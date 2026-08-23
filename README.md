# Investment Tracker

A mobile-first React app that keeps **all** of your investment data in your own Google Sheet.
No backend, no database, no server-side code — the browser talks to the Google Sheets API directly.

- Create a new sheet (tab) per asset — Gold, Stocks, Mutual Funds, anything — from the UI
- Add, rename and delete columns per sheet, from the UI
- Add, edit and delete rows; values starting with `=` become live spreadsheet formulas
- A Summary tab that totals every numeric column and detects invested vs current value
- 11 built-in investing calculators (Future value, SIP, step-up SIP, goal planner, CAGR, XIRR,
  SWP, inflation, post-tax return, doubling time, EMI)
- Download the whole thing as a real `.xlsx` any time

**What the app stores:** three settings in `localStorage` — spreadsheet ID, OAuth client ID,
currency. Nothing else. No rows, no totals, no access token. The Google token lives in a
JavaScript variable and dies with the tab.

---

## 1. One-time Google setup (~10 minutes, free, no billing)

You need this because **making a sheet "anyone with the link can edit" does not let an app write
to it.** Google allows anonymous *reads* of public sheets with an API key, but every *write*
requires a signed-in user. So the app signs you in with Google and writes as you.

### a. Create a project and enable the API

1. Go to <https://console.cloud.google.com/> and create a project (call it `Investment Tracker`).
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.

### b. Configure the consent screen

3. Go to **APIs & Services → OAuth consent screen** (newer consoles call this
   **Google Auth Platform → Branding / Audience**).
   - User type: **External**
   - App name: `Investment Tracker`, support email: your own, developer email: your own
4. Under **Audience**, leave the publishing status as **Testing** and add your own Gmail address
   under **Test users**.

> Why Testing: the app asks for the `spreadsheets` scope, which Google classes as *sensitive*.
> Publishing to Production would require a verification review. In Testing mode you can use it
> yourself with no review — you'll just see a "Google hasn't verified this app" screen once, where
> you click **Advanced → Go to Investment Tracker (unsafe)**. That warning is about *your own*
> unverified app, and only test users you list can ever sign in.

### c. Create the OAuth client ID

5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins** — add both:
     - `http://localhost:5173`
     - `https://your-app-name.vercel.app` (add this after your first deploy)
   - Authorized redirect URIs: leave empty, this flow doesn't use them.
6. Copy the **Client ID** (`…apps.googleusercontent.com`).

> Origins must match exactly — no trailing slash, and `https` for the deployed one. Every time you
> add a domain, come back and add it here or sign-in will fail with `redirect_uri_mismatch` /
> `idpiframe_initialization_failed`.

---

## 2. Google Sheet settings

Good news: **almost nothing to change.**

| Setting | What to do |
| --- | --- |
| Sharing | **Leave it private.** Do *not* set "anyone with the link can edit" — the app writes as *you*, so your own access is all it needs. If you already made it public, you can revert it. |
| Ownership | Sign into the app with the Google account that owns (or has **Editor** access to) the sheet. |
| Row 1 | Row 1 of every tab is the **header row**. Don't put a title/logo row above it and don't merge cells in row 1. |
| Tabs | One tab per asset class. The app creates them for you with a bold, frozen header row. |
| Anything else | Formatting, colours, conditional formatting, extra formulas you add in Google Sheets — all fine, the app leaves them alone. |

Your sheet is already fine as-is:
`https://docs.google.com/spreadsheets/d/14Bs1ioiG5Iv5mkJeqIiBnFrGX6lz-uLi2BncBxwe-tk/edit`
(the long string in the middle is the **Spreadsheet ID** the app needs).

One thing worth doing: if that link is currently shared publicly, **turn sharing back off**.
A publicly editable sheet is editable by anyone who finds the link, and your investment records
probably shouldn't be.

---

## 3. Run it locally

```bash
cp .env.example .env.local     # then fill in your client ID
npm install
npm run dev
```

Open <http://localhost:5173>. To test on your phone, note the Network URL that Vite prints and open
it on a device on the same Wi-Fi — but sign-in only works on origins you registered, so add that
address to Authorized JavaScript origins too, or just test auth on localhost / the deployed URL.

If you'd rather not use `.env.local`, leave it out — the app's **Settings** tab lets you paste the
spreadsheet URL and client ID directly on first run.

---

## 4. Deploy to Vercel

1. Push this folder to GitHub.
2. On Vercel: **Add New → Project → import the repo**. Framework preset is detected as **Vite**.
3. Add two **Environment Variables** (they're public values baked into the bundle — that's normal
   and safe for browser OAuth; the JavaScript-origins allowlist is what protects the client ID):
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_SPREADSHEET_ID`
4. Deploy, then copy the production URL and add it to **Authorized JavaScript origins** in Google
   Cloud Console.
5. On your phone, open the URL → browser menu → **Add to Home Screen**. It runs full-screen like a
   native app.

> Vercel preview deployments get a new random URL each time, which won't be in your origins list,
> so sign-in will fail there. Use the production URL, or add a stable custom domain.

---

## 5. How it's put together

```
src/
  lib/googleAuth.ts   Google Identity Services token flow. Token in memory only.
  lib/sheets.ts       Sheets REST v4 wrapper: read, append, update, delete rows;
                      add/rename/delete columns and tabs. Every call hits the API.
  lib/finance.ts      Pure investing maths + a declarative catalog of calculators.
  lib/format.ts       Currency formatting and "is this column numeric?" detection.
  lib/config.ts       The three persisted settings.
  components/         DataView (table + tabs), Manage (new sheet / columns),
                      RowEditor, Summary, Calculators, Settings, UI primitives.
```

Adding a calculator is one object appended to `CALCULATORS` in `src/lib/finance.ts` — the UI
renders its fields and results automatically.

### Live formulas

Rows are written with `valueInputOption=USER_ENTERED`, so typing `=E4*F4` into a field stores a
real spreadsheet formula. The table shows the calculated result; the editor shows the formula back
to you, so editing a row never silently flattens it into a number.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Could not load Google sign-in` | An ad/tracker blocker is blocking `accounts.google.com/gsi/client`. |
| `403 … has not been used in project` | Google Sheets API not enabled for the project. |
| `403 The caller does not have permission` | Signed in with an account that can't edit the sheet. |
| `404` | Wrong Spreadsheet ID in Settings. |
| Sign-in popup closes and nothing happens | The current origin isn't in Authorized JavaScript origins. |
| `access_denied` | Your Gmail isn't in the Test users list on the consent screen. |
| Signed out after an hour | Normal — tokens are short-lived. The app refreshes silently; if the Google session lapsed, tap sign in again. |
