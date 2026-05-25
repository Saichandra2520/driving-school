import { Badge } from '@/components/ui/badge';
import type { DrivingTestStatus, ExpenseCategory, StudentStatus } from '@/types';
import { formatExpenseCategory, formatStudentStatus } from '@/utils/formatters';

type StatusBadgeProps = {
  status:
    | StudentStatus
    | 'paid'
    | 'partial'
    | 'pending'
    | 'not_started'
    | 'in_progress'
    | 'completed'
    | 'thirty_days_completed'
    | 'near_completion'
    | DrivingTestStatus
    | ExpenseCategory;
};

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const variant = getVariant(status);

  return <Badge variant={variant}>{getLabel(status)}</Badge>;
}

function getVariant(
  status: StatusBadgeProps['status']
): 'success' | 'secondary' | 'warning' | 'muted' | 'default' | 'danger' | 'info' | 'slate' | 'purple' | 'indigo' | 'orange' | 'yellow' {
  if (['passed', 'paid', 'completed'].includes(status)) return 'success';
  if (['ongoing', 'extended', 'in_progress', 'fuel'].includes(status)) return 'info';
  if (['about_to_start', 'partial', 'near_completion', 'pending', 'maintenance'].includes(status)) return 'warning';
  if (['failed', 'thirty_days_completed', 'learning_challan', 'driving_test_challan'].includes(status)) return 'danger';
  if (status === 'salary') return 'purple';
  if (status === 'electricity') return 'yellow';
  if (status === 'room_rent') return 'indigo';
  if (status === 'other' || status === 'not_started') return 'slate';
  return 'muted';
}

function getLabel(status: StatusBadgeProps['status']): string {
  if (status === 'about_to_start' || status === 'ongoing' || status === 'completed' || status === 'passed' || status === 'extended') return formatStudentStatus(status);
  if (status === 'paid') return 'Paid';
  if (status === 'partial') return 'Partial';
  if (status === 'pending') return 'Pending';
  if (status === 'not_started') return 'Not Started';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'thirty_days_completed') return 'Training Completed';
  if (status === 'near_completion') return 'Near Completion';
  if (status === 'failed') return 'Failed';
  return formatExpenseCategory(status as ExpenseCategory);
}
