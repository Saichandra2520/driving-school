import { FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { feeService } from '@/services/feeService';
import type { Fee, StudentWithFee } from '@/types';
import { formatCurrency } from '@/utils/formatters';

type AddInstallmentModalProps = {
  open: boolean;
  student: StudentWithFee | null;
  balance: number;
  onClose: () => void;
  onSaved: (fee: Fee, message: string) => void;
};

const today = new Date().toISOString().slice(0, 10);

export function AddInstallmentModal({
  open,
  student,
  balance,
  onClose,
  onSaved
}: AddInstallmentModalProps): JSX.Element {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    const parsedAmount = Number(amount);
    if (!student) return;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Amount must be greater than 0.');
      return;
    }
    if (parsedAmount > balance) {
      setErrorMessage('Amount cannot exceed balance.');
      return;
    }
    if (!date) {
      setErrorMessage('Payment date is required.');
      return;
    }

    setIsSaving(true);
    try {
      const fee = await feeService.addInstallment(student.id, {
        amount: parsedAmount,
        date,
        notes
      });
      const receiptNo = fee.installments.find((installment) => installment.date === date && Number(installment.amount) === parsedAmount)?.receiptNo
        ?? fee.installments.at(-1)?.receiptNo
        ?? '';
      setAmount('');
      setDate(today);
      setNotes('');
      onSaved(fee, receiptNo ? `Installment added successfully. Receipt No: ${receiptNo}` : 'Installment added successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add installment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      {open ? (
        <DialogContent onClose={onClose}>
          <DialogHeader>
            <DialogTitle>Add Installment</DialogTitle>
            <DialogDescription>
              Current balance: {formatCurrency(balance)}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="installment-amount">Amount</Label>
              <Input
                id="installment-amount"
                type="number"
                min="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="installment-date">Payment Date</Label>
              <Input
                id="installment-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="installment-notes">Notes</Label>
              <Input
                id="installment-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || !student}>
                {isSaving ? 'Saving...' : 'Add Installment'}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
