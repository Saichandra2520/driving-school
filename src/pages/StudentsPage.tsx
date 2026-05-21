import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, RefreshCw } from 'lucide-react';
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
import {
  studentService,
  type SortDirection,
  type StudentPageCursor,
  type StudentSortField
} from '@/services/studentService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import type { CourseType, StudentStatus, StudentWithFee } from '@/types';
import { formatCourseType, formatCurrency, formatDate, formatPhoneNumber } from '@/utils/formatters';

type StatusFilter = 'all' | StudentStatus;
type CourseFilter = 'all' | CourseType;
type SortOption = {
  field: StudentSortField;
  direction: SortDirection;
};
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
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState<CourseFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>({ field: 'enrollmentDate', direction: 'desc' });
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<StudentPageCursor | null>>([null]);
  const [cursorKey, setCursorKey] = useState('');
  const [hasNextPage, setHasNextPage] = useState(false);
  const [pageRange, setPageRange] = useState({ startItem: 0, endItem: 0 });
  const [modalState, setModalState] = useState<ModalState>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const activeBranchId = profile?.role === 'staff' ? profile.branchId : selectedBranchId;
  const queryKey = useMemo(
    () => JSON.stringify([activeBranchId ?? 'all', courseFilter, debouncedSearchTerm.trim(), statusFilter, sortOption.field, sortOption.direction]),
    [activeBranchId, courseFilter, debouncedSearchTerm, sortOption.direction, sortOption.field, statusFilter]
  );
  const hasActiveFilters = Boolean(debouncedSearchTerm.trim()) || courseFilter !== 'all' || statusFilter !== 'all';
  const pageSize = 50;
  const activeFilterDescription = useMemo(
    () => getActiveFilterDescription(debouncedSearchTerm, courseFilter, statusFilter),
    [courseFilter, debouncedSearchTerm, statusFilter]
  );
  const resultSummary = pageRange.startItem
    ? `Showing ${pageRange.startItem}-${pageRange.endItem}${hasNextPage ? ' - More results available' : ''}`
    : hasActiveFilters
      ? 'No matching students'
      : 'No students yet';
  const pageCursor = cursorKey === queryKey ? pageCursors[pageNumber - 1] ?? null : null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPageNumber(1);
    setPageCursors([null]);
    setCursorKey(queryKey);
    setExpandedRows({});
  }, [queryKey]);

  const loadStudents = useCallback(async (): Promise<void> => {
    if (cursorKey !== queryKey) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await studentService.getStudentsPage({
        branchId: activeBranchId,
        courseType: courseFilter,
        status: statusFilter,
        search: debouncedSearchTerm,
        sortField: sortOption.field,
        sortDirection: sortOption.direction,
        pageSize,
        pageNumber,
        cursor: pageCursor
      });

      setStudents(result.rows);
      setHasNextPage(result.pageInfo.hasNextPage);
      setPageRange({
        startItem: result.pageInfo.startItem,
        endItem: result.pageInfo.endItem
      });
      setPageCursors((current) => {
        const next = current.slice(0, pageNumber);
        if (result.pageInfo.nextCursor) next[pageNumber] = result.pageInfo.nextCursor;
        return next;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load students. Please check your connection and try again.');
      setHasNextPage(false);
    } finally {
      setIsLoading(false);
    }
  }, [
    activeBranchId,
    courseFilter,
    cursorKey,
    debouncedSearchTerm,
    pageCursor,
    pageNumber,
    queryKey,
    sortOption.direction,
    sortOption.field,
    statusFilter
  ]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const closeModal = (): void => setModalState(null);

  const toggleExpanded = (studentId: string): void => {
    setExpandedRows((current) => ({
      ...current,
      [studentId]: !current[studentId]
    }));
  };

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
        description="Manage admissions, licence details, fees, and derived training status."
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
      {errorMessage && students.length > 0 ? (
        <Alert variant={errorMessage.includes('next step') ? 'default' : 'destructive'}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{errorMessage}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadStudents()} disabled={isLoading}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      <div className="space-y-4">
          <FilterBar className="md:grid-cols-[1fr_160px_160px_180px_130px]">
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
            <Select value={`${sortOption.field}:${sortOption.direction}`} onChange={(event) => setSortOption(parseSortOption(event.target.value))}>
              <option value="enrollmentDate:desc">Enrollment Newest</option>
              <option value="enrollmentDate:asc">Enrollment Oldest</option>
              <option value="courseStartDate:desc">Course Start Newest</option>
              <option value="courseStartDate:asc">Course Start Oldest</option>
              <option value="balance:desc">Balance High-Low</option>
              <option value="balance:asc">Balance Low-High</option>
              <option value="daysRemaining:asc">Days Remaining Low-High</option>
              <option value="daysRemaining:desc">Days Remaining High-Low</option>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setDebouncedSearchTerm('');
                setCourseFilter('all');
                setStatusFilter('all');
                setSortOption({ field: 'enrollmentDate', direction: 'desc' });
              }}
            >
              Clear
            </Button>
          </FilterBar>

          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>{resultSummary}</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
                disabled={isLoading || pageNumber === 1}
              >
                Previous
              </Button>
              <span className="min-w-16 text-center">Page {pageNumber}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPageNumber((current) => current + 1)}
                disabled={isLoading || !hasNextPage}
              >
                Next
              </Button>
            </div>
          </div>

          {isLoading && students.length === 0 ? (
            <PageLoader label="Loading students..." />
          ) : errorMessage && students.length === 0 ? (
            <EmptyState
              title="Unable to load students."
              description={errorMessage}
              actionLabel="Retry"
              onAction={() => void loadStudents()}
            />
          ) : students.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? 'No students match the selected filters.' : 'No students found. Add your first student.'}
              description={hasActiveFilters ? activeFilterDescription : undefined}
            />
          ) : (
            <div className={`overflow-x-auto rounded-md border ${isLoading ? 'opacity-60' : ''}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortLabel label="Student" />
                    </TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>
                      <SortHeader
                        label="Training"
                        active={sortOption.field === 'courseStartDate' || sortOption.field === 'daysRemaining'}
                        direction={sortOption.direction}
                        onClick={() => setSortOption(toggleSort(sortOption, sortOption.field === 'courseStartDate' ? 'daysRemaining' : 'courseStartDate'))}
                      />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHeader
                        label="Balance"
                        active={sortOption.field === 'balance'}
                        direction={sortOption.direction}
                        onClick={() => setSortOption(toggleSort(sortOption, 'balance'))}
                      />
                    </TableHead>
                    <TableHead className="w-[260px]">Actions</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => {
                    const isExpanded = Boolean(expandedRows[student.id]);

                    return (
                      <Fragment key={student.id}>
                        <TableRow
                          className="h-14 cursor-pointer hover:bg-blue-50/50"
                          onClick={() => toggleExpanded(student.id)}
                        >
                          <TableCell>
                            <p className="font-semibold text-main-text">{student.fullName}</p>
                            <p className="text-sm text-muted-foreground">{formatPhoneNumber(student.phone)}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              <Badge variant="secondary">{formatCourseType(student.courseType)}</Badge>
                              <StatusBadge status={student.status} />
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{formatDate(student.courseStartDate)}</p>
                            <p className="text-xs text-muted-foreground">Completion {formatDate(student.expiryDate)}</p>
                            {(student.status === 'ongoing' || student.status === 'extended') && student.daysRemaining < 0 ? (
                              <StatusBadge status="thirty_days_completed" />
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-danger">{formatCurrency(student.balance)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
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
                          <TableCell className="text-right">
                            <ChevronDown
                              className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            />
                          </TableCell>
                        </TableRow>

                        {isExpanded ? (
                          <TableRow className="bg-muted/20">
                            <TableCell colSpan={6}>
                              <div className="grid gap-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Detail label="Branch" value={student.branchName ?? '-'} />
                                <Detail label="Enrollment Date" value={formatDate(student.enrollmentDate)} />
                                <Detail label="Course Start Date" value={formatDate(student.courseStartDate)} />
                                <Detail label="Total Fee" value={formatCurrency(student.totalAmount)} />
                                <Detail label="Paid" value={formatCurrency(student.paidAmount)} />
                                <Detail label="Balance" value={formatCurrency(student.balance)} />
                                <Detail label="Learning Licence" value={student.learningLicenceNo || '-'} />
                                <Detail label="Driving Licence" value={student.drivingLicenceNo || '-'} />
                                <Detail label="DL Issue Date" value={student.dlIssueDate ? formatDate(student.dlIssueDate) : '-'} />
                                <Detail label="DL Expiry Date" value={student.dlExpiryDate ? formatDate(student.dlExpiryDate) : '-'} />
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
      </div>

      <Dialog open={modalState !== null} onOpenChange={(open) => !open && closeModal()}>
        {modalState?.type === 'add' ? (
          <DialogContent className="max-w-4xl" onClose={closeModal}>
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
          <DialogContent className="max-w-4xl" onClose={closeModal}>
            <DialogHeader>
              <DialogTitle>Edit Student</DialogTitle>
              <DialogDescription>Update admission, licence, or fee details.</DialogDescription>
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

function parseSortOption(value: string): SortOption {
  const [field, direction] = value.split(':') as [StudentSortField, SortDirection];
  return { field, direction };
}

function toggleSort(current: SortOption, field: StudentSortField): SortOption {
  if (current.field !== field) return { field, direction: field === 'balance' ? 'desc' : 'asc' };
  return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

function getActiveFilterDescription(search: string, course: CourseFilter, status: StatusFilter): string {
  const values = [
    search.trim() ? `Search: "${search.trim()}"` : '',
    course !== 'all' ? `Course: ${formatCourseType(course)}` : '',
    status !== 'all' ? `Status: ${status}` : ''
  ].filter(Boolean);

  return values.length ? values.join(' - ') : 'Try changing the filters or search term.';
}

function SortLabel({ label }: { label: string }): JSX.Element {
  return <span>{label}</span>;
}

function SortHeader({
  label,
  active,
  direction,
  onClick
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}): JSX.Element {
  const Icon = direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button type="button" className="inline-flex items-center gap-1 font-medium text-main-text" onClick={onClick}>
      {label}
      {active ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-main-text">{value}</p>
    </div>
  );
}
