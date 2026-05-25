import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SessionSlotModal } from '@/components/sessions/SessionSlotModal';
import { BASE_TRAINING_SESSION_COUNT } from '@/constants/courses';
import { courseExtensionService } from '@/services/courseExtensionService';
import { sessionService } from '@/services/sessionService';
import type { SessionSlot, TrainingCourseType, TrainingSession } from '@/types';
import { calculateStudentExpiryDate } from '@/utils/dateUtils';
import { formatDate } from '@/utils/formatters';

type TrainingCardProps = {
  studentId: string;
  branchId: string;
  courseType: TrainingCourseType;
  courseStartDate: string;
};

export function TrainingCard({
  studentId,
  branchId,
  courseType,
  courseStartDate
}: TrainingCardProps): JSX.Element {
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [editSlot, setEditSlot] = useState<SessionSlot | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [allowedSessions, setAllowedSessions] = useState(BASE_TRAINING_SESSION_COUNT);
  const [courseCompletionDate, setCourseCompletionDate] = useState(calculateStudentExpiryDate(courseStartDate));

  useEffect(() => {
    let isMounted = true;

    const loadSession = async (): Promise<void> => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const entitlement = await courseExtensionService.getEntitlementByStudentId(studentId, courseType);
        const nextAllowedSessions = entitlement.allowedSessions;
        const nextCourseCompletionDate = calculateStudentExpiryDate(courseStartDate, entitlement.allowedDays);
        const existingSession = await sessionService.getSessionByStudentAndCourse(studentId, courseType, nextAllowedSessions);
        const nextSession =
          existingSession ?? (await sessionService.createEmptySessionCard(studentId, branchId, courseType, nextAllowedSessions));

        if (isMounted) {
          setAllowedSessions(nextAllowedSessions);
          setCourseCompletionDate(nextCourseCompletionDate);
          setSession(
            nextSession.slots.length < nextAllowedSessions
              ? await sessionService.ensureSessionCapacity(nextSession.id, nextAllowedSessions)
              : nextSession
          );
        }
      } catch {
        if (isMounted) setErrorMessage('Unable to load training card.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, [branchId, courseStartDate, courseType, studentId]);

  const progress = useMemo(() => {
    const completed = session?.slots.filter((slot) => slot.date && slot.classType).length ?? 0;
    const remaining = Math.max(allowedSessions - completed, 0);
    const label = completed === 0 ? 'Not Started' : completed >= allowedSessions ? 'Completed' : 'In Progress';
    const variant = completed === 0 ? 'muted' : completed >= allowedSessions ? 'success' : 'warning';

    return { completed, remaining, label, variant: variant as 'muted' | 'success' | 'warning' };
  }, [allowedSessions, session]);

  const handleSaved = (nextSession: TrainingSession, nextMessage: string): void => {
    setSession(nextSession);
    setEditSlot(null);
    setMessage(nextMessage);
    setErrorMessage('');
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-sm">{courseType} Training Card</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Completed Sessions: {progress.completed} / {allowedSessions} · Remaining Sessions: {progress.remaining}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={progress.variant}>{progress.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <Alert variant="success">{message}</Alert> : null}
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading training card...</p>
        ) : session ? (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Class Type</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-[90px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.slots.map((slot) => {
                  const isCompleted = Boolean(slot.date && slot.classType);

                  return (
                    <TableRow key={slot.slotNo} className={isCompleted ? 'bg-green-50/70' : 'text-muted-foreground'}>
                      <TableCell className="font-medium">{slot.slotNo}</TableCell>
                      <TableCell>{slot.date ? formatDate(slot.date) : '-'}</TableCell>
                      <TableCell>{slot.classType || '-'}</TableCell>
                      <TableCell>{slot.vehicle || '-'}</TableCell>
                      <TableCell>{slot.instructor || '-'}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{slot.notes || '-'}</TableCell>
                      <TableCell>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditSlot(slot)}>
                          {isCompleted ? 'Edit' : 'Add'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>

      {session ? (
        <SessionSlotModal
          open={editSlot !== null}
          session={session}
          slot={editSlot}
          branchId={branchId}
          courseType={courseType}
          courseStartDate={courseStartDate}
          courseCompletionDate={courseCompletionDate}
          onClose={() => setEditSlot(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </Card>
  );
}
