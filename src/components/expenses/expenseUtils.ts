import type { ExpenseCategory } from '@/types';
import {
  formatCurrency as sharedFormatCurrency,
  formatDate as sharedFormatDate,
  formatExpenseCategory
} from '@/utils/formatters';

export function formatCurrency(value: number): string {
  return sharedFormatCurrency(value);
}

export function formatDate(value: string): string {
  return sharedFormatDate(value);
}

export function categoryLabel(category: ExpenseCategory): string {
  return formatExpenseCategory(category);
}
