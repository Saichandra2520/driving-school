export function addDays(date: string, days: number): string {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

export function getDaysRemaining(expiryDate: string): number {
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

export function calculateStudentExpiryDate(startDate: string, durationDays = 30): string {
  return addDays(startDate, durationDays);
}

export function getCourseStartDate<T extends { enrollmentDate: string; courseStartDate?: string | null }>(student: T): string {
  return student.courseStartDate || student.enrollmentDate;
}

export function isStudentExpired(enrollmentDate: string, durationDays = 30): boolean {
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
