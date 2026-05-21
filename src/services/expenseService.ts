import { addDoc, collection, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, where, type QueryConstraint } from 'firebase/firestore';
import { authService } from '@/services/authService';
import { db } from '@/services/firebase';
import { collections, getCollection, getDocument, subscribeCollection } from '@/services/firestoreUtils';
import type {
  Branch,
  CreateExpensePayload,
  Expense,
  ExpenseCategory,
  ExpenseFilters,
  ExpenseSummary,
  StaffProfile,
  Student,
  UpdateExpensePayload
} from '@/types';

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

async function getEffectiveBranchId(branchId?: string | null): Promise<string | null> {
  const { profile } = await authService.getCurrentUser();
  return profile?.role === 'staff' ? profile.branchId : branchId ?? null;
}

async function assertCanAccessBranch(branchId: string): Promise<void> {
  const { profile } = await authService.getCurrentUser();
  if (profile?.role === 'staff' && profile.branchId !== branchId) {
    throw new Error('You do not have access to this branch.');
  }
}

function validateExpense(payload: CreateExpensePayload | UpdateExpensePayload): void {
  if (!payload.branchId) throw new Error('Branch is required.');
  if (!payload.date) throw new Error('Expense date is required.');
  if (!payload.category) throw new Error('Category is required.');
  if (!Number.isFinite(payload.amount) || Number(payload.amount) <= 0) {
    throw new Error('Amount must be greater than 0.');
  }
  if (payload.category === 'salary' && !payload.staffId) {
    throw new Error('Staff is required for salary expense.');
  }
}

function normalizeExpense(expense: Expense): Expense {
  const date = expense.date ?? expense.expenseDate;
  return {
    ...expense,
    date,
    expenseDate: expense.expenseDate ?? date,
    notes: expense.notes ?? ''
  };
}

async function attachNames(expense: Expense): Promise<Expense> {
  const normalized = normalizeExpense(expense);
  const [branch, staff, student] = await Promise.all([
    getDocument<Branch>(collections.branches, normalized.branchId),
    normalized.staffId ? getDocument<StaffProfile>(collections.users, normalized.staffId) : Promise.resolve(null),
    normalized.studentId ? getDocument<Student>(collections.students, normalized.studentId) : Promise.resolve(null)
  ]);

  return {
    ...normalized,
    branch,
    staffName: staff?.fullName ?? '',
    studentName: student?.fullName ?? ''
  };
}

function addToSummary(summary: ExpenseSummary, category: ExpenseCategory, amount: number): void {
  summary.totalExpenses += amount;
  if (category === 'fuel') summary.fuelTotal += amount;
  if (category === 'maintenance') summary.maintenanceTotal += amount;
  if (category === 'salary') summary.salaryTotal += amount;
  if (category === 'electricity') summary.electricityTotal += amount;
  if (category === 'room_rent') summary.roomRentTotal += amount;
  if (category === 'learning_challan') summary.learningChallanTotal += amount;
  if (category === 'driving_test_challan') summary.drivingTestChallanTotal += amount;
  if (category === 'other') summary.otherTotal += amount;
  summary.challanTotal = summary.learningChallanTotal + summary.drivingTestChallanTotal;
  summary.rentElectricityTotal = summary.roomRentTotal + summary.electricityTotal;
}

