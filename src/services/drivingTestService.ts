import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { COURSE_LABELS, DRIVING_TEST_COURSE_PARTS } from '@/constants/courses';
import { authService } from '@/services/authService';
import { db } from '@/services/firebase';
import { firebaseUsageService } from '@/services/firebaseUsageService';
import { collections, getCollection, getDocument } from '@/services/firestoreUtils';
import type {
  DrivingTest,
  DrivingTestAttempt,
  DrivingTestCourseType,
  DrivingTestStatus,
  Student,
  UpdateDrivingTestAttemptPayload
} from '@/types';

function emptyAttempts(): DrivingTestAttempt[] {
  return Array.from({ length: 3 }, (_, index) => ({
    attemptNo: index + 1,
    date: null,
    result: 'pending',
    notes: ''
  }));
}

function normalizeDrivingTest(id: string, data: Omit<DrivingTest, 'id'>): DrivingTest {
  const attempts = Array.from({ length: 3 }, (_, index) => {
    const attemptNo = index + 1;
    const existing = data.attempts?.find((attempt) => Number(attempt.attemptNo) === attemptNo);
    const result = existing?.result === 'pass' || existing?.result === 'fail' ? existing.result : 'pending';

    return {
      attemptNo,
      date: existing?.date ?? null,
      result: result as DrivingTestAttempt['result'],
      notes: existing?.notes ?? ''
    };
  });

  return {
    id,
    studentId: data.studentId,
    branchId: data.branchId,
    courseType: data.courseType,
    attempts,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

async function assertCanAccessStudent(studentId: string): Promise<Student> {
  const [{ profile }, student] = await Promise.all([
    authService.getCurrentUser(),
    getDocument<Student>(collections.students, studentId)
  ]);

  if (!student) throw new Error('Student not found.');
  if (profile?.role === 'staff' && profile.branchId !== student.branchId) {
    throw new Error('You do not have access to this student.');
  }

  return student;
}

function hasPassed(drivingTest: DrivingTest | null): boolean {
  return Boolean(drivingTest?.attempts.some((attempt) => attempt.result === 'pass'));
}

export const drivingTestService = {
  async getDrivingTestByStudentAndCourse(
    studentId: string,
    courseType: DrivingTestCourseType
  ): Promise<DrivingTest | null> {
    await assertCanAccessStudent(studentId);
    const tests = await getCollection<DrivingTest>(collections.drivingTests, [
      where('studentId', '==', studentId),
      where('courseType', '==', courseType)
    ]);

    const test = tests[0];
    return test ? normalizeDrivingTest(test.id, test) : null;
  },

  async createEmptyDrivingTest(
    studentId: string,
    branchId: string,
    courseType: DrivingTestCourseType
  ): Promise<DrivingTest> {
    await assertCanAccessStudent(studentId);
    const testRef = await addDoc(collection(db, collections.drivingTests), {
      studentId,
      branchId,
      courseType,
      attempts: emptyAttempts(),
      createdAt: serverTimestamp()
    });
    firebaseUsageService.trackUsage('writes');

    const test = await getDocument<DrivingTest>(collections.drivingTests, testRef.id);
    if (!test) throw new Error('Unable to load driving test details.');
    return normalizeDrivingTest(test.id, test);
  },

  async updateDrivingTestAttempt(
    drivingTestId: string,
    attemptNo: number,
    payload: UpdateDrivingTestAttemptPayload
  ): Promise<DrivingTest> {
    if (!payload.result) throw new Error('Result is required.');
    if ((payload.result === 'pass' || payload.result === 'fail') && !payload.date) {
      throw new Error('Date is required for pass or fail result.');
    }

    const drivingTest = await getDocument<DrivingTest>(collections.drivingTests, drivingTestId);
    if (!drivingTest) throw new Error('Unable to load driving test details.');
    await assertCanAccessStudent(drivingTest.studentId);

    const normalized = normalizeDrivingTest(drivingTest.id, drivingTest);
    const attempts = normalized.attempts.map((attempt) =>
      attempt.attemptNo === attemptNo
        ? {
            ...attempt,
            date: payload.date || null,
            result: payload.result,
            notes: payload.notes?.trim() ?? ''
          }
        : attempt
    );

    await updateDoc(doc(db, collections.drivingTests, drivingTestId), {
      attempts,
      updatedAt: serverTimestamp()
    });
    firebaseUsageService.trackUsage('writes');

    return {
      ...normalized,
      attempts
    };
  },

  async ensureDrivingTestDocsForStudent(student: Student): Promise<void> {
    await assertCanAccessStudent(student.id);
    const snapshot = await getDocs(query(collection(db, collections.drivingTests), where('studentId', '==', student.id)));
    firebaseUsageService.trackUsage('reads', Math.max(snapshot.docs.length, 1));
    const existingCourses = new Set(snapshot.docs.map((item) => (item.data() as DrivingTest).courseType));

    await Promise.all(
      DRIVING_TEST_COURSE_PARTS[student.courseType].map((courseType) =>
        existingCourses.has(courseType)
          ? Promise.resolve()
          : drivingTestService.createEmptyDrivingTest(student.id, student.branchId, courseType)
      )
    );
  },

  getDrivingTestStatus(drivingTest: DrivingTest): DrivingTestStatus {
    const usedAttempts = drivingTest.attempts.filter((attempt) => Boolean(attempt.date || attempt.result !== 'pending'));

    if (usedAttempts.length === 0) return 'not_started';
    if (hasPassed(drivingTest)) return 'passed';
    if (usedAttempts.length === 3) return 'failed';
    return 'pending';
  },

  async checkAndSuggestStudentPassed(studentId: string): Promise<string | null> {
    const student = await getDocument<Student>(collections.students, studentId);
    if (!student || student.status === 'passed') return null;

    const tests = await Promise.all(
      DRIVING_TEST_COURSE_PARTS[student.courseType].map((courseType) =>
        drivingTestService.getDrivingTestByStudentAndCourse(studentId, courseType)
      )
    );
    const allRequiredCoursesPassed = tests.every(hasPassed);

    if (!allRequiredCoursesPassed) return null;

    if (student.courseType === 'both') {
      return 'This student has passed both 2W and 4W tests. Add the driving licence number in the student profile to mark the course as Passed.';
    }

    return `This student has passed the ${COURSE_LABELS[student.courseType]} test. Add the driving licence number in the student profile to mark the course as Passed.`;
  }
};
