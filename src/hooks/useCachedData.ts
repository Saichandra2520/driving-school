import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  defaultPageCacheStaleTimeMs,
  isPageCacheFresh,
  readPageCache,
  writePageCache
} from '@/store/pageCacheStore';

type RefreshOptions = {
  force?: boolean;
};

type CachedState<T> = {
  cacheKey: string;
  data: T | null;
  error: Error | null;
  hasCachedData: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
};

type CachedAsyncOptions<T> = {
  cacheKey: string;
  enabled?: boolean;
  fetcher: () => Promise<T>;
  staleTimeMs?: number;
  tags?: string[];
};

type CachedSubscriptionOptions<T> = {
  cacheKey: string;
  enabled?: boolean;
  staleTimeMs?: number;
  subscribe: (onNext: (data: T) => void, onError: (error: Error) => void) => () => void;
  tags?: string[];
};

type CachedResult<T> = CachedState<T> & {
  refresh: (options?: RefreshOptions) => Promise<T | undefined>;
  setCachedData: (data: T) => void;
};

export function useCachedAsync<T>({
  cacheKey,
  enabled = true,
  fetcher,
  staleTimeMs = defaultPageCacheStaleTimeMs,
  tags = []
}: CachedAsyncOptions<T>): CachedResult<T> {
  const tagsKey = tags.join('|');
  const initialState = useMemo(() => getInitialState<T>(cacheKey, enabled), [cacheKey, enabled]);
  const [state, setState] = useState<CachedState<T>>(initialState);
  const effectiveState = state.cacheKey === cacheKey ? state : initialState;

  const setCachedData = useCallback(
    (data: T): void => {
      const nextTags = tagsKey ? tagsKey.split('|') : [];
      writePageCache(cacheKey, data, nextTags);
      setState({
        cacheKey,
        data,
        error: null,
        hasCachedData: true,
        isLoading: false,
        isRefreshing: false
      });
    },
    [cacheKey, tagsKey]
  );

  const refresh = useCallback(
    async ({ force = false }: RefreshOptions = {}): Promise<T | undefined> => {
      if (!enabled) {
        setState({
          cacheKey,
          data: null,
          error: null,
          hasCachedData: false,
          isLoading: false,
          isRefreshing: false
        });
        return undefined;
      }

      const cached = readPageCache<T>(cacheKey);
      if (!force && cached && isPageCacheFresh(cacheKey, staleTimeMs)) {
        setState({
          cacheKey,
          data: cached.data,
          error: null,
          hasCachedData: true,
          isLoading: false,
          isRefreshing: false
        });
        return cached.data;
      }

      setState((current) => ({
        cacheKey,
        data: cached?.data ?? (current.cacheKey === cacheKey ? current.data : null),
        error: null,
        hasCachedData: Boolean(cached) || (current.cacheKey === cacheKey && current.hasCachedData),
        isLoading: !cached && !(current.cacheKey === cacheKey && current.data),
        isRefreshing: Boolean(cached) || Boolean(current.cacheKey === cacheKey && current.data)
      }));

      try {
        const data = await fetcher();
        setCachedData(data);
        return data;
      } catch (error) {
        const nextError = toError(error);
        setState((current) => ({
          cacheKey,
          data: current.cacheKey === cacheKey ? current.data : cached?.data ?? null,
          error: nextError,
          hasCachedData: current.cacheKey === cacheKey ? current.hasCachedData : Boolean(cached),
          isLoading: false,
          isRefreshing: false
        }));
        return undefined;
      }
    },
    [cacheKey, enabled, fetcher, setCachedData, staleTimeMs]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...effectiveState,
    refresh,
    setCachedData
  };
}

export function useCachedSubscription<T>({
  cacheKey,
  enabled = true,
  staleTimeMs = defaultPageCacheStaleTimeMs,
  subscribe,
  tags = []
}: CachedSubscriptionOptions<T>): CachedResult<T> {
  const tagsKey = tags.join('|');
  const initialState = useMemo(() => getInitialState<T>(cacheKey, enabled), [cacheKey, enabled]);
  const [state, setState] = useState<CachedState<T>>(initialState);
  const effectiveState = state.cacheKey === cacheKey ? state : initialState;

  const setCachedData = useCallback(
    (data: T): void => {
      const nextTags = tagsKey ? tagsKey.split('|') : [];
      writePageCache(cacheKey, data, nextTags);
      setState({
        cacheKey,
        data,
        error: null,
        hasCachedData: true,
        isLoading: false,
        isRefreshing: false
      });
    },
    [cacheKey, tagsKey]
  );

  const refresh = useCallback(async (): Promise<T | undefined> => {
    const cached = readPageCache<T>(cacheKey);
    if (cached) {
      setState({
        cacheKey,
        data: cached.data,
        error: null,
        hasCachedData: true,
        isLoading: false,
        isRefreshing: false
      });
      return cached.data;
    }

    return undefined;
  }, [cacheKey]);

  useEffect(() => {
    if (!enabled) {
      setState({
        cacheKey,
        data: null,
        error: null,
        hasCachedData: false,
        isLoading: false,
        isRefreshing: false
      });
      return undefined;
    }

    const cached = readPageCache<T>(cacheKey);
    setState((current) => ({
      cacheKey,
      data: cached?.data ?? (current.cacheKey === cacheKey ? current.data : null),
      error: null,
      hasCachedData: Boolean(cached) || (current.cacheKey === cacheKey && current.hasCachedData),
      isLoading: !cached && !(current.cacheKey === cacheKey && current.data),
      isRefreshing: Boolean(cached) && !isPageCacheFresh(cacheKey, staleTimeMs)
    }));

    let isActive = true;
    const unsubscribe = subscribe(
      (data) => {
        if (!isActive) return;
        setCachedData(data);
      },
      (error) => {
        if (!isActive) return;
        const nextError = toError(error);
        setState((current) => ({
          cacheKey,
          data: current.cacheKey === cacheKey ? current.data : cached?.data ?? null,
          error: nextError,
          hasCachedData: current.cacheKey === cacheKey ? current.hasCachedData : Boolean(cached),
          isLoading: false,
          isRefreshing: false
        }));
      }
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [cacheKey, enabled, setCachedData, staleTimeMs, subscribe]);

  return {
    ...effectiveState,
    refresh,
    setCachedData
  };
}

function getInitialState<T>(cacheKey: string, enabled: boolean): CachedState<T> {
  const cached = enabled ? readPageCache<T>(cacheKey) : undefined;

  return {
    cacheKey,
    data: cached?.data ?? null,
    error: null,
    hasCachedData: Boolean(cached),
    isLoading: enabled && !cached,
    isRefreshing: false
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Something went wrong. Please try again.');
}
