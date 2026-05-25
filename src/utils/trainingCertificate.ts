import { BASE_TRAINING_SESSION_COUNT } from '@/constants/courses';
import type { SessionSlot } from '@/types';

function isCompletedSlot(slot: SessionSlot): boolean {
  return Boolean(slot.date && slot.classType.trim());
}

export function getCompletedSessionCount(slots: SessionSlot[]): number {
  return slots.filter(isCompletedSlot).length;
}

export function getTrainingCertificateCompletionDate(
  slots: SessionSlot[],
  requiredSessions = BASE_TRAINING_SESSION_COUNT
): string | null {
  const completedSlots = getTrainingCertificateAttendanceSlots(slots, requiredSessions);

  return completedSlots[requiredSessions - 1]?.date ?? null;
}

export function isTrainingCertificateEligible(slots: SessionSlot[]): boolean {
  return getTrainingCertificateCompletionDate(slots) !== null;
}

export function getTrainingCertificateAttendanceSlots(
  slots: SessionSlot[],
  requiredSessions = BASE_TRAINING_SESSION_COUNT
): SessionSlot[] {
  return slots
    .filter(isCompletedSlot)
    .sort((left, right) => {
      const dateOrder = String(left.date).localeCompare(String(right.date));
      return dateOrder || left.slotNo - right.slotNo;
    })
    .slice(0, requiredSessions);
}
