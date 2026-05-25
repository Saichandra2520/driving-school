import { describe, expect, it } from 'vitest';
import {
  getTrainingCertificateAttendanceSlots,
  getCompletedSessionCount,
  getTrainingCertificateCompletionDate,
  isTrainingCertificateEligible
} from '@/utils/trainingCertificate';
import type { SessionSlot } from '@/types';

describe('training certificate utilities', () => {
  it('requires 30 completed sessions before allowing a certificate', () => {
    const slots = makeSlots(29);

    expect(getCompletedSessionCount(slots)).toBe(29);
    expect(isTrainingCertificateEligible(slots)).toBe(false);
    expect(getTrainingCertificateCompletionDate(slots)).toBeNull();
  });

  it('uses the 30th completed session date as the certificate completion date', () => {
    const slots = makeSlots(31);

    expect(isTrainingCertificateEligible(slots)).toBe(true);
    expect(getTrainingCertificateCompletionDate(slots)).toBe('2026-05-30');
    expect(getTrainingCertificateAttendanceSlots(slots)).toHaveLength(30);
  });
});

function makeSlots(completedCount: number): SessionSlot[] {
  return Array.from({ length: 35 }, (_, index) => {
    const slotNo = index + 1;
    const isCompleted = slotNo <= completedCount;

    return {
      slotNo,
      date: isCompleted ? `2026-05-${String(slotNo).padStart(2, '0')}` : null,
      classType: isCompleted ? 'Road Practice' : ''
    };
  });
}
