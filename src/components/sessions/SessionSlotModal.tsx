import { FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { sessionService } from '@/services/sessionService';
import type { SessionSlot, TrainingCourseType, TrainingSession } from '@/types';

type SessionSlotModalProps = {
  open: boolean;
  session: TrainingSession;
  slot: SessionSlot | null;
  branchId: string;
  courseType: TrainingCourseType;
  onClose: () => void;
  onSaved: (session: TrainingSession, message: string) => void;
};

const today = new Date().toISOString().slice(0, 10);

export function SessionSlotModal({
  open,
  session,
  slot,
  branchId,
  courseType,
  onClose,
  onSaved
}: SessionSlotModalProps): JSX.Element {
  const [date, setDate] = useState(today);
  const [classType, setClassType] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [instructor, setInstructor] = useState('');
  const [notes, setNotes] = useState('');
  const [classTypes, setClassTypes] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);

  useEffect(() => {
    if (!open || !slot) return;

    setDate(slot.date ?? today);
    setClassType(slot.classType ?? '');
    setVehicle(slot.vehicle ?? '');
    setInstructor(slot.instructor ?? '');
    setNotes(slot.notes ?? '');
    setErrorMessage('');
  }, [open, slot]);

  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    const loadClassTypes = async (): Promise<void> => {
      setIsLoadingClasses(true);
      try {
        const data = await sessionService.getClassTypes(branchId, courseType);
        if (isMounted) setClassTypes(data);
      } catch {
        if (isMounted) setErrorMessage('Unable to load class types.');
      } finally {
        if (isMounted) setIsLoadingClasses(false);
      }
    };

    void loadClassTypes();

    return () => {
      isMounted = false;
    };
  }, [branchId, courseType, open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    if (!slot) return;
    if (!date) {
      setErrorMessage('Date is required.');
      return;
    }
    if (!classType) {
      setErrorMessage('Class type is required.');
      return;
    }

    setIsSaving(true);
    try {
      const nextSession = await sessionService.updateSessionSlot(session.id, slot.slotNo, {
        date,
        classType,
        vehicle,
        instructor,
        notes
      });
      onSaved(nextSession, 'Session updated successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update session.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      {open ? (
        <DialogContent onClose={onClose}>
          <DialogHeader>
            <DialogTitle>{slot?.date || slot?.classType ? 'Edit Session' : 'Add Session'}</DialogTitle>
            <DialogDescription>Session No: {slot?.slotNo ?? '-'}</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="session-date">Date</Label>
              <Input
                id="session-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="session-class-type">Class Type</Label>
              <Select
                id="session-class-type"
                value={classType}
                onChange={(event) => setClassType(event.target.value)}
                disabled={isLoadingClasses}
              >
                <option value="">{isLoadingClasses ? 'Loading class types...' : 'Select class type'}</option>
                {classTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="session-vehicle">Vehicle</Label>
                <Input
                  id="session-vehicle"
                  value={vehicle}
                  onChange={(event) => setVehicle(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-instructor">Instructor</Label>
                <Input
                  id="session-instructor"
                  value={instructor}
                  onChange={(event) => setInstructor(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="session-notes">Notes</Label>
              <Textarea
                id="session-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || !slot}>
                {isSaving ? 'Saving...' : 'Save Session'}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
