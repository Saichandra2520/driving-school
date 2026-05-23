import { FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { STUDENT_COURSE_OPTIONS } from '@/constants/courses';
import { courseExtensionService } from '@/services/courseExtensionService';
import type { CourseType } from '@/types';
import { INDIAN_CURRENCY_SYMBOL } from '@/utils/formatters';

type ExtensionStudent = {
  id: string;
  branchId: string;
  courseType: CourseType;
};

type AddExtensionModalProps = {
  open: boolean;
  student: ExtensionStudent | null;
  defaultCourseType?: CourseType;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export function AddExtensionModal({
  open,
  student,
  defaultCourseType,
  onClose,
  onSaved
}: AddExtensionModalProps): JSX.Element {
  const [courseType, setCourseType] = useState<CourseType>(student?.courseType ?? '4W');
  const [extraSessions, setExtraSessions] = useState('1');
  const [extraDays, setExtraDays] = useState('0');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !student) return;
    setCourseType(defaultCourseType ?? student.courseType);
    setExtraSessions('1');
    setExtraDays('0');
    setAmount('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setErrorMessage('');
  }, [defaultCourseType, open, student]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    const parsedSessions = Number(extraSessions);
    const parsedDays = Number(extraDays);
    const parsedAmount = Number(amount || 0);

    if (!student) return;
    if (!Number.isFinite(parsedSessions) || parsedSessions < 0) {
      setErrorMessage('Extra sessions cannot be negative.');
      return;
    }
    if (!Number.isFinite(parsedDays) || parsedDays < 0) {
      setErrorMessage('Extra days cannot be negative.');
      return;
    }
    if (parsedSessions <= 0 && parsedDays <= 0) {
      setErrorMessage('Add at least one extra session or extra day.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setErrorMessage('Amount cannot be negative.');
      return;
    }
    if (!paymentDate) {
      setErrorMessage('Payment date is required.');
      return;
    }

    setIsSaving(true);
    try {
      await courseExtensionService.createExtension({
        studentId: student.id,
        branchId: student.branchId,
        courseType,
        extraSessions: parsedSessions,
        extraDays: parsedDays,
        amount: parsedAmount,
        paymentDate,
        notes
      });

      onSaved('Course extension added successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add course extension.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      {open ? (
        <DialogContent onClose={onClose}>
          <DialogHeader>
            <DialogTitle>Add Course Extension</DialogTitle>
            <DialogDescription>Record extra sessions, extra days, and any extra fee after the original course.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="extension-course">Course</Label>
                <Select id="extension-course" value={courseType} onChange={(event) => setCourseType(event.target.value as CourseType)}>
                  {STUDENT_COURSE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="extension-payment-date">Payment Date</Label>
                <Input id="extension-payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extension-sessions">Extra Sessions</Label>
                <Input id="extension-sessions" type="number" min="0" value={extraSessions} onChange={(event) => setExtraSessions(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extension-days">Extra Days</Label>
                <Input id="extension-days" type="number" min="0" value={extraDays} onChange={(event) => setExtraDays(event.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="extension-amount">Extra Fee ({INDIAN_CURRENCY_SYMBOL})</Label>
                <Input id="extension-amount" type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="extension-notes">Notes</Label>
                <Textarea id="extension-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </div>

            {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || !student}>
                {isSaving ? 'Saving...' : 'Add Extension'}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
