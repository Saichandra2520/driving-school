import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCachedAsync } from '@/hooks/useCachedData';
import {
  cacheTags,
  clearPageCache,
  createPageCacheKey,
  defaultPageCacheStaleTimeMs,
  invalidatePageCache,
  readPageCache,
  usePageCacheStore,
  writePageCache
} from '@/store/pageCacheStore';

describe('page cache store and async hook', () => {
  beforeEach(() => {
    clearPageCache();
  });

  it('uses fresh cached data without calling the fetcher', async () => {
    const cacheKey = createPageCacheKey('students', { branchId: 'branch-1' });
    const fetcher = vi.fn(async () => 'fresh');
    writePageCache(cacheKey, 'cached', [cacheTags.students]);

    const { result } = renderHook(() => useCachedAsync({ cacheKey, fetcher, tags: [cacheTags.students] }));

    await waitFor(() => {
      expect(result.current.data).toBe('cached');
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns stale cached data first and refreshes in the background', async () => {
    const cacheKey = createPageCacheKey('students', { branchId: 'branch-1', search: 'a' });
    const fetcher = vi.fn(async () => 'fresh');
    usePageCacheStore.setState({
      entries: {
        [cacheKey]: {
          data: 'cached',
          tags: [cacheTags.students],
          updatedAt: Date.now() - defaultPageCacheStaleTimeMs - 1
        }
      }
    });

    const { result } = renderHook(() => useCachedAsync({ cacheKey, fetcher, tags: [cacheTags.students] }));

    expect(result.current.data).toBe('cached');
    await waitFor(() => {
      expect(result.current.data).toBe('fresh');
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('force refresh bypasses a fresh cache entry', async () => {
    const cacheKey = createPageCacheKey('payments', { branchId: 'branch-1' });
    const fetcher = vi.fn(async () => 'fresh');
    writePageCache(cacheKey, 'cached', [cacheTags.payments]);

    const { result } = renderHook(() => useCachedAsync({ cacheKey, fetcher, tags: [cacheTags.payments] }));

    await waitFor(() => {
      expect(result.current.data).toBe('cached');
    });
    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refresh({ force: true });
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe('fresh');
  });

  it('invalidates only entries matching the requested tags', () => {
    const studentsKey = createPageCacheKey('students', { branchId: 'branch-1' });
    const expensesKey = createPageCacheKey('expenses', { branchId: 'branch-1' });
    writePageCache(studentsKey, ['student'], [cacheTags.students]);
    writePageCache(expensesKey, ['expense'], [cacheTags.expenses]);

    invalidatePageCache([cacheTags.students]);

    expect(readPageCache(studentsKey)).toBeUndefined();
    expect(readPageCache(expensesKey)?.data).toEqual(['expense']);
  });

  it('keeps branch and filter cache keys isolated', () => {
    const branchOneKey = createPageCacheKey('students', { branchId: 'branch-1', search: '' });
    const branchTwoKey = createPageCacheKey('students', { branchId: 'branch-2', search: '' });
    const filteredKey = createPageCacheKey('students', { branchId: 'branch-1', search: 'mary' });

    writePageCache(branchOneKey, 'branch-one', [cacheTags.branch('branch-1')]);
    writePageCache(branchTwoKey, 'branch-two', [cacheTags.branch('branch-2')]);
    writePageCache(filteredKey, 'filtered', [cacheTags.branch('branch-1')]);

    expect(readPageCache(branchOneKey)?.data).toBe('branch-one');
    expect(readPageCache(branchTwoKey)?.data).toBe('branch-two');
    expect(readPageCache(filteredKey)?.data).toBe('filtered');
    expect(new Set([branchOneKey, branchTwoKey, filteredKey]).size).toBe(3);
  });
});
