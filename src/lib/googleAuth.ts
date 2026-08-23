/**
 * Browser-only OAuth via Google Identity Services.
 *
 * The access token is held in a module variable — it is never written to
 * localStorage, sessionStorage or a cookie, so closing the tab throws it away.
 * Tokens are short lived (~1 hour); we refresh them silently when possible.
 */

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
  callback: (resp: TokenResponse) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let expiresAt = 0;
let clientId = '';
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

const listeners = new Set<(signedIn: boolean) => void>();
const emit = () => listeners.forEach((l) => l(isSignedIn()));

export function onAuthChange(fn: (signedIn: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isSignedIn() {
  return Boolean(accessToken) && Date.now() < expiresAt;
}

/** Waits for the GIS <script> in index.html to finish loading. */
function waitForGis(timeoutMs = 10_000): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(tick);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(tick);
        reject(new Error('Could not load Google sign-in. Check your network / ad blocker.'));
      }
    }, 60);
  });
}

async function ensureClient(id: string) {
  if (tokenClient && clientId === id) return tokenClient;
  if (!id) throw new Error('No Google Client ID configured. Add one in Settings.');
  await waitForGis();

  clientId = id;
  tokenClient = window.google!.accounts.oauth2.initTokenClient({
    client_id: id,
    scope: SCOPE,
    callback: (resp) => {
      const p = pending;
      pending = null;
      if (resp.access_token) {
        accessToken = resp.access_token;
        expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000; // 1 min safety margin
        emit();
        p?.resolve(resp.access_token);
      } else {
        p?.reject(new Error(resp.error_description || resp.error || 'Sign-in was cancelled.'));
      }
    },
    error_callback: (err) => {
      const p = pending;
      pending = null;
      p?.reject(new Error(err.message || err.type || 'Sign-in failed.'));
    },
  });
  return tokenClient;
}

function request(client: TokenClient, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (pending) return reject(new Error('A sign-in is already in progress.'));
    pending = { resolve, reject };
    client.requestAccessToken({ prompt });
  });
}

/** Explicit sign-in — always shows the Google account chooser. */
export async function signIn(id: string): Promise<string> {
  const client = await ensureClient(id);
  return request(client, 'consent');
}

/**
 * Returns a usable token, refreshing silently if the old one expired.
 * Falls back to an interactive prompt if the silent refresh is blocked.
 */
export async function getToken(id: string): Promise<string> {
  if (isSignedIn()) return accessToken!;
  const client = await ensureClient(id);
  try {
    return await request(client, ''); // '' = silent, reuses the existing Google session
  } catch {
    return request(client, 'consent');
  }
}

export function signOut() {
  const token = accessToken;
  accessToken = null;
  expiresAt = 0;
  emit();
  if (token) window.google?.accounts.oauth2.revoke(token);
}

/** Called by the Sheets layer when the API replies 401 — forces a fresh token next call. */
export function invalidateToken() {
  accessToken = null;
  expiresAt = 0;
  emit();
}
