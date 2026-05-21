import { Alert } from '@/components/ui/alert';
import { useSyncStore } from '@/store/syncStore';

export function CachedDataNotice(): JSX.Element | null {
  const isOnline = useSyncStore((state) => state.isOnline);
  const isFromCache = useSyncStore((state) => state.isFromCache);
  const hasPendingWrites = useSyncStore((state) => state.hasPendingWrites);

  if (hasPendingWrites) {
    return <Alert variant="warning" className="mb-4">Some changes are saved locally and will sync when Firebase confirms them.</Alert>;
  }

  if (!isOnline) {
    return <Alert variant="warning" className="mb-4">You are offline. Showing locally cached data where available.</Alert>;
  }

  if (isFromCache) {
    return <Alert className="mb-4">Showing cached data while the latest Firebase data loads.</Alert>;
  }

  return null;
}
