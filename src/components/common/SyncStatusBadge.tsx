import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSyncStore } from '@/store/syncStore';

export function SyncStatusBadge(): JSX.Element {
  const isOnline = useSyncStore((state) => state.isOnline);
  const isFromCache = useSyncStore((state) => state.isFromCache);
  const hasPendingWrites = useSyncStore((state) => state.hasPendingWrites);

  if (!isOnline) {
    return (
      <Badge variant="warning" className="gap-1.5">
        <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
        Offline
      </Badge>
    );
  }

  if (hasPendingWrites) {
    return (
      <Badge variant="warning" className="gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Syncing
      </Badge>
    );
  }

  if (isFromCache) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
        Cached
      </Badge>
    );
  }

  return (
    <Badge variant="success" className="gap-1.5">
      <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
      Online
    </Badge>
  );
}
