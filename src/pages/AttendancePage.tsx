import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle2, ChevronDown, PlusCircle, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { SearchInput } from '@/components/common/SearchInput';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { AddExtensionModal } from '@/components/students/AddExtensionModal';
import { TRAINING_COURSE_OPTIONS } from '@/constants/courses';
import { useCachedSubscription } from '@/hooks/useCachedData';
import { attendanceService } from '@/services/attendanceService';
import { sessionService } from '@/services/sessionService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { cacheTags, createPageCacheKey, invalidatePageCache } from '@/store/pageCacheStore';
import { useReferenceDataStore } from '@/store/referenceDataStore';
import type { AttendanceFilters, AttendanceRow, MarkAttendancePayload, TrainingCourseType } from '@/types';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { formatDate, formatPhoneNumber } from '@/utils/formatters';

type CourseFilter = 'all' | TrainingCourseType;
type AttendanceView = NonNullable<AttendanceFilters['view']>;

type RowFormState = {
  date: string;
  classType: string;
  vehicle: string;
  instructor: string;
  notes: string;
};

type PendingMark =
  | { type: 'single'; row: AttendanceRow; payload: MarkAttendancePayload }
  | { type: 'bulk'; rows: AttendanceRow[]; payload: MarkAttendancePayload }
  | null;

function getTodayDateInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}

const today = getTodayDateInputValue();
const viewOptions: Array<{ value: AttendanceView; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'marked', label: 'Marked' },
  { value: 'completed', label: 'Completed' },
  { value: 'extension_needed', label: 'Extension Needed' }
];

