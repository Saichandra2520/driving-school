import { doc, getDoc, increment, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { FirebaseUsageMetricKey, FirebaseUsageMetrics } from '@/types';

const storagePrefix = 'maryDrivingSchool.firebaseUsage';
const usageChangedEvent = 'mary-driving-school:firebase-usage-changed';
const flushDelayMs = 30_000;
const freeLimits: Record<FirebaseUsageMetricKey, number> = {
  reads: 50_000,
  writes: 20_000,
  deletes: 20_000
};

type StoredUsage = Record<FirebaseUsageMetricKey, number>;
type FlushState = {
  dateKey: string;
  pending: StoredUsage;
  timerId: number | null;
  isFlushing: boolean;
};

const flushState: FlushState = {
  dateKey: getTodayKey(),
  pending: getEmptyUsage(),
  timerId: null,
  isFlushing: false
};

function getTodayKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStorageKey(dateKey = getTodayKey()): string {
  return `${storagePrefix}.${dateKey}`;
}

function getPendingStorageKey(dateKey = getTodayKey()): string {
  return `${storagePrefix}.pending.${dateKey}`;
}

function getEmptyUsage(): StoredUsage {
  return { reads: 0, writes: 0, deletes: 0 };
}

function readStoredUsage(): StoredUsage {
  if (typeof window === 'undefined') return getEmptyUsage();

  try {
    const raw = window.localStorage.getItem(getStorageKey());
    if (!raw) return getEmptyUsage();

    const parsed = JSON.parse(raw) as Partial<StoredUsage>;
    return {
      reads: Number(parsed.reads ?? 0),
      writes: Number(parsed.writes ?? 0),
      deletes: Number(parsed.deletes ?? 0)
    };
  } catch {
    return getEmptyUsage();
  }
}

function readPendingUsage(dateKey = getTodayKey()): StoredUsage {
  if (typeof window === 'undefined') return getEmptyUsage();

  try {
    const raw = window.localStorage.getItem(getPendingStorageKey(dateKey));
    if (!raw) return getEmptyUsage();

    const parsed = JSON.parse(raw) as Partial<StoredUsage>;
    return {
      reads: Number(parsed.reads ?? 0),
      writes: Number(parsed.writes ?? 0),
      deletes: Number(parsed.deletes ?? 0)
    };
  } catch {
    return getEmptyUsage();
  }
}

function writeLocalUsage(usage: StoredUsage): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getStorageKey(), JSON.stringify(usage));
  window.dispatchEvent(new CustomEvent(usageChangedEvent));
}

function writePendingUsage(dateKey: string, usage: StoredUsage): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getPendingStorageKey(dateKey), JSON.stringify(usage));
}

function clearPendingUsage(dateKey: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getPendingStorageKey(dateKey));
}

function addUsage(base: StoredUsage, metric: FirebaseUsageMetricKey, amount: number): StoredUsage {
  return {
    ...base,
    [metric]: base[metric] + Math.ceil(amount)
  };
}

function buildMetrics(usage: StoredUsage): FirebaseUsageMetrics {
  const today = getTodayKey();
  const [year, month, day] = today.split('-').map(Number);
  const quotaDayStart = new Date(year, month - 1, day);
  const generatedAt = new Date();

  return {
    quotaDayStart: quotaDayStart.toISOString(),
    quotaDayEnd: generatedAt.toISOString(),
    generatedAt: generatedAt.toISOString(),
    freshnessNote: 'Approximate local estimate from this app/device only. Firebase Console billing usage can be different.',
    metrics: {
      reads: buildMetric('reads', usage.reads),
      writes: buildMetric('writes', usage.writes),
      deletes: buildMetric('deletes', usage.deletes)
    }
  };
}

function buildMetric(key: FirebaseUsageMetricKey, used: number) {
  const limit = freeLimits[key];
  return {
    used,
    limit,
    percentUsed: Math.min(100, Math.round((used / limit) * 1000) / 10)
  };
}

async function readRemoteUsage(): Promise<StoredUsage> {
  const snapshot = await getDoc(doc(db, 'usageMetrics', getTodayKey()));
  if (!snapshot.exists()) return getEmptyUsage();

  const data = snapshot.data() as Partial<StoredUsage>;
  return {
    reads: Number(data.reads ?? 0),
    writes: Number(data.writes ?? 0),
    deletes: Number(data.deletes ?? 0)
  };
}

function ensureFlushStateDate(): void {
  const today = getTodayKey();
  if (flushState.dateKey === today) return;

  flushState.dateKey = today;
  flushState.pending = readPendingUsage(today);
  flushState.timerId = null;
  flushState.isFlushing = false;
}

function scheduleFlush(): void {
  if (typeof window === 'undefined' || flushState.timerId !== null) return;

  flushState.timerId = window.setTimeout(() => {
    flushState.timerId = null;
    void firebaseUsageService.flushPendingUsage();
  }, flushDelayMs);
}

export const firebaseUsageService = {
  async getUsageMetrics(): Promise<FirebaseUsageMetrics> {
    try {
      return buildMetrics(await readRemoteUsage());
    } catch {
      return buildMetrics(readStoredUsage());
    }
  },

  trackUsage(metric: FirebaseUsageMetricKey, amount = 1): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    ensureFlushStateDate();

    writeLocalUsage(addUsage(readStoredUsage(), metric, amount));
    flushState.pending = addUsage(flushState.pending, metric, amount);
    writePendingUsage(flushState.dateKey, flushState.pending);
    scheduleFlush();
  },

  async flushPendingUsage(): Promise<void> {
    ensureFlushStateDate();
    if (flushState.isFlushing) return;

    const pending = { ...flushState.pending };
    if (!pending.reads && !pending.writes && !pending.deletes) return;

    flushState.isFlushing = true;
    try {
      await setDoc(
        doc(db, 'usageMetrics', flushState.dateKey),
        {
          reads: increment(pending.reads),
          writes: increment(pending.writes),
          deletes: increment(pending.deletes),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      flushState.pending = getEmptyUsage();
      clearPendingUsage(flushState.dateKey);
      window.dispatchEvent(new CustomEvent(usageChangedEvent));
    } catch (error) {
      console.warn('Unable to sync approximate Firebase usage metrics.', error);
    } finally {
      flushState.isFlushing = false;
      if (flushState.pending.reads || flushState.pending.writes || flushState.pending.deletes) {
        scheduleFlush();
      }
    }
  },

  subscribe(onChange: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;

    const handleChange = () => onChange();
    const unsubscribeRemote = onSnapshot(
      doc(db, 'usageMetrics', getTodayKey()),
      () => onChange(),
      () => undefined
    );
    window.addEventListener(usageChangedEvent, handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      unsubscribeRemote();
      window.removeEventListener(usageChangedEvent, handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }
};
