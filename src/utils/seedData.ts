import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { BASE_TRAINING_SESSION_COUNT, COURSE_COMPLETION_DAYS } from '@/constants/courses';
import { collections } from '@/services/firestoreUtils';
import { db, firebaseConfig } from '@/services/firebase';
import type { CourseType, ExpenseCategory, Installment, StudentStatus } from '@/types';

type SeedUser = {
  email: string;
  password: string;
  fullName: string;
  role: 'owner' | 'staff';
  branchId: string | null;
  phone: string;
  drivingLicenceNo: string;
};

type SeedStudent = {
  fullName: string;
  phone: string;
  enrollmentDate: string;
  courseType: CourseType;
  learningLicenceNo: string;
  llIssueDate?: string | null;
  llExpiryDate?: string | null;
  drivingLicenceNo: string;
  dlIssueDate: string | null;
  dlExpiryDate: string | null;
  status: StudentStatus;
  branchId: string;
};

type FeeSeed = {
  totalAmount: number;
  installments: Installment[];
};

const twoWheelerClasses = [
  'Handle Balance',
  'Running',
  'Marching / Stopping',
  'Circle Practice',
  'ABC + Indicator',
  'Test Practice'
];

const fourWheelerClasses = [
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
];

async function createAuthUserAndProfile(user: SeedUser): Promise<string> {
  const secondaryApp = initializeApp(firebaseConfig, `seed-user-${crypto.randomUUID()}`);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, user.email, user.password);

    await setDoc(doc(db, collections.users, credential.user.uid), {
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      branchId: user.branchId,
      phone: user.phone,
      drivingLicenceNo: user.drivingLicenceNo,
      createdAt: serverTimestamp()
    });

    return credential.user.uid;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'auth/email-already-in-use'
    ) {
      throw new Error(`Seed user already exists in Firebase Auth: ${user.email}`);
    }
    throw error;
  } finally {
    await deleteApp(secondaryApp);
  }
}

function feePayload(studentId: string, branchId: string, fee: FeeSeed) {
  const paidAmount = fee.installments.reduce((total, installment) => total + installment.amount, 0);

  return {
    studentId,
    branchId,
    totalAmount: fee.totalAmount,
    installments: fee.installments,
    paidAmount,
    balance: fee.totalAmount - paidAmount,
    createdAt: serverTimestamp()
  };
}

async function addStudent(student: SeedStudent): Promise<string> {
  const studentRef = await addDoc(collection(db, collections.students), {
    ...student,
    durationDays: COURSE_COMPLETION_DAYS,
    baseSessionCount: BASE_TRAINING_SESSION_COUNT,
    baseDurationDays: COURSE_COMPLETION_DAYS,
    createdAt: serverTimestamp()
  });

  return studentRef.id;
}

