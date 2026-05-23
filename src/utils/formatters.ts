import type { AlertSeverity, AlertType, CourseType, ExpenseCategory, StudentStatus } from '@/types';
import { COURSE_LABELS } from '@/constants/courses';

export const INDIAN_CURRENCY_SYMBOL = '₹';

export function formatCurrency(amount: number): string {
  const numericAmount = Number(amount || 0);
  const formattedAmount = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0
  }).format(Math.abs(numericAmount));

  return `${numericAmount < 0 ? '-' : ''}${INDIAN_CURRENCY_SYMBOL}${formattedAmount}`;
}

export function formatDate(date: string): string {
  if (!date) return '-';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${date}T00:00:00`));
}

export function formatCourseType(courseType: CourseType): string {
  return COURSE_LABELS[courseType];
}

export function formatStatus(status: StudentStatus | 'expired'): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatStudentStatus(status: StudentStatus): string {
  const labels: Record<StudentStatus, string> = {
    about_to_start: 'About to Start',
    ongoing: 'Ongoing',
    passed: 'Passed',
    extended: 'Extended'
  };

  return labels[status];
}

export function formatExpenseCategory(category: ExpenseCategory): string {
  const labels: Record<ExpenseCategory, string> = {
    fuel: 'Fuel',
    maintenance: 'Maintenance',
    salary: 'Salary',
    electricity: 'Electricity Bill',
    room_rent: 'Room Rent',
    learning_challan: 'Learning Challan',
    driving_test_challan: 'Driving Test Challan',
    other: 'Other'
  };

  return labels[category];
}

export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '-';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

export function formatAlertType(type: AlertType): string {
  const labels: Record<AlertType, string> = {
    thirty_days_completed: 'Training Period Completed',
    near_completion: 'Near Training Completion',
    pending_fee: 'Pending Fee',
    licence_expiry: 'Licence Expiry',
    driving_test_pending: 'Driving Test Pending'
  };

  return labels[type];
}

export function formatAlertSeverity(severity: AlertSeverity): string {
  const labels: Record<AlertSeverity, string> = {
    info: 'Info',
    warning: 'Warning',
    danger: 'Urgent'
  };

  return labels[severity];
}
