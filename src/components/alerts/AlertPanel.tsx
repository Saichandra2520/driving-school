import { useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { PageLoader } from '@/components/common/PageLoader';
import { StudentDetails } from '@/components/students/StudentDetails';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { studentService } from '@/services/studentService';
import { useAlertStore } from '@/store/alertStore';
import type { AlertFilters, AlertSeverity, AppAlert, StudentWithFee } from '@/types';
import { formatAlertType } from '@/utils/formatters';

type AlertPanelProps = {
  alerts: AppAlert[];
  isLoading?: boolean;
  errorMessage?: string;
  filters?: AlertFilters | null;
  onClose?: () => void;
};

const groups: Array<{ title: string; severity: AlertSeverity }> = [
  { title: 'Urgent', severity: 'danger' },
  { title: 'Warnings', severity: 'warning' },
  { title: 'Info', severity: 'info' }
];

export function AlertPanel({
  alerts,
  isLoading = false,
  errorMessage = '',
  filters = null,
  onClose
}: AlertPanelProps): JSX.Element {
  const fetchAlerts = useAlertStore((state) => state.fetchAlerts);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithFee | null>(null);
  const [studentError, setStudentError] = useState('');
  const [isStudentLoading, setIsStudentLoading] = useState(false);

  const openStudent = async (studentId: string): Promise<void> => {
    setIsStudentLoading(true);
    setStudentError('');

    try {
      const student = await studentService.getStudentById(studentId);
      if (!student) throw new Error('Student not found.');
      setSelectedStudent(student);
      onClose?.();
    } catch {
      setStudentError('Unable to open student details. Please try again.');
    } finally {
      setIsStudentLoading(false);
    }
  };

  const handleStudentChanged = async (): Promise<void> => {
    if (filters) {
      await fetchAlerts(filters);
    }

    if (selectedStudent) {
      const student = await studentService.getStudentById(selectedStudent.id);
      setSelectedStudent(student);
    }
  };

  return (
    <>
      <div className="space-y-3">
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
        {studentError ? <Alert variant="destructive">{studentError}</Alert> : null}

        {isLoading ? (
          <PageLoader label="Loading alerts..." />
        ) : alerts.length === 0 ? (
          <EmptyState title="No active alerts." />
        ) : (
          groups.map((group) => {
            const groupAlerts = alerts.filter((alert) => alert.severity === group.severity);
            if (groupAlerts.length === 0) return null;

            return (
              <section key={group.severity} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  <Badge variant={group.severity === 'danger' ? 'warning' : 'secondary'}>{groupAlerts.length}</Badge>
                </div>
                <div className="space-y-2">
                  {groupAlerts.map((alert) => (
                    <div key={alert.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{alert.studentName}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {alert.branchName ?? alert.branchId} · {alert.phone}
                          </p>
                        </div>
                        <Badge variant={alert.severity === 'danger' ? 'warning' : alert.severity === 'warning' ? 'secondary' : 'muted'}>
                          {formatAlertType(alert.type)}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => void openStudent(alert.studentId)}
                        disabled={isStudentLoading}
                      >
                        {alert.actionLabel ?? 'View Student'}
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      <Dialog open={selectedStudent !== null} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        {selectedStudent ? (
          <DialogContent className="max-w-3xl" onClose={() => setSelectedStudent(null)}>
            <DialogHeader>
              <DialogTitle>{selectedStudent.fullName}</DialogTitle>
              <DialogDescription>Student admission, licence, training, and fee summary.</DialogDescription>
            </DialogHeader>
            <StudentDetails
              student={selectedStudent}
              onFeeChanged={() => void handleStudentChanged()}
              onStudentChanged={() => void handleStudentChanged()}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
