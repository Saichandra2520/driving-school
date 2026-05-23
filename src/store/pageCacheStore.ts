import { create } from 'zustand';

export const defaultPageCacheStaleTimeMs = 5 * 60 * 1000;

export type PageCacheEntry<T = unknown> = {
  data: T;
  tags: string[];
  updatedAt: number;
};

type PageCacheState = {
  entries: Record<string, PageCacheEntry>;
  setEntry: <T>(key: string, data: T, tags?: string[]) => void;
  getEntry: <T>(key: string) => PageCacheEntry<T> | undefined;
  invalidateTags: (tags: string[]) => void;
  invalidateKeys: (keys: string[]) => void;
  clear: () => void;
};

export const cacheTags = {
  students: 'students',
  fees: 'fees',
  dashboard: 'dashboard',
  attendance: 'attendance',
  payments: 'payments',
  expenses: 'expenses',
  reports: 'reports',
  settings: 'settings',
  branches: 'branches',
  staff: 'staff',
  usage: 'usage',
  branch: (branchId?: string | null) => `branch:${branchId ?? 'all'}`,
  user: (userId?: string | null) => `user:${userId ?? 'anonymous'}`
} as const;

export const usePageCacheStore = create<PageCacheState>((set, get) => ({
  entries: {},
  setEntry: (key, data, tags = []) =>
    set((current) => ({
      entries: {
        ...current.entries,
        [key]: {
          data,
          tags: Array.from(new Set(tags)),
          updatedAt: Date.now()
        }
      }
    })),
  getEntry: <T>(key: string) => get().entries[key] as PageCacheEntry<T> | undefined,
  invalidateTags: (tags) =>
    set((current) => {
      if (tags.length === 0) return current;

      const tagSet = new Set(tags);
      const entries = Object.fromEntries(
        Object.entries(current.entries).filter(([, entry]) => !entry.tags.some((tag) => tagSet.has(tag)))
      );

      return { entries };
    }),
  invalidateKeys: (keys) =>
    set((current) => {
      if (keys.length === 0) return current;

      const keySet = new Set(keys);
      const entries = Object.fromEntries(
        Object.entries(current.entries).filter(([key]) => !keySet.has(key))
      );

      return { entries };
    }),
  clear: () => set({ entries: {} })
}));

export function createPageCacheKey(...parts: unknown[]): string {
  return stableStringify(parts);
}

export function readPageCache<T>(key: string): PageCacheEntry<T> | undefined {
  return usePageCacheStore.getState().getEntry<T>(key);
}

export function writePageCache<T>(key: string, data: T, tags: string[] = []): void {
  usePageCacheStore.getState().setEntry(key, data, tags);
}

export function invalidatePageCache(tags: string[]): void {
  usePageCacheStore.getState().invalidateTags(tags);
}

export function invalidatePageCacheKeys(keys: string[]): void {
  usePageCacheStore.getState().invalidateKeys(keys);
}

export function clearPageCache(): void {
  usePageCacheStore.getState().clear();
}

export function isPageCacheFresh(key: string, staleTimeMs = defaultPageCacheStaleTimeMs): boolean {
  const entry = readPageCache(key);
  return Boolean(entry && Date.now() - entry.updatedAt < staleTimeMs);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortValue(item)])
  );
}
