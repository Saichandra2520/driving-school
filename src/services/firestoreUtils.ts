import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryConstraint
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { firebaseUsageService } from '@/services/firebaseUsageService';
import { useSyncStore } from '@/store/syncStore';

export const collections = {
  branches: 'branches',
  users: 'users',
  students: 'students',
  fees: 'fees',
  expenses: 'expenses',
  courseExtensions: 'courseExtensions',
  sessions: 'sessions',
  drivingTests: 'drivingTests',
  classTypes: 'classTypes',
  counters: 'counters'
} as const;

export const createdAt = () => serverTimestamp();

export type FirestoreCacheMetadata = {
  fromCache: boolean;
  hasPendingWrites: boolean;
};

export type FirestoreRowsSnapshot<T> = {
  rows: T[];
  metadata: FirestoreCacheMetadata;
};

type CollectionSubscriber<T> = {
  onNext: (snapshot: FirestoreRowsSnapshot<T>) => void;
  onError?: (error: FirestoreError) => void;
};

type CachedCollectionSubscription<T extends object> = {
  subscribers: Set<CollectionSubscriber<T>>;
  unsubscribe: () => void;
  closeTimer: number | null;
  lastSnapshot: FirestoreRowsSnapshot<T> | null;
};

const collectionSubscriptionCache = new Map<string, CachedCollectionSubscription<any>>();
const liveQueryKeepAliveMs = 5 * 60 * 1000;

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
  useSyncStore.getState().setFirestoreMetadata({
    fromCache: snapshot.metadata.fromCache,
    hasPendingWrites: snapshot.metadata.hasPendingWrites
  });
  if (!snapshot.metadata.fromCache) firebaseUsageService.trackUsage('reads');
  return snapshot.exists() ? normalizeDoc<T>(snapshot.id, snapshot.data()) : null;
}

export async function getCollection<T extends object>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  const snapshot = await getDocs(query(collection(db, collectionName), ...constraints));
  useSyncStore.getState().setFirestoreMetadata({
    fromCache: snapshot.metadata.fromCache,
    hasPendingWrites: snapshot.docs.some((item) => item.metadata.hasPendingWrites)
  });
  if (!snapshot.metadata.fromCache) {
    firebaseUsageService.trackUsage('reads', Math.max(snapshot.docs.length, 1));
  }
  return snapshot.docs.map((item) => normalizeDoc<T>(item.id, item.data()));
}

export function subscribeCollection<T extends object>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  onNext: (snapshot: FirestoreRowsSnapshot<T>) => void,
  onError?: (error: FirestoreError) => void,
  cacheKey = collectionName
): () => void {
  const subscriber: CollectionSubscriber<T> = { onNext, onError };
  const existing = collectionSubscriptionCache.get(cacheKey) as CachedCollectionSubscription<T> | undefined;

  if (existing) {
    if (existing.closeTimer) {
      window.clearTimeout(existing.closeTimer);
      existing.closeTimer = null;
    }
    existing.subscribers.add(subscriber);
    if (existing.lastSnapshot) onNext(existing.lastSnapshot);
    return () => releaseCachedCollectionSubscription(cacheKey, subscriber);
  }

  const cachedSubscription: CachedCollectionSubscription<T> = {
    subscribers: new Set([subscriber]),
    unsubscribe: () => undefined,
    closeTimer: null,
    lastSnapshot: null
  };

  cachedSubscription.unsubscribe = onSnapshot(
    query(collection(db, collectionName), ...constraints),
    { includeMetadataChanges: true },
    (snapshot) => {
      const metadata = {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.docs.some((item) => item.metadata.hasPendingWrites)
      };
      if (!metadata.fromCache && !metadata.hasPendingWrites) {
        firebaseUsageService.trackUsage('reads', Math.max(snapshot.docs.length, 1));
      }
      const nextSnapshot = {
        rows: snapshot.docs.map((item) => normalizeDoc<T>(item.id, item.data())),
        metadata
      };

      cachedSubscription.lastSnapshot = nextSnapshot;
      useSyncStore.getState().setFirestoreMetadata(metadata);
      cachedSubscription.subscribers.forEach((item) => item.onNext(nextSnapshot));
    },
    (error) => {
      cachedSubscription.subscribers.forEach((item) => item.onError?.(error));
    }
  );

  collectionSubscriptionCache.set(cacheKey, cachedSubscription);
  return () => releaseCachedCollectionSubscription(cacheKey, subscriber);
}

function releaseCachedCollectionSubscription<T extends object>(
  cacheKey: string,
  subscriber: CollectionSubscriber<T>
): void {
  const cachedSubscription = collectionSubscriptionCache.get(cacheKey);
  if (!cachedSubscription) return;

  cachedSubscription.subscribers.delete(subscriber);
  if (cachedSubscription.subscribers.size > 0 || cachedSubscription.closeTimer) return;

  cachedSubscription.closeTimer = window.setTimeout(() => {
    cachedSubscription.unsubscribe();
    collectionSubscriptionCache.delete(cacheKey);
  }, liveQueryKeepAliveMs);
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

export { collection, doc, onSnapshot, orderBy, query, where };
