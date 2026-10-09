// Single source of truth for how money is displayed. GHS only for now; if the app ever
// needs a second currency, make CURRENCY a per-farm setting rather than a constant.
const CURRENCY = 'GHS';

const formatter = new Intl.NumberFormat('en-GH', { style: 'currency', currency: CURRENCY });

export function formatMoney(amount: number): string {
  return formatter.format(amount);
}

export type Sign = 'gain' | 'loss' | 'zero';

export function signOf(amount: number): Sign {
  // Compare at cent precision so float noise (e.g. 0.1 + 0.2 - 0.3) never shows as a loss.
  const cents = Math.round(amount * 100);
  if (cents > 0) return 'gain';
  if (cents < 0) return 'loss';
  return 'zero';
}

/** Explicit sign with a true minus (U+2212), so a loss never relies on a faint hyphen. */
export function formatSignedMoney(amount: number): string {
  const sign = signOf(amount);
  const body = formatMoney(Math.abs(amount));
  if (sign === 'gain') return `+${body}`;
  if (sign === 'loss') return `−${body}`;
  return formatMoney(0);
}
