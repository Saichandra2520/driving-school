import type { Fee, Installment, PendingPayment } from '@/types';

const storageKey = 'maryDrivingSchool.pendingPayments.v1';
const eventName = 'mary-driving-school:pending-payments-changed';

type PendingPaymentInput = {
  studentId: string;
  branchId: string;
  amount: number;
  date: string;
  notes?: string;
};

function getStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function readPayments(): PendingPayment[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingPayment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePayments(payments: PendingPayment[]): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(storageKey, JSON.stringify(payments));
  window.dispatchEvent(new CustomEvent(eventName));
}

function createPendingPaymentId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `local-${random}`;
}

function pendingReceiptNo(paymentId: string): string {
  return `PENDING-${paymentId.replace(/^local-/, '').slice(0, 8).toUpperCase()}`;
}

function toInstallment(payment: PendingPayment): Installment {
  return {
    receiptNo: pendingReceiptNo(payment.id),
    clientPaymentId: payment.id,
    receiptStatus: 'pending',
    syncError: payment.error ?? undefined,
    amount: payment.amount,
    date: payment.date,
    notes: payment.notes ?? '',
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  };
}

function recalculateWithInstallments(fee: Fee, installments: Installment[]): Fee {
  const paidAmount = installments.reduce((total, installment) => total + Number(installment.amount ?? 0), 0);
  const totalAmount = Number(fee.totalAmount ?? 0);

  return {
    ...fee,
    installments,
    totalAmount,
    paidAmount,
    balance: totalAmount - paidAmount
  };
}

export function isPendingInstallment(installment: Installment): boolean {
  return installment.receiptStatus === 'pending' || Boolean(installment.clientPaymentId?.startsWith('local-'));
}

export function getInstallmentReceiptLabel(installment: Installment): string {
  return isPendingInstallment(installment) ? 'Pending receipt' : installment.receiptNo;
}

export const pendingPaymentService = {
  getAll(): PendingPayment[] {
    return readPayments();
  },

  getByStudent(studentId: string): PendingPayment[] {
    return readPayments().filter((payment) => payment.studentId === studentId);
  },

  getByBranch(branchId?: string | null): PendingPayment[] {
    return readPayments().filter((payment) => !branchId || payment.branchId === branchId);
  },

  add(input: PendingPaymentInput): PendingPayment {
    const now = new Date().toISOString();
    const payment: PendingPayment = {
      id: createPendingPaymentId(),
      studentId: input.studentId,
      branchId: input.branchId,
      amount: input.amount,
      date: input.date,
      notes: input.notes?.trim() || '',
      status: 'pending',
      error: null,
      createdAt: now,
      updatedAt: now
    };
    writePayments([...readPayments(), payment]);
    return payment;
  },

  markSyncing(id: string): void {
    const now = new Date().toISOString();
    writePayments(
      readPayments().map((payment) =>
        payment.id === id ? { ...payment, status: 'syncing', error: null, updatedAt: now } : payment
      )
    );
  },

  markFailed(id: string, error: string): void {
    const now = new Date().toISOString();
    writePayments(
      readPayments().map((payment) =>
        payment.id === id ? { ...payment, status: 'failed', error, updatedAt: now } : payment
      )
    );
  },

  remove(id: string): void {
    writePayments(readPayments().filter((payment) => payment.id !== id));
  },

  applyPendingPaymentsToFee(fee: Fee | null, studentId: string): Fee | null {
    if (!fee) return null;
    const pendingInstallments = pendingPaymentService.getByStudent(studentId).map(toInstallment);
    if (pendingInstallments.length === 0) return recalculateWithInstallments(fee, Array.isArray(fee.installments) ? fee.installments : []);

    const existingClientIds = new Set((fee.installments ?? []).map((installment) => installment.clientPaymentId).filter(Boolean));
    const nextInstallments = [
      ...(Array.isArray(fee.installments) ? fee.installments : []),
      ...pendingInstallments.filter((installment) => !existingClientIds.has(installment.clientPaymentId))
    ];
    return recalculateWithInstallments(fee, nextInstallments);
  },

  toInstallment,

  subscribe(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }
};
