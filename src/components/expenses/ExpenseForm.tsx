import { FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { expenseService } from '@/services/expenseService';
import { settingsService } from '@/services/settingsService';
import { staffService } from '@/services/staffService';
import { studentService } from '@/services/studentService';
import type {
  Branch,
  CreateExpensePayload,
  Expense,
  ExpenseCategory,
  StaffProfile,
  Student,
  UpdateExpensePayload
} from '@/types';

type ExpenseFormProps = {
  expense?: Expense | null;
  branchId: string | null;
  isOwner: boolean;
  staffBranchId: string | null;
  onCancel: () => void;
  onSaved: () => void;
};

const today = new Date().toISOString().slice(0, 10);
const challanCategories: ExpenseCategory[] = ['learning_challan', 'driving_test_challan'];

export function ExpenseForm({
  expense,
  branchId,
  isOwner,
  staffBranchId,
  onCancel,
  onSaved
}: ExpenseFormProps): JSX.Element {
  const isEditing = Boolean(expense);
  const fixedBranchId = isOwner ? branchId : staffBranchId;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(expense?.branchId ?? fixedBranchId ?? '');
  const [date, setDate] = useState(expense?.date ?? expense?.expenseDate ?? today);
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'fuel');
  const [amount, setAmount] = useState(String(expense?.amount ?? ''));
  const [staffId, setStaffId] = useState(expense?.staffId ?? '');
  const [studentId, setStudentId] = useState(expense?.studentId ?? '');
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const canChooseBranch = isOwner && !fixedBranchId;
  const showStaff = category === 'salary';
  const showStudent = challanCategories.includes(category);

  useEffect(() => {
    let isMounted = true;

    const loadBranches = async (): Promise<void> => {
      try {
        if (!isOwner && staffBranchId) {
          const branch = await settingsService.getBranchById(staffBranchId);
          if (isMounted) {
            setBranches([branch ?? { id: staffBranchId, name: 'Assigned Branch', location: null }]);
          }
          return;
        }

        const data = await settingsService.getBranches();
        if (isMounted) {
          const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
          setBranches(sorted);
          setSelectedBranchId((current) => current || fixedBranchId || sorted[0]?.id || '');
        }
      } catch {
        if (isMounted) setErrorMessage('Could not load branches.');
      }
    };

    void loadBranches();

    return () => {
      isMounted = false;
    };
  }, [fixedBranchId, isOwner, staffBranchId]);

  useEffect(() => {
    if (!selectedBranchId) {
      setStaff([]);
      setStudents([]);
      return;
    }

    let isMounted = true;

    const loadLookups = async (): Promise<void> => {
      const shouldLoadStaff = category === 'salary';
      const shouldLoadStudents = challanCategories.includes(category);

      if (!shouldLoadStaff) setStaff([]);
      if (!shouldLoadStudents) setStudents([]);
      if (!shouldLoadStaff && !shouldLoadStudents) {
        setErrorMessage('');
        return;
      }

      try {
        const [staffRows, studentRows] = await Promise.all([
          shouldLoadStaff ? staffService.getStaffByBranch(selectedBranchId) : Promise.resolve([]),
          shouldLoadStudents ? studentService.getStudentsByBranch(selectedBranchId) : Promise.resolve([])
        ]);

        if (isMounted) {
          setErrorMessage('');
          setStaff(staffRows.sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? '')));
          setStudents(studentRows.sort((a, b) => a.fullName.localeCompare(b.fullName)));
        }
      } catch (error) {
        console.error('Failed to load expense form lookups:', error);
        if (isMounted) {
          setErrorMessage(shouldLoadStaff ? 'Could not load staff.' : 'Could not load students.');
        }
      }
    };

    void loadLookups();

    return () => {
      isMounted = false;
    };
  }, [category, selectedBranchId]);

  useEffect(() => {
    if (category !== 'salary') setStaffId('');
    if (!challanCategories.includes(category)) setStudentId('');
  }, [category]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    const parsedAmount = Number(amount);
    if (!selectedBranchId) {
      setErrorMessage('Branch is required.');
      return;
    }
    if (!date) {
      setErrorMessage('Expense date is required.');
      return;
    }
    if (!category) {
      setErrorMessage('Category is required.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Amount must be greater than 0.');
      return;
    }
    if (category === 'salary' && !staffId) {
      setErrorMessage('Staff is required for salary expense.');
      return;
    }

    setIsSaving(true);

    try {
      const commonPayload = {
        branchId: selectedBranchId,
        category,
        amount: parsedAmount,
        date,
        staffId: category === 'salary' ? staffId : '',
        studentId: showStudent ? studentId : '',
        notes
      };

      if (expense) {
        await expenseService.updateExpense(expense.id, commonPayload satisfies UpdateExpensePayload);
      } else {
        await expenseService.createExpense(commonPayload satisfies CreateExpensePayload);
      }

      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : isEditing ? 'Unable to update expense.' : 'Unable to add expense.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="expense-branch">Branch</Label>
          <Select
            id="expense-branch"
            value={selectedBranchId}
            onChange={(event) => setSelectedBranchId(event.target.value)}
            disabled={!canChooseBranch}
          >
            <option value="">Select branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expense-date">Expense Date</Label>
          <Input id="expense-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="expense-category">Category</Label>
          <Select
            id="expense-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
          >
            <option value="fuel">Fuel</option>
            <option value="maintenance">Maintenance</option>
            <option value="electricity">Electricity Bill</option>
            <option value="room_rent">Room Rent</option>
            <option value="salary">Salary</option>
            <option value="learning_challan">Learning Challan</option>
            <option value="driving_test_challan">Driving Test Challan</option>
            <option value="other">Other</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expense-amount">Amount</Label>
          <Input
            id="expense-amount"
            type="number"
            min="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>

        {showStaff ? (
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="expense-staff">Staff *</Label>
            <Select id="expense-staff" value={staffId} onChange={(event) => setStaffId(event.target.value)}>
              <option value="">Select staff</option>
              {staff.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName || item.id}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">Salary expenses should be linked to staff.</p>
          </div>
        ) : null}

        {showStudent ? (
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="expense-student">Student <span className="text-muted-foreground">(optional)</span></Label>
            <Select id="expense-student" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">No student linked</option>
              {students.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName} - {item.phone}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">Challan can optionally be linked to a student.</p>
          </div>
        ) : null}

        <div className="space-y-2 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="expense-notes">Notes</Label>
          <Textarea
            id="expense-notes"
            className="min-h-24 resize-y"
            value={notes ?? ''}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </div>

      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2 border-t bg-surface px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Expense'}
        </Button>
      </div>
    </form>
  );
}
