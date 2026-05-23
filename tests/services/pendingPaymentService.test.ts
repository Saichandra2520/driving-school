import { beforeEach, describe, expect, it } from 'vitest';
import { getInstallmentReceiptLabel, isPendingInstallment, pendingPaymentService } from '@/services/pendingPaymentService';
import type { Fee } from '@/types';

const baseFee: Fee = {
  id: 'fee-1',
  studentId: 'student-1',
  branchId: 'branch-1',
  totalAmount: 1000,
  installments: [],
  paidAmount: 0,
  balance: 1000
};

describe('pendingPaymentService', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores pending payments and merges them into local fee totals', () => {
    pendingPaymentService.add({
      studentId: 'student-1',
      branchId: 'branch-1',
      amount: 300,
      date: '2026-05-23',
      notes: 'offline'
    });

    const fee = pendingPaymentService.applyPendingPaymentsToFee(baseFee, 'student-1');

    expect(fee?.paidAmount).toBe(300);
    expect(fee?.balance).toBe(700);
    expect(fee?.installments).toHaveLength(1);
    expect(isPendingInstallment(fee!.installments[0])).toBe(true);
    expect(getInstallmentReceiptLabel(fee!.installments[0])).toBe('Pending receipt');
  });

  it('keeps failed payments for retry with the sync error', () => {
    const payment = pendingPaymentService.add({
      studentId: 'student-1',
      branchId: 'branch-1',
      amount: 300,
      date: '2026-05-23'
    });

    pendingPaymentService.markFailed(payment.id, 'Network unavailable');

    expect(pendingPaymentService.getAll()[0]).toMatchObject({
      id: payment.id,
      status: 'failed',
      error: 'Network unavailable'
    });
  });
});
