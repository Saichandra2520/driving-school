import type { ReceiptData } from '@/types';
import { formatCourseType, formatCurrency, formatDate } from '@/utils/formatters';

export function formatIndianPhoneNumber(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-()+]/g, '').replace(/\D/g, '');

  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }

  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return cleaned;
  }

  return null;
}

export function createReceiptWhatsAppMessage(data: ReceiptData): string {
  return [
    `Hello ${data.student.fullName},`,
    '',
    'Payment received successfully.',
    '',
    `Receipt No: ${data.receiptNo}`,
    `Branch: ${data.branch.name}`,
    `Course: ${formatCourseType(data.student.courseType)}`,
    `Payment Date: ${formatDate(data.paymentDate)}`,
    `Amount Paid: ${formatCurrency(data.amount)}`,
    '',
    `Total Fee: ${formatCurrency(data.fee.totalAmount)}`,
    `Total Paid: ${formatCurrency(data.fee.paidAmount)}`,
    `Balance: ${formatCurrency(data.fee.balance)}`,
    '',
    'Thank you,',
    data.branch.name,
    '',
    'Note: Please collect/download your receipt from the driving school.'
  ].join('\n');
}

export async function openWhatsAppMessage(phone: string, message: string): Promise<void> {
  const formattedPhone = formatIndianPhoneNumber(phone);

  if (!formattedPhone) {
    throw new Error('Invalid student phone number.');
  }

  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;

  if (window.electron?.openExternalUrl) {
    await window.electron.openExternalUrl(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
