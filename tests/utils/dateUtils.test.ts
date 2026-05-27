import { describe, expect, it } from 'vitest';
import { addMonths } from '@/utils/dateUtils';

describe('date utilities', () => {
  it('adds months for learning license expiry dates', () => {
    expect(addMonths('2026-05-27', 6)).toBe('2026-11-27');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });
});
