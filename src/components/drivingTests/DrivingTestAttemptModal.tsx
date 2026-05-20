import { FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { drivingTestService } from '@/services/drivingTestService';
import type { DrivingTest, DrivingTestAttempt, DrivingTestResult } from '@/types';

type DrivingTestAttemptModalProps = {
  open: boolean;
  drivingTest: DrivingTest;
  attempt: DrivingTestAttempt | null;
  onClose: () => void;
  onSaved: (drivingTest: DrivingTest, message: string) => void;
};

const today = new Date().toISOString().slice(0, 10);

export function DrivingTestAttemptModal({
  open,
  drivingTest,
  attempt,
  onClose,
  onSaved
}: DrivingTestAttemptModalProps): JSX.Element {
  const [date, setDate] = useState(today);
  const [result, setResult] = useState<DrivingTestResult>('pending');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !attempt) return;

    setDate(attempt.date ?? today);
    setResult(attempt.result ?? 'pending');
    setNotes(attempt.notes ?? '');
    setErrorMessage('');
  }, [attempt, open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    if (!attempt) return;
    if (!result) {
      setErrorMessage('Result is required.');
      return;
    }
    if ((result === 'pass' || result === 'fail') && !date) {
      setErrorMessage('Date is required for pass or fail result.');
      return;
    }

    setIsSaving(true);
    try {
      const nextTest = await drivingTestService.updateDrivingTestAttempt(drivingTest.id, attempt.attemptNo, {
        date: date || null,
        result,
        notes
      });
      onSaved(nextTest, 'Driving test attempt updated successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update driving test attempt.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      {open ? (
        <DialogContent onClose={onClose}>
          <DialogHeader>
            <DialogTitle>{attempt?.date || attempt?.result !== 'pending' ? 'Edit Attempt' : 'Add Attempt'}</DialogTitle>
            <DialogDescription>Attempt number: {attempt?.attemptNo ?? '-'}</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="attempt-number">Attempt Number</Label>
              <Input id="attempt-number" value={attempt?.attemptNo ?? ''} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="attempt-date">Date</Label>
              <Input
                id="attempt-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="attempt-result">Result</Label>
              <Select
                id="attempt-result"
                value={result}
                onChange={(event) => setResult(event.target.value as DrivingTestResult)}
              >
                <option value="pending">Pending</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="attempt-notes">Notes</Label>
              <Textarea
                id="attempt-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || !attempt}>
                {isSaving ? 'Saving...' : 'Save Attempt'}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
