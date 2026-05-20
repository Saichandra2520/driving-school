import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { FilterBar } from '@/components/common/FilterBar';
import { PageLoader } from '@/components/common/PageLoader';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AddInstallmentModal } from '@/components/fees/AddInstallmentModal';
import { StudentDetails } from '@/components/students/StudentDetails';
import { StudentForm } from '@/components/students/StudentForm';
import { studentService } from '@/services/studentService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import type { CourseType, StudentStatus, StudentWithFee } from '@/types';
import { formatCourseType, formatCurrency, formatDate, formatPhoneNumber } from '@/utils/formatters';

type StatusFilter = 'all' | StudentStatus;
type CourseFilter = 'all' | CourseType;
type ModalState =
  | { type: 'add' }
  | { type: 'edit'; student: StudentWithFee }
  | { type: 'view'; student: StudentWithFee }
  | { type: 'payment'; student: StudentWithFee }
  | null;

export function StudentsPage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const selectedBranchId = useAppStore((state) => state.branchId);
  const [students, setStudents] = useState<StudentWithFee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState<CourseFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const activeBranchId = profile?.role === 'staff' ? profile.branchId : selectedBranchId;
  const hasActiveFilters = Boolean(searchTerm.trim()) || courseFilter !== 'all' || statusFilter !== 'all';

  const loadStudents = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const data = await studentService.getStudents({
        branchId: activeBranchId,
        courseType: courseFilter,
        status: statusFilter,
        search: searchTerm
      });
      setStudents(data);
    } catch {
      setErrorMessage('Unable to load students. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, courseFilter, searchTerm, statusFilter]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const closeModal = (): void => setModalState(null);

  const handleSaved = async (message: string): Promise<void> => {
    closeModal();
    setSuccessMessage(message);
    await loadStudents();
  };

  const handleFeeChanged = async (message?: string): Promise<void> => {
    if (message) {
      setSuccessMessage(message);
      setErrorMessage('');
    }
    await loadStudents();
  };

  return (
    <section className="space-y-5">
      <PageHeader
        title="Students"
        description="Manage admissions, licence details, fees, and training status."
        actions={
          <Button
            type="button"
            onClick={() => {
              setSuccessMessage('');
              setErrorMessage('');
              setModalState({ type: 'add' });
            }}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add Student
          </Button>
        }
      />

      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant={errorMessage.includes('next step') ? 'default' : 'destructive'}>{errorMessage}</Alert> : null}

      <div className="space-y-4">
          <FilterBar className="md:grid-cols-[1fr_160px_160px_130px]">
            <SearchInput
              placeholder="Search name, phone, LL no, DL no"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <Select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value as CourseFilter)}>
              <option value="all">All Courses</option>
              <option value="2W">2W</option>
              <option value="4W">4W</option>
              <option value="both">Both</option>
            </Select>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All Status</option>
              <option value="ongoing">Ongoing</option>
              <option value="passed">Passed</option>
              <option value="extended">Extended</option>
              <option value="dropped">Dropped</option>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setCourseFilter('all');
                setStatusFilter('all');
              }}
            >
              Clear
            </Button>
          </FilterBar>

          {isLoading ? (
            <PageLoader label="Loading students..." />
          ) : students.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? 'No students match the selected filters.' : 'No students found. Add your first student.'}
            />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Training</TableHead>
                    <TableHead>Licence</TableHead>
                    <TableHead className="text-right">Total Fee</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="w-[260px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id} className="h-14">
                      <TableCell>
                        <button type="button" className="text-left font-semibold text-primary hover:underline" onClick={() => setModalState({ type: 'view', student })}>
                          {student.fullName}
                        </button>
                        <p className="text-sm text-muted-foreground">{formatPhoneNumber(student.phone)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="secondary">{formatCourseType(student.courseType)}</Badge>
                          <StatusBadge status={student.status} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{formatDate(student.enrollmentDate)}</p>
                        <p className="text-xs text-muted-foreground">Base date {formatDate(student.expiryDate)}</p>
                        {student.status === 'ongoing' && student.daysRemaining < 0 ? <StatusBadge status="thirty_days_completed" /> : null}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">LL: {student.learningLicenceNo || '-'}</p>
                        <p className="text-xs text-muted-foreground">DL: {student.drivingLicenceNo || '-'}</p>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(student.totalAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(student.paidAmount)}</TableCell>
                      <TableCell className="text-right font-semibold text-danger">{formatCurrency(student.balance)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setModalState({ type: 'view', student })}>
                            View
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setModalState({ type: 'edit', student })}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setModalState({ type: 'payment', student })}
                          >
                            Payment
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </div>

      <Dialog open={modalState !== null} onOpenChange={(open) => !open && closeModal()}>
        {modalState?.type === 'add' ? (
          <DialogContent onClose={closeModal}>
            <DialogHeader>
              <DialogTitle>Add Student</DialogTitle>
              <DialogDescription>Enter admission, licence, and fee details.</DialogDescription>
            </DialogHeader>
            <StudentForm
              defaultBranchId={activeBranchId}
              onCancel={closeModal}
              onSaved={() => void handleSaved('Student added successfully.')}
            />
          </DialogContent>
        ) : null}

        {modalState?.type === 'edit' ? (
          <DialogContent onClose={closeModal}>
            <DialogHeader>
              <DialogTitle>Edit Student</DialogTitle>
              <DialogDescription>Update admission, licence, status, or fee details.</DialogDescription>
            </DialogHeader>
            <StudentForm
              defaultBranchId={modalState.student.branchId}
              student={modalState.student}
              onCancel={closeModal}
              onSaved={() => void handleSaved('Student updated successfully.')}
            />
          </DialogContent>
        ) : null}

        {modalState?.type === 'view' ? (
          <DialogContent className="max-w-3xl" onClose={closeModal}>
            <DialogHeader>
              <DialogTitle>{modalState.student.fullName}</DialogTitle>
              <DialogDescription>Student admission, licence, training, and fee summary.</DialogDescription>
            </DialogHeader>
            <StudentDetails
              student={modalState.student}
              onFeeChanged={() => void handleFeeChanged()}
              onStudentChanged={() => void handleFeeChanged()}
            />
          </DialogContent>
        ) : null}
      </Dialog>

      <AddInstallmentModal
        open={modalState?.type === 'payment'}
        student={modalState?.type === 'payment' ? modalState.student : null}
        balance={modalState?.type === 'payment' ? modalState.student.balance : 0}
        onClose={closeModal}
        onSaved={(_, message) => {
          closeModal();
          void handleFeeChanged(message);
        }}
      />
    </section>
  );
}
