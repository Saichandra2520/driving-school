import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DownloadReceiptButton } from '@/components/receipts/DownloadReceiptButton';
import { WhatsAppReceiptButton } from '@/components/receipts/WhatsAppReceiptButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { feeService } from '@/services/feeService';
import type { StudentWithFee } from '@/types';
import { formatCurrency, getBalance } from '@/components/students/studentUtils';

type RecordPaymentModalProps = {
  student: StudentWithFee;
  onCancel: () => void;
  onRecorded: (paymentId: string) => void;
};

const today = new Date().toISOString().slice(0, 10);

export function RecordPaymentModal({
  student,
  onCancel,
  onRecorded
}: RecordPaymentModalProps): JSX.Element {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [recordedReceiptNo, setRecordedReceiptNo] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const balance = getBalance(student);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setErrorMessage('Payment amount must be greater than 0.');
      return;
    }
    if (paymentAmount > balance) {
      setErrorMessage('Payment amount cannot exceed the remaining balance.');
      return;
    }

    setIsSaving(true);

    try {
      const fee = await feeService.addInstallment(student.id, {
        amount: paymentAmount,
        date: paymentDate,
        notes
      });
      const latestInstallment = fee.installments[fee.installments.length - 1];
      setRecordedReceiptNo(latestInstallment?.receiptNo ?? null);
      setSuccessMessage(latestInstallment ? `Payment recorded successfully. Receipt No: ${latestInstallment.receiptNo}` : 'Payment recorded successfully.');
      onRecorded(latestInstallment?.receiptNo ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not record payment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="rounded-md border bg-blue-50 p-3 text-sm">
        <span className="text-muted-foreground">Remaining balance: </span>
        <span className="font-semibold">{formatCurrency(balance)}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="payment-amount">Amount</Label>
          <Input
            id="payment-amount"
            type="number"
            min="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-date">Payment Date</Label>
          <Input
            id="payment-date"
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="payment-notes">Notes</Label>
          <Input id="payment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
          {errorMessage}
        </p>
      ) : null}

      {successMessage && recordedReceiptNo ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-success">
          <span>{successMessage}</span>
          <div className="flex gap-2">
            <DownloadReceiptButton
              studentId={student.id}
              receiptNo={recordedReceiptNo}
              variant="outline"
              onError={() => setErrorMessage('Unable to generate receipt.')}
            />
            <WhatsAppReceiptButton
              studentId={student.id}
              receiptNo={recordedReceiptNo}
              variant="outline"
              onError={(message) => setErrorMessage(message)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {recordedReceiptNo ? 'Done' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={isSaving || balance <= 0}>
          {isSaving ? 'Recording...' : 'Record Payment'}
        </Button>
      </div>
    </form>
  );
}
