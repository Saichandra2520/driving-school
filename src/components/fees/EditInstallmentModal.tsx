import { FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { feeService } from '@/services/feeService';
import { useSyncStore } from '@/store/syncStore';
import type { Fee, Installment, StudentWithFee } from '@/types';
import { INDIAN_CURRENCY_SYMBOL } from '@/utils/formatters';

type EditInstallmentModalProps = {
  open: boolean;
  student: StudentWithFee;
  installment: Installment | null;
  onClose: () => void;
  onSaved: (fee: Fee, message: string) => void;
};

export function EditInstallmentModal({
  open,
  student,
  installment,
  onClose,
  onSaved
}: EditInstallmentModalProps): JSX.Element {
  const isOnline = useSyncStore((state) => state.isOnline);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!installment) return;
    setAmount(String(installment.amount));
    setDate(installment.date);
    setNotes(installment.notes ?? '');
    setErrorMessage('');
  }, [installment]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    const parsedAmount = Number(amount);
    if (!installment) return;
    if (!isOnline) {
      setErrorMessage('Internet is required to update payments and receipt records.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Amount must be greater than 0.');
      return;
    }
    if (!date) {
      setErrorMessage('Payment date is required.');
      return;
    }

    setIsSaving(true);
    try {
      const fee = await feeService.updateInstallment(student.id, installment.receiptNo, {
        amount: parsedAmount,
        date,
        notes
      });
      onSaved(fee, 'Installment updated successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update installment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      {open ? (
        <DialogContent onClose={onClose}>
          <DialogHeader>
            <DialogTitle>Edit Installment</DialogTitle>
            <DialogDescription>Receipt number: {installment?.receiptNo ?? '-'}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {!isOnline ? <Alert variant="warning">Payment receipt records can only be changed while online.</Alert> : null}
            <div className="space-y-2">
              <Label htmlFor="edit-installment-amount">Amount ({INDIAN_CURRENCY_SYMBOL})</Label>
              <Input
                id="edit-installment-amount"
                type="number"
                min="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={!isOnline}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-installment-date">Payment Date</Label>
              <Input
                id="edit-installment-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={!isOnline}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-installment-notes">Notes</Label>
              <Input
                id="edit-installment-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={!isOnline}
              />
            </div>
            {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || !installment || !isOnline}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
