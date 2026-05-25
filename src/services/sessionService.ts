import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { authService } from '@/services/authService';
import { BASE_TRAINING_SESSION_COUNT, COURSE_PARTS } from '@/constants/courses';
import { courseExtensionService } from '@/services/courseExtensionService';
import { db } from '@/services/firebase';
import { firebaseUsageService } from '@/services/firebaseUsageService';
import { collections, getCollection, getDocument } from '@/services/firestoreUtils';
import { calculateStudentExpiryDate, getCourseStartDate } from '@/utils/dateUtils';
import type {
  ClassTypes,
  CourseType,
  Student,
  TrainingCourseType,
  TrainingSession,
  UpdateSessionSlotPayload,
  MarkAttendancePayload,
  SessionSlot
} from '@/types';

const fallbackClassTypes: Record<TrainingCourseType, string[]> = {
  '2W': ['Handle Balance', 'Running', 'Marching / Stopping', 'Circle Practice', 'ABC + Indicator', 'Test Practice'],
  '4W': [
    'Theory',
    'Steering Practice',
    'Gear / Peddle Practice',
    'Road Practice',
    'Slow Race',
    'Parking',
    'Traffic',
    'Hill Marching',
    'Test Practice',
    'Night Drive',
    'A2Z Workshop Class'
  ],
  HV: [
    'Theory',
    'Vehicle Controls',
    'Yard Practice',
    'Road Practice',
    'Reverse / Parking',
    'Gradient Start',
    'Load Safety',
    'Test Practice'
  ]
};

function emptySlots(slotCount = BASE_TRAINING_SESSION_COUNT) {
  return Array.from({ length: slotCount }, (_, index) => ({
    slotNo: index + 1,
    date: null,
    classType: '',
    vehicle: '',
    instructor: '',
    notes: ''
  }));
}

