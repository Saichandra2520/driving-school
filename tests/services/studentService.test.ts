import { beforeEach, describe, expect, it, vi } from 'vitest';
import { studentService } from '@/services/studentService';
import { getCollection } from '@/services/firestoreUtils';
import { authService } from '@/services/authService';
import type { Branch, Fee, Student } from '@/types';

const { getDocsMock } = vi.hoisted(() => ({
  getDocsMock: vi.fn()
}));

const branches: Branch[] = [
  { id: 'branch-1', name: 'Main Branch' },
  { id: 'branch-2', name: 'Second Branch' }
];

let students: Student[] = [];
let fees: Fee[] = [];

vi.mock('@/services/firebase', () => ({
  db: {}
}));

vi.mock('@/services/firebaseUsageService', () => ({
  firebaseUsageService: {
    trackUsage: vi.fn()
  }
}));

vi.mock('@/services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn()
  }
}));

vi.mock('@/services/firestoreUtils', () => ({
  collections: {
    branches: 'branches',
    students: 'students',
    fees: 'fees',
    sessions: 'sessions',
    drivingTests: 'drivingTests'
  },
  createdAt: () => 'created-at',
  getCollection: vi.fn(),
  getDocument: vi.fn(async (collectionName: string, id: string) =>
    collectionName === 'branches' ? branches.find((branch) => branch.id === id) ?? null : null
  ),
  subscribeCollection: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, collectionName: string) => ({ collectionName }),
  documentId: () => '__name__',
  doc: vi.fn(),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  limit: vi.fn((value: number) => ({ type: 'limit', value })),
  orderBy: vi.fn((field: string, direction?: string) => ({ type: 'orderBy', field, direction })),
  query: (collectionRef: { collectionName: string }, ...constraints: unknown[]) => ({
    collectionName: collectionRef.collectionName,
    constraints
  }),
  serverTimestamp: () => 'server-timestamp',
  startAfter: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ type: 'where', field, op, value })),
  writeBatch: vi.fn()
}));

describe('studentService search and paging', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(authService.getCurrentUser).mockResolvedValue({ user: null, profile: { id: 'owner', fullName: 'Owner', role: 'owner', branchId: null } });
    students = [];
    fees = [];
    getDocsMock.mockImplementation(async (queryArg: { constraints?: Array<{ type: string; field: string; op: string; value: unknown }> }) => {
      const branchConstraint = queryArg.constraints?.find((constraint) => constraint.type === 'where' && constraint.field === 'branchId');
      const rows = branchConstraint ? students.filter((student) => student.branchId === branchConstraint.value) : students;
      return {
        docs: rows.map((student) => ({
          id: student.id,
          data: () => ({ ...student })
        }))
      };
    });
    vi.mocked(getCollection).mockImplementation(async (collectionName: string, constraints: Array<{ field?: string; op?: string; value?: unknown }> = []) => {
      if (collectionName === 'branches') return branches as never;
      if (collectionName === 'fees') {
        const studentConstraint = constraints.find((constraint) => constraint.field === 'studentId');
        if (studentConstraint?.op === 'in' && Array.isArray(studentConstraint.value)) {
          return fees.filter((fee) => studentConstraint.value.includes(fee.studentId)) as never;
        }
        return fees as never;
      }
      return [] as never;
    });
  });

  it('finds older records without searchTokens beyond the old fallback cap', async () => {
    students = Array.from({ length: 260 }, (_, index) => makeStudent(`student-${index}`, `Student ${index}`));
    students.push(makeStudent('student-old', 'Very Old Match', { searchTokens: undefined }));
    fees = students.map((student) => makeFee(student.id, 1000, 0));

    const result = await studentService.getStudentsPageFallback({ search: 'Very Old', pageSize: 50 });

    expect(result.rows.map((student) => student.id)).toContain('student-old');
  });

  it('applies branch, course, status filters and balance sorting in correctness-first fallback', async () => {
    students = [
      makeStudent('student-low', 'Low Balance', { branchId: 'branch-1', courseType: '4W', enrollmentDate: '2026-05-01' }),
      makeStudent('student-high', 'High Balance', { branchId: 'branch-1', courseType: 'both', enrollmentDate: '2026-05-02' }),
      makeStudent('student-other-branch', 'Other Branch', { branchId: 'branch-2', courseType: '4W' }),
      makeStudent('student-passed', 'Passed Student', { branchId: 'branch-1', drivingLicenceNo: 'DL-1' })
    ];
    fees = [
      makeFee('student-low', 1000, 900),
      makeFee('student-high', 1000, 100),
      makeFee('student-other-branch', 1000, 0),
      makeFee('student-passed', 1000, 0)
    ];

    const result = await studentService.getStudentsPage({
      branchId: 'branch-1',
      courseType: '4W',
      status: 'ongoing',
      sortField: 'balance',
      sortDirection: 'desc',
      pageSize: 50
    });

    expect(result.rows.map((student) => student.id)).toEqual(['student-high', 'student-low']);
  });
});

function makeStudent(id: string, fullName: string, overrides: Partial<Student> = {}): Student {
  return {
    id,
    fullName,
    phone: '9876543210',
    enrollmentDate: '2026-05-01',
    courseStartDate: '2026-05-01',
    courseType: '4W',
    learningLicenceNo: '',
    drivingLicenceNo: '',
    status: 'ongoing',
    branchId: 'branch-1',
    createdAt: `2026-05-${String((Number(id.replace(/\D/g, '')) % 28) + 1).padStart(2, '0')}`,
    durationDays: 30,
    searchTokens: fullName.toLowerCase().split(' '),
    ...overrides
  };
}

function makeFee(studentId: string, totalAmount: number, paidAmount: number): Fee {
  return {
    id: `fee-${studentId}`,
    studentId,
    branchId: students.find((student) => student.id === studentId)?.branchId ?? 'branch-1',
    totalAmount,
    installments: paidAmount > 0 ? [{ receiptNo: `RCP-${studentId}`, amount: paidAmount, date: '2026-05-23' }] : [],
    paidAmount,
    balance: totalAmount - paidAmount
  };
}