export const expenseService = {
  async getExpenses(filters: ExpenseFilters = {}): Promise<Expense[]> {
    const effectiveBranchId = await getEffectiveBranchId(filters.branchId);
    const expenses = await getCollection<Expense>(collections.expenses, [
      ...(effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : []),
      ...(filters.category && filters.category !== 'all' ? [where('category', '==', filters.category)] : []),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    ]).catch(async () => {
      const fallback = await getCollection<Expense>(collections.expenses, [
        ...(effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : []),
        ...(filters.category && filters.category !== 'all' ? [where('category', '==', filters.category)] : [])
      ]);
      return fallback.sort((a, b) => normalizeExpense(b).date.localeCompare(normalizeExpense(a).date));
    });

    const filtered = expenses.map(normalizeExpense).filter((expense) => {
      if (filters.fromDate && expense.date < filters.fromDate) return false;
      if (filters.toDate && expense.date > filters.toDate) return false;
      return true;
    });

    return Promise.all(filtered.map(attachNames));
  },

  subscribeExpenses(
    filters: ExpenseFilters = {},
    onNext: (expenses: Expense[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    let isActive = true;
    let cleanup = (): void => undefined;
    let latestExpenses: Expense[] = [];
    let latestBranches: Branch[] = [];
    let latestStaff: StaffProfile[] = [];
    let latestStudents: Student[] = [];
    let expensesLoaded = false;
    let branchesLoaded = false;
    let staffLoaded = false;
    let studentsLoaded = false;

    const emit = (): void => {
      if (!isActive) return;
      if (!expensesLoaded || !branchesLoaded || !staffLoaded || !studentsLoaded) return;

      const branchesById = new Map(latestBranches.map((branch) => [branch.id, branch]));
      const staffById = new Map(latestStaff.map((staff) => [staff.id, staff]));
      const studentsById = new Map(latestStudents.map((student) => [student.id, student]));
      const rows = latestExpenses
        .map(normalizeExpense)
        .filter((expense) => {
          if (filters.fromDate && expense.date < filters.fromDate) return false;
          if (filters.toDate && expense.date > filters.toDate) return false;
          return true;
        })
        .map((expense) => ({
          ...expense,
          branch: branchesById.get(expense.branchId) ?? null,
          staffName: expense.staffId ? staffById.get(expense.staffId)?.fullName ?? '' : '',
          studentName: expense.studentId ? studentsById.get(expense.studentId)?.fullName ?? '' : ''
        }));

      onNext(rows);
    };

    void getEffectiveBranchId(filters.branchId).then((effectiveBranchId) => {
      if (!isActive) return;

      const expenseConstraints: QueryConstraint[] = [
        ...(effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : []),
        ...(filters.category && filters.category !== 'all' ? [where('category', '==', filters.category)] : []),
        orderBy('date', 'desc'),
        orderBy('createdAt', 'desc')
      ];
      const branchScoped = effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : [];
      const queryKey = `branch=${effectiveBranchId ?? 'all'}|category=${filters.category ?? 'all'}`;
      const unsubscribers = [
        subscribeCollection<Expense>(
          collections.expenses,
          expenseConstraints,
          ({ rows }) => {
            expensesLoaded = true;
            latestExpenses = rows;
            emit();
          },
          onError,
          `expenses:${queryKey}`
        ),
        subscribeCollection<Branch>(
          collections.branches,
          [],
          ({ rows }) => {
            branchesLoaded = true;
            latestBranches = effectiveBranchId ? rows.filter((branch) => branch.id === effectiveBranchId) : rows;
            emit();
          },
          onError,
          'branches:all'
        ),
        subscribeCollection<StaffProfile>(
          collections.users,
          [where('role', '==', 'staff'), ...branchScoped],
          ({ rows }) => {
            staffLoaded = true;
            latestStaff = rows;
            emit();
          },
          onError,
          `staff:${effectiveBranchId ?? 'all'}`
        ),
        subscribeCollection<Student>(
          collections.students,
          branchScoped,
          ({ rows }) => {
            studentsLoaded = true;
            latestStudents = rows;
            emit();
          },
          onError,
          `students:expense-names:${effectiveBranchId ?? 'all'}`
        )
      ];

      cleanup = (): void => unsubscribers.forEach((unsubscribe) => unsubscribe());
    });

    return () => {
      isActive = false;
      cleanup();
    };
  },

  async createExpense(payload: CreateExpensePayload): Promise<void> {
    const effectiveBranchId = await getEffectiveBranchId(payload.branchId);
    const nextPayload = { ...payload, branchId: effectiveBranchId ?? payload.branchId };
    validateExpense(nextPayload);
    await assertCanAccessBranch(nextPayload.branchId);

    await addDoc(collection(db, collections.expenses), {
      branchId: nextPayload.branchId,
      category: nextPayload.category,
      amount: nextPayload.amount,
      date: nextPayload.date,
      expenseDate: nextPayload.date,
      staffId: nextPayload.category === 'salary' ? nextPayload.staffId : '',
      studentId:
        nextPayload.category === 'learning_challan' || nextPayload.category === 'driving_test_challan'
          ? nextPayload.studentId ?? ''
          : '',
      notes: nextPayload.notes?.trim() || '',
      createdAt: serverTimestamp()
    });
  },

  async updateExpense(expenseId: string, payload: UpdateExpensePayload): Promise<void> {
    const existing = await getDocument<Expense>(collections.expenses, expenseId);
    if (!existing) throw new Error('Expense not found.');
    await assertCanAccessBranch(existing.branchId);

    const nextPayload = {
      branchId: payload.branchId ?? existing.branchId,
      category: payload.category ?? existing.category,
      amount: payload.amount ?? existing.amount,
      date: payload.date ?? normalizeExpense(existing).date,
      staffId: payload.staffId ?? existing.staffId,
      studentId: payload.studentId ?? existing.studentId,
      notes: payload.notes ?? existing.notes ?? ''
    };
    validateExpense(nextPayload);
    await assertCanAccessBranch(nextPayload.branchId);

    await updateDoc(doc(db, collections.expenses, expenseId), {
      branchId: nextPayload.branchId,
      category: nextPayload.category,
      amount: nextPayload.amount,
      date: nextPayload.date,
      expenseDate: nextPayload.date,
      staffId: nextPayload.category === 'salary' ? nextPayload.staffId : '',
      studentId:
        nextPayload.category === 'learning_challan' || nextPayload.category === 'driving_test_challan'
          ? nextPayload.studentId ?? ''
          : '',
      notes: nextPayload.notes?.trim() || '',
      updatedAt: serverTimestamp()
    });
  },

  async deleteExpense(expenseId: string): Promise<void> {
    const existing = await getDocument<Expense>(collections.expenses, expenseId);
    if (!existing) throw new Error('Expense not found.');
    await assertCanAccessBranch(existing.branchId);
    await deleteDoc(doc(db, collections.expenses, expenseId));
  },

  async getExpenseSummary(filters: ExpenseFilters = {}): Promise<ExpenseSummary> {
    const expenses = await expenseService.getExpenses(filters);
    const summary = { ...emptySummary };
    expenses.forEach((expense) => addToSummary(summary, expense.category, Number(expense.amount)));
    return summary;
  }
};