export function AttendancePage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const selectedBranchId = useAppStore((state) => state.branchId);
  const [date, setDate] = useState(today);
  const [courseType, setCourseType] = useState<CourseFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<AttendanceView>('all');
  const [allRows, setAllRows] = useState<AttendanceRow[]>([]);
  const classTypes = useReferenceDataStore((state) => state.classTypes);
  const setClassTypes = useReferenceDataStore((state) => state.setClassTypes);
  const [forms, setForms] = useState<Record<string, RowFormState>>({});
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [extensionTarget, setExtensionTarget] = useState<AttendanceRow | null>(null);
  const [pendingMark, setPendingMark] = useState<PendingMark>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const parentRef = useRef<HTMLDivElement | null>(null);

  const ownerNeedsBranch = profile?.role === 'owner' && !selectedBranchId;
  const staffNeedsBranch = profile?.role === 'staff' && !profile.branchId;
  const effectiveBranchId = profile?.role === 'staff' ? profile.branchId ?? undefined : selectedBranchId ?? undefined;

  const filters = useMemo<AttendanceFilters | null>(() => {
    if (!profile || ownerNeedsBranch || staffNeedsBranch || !effectiveBranchId) return null;

    return {
      role: profile.role,
      userBranchId: profile.branchId ?? undefined,
      branchId: effectiveBranchId,
      courseType,
      search: debouncedSearch,
      selectedDate: date
    };
  }, [courseType, date, debouncedSearch, effectiveBranchId, ownerNeedsBranch, profile, staffNeedsBranch]);
  const attendanceCacheKey = useMemo(
    () =>
      createPageCacheKey('attendance', {
        branchId: filters?.branchId ?? 'none',
        courseType: filters?.courseType ?? 'all',
        date: filters?.selectedDate ?? date,
        role: filters?.role ?? 'none',
        search: filters?.search ?? '',
        userId: profile?.id ?? 'anonymous'
      }),
    [date, filters?.branchId, filters?.courseType, filters?.role, filters?.search, filters?.selectedDate, profile?.id]
  );
  const attendanceCacheTags = useMemo(
    () => [
      cacheTags.attendance,
      cacheTags.students,
      cacheTags.branch(filters?.branchId ?? 'all'),
      cacheTags.user(profile?.id)
    ],
    [filters?.branchId, profile?.id]
  );
  const subscribeAttendance = useCallback(
    (onNext: (rows: AttendanceRow[]) => void, onError: (error: Error) => void) => {
      if (!filters) return () => undefined;
      return attendanceService.subscribeAttendanceRows(filters, onNext, onError);
    },
    [filters]
  );
  const {
    data: cachedAttendanceRows,
    error: attendanceError,
    isLoading,
    isRefreshing,
    setCachedData: setCachedAttendanceRows
  } = useCachedSubscription<AttendanceRow[]>({
    cacheKey: attendanceCacheKey,
    enabled: Boolean(filters),
    subscribe: subscribeAttendance,
    tags: attendanceCacheTags
  });

  const rows = useMemo(() => allRows.filter((row) => matchesAttendanceView(row, view)), [allRows, view]);
  const summary = useMemo(() => getAttendanceSummary(allRows), [allRows]);
  const selectedRowEntries = useMemo(
    () => rows.filter((row) => selectedRows[getRowKey(row)] && !row.isCompleted),
    [rows, selectedRows]
  );
  const selectedCourseType = selectedRowEntries[0]?.courseType ?? null;
  const selectedCourseMixed = selectedRowEntries.some((row) => row.courseType !== selectedCourseType);
  const bulkClassOptions = useMemo(() => {
    if (!selectedCourseType) return [];
    const keys = Array.from(new Set(selectedRowEntries.map((row) => `${row.branchId}-${row.courseType}`)));
    return Array.from(new Set(keys.flatMap((key) => classTypes[key] ?? [])));
  }, [classTypes, selectedCourseType, selectedRowEntries]);
  const bulkForm = forms.bulk ?? emptyRowForm(date, bulkClassOptions[0] ?? '');

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (expandedRows[getRowKey(rows[index])] ? 285 : 116),
    overscan: 8
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setAllRows(cachedAttendanceRows ?? []);
  }, [cachedAttendanceRows]);

  const loadAttendance = useCallback(async (): Promise<void> => {
    if (!filters) {
      setAllRows([]);
      return;
    }

    setIsManualRefreshing(true);
    setErrorMessage('');

    try {
      const data = await attendanceService.getAttendanceRows(filters);
      setCachedAttendanceRows(data);
    } catch (error) {
      console.error('Failed to load attendance:', error);
      setErrorMessage(getFriendlyErrorMessage(error, 'Unable to load attendance. Please check your connection and try again.'));
    } finally {
      setIsManualRefreshing(false);
    }
  }, [filters, setCachedAttendanceRows]);

  useEffect(() => {
    if (!attendanceError) return;

    console.error('Failed to load attendance:', attendanceError);
    setErrorMessage(getFriendlyErrorMessage(attendanceError, 'Unable to load attendance. Please check your connection and try again.'));
  }, [attendanceError]);

  useEffect(() => {
    setSelectedRows({});
    setExpandedRows({});
  }, [courseType, date, debouncedSearch, effectiveBranchId, view]);

  useEffect(() => {
    if (!message && !errorMessage) return;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
      setErrorMessage('');
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [errorMessage, message]);

  useEffect(() => {
    let isMounted = true;

    const loadClassTypes = async (): Promise<void> => {
      const uniqueKeys = Array.from(new Set(rows.map((row) => `${row.branchId}-${row.courseType}`)));
      const missingKeys = uniqueKeys.filter((key) => !classTypes[key]);
      if (missingKeys.length === 0) return;

      const entries = await Promise.all(
        missingKeys.map(async (key) => {
          const [branchId, course] = key.split('-') as [string, TrainingCourseType];
          const values = await sessionService.getClassTypes(branchId, course);
          return [key, values] as const;
        })
      );

      if (!isMounted) return;
      entries.forEach(([key, values]) => setClassTypes(key, values));
    };

    void loadClassTypes();

    return () => {
      isMounted = false;
    };
  }, [classTypes, rows, setClassTypes]);

  useEffect(() => {
    setForms((current) => {
      const next = { ...current };

      rows.forEach((row) => {
        const rowKey = getRowKey(row);
        const classTypeKey = `${row.branchId}-${row.courseType}`;
        const defaultClassType = classTypes[classTypeKey]?.[0] || '';

        if (!next[rowKey]) {
          next[rowKey] = emptyRowForm(date, defaultClassType);
        } else {
          next[rowKey] = {
            ...next[rowKey],
            date: next[rowKey].date || date,
            classType: next[rowKey].classType || defaultClassType
          };
        }
      });

      next.bulk = {
        ...(next.bulk ?? emptyRowForm(date, bulkClassOptions[0] ?? '')),
        date: next.bulk?.date || date,
        classType: next.bulk?.classType || bulkClassOptions[0] || ''
      };

      return next;
    });
  }, [bulkClassOptions, classTypes, date, rows]);

  const updateForm = (rowKey: string, patch: Partial<RowFormState>): void => {
    setForms((current) => ({
      ...current,
      [rowKey]: { ...(current[rowKey] ?? emptyRowForm(date)), ...patch }
    }));
  };

  const toggleRow = (rowKey: string): void => {
    setExpandedRows((current) => ({
      ...current,
      [rowKey]: !current[rowKey]
    }));
  };

  const toggleSelected = (row: AttendanceRow): void => {
    if (row.isCompleted) return;
    const rowKey = getRowKey(row);
    const selectedCourse = selectedRowEntries[0]?.courseType;
    if (!selectedRows[rowKey] && selectedCourse && selectedCourse !== row.courseType) {
      setErrorMessage('Bulk attendance can include only one course at a time.');
      return;
    }

    setSelectedRows((current) => ({
      ...current,
      [rowKey]: !current[rowKey]
    }));
  };

  const buildPayload = (row: AttendanceRow, form: RowFormState | undefined): MarkAttendancePayload | null => {
    const classTypeKey = `${row.branchId}-${row.courseType}`;
    const selectedClassType = form?.classType || classTypes[classTypeKey]?.[0] || '';
    const selectedDate = form?.date || date;

    if (!selectedDate) {
      setErrorMessage('Date is required.');
      return null;
    }

    if (selectedDate > getTodayDateInputValue()) {
      setErrorMessage('Attendance date cannot be in the future.');
      return null;
    }

    if (selectedDate < row.courseStartDate) {
      setErrorMessage('Attendance date cannot be before the course start date.');
      return null;
    }

    if (selectedDate > row.courseCompletionDate) {
      setErrorMessage(`Attendance date must be within the ${row.allowedDays}-day course period.`);
      return null;
    }

    if (!selectedClassType) {
      setErrorMessage('Class type is required.');
      return null;
    }

    return {
      date: selectedDate,
      classType: selectedClassType,
      vehicle: form?.vehicle,
      instructor: form?.instructor,
      notes: form?.notes
    };
  };

  const markRows = async (targetRows: AttendanceRow[], payload: MarkAttendancePayload): Promise<void> => {
    targetRows.forEach((row) => {
      const rowKey = getRowKey(row);
      setSavingRows((current) => ({ ...current, [rowKey]: true }));
    });

    try {
      await Promise.all(targetRows.map((row) => attendanceService.markAttendance(row.sessionId, payload, row.allowedSessions)));
      setMessage(targetRows.length === 1 ? 'Attendance marked successfully.' : `${targetRows.length} attendance records marked successfully.`);
      setSelectedRows({});
      targetRows.forEach((row) => updateForm(getRowKey(row), { date: payload.date, vehicle: '', instructor: '', notes: '' }));
      invalidatePageCache([
        cacheTags.dashboard,
        cacheTags.students,
        cacheTags.reports,
        cacheTags.branch(effectiveBranchId ?? 'all'),
        cacheTags.user(profile?.id)
      ]);
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Unable to mark attendance. Please try again.'));
    } finally {
      targetRows.forEach((row) => {
        const rowKey = getRowKey(row);
        setSavingRows((current) => ({ ...current, [rowKey]: false }));
      });
      setIsBulkSaving(false);
    }
  };

  const handleMarkPresent = async (row: AttendanceRow): Promise<void> => {
    const rowKey = getRowKey(row);
    const payload = buildPayload(row, forms[rowKey]);
    if (!payload) {
      setExpandedRows((current) => ({ ...current, [rowKey]: true }));
      return;
    }

    setMessage('');
    setErrorMessage('');

    if (row.isMarkedOnSelectedDate && payload.date === date) {
      setPendingMark({ type: 'single', row, payload });
      return;
    }

    await markRows([row], payload);
  };

  const handleBulkMark = async (): Promise<void> => {
    const targetRows = selectedRowEntries.filter((row) => !row.isCompleted);
    if (targetRows.length === 0) {
      setErrorMessage('Select at least one pending attendance row.');
      return;
    }

    if (selectedCourseMixed) {
      setErrorMessage('Bulk attendance can include only one course at a time.');
      return;
    }

    const payload = buildPayload(targetRows[0], bulkForm);
    if (!payload) return;

    setMessage('');
    setErrorMessage('');
    setIsBulkSaving(true);

    const duplicateRows = targetRows.filter((row) => row.isMarkedOnSelectedDate && payload.date === date);
    if (duplicateRows.length > 0) {
      setPendingMark({ type: 'bulk', rows: targetRows, payload });
      return;
    }

    await markRows(targetRows, payload);
  };

  const handleConfirmPendingMark = async (): Promise<void> => {
    const target = pendingMark;
    setPendingMark(null);
    if (!target) return;

    if (target.type === 'single') {
      await markRows([target.row], target.payload);
    } else {
      await markRows(target.rows, target.payload);
    }
  };

  const handleExtensionSaved = async (nextMessage: string): Promise<void> => {
    setExtensionTarget(null);
    setMessage(nextMessage);
    setErrorMessage('');
    invalidatePageCache([
      cacheTags.attendance,
      cacheTags.dashboard,
      cacheTags.students,
      cacheTags.reports,
      cacheTags.branch(effectiveBranchId ?? 'all'),
      cacheTags.user(profile?.id)
    ]);
    await loadAttendance();
  };

  const hasActiveFilters = courseType !== 'all' || Boolean(debouncedSearch.trim()) || view !== 'all';
  const duplicateCount = pendingMark?.type === 'single'
    ? 1
    : pendingMark?.rows.filter((row) => row.isMarkedOnSelectedDate).length ?? 0;

  return (
    <section className="space-y-5">
      <PageHeader
        title="Attendance"
        description="Mark training sessions on the dates students actually attend."
        actions={
          <Button type="button" variant="outline" onClick={() => void loadAttendance()} disabled={isLoading || isRefreshing || isManualRefreshing || ownerNeedsBranch || staffNeedsBranch}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {isManualRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      {ownerNeedsBranch ? (
        <EmptyState
          title="Select a branch to mark attendance."
          description="Attendance is branch-specific for production safety. Choose a branch from the branch selector first."
        />
      ) : staffNeedsBranch ? (
        <EmptyState
          title="Your staff profile is not assigned to a branch."
          description="Ask the owner to edit your staff profile and select a branch before marking attendance."
        />
      ) : (
        <>
          <FilterBar className="md:grid-cols-[180px_160px_minmax(240px,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="attendance-date">Date</Label>
              <Input id="attendance-date" type="date" value={date} max={getTodayDateInputValue()} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-course">Course</Label>
              <Select id="attendance-course" value={courseType} onChange={(event) => setCourseType(event.target.value as CourseFilter)}>
                <option value="all">All</option>
                {TRAINING_COURSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-search">Search</Label>
              <SearchInput
                id="attendance-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by student name or phone"
              />
            </div>
          </FilterBar>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Total Visible" value={summary.total} />
            <SummaryCard label="Pending" value={summary.pending} />
            <SummaryCard label="Marked" value={summary.marked} />
            <SummaryCard label="Completed" value={summary.completed} />
            <SummaryCard label="Extension Needed" value={summary.extensionNeeded} />
          </div>

          <div className="flex flex-wrap gap-2">
            {viewOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={view === option.value ? 'default' : 'outline'}
                onClick={() => setView(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {selectedRowEntries.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bulk Attendance ({selectedRowEntries.length})</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-[160px_220px_1fr_1fr_1fr_170px]">
                <Field label="Date" htmlFor="bulk-date">
                  <Input id="bulk-date" type="date" value={bulkForm.date} max={getTodayDateInputValue()} onChange={(event) => updateForm('bulk', { date: event.target.value })} />
                </Field>
                <Field label="Class Type" htmlFor="bulk-class">
                  <Select id="bulk-class" value={bulkForm.classType} onChange={(event) => updateForm('bulk', { classType: event.target.value })}>
                    <option value="">Select class</option>
                    {bulkClassOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Vehicle" htmlFor="bulk-vehicle">
                  <Input id="bulk-vehicle" value={bulkForm.vehicle} placeholder="Optional" onChange={(event) => updateForm('bulk', { vehicle: event.target.value })} />
                </Field>
                <Field label="Instructor" htmlFor="bulk-instructor">
                  <Input id="bulk-instructor" value={bulkForm.instructor} placeholder="Optional" onChange={(event) => updateForm('bulk', { instructor: event.target.value })} />
                </Field>
                <Field label="Notes" htmlFor="bulk-notes">
                  <Input id="bulk-notes" value={bulkForm.notes} placeholder="Optional" onChange={(event) => updateForm('bulk', { notes: event.target.value })} />
                </Field>
                <div className="flex items-end gap-2">
                  <Button type="button" onClick={() => void handleBulkMark()} disabled={isBulkSaving}>
                    {isBulkSaving ? 'Saving...' : 'Mark Selected'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setSelectedRows({})}>
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {message ? <Alert variant="success">{message}</Alert> : null}
          {errorMessage && rows.length > 0 ? (
            <Alert variant="destructive">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{errorMessage}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void loadAttendance()} disabled={isLoading || isRefreshing || isManualRefreshing}>
                  Retry
                </Button>
              </div>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Training Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && rows.length === 0 ? (
                <PageLoader label="Loading attendance..." />
              ) : errorMessage && rows.length === 0 ? (
                <EmptyState title="Unable to load attendance." description={errorMessage} actionLabel="Retry" onAction={() => void loadAttendance()} />
              ) : rows.length === 0 ? (
                <EmptyState title={hasActiveFilters ? 'No students match the selected filters.' : 'No students available for attendance.'} />
              ) : (
                <div
                  ref={parentRef}
                  className={`h-[640px] overflow-auto pr-2 ${isRefreshing || isManualRefreshing ? 'opacity-60' : ''}`}
                >
                  <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                      const row = rows[virtualRow.index];
                      const rowKey = getRowKey(row);
                      const form = forms[rowKey] ?? emptyRowForm(date);
                      const classTypeOptions = classTypes[`${row.branchId}-${row.courseType}`] ?? [];
                      const isSaving = Boolean(savingRows[rowKey]);
                      const isSelected = Boolean(selectedRows[rowKey]);

                      return (
                        <div
                          key={rowKey}
                          ref={virtualizer.measureElement}
                          data-index={virtualRow.index}
                          className="absolute left-0 top-0 w-full pb-2"
                          style={{ transform: `translateY(${virtualRow.start}px)` }}
                        >
                          <AttendanceChecklistItem
                            row={row}
                            rowKeyValue={rowKey}
                            form={form}
                            classTypeOptions={classTypeOptions}
                            isSaving={isSaving}
                            isExpanded={Boolean(expandedRows[rowKey])}
                            isSelected={isSelected}
                            maxDate={getTodayDateInputValue()}
                            onToggle={() => toggleRow(rowKey)}
                            onToggleSelected={() => toggleSelected(row)}
                            onUpdateForm={updateForm}
                            onMarkPresent={() => void handleMarkPresent(row)}
                            onQuickMark={() => void handleMarkPresent(row)}
                            onExtend={() => setExtensionTarget(row)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AddExtensionModal
        open={extensionTarget !== null}
        student={
          extensionTarget
            ? {
                id: extensionTarget.studentId,
                branchId: extensionTarget.branchId,
                courseType: extensionTarget.courseType
              }
            : null
        }
        defaultCourseType={extensionTarget?.courseType}
        onClose={() => setExtensionTarget(null)}
        onSaved={(nextMessage) => void handleExtensionSaved(nextMessage)}
      />

      <ConfirmDialog
        open={pendingMark !== null}
        title="Duplicate Attendance Date"
        description={`${duplicateCount} selected attendance ${duplicateCount === 1 ? 'row already has' : 'rows already have'} a session on ${formatDate(date)}. Mark another session anyway?`}
        confirmLabel="Mark Anyway"
        onCancel={() => {
          setPendingMark(null);
          setIsBulkSaving(false);
        }}
        onConfirm={() => void handleConfirmPendingMark()}
      />
    </section>
  );
}

function AttendanceChecklistItem({
  row,
  rowKeyValue,
  form,
  classTypeOptions,
  isSaving,
  isExpanded,
  isSelected,
  maxDate,
  onToggle,
  onToggleSelected,
  onUpdateForm,
  onMarkPresent,
  onQuickMark,
  onExtend
}: {
  row: AttendanceRow;
  rowKeyValue: string;
  form: RowFormState;
  classTypeOptions: string[];
  isSaving: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  maxDate: string;
  onToggle: () => void;
  onToggleSelected: () => void;
  onUpdateForm: (rowKey: string, patch: Partial<RowFormState>) => void;
  onMarkPresent: () => void;
  onQuickMark: () => void;
  onExtend: () => void;
}): JSX.Element {
  const progressPercent = Math.min(100, Math.round((row.completedSessions / row.allowedSessions) * 100));
  const lastClass = row.lastClassType ? `${row.lastClassType}${row.lastSessionDate ? ` - ${formatDate(row.lastSessionDate)}` : ''}` : '-';

  return (
    <div className="overflow-hidden rounded-lg border bg-surface shadow-sm transition-colors hover:border-primary/30">
      <div
        role="button"
        tabIndex={0}
        className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-50/50 lg:grid-cols-[36px_minmax(240px,1.4fr)_140px_150px_170px_190px_40px]"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onToggle();
        }}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={isSelected}
            disabled={row.isCompleted || isSaving}
            onChange={onToggleSelected}
            aria-label={`Select ${row.studentName}`}
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-main-text">{row.studentName}</p>
            <Badge variant="info">{row.courseType}</Badge>
            {row.isMarkedOnSelectedDate ? <Badge variant="success">Marked</Badge> : null}
            {row.isCompleted ? <StatusBadge status="completed" /> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{formatPhoneNumber(row.phone)} - {row.branchName ?? row.branchId}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Sessions</p>
          <p className="mt-1 font-semibold text-main-text">{row.completedSessions} / {row.allowedSessions}</p>
          <div className="mt-1 h-1.5 rounded-full bg-background">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Next Session</p>
          <p className="mt-1 font-semibold text-main-text">{row.isCompleted ? 'Done' : row.nextSessionNo ?? '-'}</p>
          {!row.isCompleted ? <p className="mt-1 text-xs text-muted-foreground">{row.remainingSessions} remaining</p> : null}
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Last Class</p>
          <p className="mt-1 truncate font-medium text-main-text">{lastClass}</p>
          {row.selectedDateSessionCount > 0 ? (
            <p className="mt-1 truncate text-xs text-success">{row.selectedDateSessionCount} on selected date</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end" onClick={(event) => event.stopPropagation()}>
          {!row.isCompleted ? (
            <Button type="button" size="sm" onClick={onQuickMark} disabled={isSaving}>
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {isSaving ? 'Saving...' : 'Quick Mark'}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={onExtend}>
              <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Extend
            </Button>
          )}
        </div>

        <div className="flex items-center justify-end">
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </div>
      </div>

      {isExpanded ? (
        <div className="border-t bg-surface p-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_170px]">
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
              <Field label="Session Date *" htmlFor={`${rowKeyValue}-date`}>
                <Input
                  id={`${rowKeyValue}-date`}
                  type="date"
                  value={form.date}
                  max={maxDate}
                  onChange={(event) => onUpdateForm(rowKeyValue, { date: event.target.value })}
                  disabled={row.isCompleted || isSaving}
                />
              </Field>
              <Field label="Class Type *" htmlFor={`${rowKeyValue}-class-type`}>
                <Select
                  id={`${rowKeyValue}-class-type`}
                  value={form.classType}
                  onChange={(event) => onUpdateForm(rowKeyValue, { classType: event.target.value })}
                  disabled={row.isCompleted || isSaving}
                >
                  <option value="">Select class</option>
                  {classTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Vehicle" htmlFor={`${rowKeyValue}-vehicle`}>
                <Input
                  id={`${rowKeyValue}-vehicle`}
                  value={form.vehicle}
                  placeholder="Optional"
                  onChange={(event) => onUpdateForm(rowKeyValue, { vehicle: event.target.value })}
                  disabled={row.isCompleted || isSaving}
                />
              </Field>
              <Field label="Instructor" htmlFor={`${rowKeyValue}-instructor`}>
                <Input
                  id={`${rowKeyValue}-instructor`}
                  value={form.instructor}
                  placeholder="Optional"
                  onChange={(event) => onUpdateForm(rowKeyValue, { instructor: event.target.value })}
                  disabled={row.isCompleted || isSaving}
                />
              </Field>
              <Field label="Notes" htmlFor={`${rowKeyValue}-notes`}>
                <Input
                  id={`${rowKeyValue}-notes`}
                  value={form.notes}
                  placeholder="Optional"
                  onChange={(event) => onUpdateForm(rowKeyValue, { notes: event.target.value })}
                  disabled={row.isCompleted || isSaving}
                />
              </Field>
            </div>

            <div className="flex flex-col justify-end gap-2 xl:items-stretch">
              <Button type="button" onClick={onMarkPresent} disabled={row.isCompleted || isSaving}>
                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                {row.isCompleted ? 'Completed' : isSaving ? 'Saving...' : 'Mark Present'}
              </Button>
              {row.isCompleted ? (
                <Button type="button" variant="secondary" onClick={onExtend}>
                  <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add Extension
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-main-text">{value}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function getAttendanceSummary(rows: AttendanceRow[]): {
  total: number;
  pending: number;
  marked: number;
  completed: number;
  extensionNeeded: number;
} {
  return rows.reduce(
    (summary, row) => ({
      total: summary.total + 1,
      pending: summary.pending + (!row.isCompleted && !row.isMarkedOnSelectedDate ? 1 : 0),
      marked: summary.marked + (row.isMarkedOnSelectedDate ? 1 : 0),
      completed: summary.completed + (row.isCompleted ? 1 : 0),
      extensionNeeded: summary.extensionNeeded + (row.isCompleted ? 1 : 0)
    }),
    { total: 0, pending: 0, marked: 0, completed: 0, extensionNeeded: 0 }
  );
}

function matchesAttendanceView(row: AttendanceRow, view: AttendanceView): boolean {
  if (view === 'pending') return !row.isCompleted && !row.isMarkedOnSelectedDate;
  if (view === 'marked') return row.isMarkedOnSelectedDate;
  if (view === 'completed') return row.isCompleted;
  if (view === 'extension_needed') return row.isCompleted;
  return true;
}

function getRowKey(row: AttendanceRow): string {
  return `${row.sessionId}-${row.courseType}`;
}

function emptyRowForm(dateValue = today, classType = ''): RowFormState {
  return {
    date: dateValue,
    classType,
    vehicle: '',
    instructor: '',
    notes: ''
  };
}
