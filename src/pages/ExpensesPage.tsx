import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { FilterBar } from '@/components/common/FilterBar';
import { PageLoader } from '@/components/common/PageLoader';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { StatCard } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { expenseService } from '@/services/expenseService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import type { Expense, ExpenseCategory, ExpenseFilters, ExpenseSummary } from '@/types';
import { formatCurrency, formatDate, formatExpenseCategory } from '@/utils/formatters';

type CategoryFilter = 'all' | ExpenseCategory;
type ModalState = { type: 'add' } | { type: 'edit'; expense: Expense } | null;

const emptySummary: ExpenseSummary = {
  totalExpenses: 0,
  fuelTotal: 0,
  maintenanceTotal: 0,
  salaryTotal: 0,
  electricityTotal: 0,
  roomRentTotal: 0,
  learningChallanTotal: 0,
  drivingTestChallanTotal: 0,
  challanTotal: 0,
  rentElectricityTotal: 0,
  otherTotal: 0
};

const monthStart = new Date();
monthStart.setDate(1);
const defaultFromDate = monthStart.toISOString().slice(0, 10);
const defaultToDate = new Date().toISOString().slice(0, 10);

export function ExpensesPage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const selectedBranchId = useAppStore((state) => state.branchId);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary>(emptySummary);
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [modalState, setModalState] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isOwner = profile?.role === 'owner';
  const activeBranchId = profile?.role === 'staff' ? profile.branchId : selectedBranchId;

  const filters = useMemo<ExpenseFilters>(
    () => ({
      branchId: activeBranchId ?? undefined,
      fromDate,
      toDate,
      category: categoryFilter
    }),
    [activeBranchId, categoryFilter, fromDate, toDate]
  );
  const visibleExpenses = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return expenses;
    return expenses.filter((expense) =>
      [expense.notes ?? '', expense.staffName ?? '', expense.studentName ?? '', expense.branch?.name ?? ''].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  }, [expenses, search]);

  const loadExpenses = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const [rows, nextSummary] = await Promise.all([
        expenseService.getExpenses(filters),
        expenseService.getExpenseSummary(filters)
      ]);
      setExpenses(rows);
      setSummary(nextSummary);
    } catch {
      setErrorMessage('Unable to load expenses. Please check your connection and try again.');
      setExpenses([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const handleSaved = async (successMessage: string): Promise<void> => {
    setModalState(null);
    setMessage(successMessage);
    setErrorMessage('');
    await loadExpenses();
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;

    setMessage('');
    setErrorMessage('');

    try {
      await expenseService.deleteExpense(deleteTarget.id);
      setDeleteTarget(null);
      setMessage('Expense deleted successfully.');
      await loadExpenses();
    } catch {
      setDeleteTarget(null);
      setErrorMessage('Unable to delete expense.');
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        title="Expenses"
        description="Track fuel, salary, rent, bills, challans, and other expenses."
        actions={
          <Button
            type="button"
            onClick={() => {
              setMessage('');
              setErrorMessage('');
              setModalState({ type: 'add' });
            }}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add Expense
          </Button>
        }
      />

      {message ? <Alert variant="success">{message}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total" value={formatCurrency(summary.totalExpenses)} tone="danger" />
        <StatCard label="Fuel" value={formatCurrency(summary.fuelTotal)} />
        <StatCard label="Salary" value={formatCurrency(summary.salaryTotal)} />
        <StatCard label="Rent + Electricity" value={formatCurrency(summary.rentElectricityTotal)} />
        <StatCard label="Challans" value={formatCurrency(summary.challanTotal)} />
        <StatCard label="Other" value={formatCurrency(summary.otherTotal)} />
      </div>

      <div className="space-y-4">
          <FilterBar className="md:grid-cols-[minmax(150px,170px)_minmax(150px,170px)_minmax(180px,210px)_minmax(200px,1fr)_auto]">
            <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}>
              <option value="all">All Categories</option>
              <option value="fuel">Fuel</option>
              <option value="maintenance">Maintenance</option>
              <option value="electricity">Electricity Bill</option>
              <option value="room_rent">Room Rent</option>
              <option value="salary">Salary</option>
              <option value="learning_challan">Learning Challan</option>
              <option value="driving_test_challan">Driving Test Challan</option>
              <option value="other">Other</option>
            </Select>
            <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes, staff, student" />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFromDate(defaultFromDate);
                setToDate(defaultToDate);
                setCategoryFilter('all');
                setSearch('');
              }}
            >
              Clear Filters
            </Button>
          </FilterBar>

          {isLoading ? (
            <PageLoader label="Loading expenses..." />
          ) : visibleExpenses.length === 0 ? (
            <EmptyState title="No expenses found for the selected filters." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{formatDate(expense.date)}</TableCell>
                      <TableCell>{expense.branch?.name ?? '-'}</TableCell>
                      <TableCell>
                        <StatusBadge status={expense.category} />
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(expense.amount)}</TableCell>
                      <TableCell>{expense.staffName || '-'}</TableCell>
                      <TableCell>{expense.studentName || '-'}</TableCell>
                      <TableCell className="max-w-[320px] truncate">{expense.notes || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button type="button" size="sm" variant="ghost" onClick={() => setModalState({ type: 'edit', expense })}>
                            Edit
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(expense)}>
                            Delete
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

      <Dialog open={modalState !== null} onOpenChange={(open) => !open && setModalState(null)}>
        {modalState?.type === 'add' ? (
          <DialogContent className="max-w-3xl" onClose={() => setModalState(null)}>
            <DialogHeader>
              <DialogTitle>Add Expense</DialogTitle>
              <DialogDescription>Record a daily branch expense.</DialogDescription>
            </DialogHeader>
            <ExpenseForm
              branchId={activeBranchId}
              isOwner={Boolean(isOwner)}
              staffBranchId={profile?.branchId ?? null}
              onCancel={() => setModalState(null)}
              onSaved={() => void handleSaved('Expense added successfully.')}
            />
          </DialogContent>
        ) : null}

        {modalState?.type === 'edit' ? (
          <DialogContent className="max-w-3xl" onClose={() => setModalState(null)}>
            <DialogHeader>
              <DialogTitle>Edit Expense</DialogTitle>
              <DialogDescription>Update expense details.</DialogDescription>
            </DialogHeader>
            <ExpenseForm
              expense={modalState.expense}
              branchId={activeBranchId}
              isOwner={Boolean(isOwner)}
              staffBranchId={profile?.branchId ?? null}
              onCancel={() => setModalState(null)}
              onSaved={() => void handleSaved('Expense updated successfully.')}
            />
          </DialogContent>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </section>
  );
}
