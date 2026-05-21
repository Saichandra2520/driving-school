import {
  collection,
  documentId,
  doc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint
} from 'firebase/firestore';
import { authService } from '@/services/authService';
import { COURSE_PARTS } from '@/constants/courses';
import { db } from '@/services/firebase';
import { collections, createdAt, getCollection, getDocument, subscribeCollection } from '@/services/firestoreUtils';
import { useSyncStore } from '@/store/syncStore';
import { calculateStudentExpiryDate, getCourseStartDate, getDaysRemaining } from '@/utils/dateUtils';
import { deriveStudentStatus } from '@/utils/studentStatus';
import type {
  Branch,
  CourseType,
  CreateStudentPayload,
  DrivingTest,
  Fee,
  Session,
  Student,
  StudentStatus,
  StudentWithFee,
  UpdateStudentPayload
} from '@/types';

type StudentFilters = {
  branchId?: string | null;
  courseType?: CourseType | 'all' | null;
  status?: StudentStatus | 'all' | null;
  search?: string;
};

export type StudentSortField = 'createdAt' | 'enrollmentDate' | 'courseStartDate' | 'balance' | 'daysRemaining';
export type SortDirection = 'asc' | 'desc';
export type StudentPageCursor = QueryDocumentSnapshot<DocumentData>;

export type StudentsPageRequest = StudentFilters & {
  pageSize?: number;
  pageNumber?: number;
  cursor?: StudentPageCursor | null;
  sortField?: StudentSortField;
  sortDirection?: SortDirection;
};

export type StudentsPageResult = {
  rows: StudentWithFee[];
  pageInfo: {
    hasNextPage: boolean;
    nextCursor: StudentPageCursor | null;
    startItem: number;
    endItem: number;
  };
};

const searchableStudentFields = ['fullName', 'phone', 'learningLicenceNo', 'drivingLicenceNo'] as const;

function emptySessionSlots() {
  return Array.from({ length: 30 }, (_, index) => ({
    slotNo: index + 1,
    date: null,
    classType: ''
  }));
}

function emptyTestAttempts() {
  return Array.from({ length: 3 }, (_, index) => ({
    attemptNo: index + 1,
    date: null,
    result: 'pending',
    notes: ''
  }));
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSearchToken(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function addPrefixes(tokens: Set<string>, value: string): void {
  const normalized = normalizeSearchToken(value);
  if (!normalized) return;

  const compact = normalized.replace(/[^a-z0-9]/g, '');
  const candidates = new Set([
    normalized.replace(/[^a-z0-9 ]/g, ''),
    compact,
    ...normalized.split(' ').map((part) => part.replace(/[^a-z0-9]/g, ''))
  ]);

  candidates.forEach((candidate) => {
    if (!candidate) return;
    const maxLength = Math.min(candidate.length, 40);
    for (let index = 1; index <= maxLength; index += 1) {
      tokens.add(candidate.slice(0, index));
    }
  });
}

function createStudentSearchTokens(student: Pick<Student, (typeof searchableStudentFields)[number]>): string[] {
  const tokens = new Set<string>();
  searchableStudentFields.forEach((field) => addPrefixes(tokens, student[field] ?? ''));
  return Array.from(tokens).slice(0, 300);
}

function matchesCourseFilter(student: Student, courseType?: CourseType | 'all' | null): boolean {
  if (!courseType || courseType === 'all') return true;
  if (courseType === 'both') return student.courseType === 'both';
  return COURSE_PARTS[student.courseType].includes(courseType);
}

function getCourseConstraint(courseType?: CourseType | 'all' | null): QueryConstraint[] {
  if (!courseType || courseType === 'all') return [];
  if (courseType === 'both') return [where('courseType', '==', 'both')];
  return [where('courseType', 'in', courseType === 'HV' ? ['HV'] : [courseType, 'both'])];
}

function getServerSort(sortField?: StudentSortField, sortDirection: SortDirection = 'desc'): QueryConstraint[] {
  if (sortField === 'createdAt') return [orderBy('createdAt', sortDirection), orderBy(documentId(), sortDirection)];
  if (sortField === 'courseStartDate') return [orderBy('courseStartDate', sortDirection), orderBy(documentId(), sortDirection)];
  if (sortField === 'enrollmentDate') return [orderBy('enrollmentDate', sortDirection), orderBy(documentId(), sortDirection)];
  return [orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc')];
}

function sortPageRows(rows: StudentWithFee[], sortField?: StudentSortField, sortDirection: SortDirection = 'desc'): StudentWithFee[] {
  if (sortField !== 'balance' && sortField !== 'daysRemaining' && sortField !== 'createdAt') return rows;

  const direction = sortDirection === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = getClientSortValue(left, sortField);
    const rightValue = getClientSortValue(right, sortField);
    return (leftValue - rightValue) * direction;
  });
}

function getClientSortValue(student: StudentWithFee, sortField: StudentSortField): number {
  if (sortField === 'balance') return student.balance;
  if (sortField === 'daysRemaining') return student.daysRemaining;
  if (sortField === 'createdAt') return getTimestampValue(student.createdAt);
  return 0;
}

function getTimestampValue(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  return 0;
}

function getMissingIndexMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return message.toLowerCase().includes('index')
    ? 'Student list needs a database index. Please contact admin.'
    : 'Unable to load students. Please check your connection and try again.';
}

