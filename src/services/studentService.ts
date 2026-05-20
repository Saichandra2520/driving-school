import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint
} from 'firebase/firestore';
import { authService } from '@/services/authService';
import { db } from '@/services/firebase';
import { collections, createdAt, getCollection, getDocument } from '@/services/firestoreUtils';
import { calculateStudentExpiryDate, getDaysRemaining } from '@/utils/dateUtils';
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

const courseParts: Record<CourseType, Array<'2W' | '4W'>> = {
  '2W': ['2W'],
  '4W': ['4W'],
  both: ['2W', '4W']
};

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

async function attachFeeAndBranch(student: Student, branches: Branch[]): Promise<StudentWithFee> {
  const fee = await getStudentFee(student.id);
  const totalAmount = Number(fee?.totalAmount ?? 0);
  const paidAmount = Number(fee?.paidAmount ?? 0);
  const balance = Number(fee?.balance ?? Math.max(totalAmount - paidAmount, 0));
  const durationDays = student.baseDurationDays ?? student.durationDays ?? 30;
  const expiryDate = calculateStudentExpiryDate(student.enrollmentDate, durationDays);

  return {
    ...student,
    durationDays,
    baseSessionCount: student.baseSessionCount ?? 30,
    baseDurationDays: durationDays,
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
  async getStudents(filters: StudentFilters = {}): Promise<StudentWithFee[]> {
    const { profile } = await authService.getCurrentUser();
    const effectiveBranchId = profile?.role === 'staff' ? profile.branchId : filters.branchId;
    const constraints: QueryConstraint[] = [
      ...(effectiveBranchId ? [where('branchId', '==', effectiveBranchId)] : []),
      ...(filters.courseType && filters.courseType !== 'all' ? [where('courseType', '==', filters.courseType)] : []),
      ...(filters.status && filters.status !== 'all' ? [where('status', '==', filters.status)] : []),
      orderBy('enrollmentDate', 'desc')
    ];

    const [studentsRaw, branches] = await Promise.all([
      getCollection<Student>(collections.students, constraints),
      effectiveBranchId
        ? getDocument<Branch>(collections.branches, effectiveBranchId).then((branch) => (branch ? [branch] : []))
        : getCollection<Branch>(collections.branches)
    ]);

    const search = normalizeSearch(filters.search ?? '');
    const students = search
      ? studentsRaw.filter((student) =>
          [student.fullName, student.phone, student.learningLicenceNo ?? '', student.drivingLicenceNo ?? '']
            .some((value) => value.toLowerCase().includes(search))
        )
      : studentsRaw;

    return Promise.all(students.map((student) => attachFeeAndBranch(student, branches)));
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

    const studentRef = await addDoc(collection(db, collections.students), {
      branchId: payload.branchId,
      fullName: payload.fullName.trim(),
      phone: payload.phone.trim(),
      courseType: payload.courseType,
      enrollmentDate: payload.enrollmentDate,
      learningLicenceNo: payload.learningLicenceNo?.trim() ?? '',
      drivingLicenceNo: payload.drivingLicenceNo?.trim() ?? '',
      dlIssueDate: payload.dlIssueDate || null,
      dlExpiryDate: payload.dlExpiryDate || null,
      status: payload.status,
      durationDays: 30,
      baseSessionCount: 30,
      baseDurationDays: 30,
      completedAt: null,
      createdAt: createdAt()
    });

    await studentService.createInitialStudentRelatedDocs(
      studentRef.id,
      payload.branchId,
      payload.courseType,
      payload.totalAmount
    );

    const student = await studentService.getStudentById(studentRef.id);
    if (!student) throw new Error('Student was created but could not be loaded.');
    return student;
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
    if (payload.courseType !== undefined) updatePayload.courseType = payload.courseType;
    if (payload.learningLicenceNo !== undefined) updatePayload.learningLicenceNo = payload.learningLicenceNo.trim();
    if (payload.drivingLicenceNo !== undefined) updatePayload.drivingLicenceNo = payload.drivingLicenceNo.trim();
    if (payload.dlIssueDate !== undefined) updatePayload.dlIssueDate = payload.dlIssueDate || null;
    if (payload.dlExpiryDate !== undefined) updatePayload.dlExpiryDate = payload.dlExpiryDate || null;
    if (payload.status !== undefined) updatePayload.status = payload.status;
    if (payload.branchId !== undefined) updatePayload.branchId = payload.branchId;

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

    courseParts[courseType].forEach((course) => {
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

    courseParts[courseType].forEach((course) => {
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
  }
};
