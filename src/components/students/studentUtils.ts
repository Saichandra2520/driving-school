import type { CourseType, StudentStatus, StudentWithFee } from '@/types';
import {
  addDays,
  calculateStudentExpiryDate,
  getDaysRemaining as getRemainingDays
} from '@/utils/dateUtils';
import {
  formatCourseType,
  formatCurrency as sharedFormatCurrency,
  formatDate as sharedFormatDate,
  formatStudentStatus
} from '@/utils/formatters';

export function formatCurrency(value: number): string {
  return sharedFormatCurrency(value);
}

export function formatDate(value: string): string {
  return sharedFormatDate(value);
}

export function getExpiryDate(enrollmentDate: string, durationDays: number): string {
  return durationDays === 30 ? calculateStudentExpiryDate(enrollmentDate) : addDays(enrollmentDate, durationDays);
}

export function getDaysRemaining(student: StudentWithFee): number {
  return getRemainingDays(student.expiryDate ?? getExpiryDate(student.enrollmentDate, student.durationDays));
}

export function getBalance(student: StudentWithFee): number {
  return student.balance ?? Math.max((student.fee?.totalAmount ?? 0) - (student.fee?.paidAmount ?? 0), 0);
}

export function courseLabel(courseType: CourseType): string {
  return formatCourseType(courseType);
}

export function statusLabel(status: StudentStatus): string {
  return formatStudentStatus(status);
}