function isMissingIndexError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return message.toLowerCase().includes('index');
}

async function getStudentFee(studentId: string): Promise<Fee | null> {
  const fees = await getCollection<Fee>(collections.fees, [where('studentId', '==', studentId)]);
  const fee = fees[0];
  if (!fee) return null;

  const installments = Array.isArray(fee.installments) ? fee.installments : [];
  const paidAmount = installments.length
    ? installments.reduce((total, installment) => total + Number(installment.amount), 0)
    : Number(fee.paidAmount ?? 0);

  return {
    ...fee,
    branchId: fee.branchId ?? '',
    installments,
    paidAmount,
    balance: Number(fee.totalAmount) - paidAmount
  };
}

async function getStudentFees(studentIds: string[]): Promise<Map<string, Fee>> {
  if (studentIds.length === 0) return new Map();

  const chunks = Array.from({ length: Math.ceil(studentIds.length / 30) }, (_, index) =>
    studentIds.slice(index * 30, index * 30 + 30)
  );
  const rows = (await Promise.all(
    chunks.map((chunk) => getCollection<Fee>(collections.fees, [where('studentId', 'in', chunk)]))
  )).flat();

  return new Map(
    rows.map((fee) => {
      const installments = Array.isArray(fee.installments) ? fee.installments : [];
      const paidAmount = installments.length
        ? installments.reduce((total, installment) => total + Number(installment.amount), 0)
        : Number(fee.paidAmount ?? 0);

      return [
        fee.studentId,
        {
          ...fee,
          branchId: fee.branchId ?? '',
          installments,
          paidAmount,
          balance: Number(fee.totalAmount) - paidAmount
        }
      ];
    })
  );
}

async function attachFeeAndBranch(student: Student, branches: Branch[]): Promise<StudentWithFee> {
  const fee = await getStudentFee(student.id);
  return attachFeeAndBranchWithFee(student, branches, fee);
}

async function attachFeeAndBranchWithFee(
  student: Student,
  branches: Branch[],
  fee: Fee | null
): Promise<StudentWithFee> {
  const totalAmount = Number(fee?.totalAmount ?? 0);
  const paidAmount = Number(fee?.paidAmount ?? 0);
  const balance = Number(fee?.balance ?? Math.max(totalAmount - paidAmount, 0));
  const durationDays = student.baseDurationDays ?? student.durationDays ?? 30;
  const courseStartDate = getCourseStartDate(student);
  const expiryDate = calculateStudentExpiryDate(courseStartDate, durationDays);

  return {
    ...student,
    status: deriveStudentStatus(student),
    durationDays,
    baseSessionCount: student.baseSessionCount ?? 30,
    baseDurationDays: durationDays,
    courseStartDate,
    branchName: branches.find((branch) => branch.id === student.branchId)?.name,
    totalAmount,
    paidAmount,
    balance,
    expiryDate,
    daysRemaining: getDaysRemaining(expiryDate),
    fee
  };
}