function normalizeSession(id: string, data: Omit<TrainingSession, 'id'>, slotCount = BASE_TRAINING_SESSION_COUNT): TrainingSession {
  const normalizedSlotCount = Math.max(slotCount, data.slots?.length ?? 0, BASE_TRAINING_SESSION_COUNT);
  const slots = Array.from({ length: normalizedSlotCount }, (_, index) => {
    const slotNo = index + 1;
    const existing = data.slots?.find((slot) => Number(slot.slotNo) === slotNo);
    return {
      slotNo,
      date: existing?.date ?? null,
      classType: existing?.classType ?? '',
      vehicle: existing?.vehicle ?? '',
      instructor: existing?.instructor ?? '',
      notes: existing?.notes ?? ''
    };
  });

  return {
    id,
    studentId: data.studentId,
    branchId: data.branchId,
    courseType: data.courseType,
    slots,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

export function getNextEmptySlot(slots: SessionSlot[]): SessionSlot | null {
  return slots.find((slot) => !slot.date && !slot.classType.trim()) ?? null;
}

export function getLastCompletedSession(slots: SessionSlot[]): SessionSlot | null {
  return [...slots].reverse().find((slot) => Boolean(slot.date && slot.classType.trim())) ?? null;
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

async function assertCanAccessSession(session: TrainingSession): Promise<Student> {
  const [{ profile }, student] = await Promise.all([
    authService.getCurrentUser(),
    getDocument<Student>(collections.students, session.studentId)
  ]);

  if (!student) throw new Error('Student not found.');
  if (profile?.role === 'staff' && (profile.branchId !== student.branchId || profile.branchId !== session.branchId)) {
    throw new Error('You do not have access to this branch.');
  }

  return student;
}

async function assertSessionDateInTrainingPeriod(
  student: Student,
  session: TrainingSession,
  date: string
): Promise<void> {
  const courseStartDate = getCourseStartDate(student);
  const entitlement = await courseExtensionService.getEntitlementForStudent(student, session.courseType);
  const completionDate = calculateStudentExpiryDate(courseStartDate, entitlement.allowedDays);

  if (date < courseStartDate) {
    throw new Error('Session date cannot be before the course start date.');
  }

  if (date > completionDate) {
    throw new Error(`Session date must be within the ${entitlement.allowedDays}-day course period.`);
  }
}

export const sessionService = {
  async getSessionByStudentAndCourse(
    studentId: string,
    courseType: TrainingCourseType,
    slotCount = BASE_TRAINING_SESSION_COUNT
  ): Promise<TrainingSession | null> {
    await assertCanAccessStudent(studentId);
    const sessions = await getCollection<TrainingSession>(collections.sessions, [
      where('studentId', '==', studentId),
      where('courseType', '==', courseType)
    ]);

    const session = sessions[0];
    return session ? normalizeSession(session.id, session, slotCount) : null;
  },

  async createEmptySessionCard(
    studentId: string,
    branchId: string,
    courseType: TrainingCourseType,
    slotCount = BASE_TRAINING_SESSION_COUNT
  ): Promise<TrainingSession> {
    await assertCanAccessStudent(studentId);
    const slots = emptySlots(slotCount);
    const sessionRef = await addDoc(collection(db, collections.sessions), {
      studentId,
      branchId,
      courseType,
      slots,
      createdAt: serverTimestamp()
    });
    firebaseUsageService.trackUsage('writes');

    return normalizeSession(sessionRef.id, {
      studentId,
      branchId,
      courseType,
      slots
    }, slotCount);
  },

  async ensureSessionCapacity(sessionId: string, slotCount: number): Promise<TrainingSession> {
    const session = await getDocument<TrainingSession>(collections.sessions, sessionId);
    if (!session) throw new Error('Unable to load training card.');

    const normalized = normalizeSession(session.id, session, slotCount);
    await assertCanAccessSession(normalized);

    if (normalized.slots.length === session.slots?.length) {
      return normalized;
    }

    await updateDoc(doc(db, collections.sessions, sessionId), {
      slots: normalized.slots,
      updatedAt: serverTimestamp()
    });
    firebaseUsageService.trackUsage('writes');

    return normalized;
  },

  async updateSessionSlot(
    sessionId: string,
    slotNo: number,
    payload: UpdateSessionSlotPayload
  ): Promise<TrainingSession> {
    if (!payload.date) throw new Error('Date is required.');
    if (!payload.classType.trim()) throw new Error('Class type is required.');

    const session = await getDocument<TrainingSession>(collections.sessions, sessionId);
    if (!session) throw new Error('Unable to load training card.');

    const normalized = normalizeSession(session.id, session);
    const student = await assertCanAccessSession(normalized);
    await assertSessionDateInTrainingPeriod(student, normalized, payload.date);
    const slots = normalized.slots.map((slot) =>
      slot.slotNo === slotNo
        ? {
            ...slot,
            date: payload.date,
            classType: payload.classType.trim(),
            vehicle: payload.vehicle?.trim() ?? '',
            instructor: payload.instructor?.trim() ?? '',
            notes: payload.notes?.trim() ?? ''
          }
        : slot
    );

    await updateDoc(doc(db, collections.sessions, sessionId), {
      slots,
      updatedAt: serverTimestamp()
    });
    firebaseUsageService.trackUsage('writes');

    return {
      ...normalized,
      slots
    };
  },

  async quickMarkNextSession(
    sessionId: string,
    payload: MarkAttendancePayload
  ): Promise<TrainingSession> {
    if (!payload.date) throw new Error('Date is required.');
    if (!payload.classType.trim()) throw new Error('Class type is required.');

    const session = await getDocument<TrainingSession>(collections.sessions, sessionId);
    if (!session) throw new Error('Unable to load training card.');
    const normalizedSession = normalizeSession(session.id, session);
    const student = await assertCanAccessSession(normalizedSession);
    await assertSessionDateInTrainingPeriod(student, normalizedSession, payload.date);

    return runTransaction(db, async (transaction) => {
      const sessionRef = doc(db, collections.sessions, sessionId);
      const snapshot = await transaction.get(sessionRef);
      firebaseUsageService.trackUsage('reads');
      if (!snapshot.exists()) throw new Error('Unable to load training card.');

      const normalized = normalizeSession(snapshot.id, snapshot.data() as Omit<TrainingSession, 'id'>);
      const nextSlot = getNextEmptySlot(normalized.slots);
      if (!nextSlot) throw new Error('All allowed sessions are already completed.');

      const slots = normalized.slots.map((slot) =>
        slot.slotNo === nextSlot.slotNo
          ? {
              ...slot,
              date: payload.date,
              classType: payload.classType.trim(),
              vehicle: payload.vehicle?.trim() ?? '',
              instructor: payload.instructor?.trim() ?? '',
              notes: payload.notes?.trim() ?? ''
            }
          : slot
      );

      transaction.update(sessionRef, {
        slots,
        updatedAt: serverTimestamp()
      });
      firebaseUsageService.trackUsage('writes');

      return {
        ...normalized,
        slots
      };
    });
  },

  async quickMarkNextSessionFast(
    sessionId: string,
    payload: MarkAttendancePayload,
    slotCount = BASE_TRAINING_SESSION_COUNT
  ): Promise<TrainingSession> {
    if (!payload.date) throw new Error('Date is required.');
    if (!payload.classType.trim()) throw new Error('Class type is required.');

    return runTransaction(db, async (transaction) => {
      const sessionRef = doc(db, collections.sessions, sessionId);
      const snapshot = await transaction.get(sessionRef);
      firebaseUsageService.trackUsage('reads');
      if (!snapshot.exists()) throw new Error('Unable to load training card.');

      const normalized = normalizeSession(snapshot.id, snapshot.data() as Omit<TrainingSession, 'id'>, slotCount);
      const nextSlot = getNextEmptySlot(normalized.slots);
      if (!nextSlot) throw new Error('All allowed sessions are already completed.');

      const slots = normalized.slots.map((slot) =>
        slot.slotNo === nextSlot.slotNo
          ? {
              ...slot,
              date: payload.date,
              classType: payload.classType.trim(),
              vehicle: payload.vehicle?.trim() ?? '',
              instructor: payload.instructor?.trim() ?? '',
              notes: payload.notes?.trim() ?? ''
            }
          : slot
      );

      transaction.update(sessionRef, {
        slots,
        updatedAt: serverTimestamp()
      });
      firebaseUsageService.trackUsage('writes');

      return {
        ...normalized,
        slots
      };
    });
  },

  async getClassTypes(branchId: string, courseType: TrainingCourseType): Promise<string[]> {
    const classTypes = await getCollection<ClassTypes>(collections.classTypes, [
      where('branchId', '==', branchId),
      where('courseType', '==', courseType)
    ]);

    return classTypes[0]?.classes?.length ? classTypes[0].classes : fallbackClassTypes[courseType];
  },

  async ensureSessionCardsForStudent(student: Student): Promise<void> {
    await assertCanAccessStudent(student.id);
    const snapshot = await getDocs(query(collection(db, collections.sessions), where('studentId', '==', student.id)));
    firebaseUsageService.trackUsage('reads', Math.max(snapshot.docs.length, 1));
    const existingCourses = new Set(
      snapshot.docs.map((item) => (item.data() as TrainingSession).courseType)
    );

    await Promise.all(
      COURSE_PARTS[student.courseType].map((courseType) =>
        existingCourses.has(courseType)
          ? Promise.resolve()
          : sessionService.createEmptySessionCard(student.id, student.branchId, courseType)
      )
    );
  }
};