export async function seedDummyData(): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error('Dummy seed data can only be created in development mode.');
  }

  const receiptCounter = await getDoc(doc(db, collections.counters, 'receipts'));
  if (receiptCounter.exists()) {
    throw new Error('Seed data appears to already exist because counters/receipts is present.');
  }

  const branch1Ref = await addDoc(collection(db, collections.branches), {
    name: 'Mary Driving School - Branch 1',
    location: 'Hyderabad',
    createdAt: serverTimestamp()
  });

  const branch2Ref = await addDoc(collection(db, collections.branches), {
    name: 'Mary Driving School - Branch 2',
    location: 'Secunderabad',
    createdAt: serverTimestamp()
  });

  const branch1Id = branch1Ref.id;
  const branch2Id = branch2Ref.id;

  await createAuthUserAndProfile({
    email: 'owner@marydrivingschool.com',
    password: 'Owner@123',
    fullName: 'Admin Owner',
    role: 'owner',
    branchId: null,
    phone: '9999999999',
    drivingLicenceNo: 'TS09 2024 0000001'
  });

  const staff1Id = await createAuthUserAndProfile({
    email: 'staff1@marydrivingschool.com',
    password: 'Staff@123',
    fullName: 'Ravi Kumar',
    role: 'staff',
    branchId: branch1Id,
    phone: '9876543210',
    drivingLicenceNo: 'TS09 2023 0000002'
  });

  await createAuthUserAndProfile({
    email: 'staff2@marydrivingschool.com',
    password: 'Staff@123',
    fullName: 'Suresh Reddy',
    role: 'staff',
    branchId: branch2Id,
    phone: '9876543211',
    drivingLicenceNo: 'TS09 2023 0000003'
  });

  const student1Id = await addStudent({
    fullName: 'Abhishek Kumar',
    phone: '9534197235',
    enrollmentDate: '2024-11-01',
    courseType: 'both',
    learningLicenceNo: 'LL-2024-001',
    drivingLicenceNo: '',
    dlIssueDate: null,
    dlExpiryDate: null,
    status: 'ongoing',
    branchId: branch1Id
  });

  const student2Id = await addStudent({
    fullName: 'Priya Nayak',
    phone: '8100083837',
    enrollmentDate: '2024-11-05',
    courseType: '4W',
    learningLicenceNo: 'LL-2024-002',
    drivingLicenceNo: 'TS09 2024 0000005',
    dlIssueDate: '2024-10-01',
    dlExpiryDate: '2044-10-01',
    status: 'passed',
    branchId: branch1Id
  });

  const student3Id = await addStudent({
    fullName: 'Swetha Rao',
    phone: '9521835344',
    enrollmentDate: '2024-11-20',
    courseType: '2W',
    learningLicenceNo: 'LL-2024-003',
    drivingLicenceNo: '',
    dlIssueDate: null,
    dlExpiryDate: null,
    status: 'ongoing',
    branchId: branch1Id
  });

  const student4Id = await addStudent({
    fullName: 'Rahul Sharma',
    phone: '9876501234',
    enrollmentDate: '2024-11-03',
    courseType: '4W',
    learningLicenceNo: 'LL-2024-004',
    drivingLicenceNo: '',
    dlIssueDate: null,
    dlExpiryDate: null,
    status: 'ongoing',
    branchId: branch2Id
  });

  const student5Id = await addStudent({
    fullName: 'Kavya Reddy',
    phone: '9123456780',
    enrollmentDate: '2024-11-10',
    courseType: '2W',
    learningLicenceNo: 'LL-2024-005',
    drivingLicenceNo: '',
    dlIssueDate: null,
    dlExpiryDate: null,
    status: 'ongoing',
    branchId: branch2Id
  });

  const student6Id = await addStudent({
    fullName: 'Srinivas Rao',
    phone: '9988776655',
    enrollmentDate: '2024-11-15',
    courseType: 'both',
    learningLicenceNo: 'LL-2024-006',
    drivingLicenceNo: '',
    dlIssueDate: null,
    dlExpiryDate: null,
    status: 'ongoing',
    branchId: branch2Id
  });

  const fees: Array<[string, string, FeeSeed]> = [
    [
      student1Id,
      branch1Id,
      {
        totalAmount: 7000,
        installments: [
          { receiptNo: 'RCP-001', amount: 3500, date: '2024-11-01', notes: 'Advance' },
          { receiptNo: 'RCP-002', amount: 2000, date: '2024-11-15', notes: 'Second payment' }
        ]
      }
    ],
    [
      student2Id,
      branch1Id,
      {
        totalAmount: 4500,
        installments: [{ receiptNo: 'RCP-003', amount: 4500, date: '2024-11-05', notes: 'Full payment' }]
      }
    ],
    [
      student3Id,
      branch1Id,
      {
        totalAmount: 3000,
        installments: [{ receiptNo: 'RCP-004', amount: 1500, date: '2024-11-20', notes: 'Advance' }]
      }
    ],
    [
      student4Id,
      branch2Id,
      {
        totalAmount: 5000,
        installments: [{ receiptNo: 'RCP-005', amount: 2500, date: '2024-11-03', notes: 'Advance' }]
      }
    ],
    [
      student5Id,
      branch2Id,
      {
        totalAmount: 3200,
        installments: [{ receiptNo: 'RCP-006', amount: 3200, date: '2024-11-10', notes: 'Full payment' }]
      }
    ],
    [
      student6Id,
      branch2Id,
      {
        totalAmount: 7500,
        installments: []
      }
    ]
  ];

  await Promise.all(
    fees.map(([studentId, branchId, fee]) => addDoc(collection(db, collections.fees), feePayload(studentId, branchId, fee)))
  );

  await Promise.all([
    addDoc(collection(db, collections.sessions), {
      studentId: student1Id,
      courseType: '2W',
      branchId: branch1Id,
      slots: [
        { slotNo: 1, date: '2024-11-01', classType: 'Handle Balance' },
        { slotNo: 2, date: '2024-11-02', classType: 'Running' },
        { slotNo: 3, date: '2024-11-03', classType: 'Circle Practice' }
      ]
    }),
    addDoc(collection(db, collections.sessions), {
      studentId: student1Id,
      courseType: '4W',
      branchId: branch1Id,
      slots: [
        { slotNo: 1, date: '2024-11-01', classType: 'Theory' },
        { slotNo: 2, date: '2024-11-02', classType: 'Steering' },
        { slotNo: 3, date: '2024-11-03', classType: 'Road Practice' }
      ]
    }),
    addDoc(collection(db, collections.drivingTests), {
      studentId: student2Id,
      courseType: '4W',
      branchId: branch1Id,
      attempts: [
        { attemptNo: 1, date: '2024-12-01', result: 'fail' },
        { attemptNo: 2, date: '2024-12-15', result: 'pass' }
      ]
    })
  ]);

  const expenses: Array<{
    category: ExpenseCategory;
    amount: number;
    date: string;
    staffId?: string;
    studentId?: string;
    notes: string;
  }> = [
    { category: 'fuel', amount: 2000, date: '2024-11-01', notes: 'Petrol for Alto' },
    { category: 'salary', amount: 15000, date: '2024-11-30', staffId: staff1Id, notes: 'November salary Ravi' },
    { category: 'electricity', amount: 1200, date: '2024-11-05', notes: 'EB bill Nov' },
    { category: 'room_rent', amount: 5000, date: '2024-11-01', notes: 'Office rent Nov' },
    { category: 'learning_challan', amount: 200, date: '2024-11-02', studentId: student1Id, notes: 'RTO challan Abhishek' },
    { category: 'driving_test_challan', amount: 300, date: '2024-12-01', studentId: student2Id, notes: 'Test challan Priya' }
  ];

  await Promise.all(
    expenses.map((expense) =>
      addDoc(collection(db, collections.expenses), {
        branchId: branch1Id,
        ...expense,
        expenseDate: expense.date,
        createdAt: serverTimestamp()
      })
    )
  );

  await Promise.all(
    [branch1Id, branch2Id].flatMap((branchId) => [
      addDoc(collection(db, collections.classTypes), {
        branchId,
        courseType: '2W',
        classes: twoWheelerClasses
      }),
      addDoc(collection(db, collections.classTypes), {
        branchId,
        courseType: '4W',
        classes: fourWheelerClasses
      })
    ])
  );

  await setDoc(doc(db, collections.counters, 'receipts'), { lastReceiptNo: 6 });
}