async function existingCourseDocs<T extends Session | DrivingTest>(
  collectionName: string,
  studentId: string
): Promise<T[]> {
  return getCollection<T>(collectionName, [where('studentId', '==', studentId)]);
}

export const studentService = {
  async getStudentsPage(filters: StudentsPageRequest = {}): Promise<StudentsPageResult> {
    if (!filters.sortField || filters.sortField === 'createdAt') {
      return studentService.getStudentsPageFallback(filters);
    }

    try {
      const { profile } = await authService.getCurrentUser();
      const effectiveBranchId = profile?.role === 'staff' ? profile.branchId : filters.branchId;
      const pageSize = filters.pageSize ?? 50;
      const pageNumber = filters.pageNumber ?? 1;
      const search = normalizeSearchToken(filters.search ?? '');
      const constraints: QueryConstraint[] = [
        ...(effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : []),
        ...getCourseConstraint(filters.courseType),
        ...(filters.status && filters.status !== 'all' ? [where('status', '==', filters.status)] : []),
        ...(search ? [where('searchTokens', 'array-contains', search)] : []),
        ...getServerSort(filters.sortField, filters.sortDirection),
        ...(filters.cursor ? [startAfter(filters.cursor)] : []),
        firestoreLimit(pageSize + 1)
      ];

      const [snapshot, branches] = await Promise.all([
        getDocs(query(collection(db, collections.students), ...constraints)),
        effectiveBranchId
          ? getDocument<Branch>(collections.branches, effectiveBranchId).then((branch) => (branch ? [branch] : []))
          : getCollection<Branch>(collections.branches)
      ]);
      const pageDocs = snapshot.docs.slice(0, pageSize);
      const hasNextPage = snapshot.docs.length > pageSize;
      const students = pageDocs.map((item) => ({ id: item.id, ...item.data() }) as Student);
      const feesByStudent = await getStudentFees(students.map((student) => student.id));
      const rows = await Promise.all(
        students.map((student) => attachFeeAndBranchWithFee(student, branches, feesByStudent.get(student.id) ?? null))
      );
      const sortedRows = sortPageRows(rows, filters.sortField, filters.sortDirection);
      const startItem = rows.length === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
      const endItem = rows.length === 0 ? 0 : startItem + rows.length - 1;

      return {
        rows: sortedRows,
        pageInfo: {
          hasNextPage,
          nextCursor: hasNextPage ? pageDocs[pageDocs.length - 1] ?? null : null,
          startItem,
          endItem
        }
      };
    } catch (error) {
      if (isMissingIndexError(error)) {
        return studentService.getStudentsPageFallback(filters);
      }

      throw new Error(getMissingIndexMessage(error));
    }
  },

  async getStudentsPageFallback(filters: StudentsPageRequest = {}): Promise<StudentsPageResult> {
    const { profile } = await authService.getCurrentUser();
    const effectiveBranchId = profile?.role === 'staff' ? profile.branchId : filters.branchId;
    const pageSize = filters.pageSize ?? 50;
    const pageNumber = filters.pageNumber ?? 1;
    const search = normalizeSearchToken(filters.search ?? '');
    const clientCreatedAtSort = !filters.sortField || filters.sortField === 'createdAt';
    const constraints: QueryConstraint[] = [
      ...(effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : []),
      ...(clientCreatedAtSort
        ? []
        : [
            orderBy('enrollmentDate', 'desc'),
            ...(filters.cursor ? [startAfter(filters.cursor)] : []),
            firestoreLimit(pageSize * 5 + 1)
          ])
    ];

    const [snapshot, branches] = await Promise.all([
      getDocs(query(collection(db, collections.students), ...constraints)),
      effectiveBranchId
        ? getDocument<Branch>(collections.branches, effectiveBranchId).then((branch) => (branch ? [branch] : []))
        : getCollection<Branch>(collections.branches)
    ]);
    const visibleDocs = snapshot.docs.filter((item) => {
      const student = { id: item.id, ...item.data() } as Student;
      if (!matchesCourseFilter(student, filters.courseType)) return false;
      if (filters.status && filters.status !== 'all' && deriveStudentStatus(student) !== filters.status) return false;
      if (search && !(Array.isArray(student.searchTokens) && student.searchTokens.includes(search))) return false;
      return true;
    });
    const pageDocs = clientCreatedAtSort ? visibleDocs : visibleDocs.slice(0, pageSize);
    const students = pageDocs.map((item) => ({ id: item.id, ...item.data() }) as Student);
    const feesByStudent = await getStudentFees(students.map((student) => student.id));
    const rows = await Promise.all(
      students.map((student) => attachFeeAndBranchWithFee(student, branches, feesByStudent.get(student.id) ?? null))
    );
    const sortedRows = sortPageRows(rows, filters.sortField ?? 'createdAt', filters.sortDirection);
    const pagedRows = clientCreatedAtSort
      ? sortedRows.slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
      : sortedRows;
    const startItem = pagedRows.length === 0 ? 0 : (pageNumber - 1) * pageSize + 1;
    const endItem = pagedRows.length === 0 ? 0 : startItem + pagedRows.length - 1;

    return {
      rows: pagedRows,
      pageInfo: {
        hasNextPage: clientCreatedAtSort
          ? sortedRows.length > pageNumber * pageSize
          : snapshot.docs.length > pageSize * 5 || visibleDocs.length > pageSize,
        nextCursor: clientCreatedAtSort
          ? null
          : snapshot.docs.length > 0
            ? snapshot.docs[Math.min(snapshot.docs.length, pageSize * 5) - 1] ?? null
            : null,
        startItem,
        endItem
      }
    };
  },

  async getStudents(filters: StudentFilters = {}): Promise<StudentWithFee[]> {
    const { profile } = await authService.getCurrentUser();
    const effectiveBranchId = profile?.role === 'staff' ? profile.branchId : filters.branchId;
    const constraints: QueryConstraint[] = [
      ...(effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : []),
      orderBy('enrollmentDate', 'desc')
    ];

    const [studentsRaw, branches] = await Promise.all([
      getCollection<Student>(collections.students, constraints),
      effectiveBranchId
        ? getDocument<Branch>(collections.branches, effectiveBranchId).then((branch) => (branch ? [branch] : []))
        : getCollection<Branch>(collections.branches)
    ]);

    const search = normalizeSearch(filters.search ?? '');
    const courseFilteredStudents = studentsRaw.filter((student) => matchesCourseFilter(student, filters.courseType));
    const students = search
      ? courseFilteredStudents.filter((student) =>
          [student.fullName, student.phone, student.learningLicenceNo ?? '', student.drivingLicenceNo ?? '']
            .some((value) => value.toLowerCase().includes(search))
        )
      : courseFilteredStudents;

    const studentsWithFee = await Promise.all(students.map((student) => attachFeeAndBranch(student, branches)));

    return filters.status && filters.status !== 'all'
      ? studentsWithFee.filter((student) => student.status === filters.status)
      : studentsWithFee;
  },

  subscribeStudents(
    filters: StudentFilters = {},
    onNext: (students: StudentWithFee[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    let isActive = true;
    let cleanup = (): void => undefined;
    let latestStudents: Student[] = [];
    let latestFees: Fee[] = [];
    let latestBranches: Branch[] = [];
    let studentsLoaded = false;
    let feesLoaded = false;
    let branchesLoaded = false;

    const emit = async (): Promise<void> => {
      if (!isActive) return;
      if (!studentsLoaded || !feesLoaded || !branchesLoaded) return;

      const search = normalizeSearch(filters.search ?? '');
      const courseFilteredStudents = latestStudents.filter((student) => matchesCourseFilter(student, filters.courseType));
      const students = search
        ? courseFilteredStudents.filter((student) =>
            [student.fullName, student.phone, student.learningLicenceNo ?? '', student.drivingLicenceNo ?? ''].some((value) =>
              value.toLowerCase().includes(search)
            )
          )
        : courseFilteredStudents;

      const feesByStudent = new Map(latestFees.map((fee) => [fee.studentId, fee]));
      const rows = await Promise.all(
        students.map((student) => attachFeeAndBranchWithFee(student, latestBranches, feesByStudent.get(student.id) ?? null))
      );
      const filtered = filters.status && filters.status !== 'all'
        ? rows.filter((student) => student.status === filters.status)
        : rows;

      if (isActive) onNext(filtered);
    };

    void authService.getCurrentUser().then(({ profile }) => {
      if (!isActive) return;

      const effectiveBranchId = profile?.role === 'staff' ? profile.branchId : filters.branchId;
      const queryKey = `branch=${effectiveBranchId ?? 'all'}`;
      const studentConstraints: QueryConstraint[] = [
        ...(effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : []),
        orderBy('enrollmentDate', 'desc')
      ];
      const scopedByBranch = effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : [];
      const unsubscribers = [
        subscribeCollection<Student>(
          collections.students,
          studentConstraints,
          ({ rows }) => {
            studentsLoaded = true;
            latestStudents = rows;
            void emit();
          },
          onError,
          `students:${queryKey}`
        ),
        subscribeCollection<Fee>(
          collections.fees,
          scopedByBranch,
          ({ rows }) => {
            feesLoaded = true;
            latestFees = rows;
            void emit();
          },
          onError,
          `fees:${effectiveBranchId ?? 'all'}`
        ),
        subscribeCollection<Branch>(
          collections.branches,
          [],
          ({ rows }) => {
            branchesLoaded = true;
            latestBranches = effectiveBranchId ? rows.filter((branch) => branch.id === effectiveBranchId) : rows;
            void emit();
          },
          onError,
          'branches:all'
        )
      ];

      cleanup = (): void => unsubscribers.forEach((unsubscribe) => unsubscribe());
    });

    return () => {
      isActive = false;
      cleanup();
    };
  },

  async getStudentById(studentId: string): Promise<StudentWithFee | null> {
    const student = await getDocument<Student>(collections.students, studentId);
    const branches = student
      ? await getDocument<Branch>(collections.branches, student.branchId).then((branch) => (branch ? [branch] : []))
      : [];
    return student ? attachFeeAndBranch(student, branches) : null;
  },

  async getStudentsByBranch(branchId: string): Promise<Student[]> {
    return getCollection<Student>(collections.students, [where('branchId', '==', branchId)]);
  },

  async createStudent(payload: CreateStudentPayload): Promise<StudentWithFee> {
    if (payload.totalAmount <= 0) throw new Error('Total fee must be greater than 0.');

    const studentRef = doc(collection(db, collections.students));
    const feeRef = doc(collection(db, collections.fees));
    const batch = writeBatch(db);
    const studentData: Omit<Student, 'id'> = {
      branchId: payload.branchId,
      fullName: payload.fullName.trim(),
      phone: payload.phone.trim(),
      courseType: payload.courseType,
      enrollmentDate: payload.enrollmentDate,
      courseStartDate: payload.courseStartDate || null,
      learningLicenceNo: payload.learningLicenceNo?.trim() ?? '',
      llIssueDate: payload.llIssueDate || null,
      llExpiryDate: payload.llExpiryDate || null,
      drivingLicenceNo: payload.drivingLicenceNo?.trim() ?? '',
      dlIssueDate: payload.dlIssueDate || null,
      dlExpiryDate: payload.dlExpiryDate || null,
      status: deriveStudentStatus({ drivingLicenceNo: payload.drivingLicenceNo }),
      durationDays: 30,
      baseSessionCount: 30,
      baseDurationDays: 30,
      completedAt: null,
      searchTokens: createStudentSearchTokens({
        fullName: payload.fullName,
        phone: payload.phone,
        learningLicenceNo: payload.learningLicenceNo ?? '',
        drivingLicenceNo: payload.drivingLicenceNo ?? ''
      }),
      createdAt: createdAt()
    };
    const feeData = {
      studentId: studentRef.id,
      branchId: payload.branchId,
      totalAmount: payload.totalAmount,
      installments: [],
      paidAmount: 0,
      balance: payload.totalAmount,
      createdAt: createdAt()
    };

    batch.set(studentRef, studentData);
    batch.set(feeRef, feeData);

    COURSE_PARTS[payload.courseType].forEach((course) => {
      batch.set(doc(collection(db, collections.sessions)), {
        studentId: studentRef.id,
        courseType: course,
        branchId: payload.branchId,
        slots: emptySessionSlots(),
        createdAt: serverTimestamp()
      });

      batch.set(doc(collection(db, collections.drivingTests)), {
        studentId: studentRef.id,
        courseType: course,
        branchId: payload.branchId,
        attempts: emptyTestAttempts(),
        createdAt: serverTimestamp()
      });
    });

    const commit = batch.commit();
    if (useSyncStore.getState().isOnline) {
      await commit;
    } else {
      void commit.catch((error) => console.error('Student creation sync failed:', error));
    }

    return attachFeeAndBranchWithFee(
      { id: studentRef.id, ...studentData, createdAt: new Date().toISOString() },
      [],
      {
        id: feeRef.id,
        studentId: studentRef.id,
        branchId: payload.branchId,
        totalAmount: payload.totalAmount,
        installments: [],
        paidAmount: 0,
        balance: payload.totalAmount,
        createdAt: new Date().toISOString()
      }
    );
  },

  async updateStudent(studentId: string, payload: UpdateStudentPayload): Promise<void> {
    const existingStudent = await getDocument<Student>(collections.students, studentId);
    if (!existingStudent) throw new Error('Student not found.');

    const nextBranchId = payload.branchId ?? existingStudent.branchId;
    const nextCourseType = payload.courseType ?? existingStudent.courseType;
    const updatePayload: Record<string, unknown> = {};

    if (payload.fullName !== undefined) updatePayload.fullName = payload.fullName.trim();
    if (payload.phone !== undefined) updatePayload.phone = payload.phone.trim();
    if (payload.enrollmentDate !== undefined) updatePayload.enrollmentDate = payload.enrollmentDate;
    if (payload.courseStartDate !== undefined) updatePayload.courseStartDate = payload.courseStartDate || null;
    if (payload.courseType !== undefined) updatePayload.courseType = payload.courseType;
    if (payload.learningLicenceNo !== undefined) updatePayload.learningLicenceNo = payload.learningLicenceNo.trim();
    if (payload.llIssueDate !== undefined) updatePayload.llIssueDate = payload.llIssueDate || null;
    if (payload.llExpiryDate !== undefined) updatePayload.llExpiryDate = payload.llExpiryDate || null;
    if (payload.drivingLicenceNo !== undefined) updatePayload.drivingLicenceNo = payload.drivingLicenceNo.trim();
    if (payload.dlIssueDate !== undefined) updatePayload.dlIssueDate = payload.dlIssueDate || null;
    if (payload.dlExpiryDate !== undefined) updatePayload.dlExpiryDate = payload.dlExpiryDate || null;
    if (payload.branchId !== undefined) updatePayload.branchId = payload.branchId;

    updatePayload.status = deriveStudentStatus({
      status: existingStudent.status,
      drivingLicenceNo: payload.drivingLicenceNo ?? existingStudent.drivingLicenceNo
    });
    updatePayload.searchTokens = createStudentSearchTokens({
      fullName: payload.fullName ?? existingStudent.fullName,
      phone: payload.phone ?? existingStudent.phone,
      learningLicenceNo: payload.learningLicenceNo ?? existingStudent.learningLicenceNo ?? '',
      drivingLicenceNo: payload.drivingLicenceNo ?? existingStudent.drivingLicenceNo ?? ''
    });

    await updateDoc(doc(db, collections.students, studentId), updatePayload);

    if (payload.totalAmount !== undefined || payload.branchId !== undefined) {
      const fee = await getStudentFee(studentId);
      if (!fee) throw new Error('Fee record was not found for this student.');

      const totalAmount = payload.totalAmount ?? Number(fee.totalAmount);
      if (totalAmount <= 0) throw new Error('Total fee must be greater than 0.');

      const paidAmount = Number(fee.paidAmount ?? 0);
      await updateDoc(doc(db, collections.fees, fee.id), {
        branchId: nextBranchId,
        totalAmount,
        paidAmount,
        balance: totalAmount - paidAmount
      });
    }

    if (payload.branchId !== undefined) {
      await studentService.updateRelatedDocBranch(studentId, payload.branchId);
    }

    await studentService.ensureCourseRelatedDocs(studentId, nextBranchId, nextCourseType);
  },

  async deleteStudent(studentId: string): Promise<void> {
    await updateDoc(doc(db, collections.students, studentId), { status: 'dropped' });
  },

  getStudentFee,

  async createInitialStudentRelatedDocs(
    studentId: string,
    branchId: string,
    courseType: CourseType,
    totalAmount: number
  ): Promise<void> {
    const batch = writeBatch(db);

    batch.set(doc(collection(db, collections.fees)), {
      studentId,
      branchId,
      totalAmount,
      installments: [],
      paidAmount: 0,
      balance: totalAmount,
      createdAt: serverTimestamp()
    });

    COURSE_PARTS[courseType].forEach((course) => {
      batch.set(doc(collection(db, collections.sessions)), {
        studentId,
        courseType: course,
        branchId,
        slots: emptySessionSlots(),
        createdAt: serverTimestamp()
      });

      batch.set(doc(collection(db, collections.drivingTests)), {
        studentId,
        courseType: course,
        branchId,
        attempts: emptyTestAttempts(),
        createdAt: serverTimestamp()
      });
    });

    await batch.commit();
  },

  async ensureCourseRelatedDocs(studentId: string, branchId: string, courseType: CourseType): Promise<void> {
    const [sessions, tests] = await Promise.all([
      existingCourseDocs<Session>(collections.sessions, studentId),
      existingCourseDocs<DrivingTest>(collections.drivingTests, studentId)
    ]);
    const existingSessionCourses = new Set(sessions.map((session) => session.courseType));
    const existingTestCourses = new Set(tests.map((test) => test.courseType));
    const batch = writeBatch(db);
    let hasWrites = false;

    COURSE_PARTS[courseType].forEach((course) => {
      if (!existingSessionCourses.has(course)) {
        batch.set(doc(collection(db, collections.sessions)), {
          studentId,
          courseType: course,
          branchId,
          slots: emptySessionSlots(),
          createdAt: serverTimestamp()
        });
        hasWrites = true;
      }

      if (!existingTestCourses.has(course)) {
        batch.set(doc(collection(db, collections.drivingTests)), {
          studentId,
          courseType: course,
          branchId,
          attempts: emptyTestAttempts(),
          createdAt: serverTimestamp()
        });
        hasWrites = true;
      }
    });

    if (hasWrites) {
      await batch.commit();
    }
  },

  async updateRelatedDocBranch(studentId: string, branchId: string): Promise<void> {
    const batch = writeBatch(db);
    const [sessions, tests] = await Promise.all([
      getDocs(query(collection(db, collections.sessions), where('studentId', '==', studentId))),
      getDocs(query(collection(db, collections.drivingTests), where('studentId', '==', studentId)))
    ]);

    sessions.docs.forEach((snapshot) => batch.update(snapshot.ref, { branchId }));
    tests.docs.forEach((snapshot) => batch.update(snapshot.ref, { branchId }));

    if (!sessions.empty || !tests.empty) {
      await batch.commit();
    }
  },

  async updateStudentStatus(studentId: string, status: StudentStatus): Promise<void> {
    await updateDoc(doc(db, collections.students, studentId), { status });
  },

  async backfillStudentSearchTokens(
    batchSize = 300,
    cursor?: StudentPageCursor | null
  ): Promise<{ updated: number; scanned: number; nextCursor: StudentPageCursor | null; hasNextPage: boolean }> {
    const snapshot = await getDocs(query(
      collection(db, collections.students),
      orderBy(documentId(), 'asc'),
      ...(cursor ? [startAfter(cursor)] : []),
      firestoreLimit(batchSize + 1)
    ));
    const docs = snapshot.docs.slice(0, batchSize);
    const batch = writeBatch(db);
    let writes = 0;

    docs.forEach((item) => {
      const student = { id: item.id, ...item.data() } as Student;
      const nextTokens = createStudentSearchTokens(student);
      const currentTokens = Array.isArray(student.searchTokens) ? student.searchTokens : [];
      if (nextTokens.join('|') === currentTokens.join('|')) return;

      batch.update(item.ref, { searchTokens: nextTokens });
      writes += 1;
    });

    if (writes > 0) await batch.commit();
    return {
      updated: writes,
      scanned: docs.length,
      nextCursor: snapshot.docs.length > batchSize ? docs[docs.length - 1] ?? null : null,
      hasNextPage: snapshot.docs.length > batchSize
    };
  }
};
