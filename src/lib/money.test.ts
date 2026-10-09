import { describe, it, expect } from 'vitest';
import { formatMoney, formatSignedMoney, signOf } from './money';
import { toLocalDateString } from './dates';

describe('money', () => {
  it('formats GHS with thousands separators and two decimals', () => {
    expect(formatMoney(12000.5)).toBe('GH₵12,000.50');
  });

  it('prefixes an explicit sign, using a true minus for losses', () => {
    expect(formatSignedMoney(1200)).toBe('+GH₵1,200.00');
    expect(formatSignedMoney(-30)).toBe('−GH₵30.00');
    expect(formatSignedMoney(0)).toBe('GH₵0.00');
  });

  it('treats float noise as zero', () => {
    expect(signOf(0.1 + 0.2 - 0.3)).toBe('zero');
    expect(formatSignedMoney(0.1 + 0.2 - 0.3)).toBe('GH₵0.00');
  });
});

describe('toLocalDateString', () => {
  it('uses local calendar fields, not UTC', () => {
    expect(toLocalDateString(new Date(2026, 9, 1, 0, 30))).toBe('2026-10-01');
    expect(toLocalDateString(new Date(2026, 0, 31, 23, 59))).toBe('2026-01-31');
  });
});
