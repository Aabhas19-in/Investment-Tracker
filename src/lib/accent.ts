/**
 * Every sheet gets its own colour so the app doesn't read as one grey wall.
 * Known asset names get a hue that actually means something (gold is gold);
 * anything else is hashed to a stable colour from the same family.
 */

export const ACCENTS = [
  '#e8992b', // amber
  '#2f9de0', // sky
  '#8b5cf6', // violet
  '#12a594', // teal
  '#e2557b', // rose
  '#6f9a1f', // olive
  '#e0713a', // orange
  '#4f6ff0', // indigo
] as const;

const NAMED: { match: RegExp; color: string }[] = [
  { match: /gold|silver|bullion|metal|sgb/i, color: '#e8992b' },
  { match: /stock|equit|share|nifty|sensex/i, color: '#2f9de0' },
  { match: /crypto|bitcoin|btc|eth|coin/i, color: '#8b5cf6' },
  { match: /fd|fixed|deposit|bond|ppf|nps|epf/i, color: '#12a594' },
  { match: /mutual|fund|sip|elss/i, color: '#4f6ff0' },
  { match: /real.?estate|property|land|house/i, color: '#e0713a' },
  { match: /cash|saving|emergency/i, color: '#6f9a1f' },
];

export function accentFor(name: string): string {
  const named = NAMED.find((n) => n.match.test(name));
  if (named) return named.color;

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

/** Two initials at most — used for the round badge on each sheet and row. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
