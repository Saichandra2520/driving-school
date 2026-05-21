import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, PlusCircle, RefreshCw } from 'lucide-react';
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
import { attendanceService } from '@/services/attendanceService';
import { sessionService } from '@/services/sessionService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { useReferenceDataStore } from '@/store/referenceDataStore';
import type { AttendanceFilters, AttendanceRow, MarkAttendancePayload, TrainingCourseType } from '@/types';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { formatDate, formatPhoneNumber } from '@/utils/formatters';

type CourseFilter = 'all' | TrainingCourseType;

type RowFormState = {
  date: string;
  classType: string;
  vehicle: string;
  instructor: string;
  notes: string;
};

const today = new Date().toISOString().slice(0, 10);

export function AttendancePage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const selectedBranchId = useAppStore((state) => state.branchId);
  const [date, setDate] = useState(today);
  const [courseType, setCourseType] = useState<CourseFilter>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const classTypes = useReferenceDataStore((state) => state.classTypes);
  const setClassTypes = useReferenceDataStore((state) => state.setClassTypes);
  const [forms, setForms] = useState<Record<string, RowFormState>>({});
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [extensionTarget, setExtensionTarget] = useState<AttendanceRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const filters = useMemo<AttendanceFilters | null>(() => {
    if (!profile) return null;

    return {
      role: profile.role,
      userBranchId: profile.branchId ?? undefined,
      branchId: profile.role === 'owner' ? selectedBranchId ?? 'all' : profile.branchId ?? undefined,
      courseType,
      search
    };
  }, [courseType, profile, search, selectedBranchId]);

  const loadAttendance = useCallback(async (): Promise<void> => {
    if (!filters) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const data = await attendanceService.getAttendanceRows(filters);
      setRows(data);
    } catch (error) {
      console.error('Failed to load attendance:', error);
      setErrorMessage(getFriendlyErrorMessage(error, 'Unable to load attendance. Please check your connection and try again.'));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!filters) return;

    setIsLoading(true);
    setErrorMessage('');

    const unsubscribe = attendanceService.subscribeAttendanceRows(
      filters,
      (data) => {
        setRows(data);
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to load attendance:', error);
        setErrorMessage(getFriendlyErrorMessage(error, 'Unable to load attendance. Please check your connection and try again.'));
        setRows([]);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [filters]);

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
        const defaultClassType = classTypes[classTypeKey]?.[0] ?? '';

        if (!next[rowKey]) {
          next[rowKey] = { date, classType: defaultClassType, vehicle: '', instructor: '', notes: '' };
        } else if (!next[rowKey].classType && defaultClassType) {
          next[rowKey] = { ...next[rowKey], classType: defaultClassType };
        } else if (!next[rowKey].date) {
          next[rowKey] = { ...next[rowKey], date };
        }
      });

      return next;
    });
  }, [classTypes, date, rows]);

  const updateForm = (rowKey: string, patch: Partial<RowFormState>): void => {
    setForms((current) => ({
      ...current,
      [rowKey]: { ...(current[rowKey] ?? emptyRowForm()), ...patch }
    }));
  };

  const toggleRow = (rowKey: string): void => {
    setExpandedRows((current) => ({
      ...current,
      [rowKey]: !current[rowKey]
    }));
  };

  const handleMarkPresent = async (row: AttendanceRow): Promise<void> => {
    const rowKey = getRowKey(row);
    const form = forms[rowKey];
    const classTypeKey = `${row.branchId}-${row.courseType}`;
    const selectedClassType = form?.classType || classTypes[classTypeKey]?.[0] || '';

    setMessage('');
    setErrorMessage('');

    const selectedDate = form?.date || date;

    if (!selectedDate) {
      setErrorMessage('Date is required.');
      setExpandedRows((current) => ({ ...current, [rowKey]: true }));
      return;
    }

    if (!selectedClassType) {
      setErrorMessage('Class type is required.');
      setExpandedRows((current) => ({ ...current, [rowKey]: true }));
      return;
    }

    setSavingRows((current) => ({ ...current, [rowKey]: true }));

    try {
      const payload: MarkAttendancePayload = {
        date: selectedDate,
        classType: selectedClassType,
        vehicle: form?.vehicle,
        instructor: form?.instructor,
        notes: form?.notes
      };

      await attendanceService.markAttendance(row.sessionId, payload, row.allowedSessions);
      setMessage('Attendance marked successfully.');
      updateForm(rowKey, { date: selectedDate, vehicle: '', instructor: '', notes: '' });
      await loadAttendance();
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Unable to mark attendance. Please try again.'));
    } finally {
      setSavingRows((current) => ({ ...current, [rowKey]: false }));
    }
  };

  const handleExtensionSaved = async (nextMessage: string): Promise<void> => {
    setExtensionTarget(null);
    setMessage(nextMessage);
    setErrorMessage('');
    await loadAttendance();
  };

  const hasActiveFilters = courseType !== 'all' || Boolean(search.trim());

  return (
    <section className="space-y-5">
      <PageHeader
        title="Attendance"
        description="Mark training sessions on the dates students actually attend."
        actions={
          <Button type="button" variant="outline" onClick={() => void loadAttendance()} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <FilterBar className="md:grid-cols-[180px_160px_minmax(240px,1fr)]">
        <div className="space-y-2">
          <Label htmlFor="attendance-date">Date</Label>
          <Input id="attendance-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="attendance-course">Course</Label>
          <Select id="attendance-course" value={courseType} onChange={(event) => setCourseType(event.target.value as CourseFilter)}>
            <option value="all">All</option>
            <option value="2W">2W</option>
            <option value="4W">4W</option>
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

      {message ? <Alert variant="success">{message}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Training Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <PageLoader label="Loading attendance..." />
          ) : rows.length === 0 ? (
            <EmptyState title={hasActiveFilters ? 'No students match the selected filters.' : 'No students available for attendance.'} />
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const rowKey = getRowKey(row);
                const form = forms[rowKey] ?? { date, classType: '', vehicle: '', instructor: '', notes: '' };
                const classTypeOptions = classTypes[`${row.branchId}-${row.courseType}`] ?? [];
                const isSaving = Boolean(savingRows[rowKey]);

                return (
                  <AttendanceChecklistItem
                    key={rowKey}
                    row={row}
                    rowKeyValue={rowKey}
                    form={form}
                    classTypeOptions={classTypeOptions}
                    isSaving={isSaving}
                    isExpanded={Boolean(expandedRows[rowKey])}
                    onToggle={() => toggleRow(rowKey)}
                    onUpdateForm={updateForm}
                    onMarkPresent={() => void handleMarkPresent(row)}
                    onExtend={() => setExtensionTarget(row)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
  onToggle,
  onUpdateForm,
  onMarkPresent,
  onExtend
}: {
  row: AttendanceRow;
  rowKeyValue: string;
  form: RowFormState;
  classTypeOptions: string[];
  isSaving: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateForm: (rowKey: string, patch: Partial<RowFormState>) => void;
  onMarkPresent: () => void;
  onExtend: () => void;
}): JSX.Element {
  const progressPercent = Math.min(100, Math.round((row.completedSessions / row.allowedSessions) * 100));
  const lastClass = row.lastClassType ? `${row.lastClassType}${row.lastSessionDate ? ` · ${formatDate(row.lastSessionDate)}` : ''}` : '-';

  return (
    <div className="overflow-hidden rounded-lg border bg-surface shadow-sm transition-colors hover:border-primary/30">
      <button
        type="button"
        className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-50/50 lg:grid-cols-[minmax(240px,1.4fr)_140px_150px_170px_120px_40px]"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-main-text">{row.studentName}</p>
            <Badge variant="info">{row.courseType}</Badge>
            {row.isCompleted ? <StatusBadge status="completed" /> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{formatPhoneNumber(row.phone)} · {row.branchName ?? row.branchId}</p>
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
        </div>

        <div className="flex items-center lg:justify-end">
          {row.isCompleted ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                onExtend();
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Extend
            </Button>
          ) : null}
        </div>

        <div className="flex items-center justify-end">
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </div>
      </button>

      {isExpanded ? (
        <div className="border-t bg-surface p-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_170px]">
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor={`${rowKeyValue}-date`}>Session Date *</Label>
                <Input
                  id={`${rowKeyValue}-date`}
                  type="date"
                  value={form.date}
                  onChange={(event) => onUpdateForm(rowKeyValue, { date: event.target.value })}
                  disabled={row.isCompleted || isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${rowKeyValue}-class-type`}>Class Type *</Label>
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
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${rowKeyValue}-vehicle`}>Vehicle</Label>
                <Input
                  id={`${rowKeyValue}-vehicle`}
                  value={form.vehicle}
                  placeholder="Optional"
                  onChange={(event) => onUpdateForm(rowKeyValue, { vehicle: event.target.value })}
                  disabled={row.isCompleted || isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${rowKeyValue}-instructor`}>Instructor</Label>
                <Input
                  id={`${rowKeyValue}-instructor`}
                  value={form.instructor}
                  placeholder="Optional"
                  onChange={(event) => onUpdateForm(rowKeyValue, { instructor: event.target.value })}
                  disabled={row.isCompleted || isSaving}
                />
              </div>
              <div className="space-y-2 md:col-span-2 2xl:col-span-1">
                <Label htmlFor={`${rowKeyValue}-notes`}>Notes</Label>
                <Input
                  id={`${rowKeyValue}-notes`}
                  value={form.notes}
                  placeholder="Optional"
                  onChange={(event) => onUpdateForm(rowKeyValue, { notes: event.target.value })}
                  disabled={row.isCompleted || isSaving}
                />
              </div>
            </div>

            <div className="flex flex-col justify-end gap-2 xl:items-stretch">
              {row.lastClassType && !row.isCompleted ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onUpdateForm(rowKeyValue, { classType: row.lastClassType })}
                  disabled={isSaving}
                >
                  Repeat Last Class
                </Button>
              ) : null}
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

function getRowKey(row: AttendanceRow): string {
  return `${row.sessionId}-${row.courseType}`;
}

function emptyRowForm(): RowFormState {
  return {
    date: today,
    classType: '',
    vehicle: '',
    instructor: '',
    notes: ''
  };
}
