import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type QueryConstraint
} from 'firebase/firestore';
import { db } from '@/services/firebase';

export const collections = {
  branches: 'branches',
  users: 'users',
  students: 'students',
  fees: 'fees',
  payments: 'payments',
  expenses: 'expenses',
  courseExtensions: 'courseExtensions',
  sessions: 'sessions',
  drivingTests: 'drivingTests',
  classTypes: 'classTypes',
  counters: 'counters'
} as const;

export const createdAt = () => serverTimestamp();

export function normalizeDoc<T extends object>(id: string, data: DocumentData): T {
  return {
    id,
    ...Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        value instanceof Timestamp ? value.toDate().toISOString() : value
      ])
    )
  } as unknown as T;
}

export async function getDocument<T extends object>(
  collectionName: string,
  id: string
): Promise<T | null> {
  const snapshot = await getDoc(doc(db, collectionName, id));
  return snapshot.exists() ? normalizeDoc<T>(snapshot.id, snapshot.data()) : null;
}

export async function getCollection<T extends object>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  const snapshot = await getDocs(query(collection(db, collectionName), ...constraints));
  return snapshot.docs.map((item) => normalizeDoc<T>(item.id, item.data()));
}

export async function getByBranch<T extends { branchId: string }>(
  collectionName: string,
  branchId?: string | null,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  return getCollection<T>(collectionName, [
    ...(branchId ? [where('branchId', '==', branchId)] : []),
    ...constraints
  ]);
}

export { collection, doc, orderBy, query, where };
