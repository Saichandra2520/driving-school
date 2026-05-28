import { useEffect, useMemo, useState } from 'react';
import { DrivingTestAttemptModal } from '@/components/drivingTests/DrivingTestAttemptModal';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { drivingTestService } from '@/services/drivingTestService';
import type {
  DrivingTest,
  DrivingTestAttempt,
  DrivingTestCourseType,
  DrivingTestResult,
  DrivingTestStatus
} from '@/types';
import { addDays, addMonths } from '@/utils/dateUtils';
import { formatDate } from '@/utils/formatters';

type DrivingTestCardProps = {
  studentId: string;
  branchId: string;
  courseType: DrivingTestCourseType;
  llIssueDate?: string | null;
  needsDrivingLicenceDetails?: boolean;
  onStudentChanged?: () => void;
};

const attemptLabels: Record<number, string> = {
  1: 'First Attempt',
  2: 'Second Attempt',
  3: 'Third Attempt'
};

const statusLabels: Record<DrivingTestStatus, string> = {
  not_started: 'Not Applied',
  pending: 'Applied',
  passed: 'Passed',
  failed: 'Failed'
};

const resultLabels: Record<DrivingTestResult, string> = {
  pending: 'Pending',
  pass: 'Pass',
  fail: 'Fail'
};

function statusVariant(status: DrivingTestStatus): 'muted' | 'warning' | 'success' | 'default' {
  if (status === 'passed') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'failed') return 'default';
  return 'muted';
}

function resultVariant(result: DrivingTestResult): 'muted' | 'success' | 'warning' {
  if (result === 'pass') return 'success';
  if (result === 'fail') return 'warning';
  return 'muted';
}

export function DrivingTestCard({
  studentId,
  branchId,
  courseType,
  llIssueDate,
  needsDrivingLicenceDetails = false,
  onStudentChanged
}: DrivingTestCardProps): JSX.Element {
  const [drivingTest, setDrivingTest] = useState<DrivingTest | null>(null);
  const [editAttempt, setEditAttempt] = useState<DrivingTestAttempt | null>(null);
  const [passSuggestion, setPassSuggestion] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadDrivingTest = async (): Promise<void> => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const existingTest = await drivingTestService.getDrivingTestByStudentAndCourse(studentId, courseType);
        const nextTest =
          existingTest ?? (await drivingTestService.createEmptyDrivingTest(studentId, branchId, courseType));

        if (isMounted) setDrivingTest(nextTest);
      } catch {
        if (isMounted) setErrorMessage('Unable to load driving test details.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadDrivingTest();

    return () => {
      isMounted = false;
    };
  }, [branchId, courseType, studentId]);

  const status = useMemo(
    () => (drivingTest ? drivingTestService.getDrivingTestStatus(drivingTest) : 'not_started'),
    [drivingTest]
  );
  const minAttemptDate = llIssueDate ? addDays(llIssueDate, 30) : '';
  const maxAttemptDate = llIssueDate ? addMonths(llIssueDate, 6) : '';
  const visibleAttempts = useMemo(() => {
    if (!drivingTest) return [];

    return drivingTest.attempts.filter((attempt, index, attempts) => {
      const isUsed = Boolean(attempt.date || attempt.result !== 'pending' || attempt.notes);
      if (isUsed || attempt.attemptNo === 1) return true;

      const previousAttempt = attempts[index - 1];
      return previousAttempt?.result === 'fail';
    });
  }, [drivingTest]);

  const handleSaved = async (nextTest: DrivingTest, nextMessage: string): Promise<void> => {
    setDrivingTest(nextTest);
    setEditAttempt(null);
    setMessage(nextMessage);
    setErrorMessage('');

    if (drivingTestService.getDrivingTestStatus(nextTest) === 'passed') {
      onStudentChanged?.();
    }

    try {
      setPassSuggestion(await drivingTestService.checkAndSuggestStudentPassed(studentId));
    } catch {
      setPassSuggestion(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-sm">{courseType} Driving Test</CardTitle>
        <Badge variant={statusVariant(status)}>{statusLabels[status]}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <Alert variant="success">{message}</Alert> : null}
        {passSuggestion ? <Alert>{passSuggestion}</Alert> : null}
        {status === 'passed' && needsDrivingLicenceDetails ? (
          <Alert variant="warning">Driving license number and issue date are required after passing the driving test.</Alert>
        ) : null}
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading driving test details...</p>
        ) : drivingTest ? (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-[90px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleAttempts.map((attempt) => {
                  const isUsed = Boolean(attempt.date || attempt.result !== 'pending' || attempt.notes);

                  return (
                    <TableRow key={attempt.attemptNo} className={isUsed ? undefined : 'text-muted-foreground'}>
                      <TableCell className="font-medium">{attemptLabels[attempt.attemptNo]}</TableCell>
                      <TableCell>{attempt.date ? formatDate(attempt.date) : '-'}</TableCell>
                      <TableCell>
                        <Badge variant={resultVariant(attempt.result)}>{resultLabels[attempt.result]}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate">{attempt.notes || '-'}</TableCell>
                      <TableCell>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditAttempt(attempt)}>
                          {isUsed ? 'Edit' : 'Add'}
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

      {drivingTest ? (
        <DrivingTestAttemptModal
          open={editAttempt !== null}
          drivingTest={drivingTest}
          attempt={editAttempt}
          minDate={minAttemptDate}
          maxDate={maxAttemptDate}
          onClose={() => setEditAttempt(null)}
          onSaved={(nextTest, nextMessage) => void handleSaved(nextTest, nextMessage)}
        />
      ) : null}

    </Card>
  );
}
