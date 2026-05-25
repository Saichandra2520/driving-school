import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageLoader } from '@/components/common/PageLoader';
import { SearchInput } from '@/components/common/SearchInput';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCachedAsync } from '@/hooks/useCachedData';
import { studentService, type StudentsPageResult } from '@/services/studentService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { cacheTags, createPageCacheKey, invalidatePageCache } from '@/store/pageCacheStore';
import type { StudentWithFee } from '@/types';
import { formatCourseType, formatCurrency, formatPhoneNumber } from '@/utils/formatters';

const pageSize = 25;

export function StudentManagement(): JSX.Element | null {
  const profile = useAuthStore((state) => state.profile);
  const branchId = useAppStore((state) => state.branchId);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<StudentWithFee | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const pageCacheKey = useMemo(
    () =>
      createPageCacheKey('settings-student-management', {
        branchId: branchId ?? 'all',
        pageNumber,
        search: debouncedSearchTerm.trim()
      }),
    [branchId, debouncedSearchTerm, pageNumber]
  );
  const pageCacheTags = useMemo(
    () => [
      cacheTags.settings,
      cacheTags.students,
      cacheTags.fees,
      cacheTags.branch(branchId ?? 'all'),
      cacheTags.user(profile?.id)
    ],
    [branchId, profile?.id]
  );
  const searchQuery = debouncedSearchTerm.trim();
  const hasSearch = searchQuery.length > 0;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPageNumber(1);
  }, [branchId, debouncedSearchTerm]);

  const fetchStudents = useCallback(
    () =>
      studentService.getStudentsPage({
        branchId,
        search: searchQuery,
        pageSize,
        pageNumber,
        sortField: 'createdAt',
        sortDirection: 'desc'
      }),
    [branchId, pageNumber, searchQuery]
  );
  const {
    data: studentsPage,
    error: loadError,
    isLoading,
    isRefreshing,
    refresh: refreshStudents
  } = useCachedAsync<StudentsPageResult>({
    cacheKey: pageCacheKey,
    enabled: hasSearch,
    fetcher: fetchStudents,
    tags: pageCacheTags
  });

  useEffect(() => {
    if (!hasSearch || !loadError) return;
    setErrorMessage(loadError.message || 'Could not load students.');
  }, [hasSearch, loadError]);

  useEffect(() => {
    if (hasSearch) return;
    setErrorMessage('');
  }, [hasSearch]);

  if (profile?.role !== 'owner') {
    return null;
  }

  const students = hasSearch ? studentsPage?.rows ?? [] : [];
  const hasNextPage = hasSearch && Boolean(studentsPage?.pageInfo.hasNextPage);
  const pageInfo = hasSearch ? studentsPage?.pageInfo : undefined;

  const refresh = async (force = false): Promise<void> => {
    if (!hasSearch) return;
    setErrorMessage('');
    await refreshStudents({ force });
  };

  const invalidateStudentRelatedCache = (): void => {
    invalidatePageCache([
      cacheTags.settings,
      cacheTags.students,
      cacheTags.fees,
      cacheTags.dashboard,
      cacheTags.attendance,
      cacheTags.payments,
      cacheTags.reports,
      cacheTags.branch(branchId ?? 'all'),
      cacheTags.user(profile.id)
    ]);
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;

    setMessage('');
    setErrorMessage('');

    try {
      await studentService.deleteStudent(deleteTarget.id);
      setDeleteTarget(null);
      setMessage('Student deleted successfully.');
      invalidateStudentRelatedCache();
      await refresh(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete student.');
      setDeleteTarget(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Student Management</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Owner-only student deletion for incorrect records.</p>
          </div>
          <Badge variant="secondary">{branchId ? 'Selected Branch' : 'All Branches'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <Alert variant="success">{message}</Alert> : null}
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <SearchInput
            placeholder="Search name, phone, LL no, DL no"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <Button type="button" variant="outline" onClick={() => void refresh(true)} disabled={!hasSearch || isLoading || isRefreshing}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchTerm('');
              setDebouncedSearchTerm('');
            }}
          >
            Clear
          </Button>
        </div>

        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            {!hasSearch
              ? 'Search to load students'
              : pageInfo?.startItem
              ? `Showing ${pageInfo.startItem}-${pageInfo.endItem}${hasNextPage ? ' - More results available' : ''}`
              : 'No matching students'}
          </p>
          {hasSearch ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
                disabled={isLoading || isRefreshing || pageNumber === 1}
              >
                Previous
              </Button>
              <span className="min-w-16 text-center">Page {pageNumber}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPageNumber((current) => current + 1)}
                disabled={isLoading || isRefreshing || !hasNextPage}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading && students.length === 0 ? (
          <PageLoader label="Loading students..." />
        ) : students.length === 0 ? (
          <EmptyState
            title={hasSearch ? 'No students match the search.' : 'Search required.'}
            description={hasSearch ? 'Try another name, phone, LL no, or DL no.' : 'Enter name, phone, LL no, or DL no.'}
          />
        ) : (
          <div className={`overflow-x-auto rounded-md border ${isRefreshing ? 'opacity-60' : ''}`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <p className="font-semibold text-main-text">{student.fullName}</p>
                      <p className="text-sm text-muted-foreground">{formatPhoneNumber(student.phone)}</p>
                    </TableCell>
                    <TableCell>{student.branchName ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{formatCourseType(student.courseType)}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={student.status} />
                    </TableCell>
                    <TableCell className="text-right font-semibold text-danger">
                      {formatCurrency(student.balance)}
                    </TableCell>
                    <TableCell>
                      <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteTarget(student)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <ConfirmDialog
          open={deleteTarget !== null}
          title="Delete Student"
          description={
            deleteTarget
              ? `Delete ${deleteTarget.fullName}? This removes the student, fee, training, driving test, and extension records. Linked expense records stay saved but will be unlinked.`
              : ''
          }
          confirmLabel="Delete student"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
      </CardContent>
    </Card>
  );
}
