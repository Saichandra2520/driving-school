import { COURSE_COMPLETION_DAYS } from '@/constants/courses';

function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return formatLocalDate(nextDate);
}

export function addMonths(date: string, months: number): string {
  const sourceDate = new Date(`${date}T00:00:00`);
  const targetYear = sourceDate.getFullYear();
  const targetMonth = sourceDate.getMonth() + months;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(sourceDate.getDate(), lastDayOfTargetMonth);

  return formatLocalDate(new Date(targetYear, targetMonth, targetDay));
}

export function getDaysRemaining(expiryDate: string): number {
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

export function calculateStudentExpiryDate(startDate: string, durationDays = COURSE_COMPLETION_DAYS): string {
  return addDays(startDate, durationDays);
}

export function getCourseStartDate<T extends { enrollmentDate: string; courseStartDate?: string | null }>(student: T): string {
  return student.courseStartDate || student.enrollmentDate;
}

export function isStudentExpired(enrollmentDate: string, durationDays = COURSE_COMPLETION_DAYS): boolean {
  return getDaysRemaining(addDays(enrollmentDate, durationDays)) < 0;
}

export function isWithinNextDays(targetDate: string, days: number): boolean {
  const remaining = getDaysRemaining(targetDate);
  return remaining >= 0 && remaining <= days;
}

export function isPastDate(date: string): boolean {
  return getDaysRemaining(date) < 0;
}

export function getMonthStartAndEnd(month: number, year: number): { startDate: string; endDate: string } {
  const paddedMonth = String(month).padStart(2, '0');
  const end = new Date(year, month, 0);

  return {
    startDate: `${year}-${paddedMonth}-01`,
    endDate: `${year}-${paddedMonth}-${String(end.getDate()).padStart(2, '0')}`
  };
}

export function isDateInMonthYear(date: string, month: number, year: number): boolean {
  if (!date) return false;

  const { startDate, endDate } = getMonthStartAndEnd(month, year);
  return date >= startDate && date <= endDate;
}
