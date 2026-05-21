import { create } from 'zustand';

type SyncState = {
  isOnline: boolean;
  lastOnlineAt: string | null;
  lastOfflineAt: string | null;
  isFromCache: boolean;
  hasPendingWrites: boolean;
  setOnlineStatus: (isOnline: boolean) => void;
  setFirestoreMetadata: (metadata: { fromCache?: boolean; hasPendingWrites?: boolean }) => void;
};

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastOnlineAt: typeof navigator === 'undefined' || navigator.onLine ? new Date().toISOString() : null,
  lastOfflineAt: typeof navigator !== 'undefined' && !navigator.onLine ? new Date().toISOString() : null,
  isFromCache: false,
  hasPendingWrites: false,
  setOnlineStatus: (isOnline) =>
    set((current) => ({
      isOnline,
      lastOnlineAt: isOnline ? new Date().toISOString() : current.lastOnlineAt,
      lastOfflineAt: isOnline ? current.lastOfflineAt : new Date().toISOString()
    })),
  setFirestoreMetadata: (metadata) =>
    set((current) => ({
      isFromCache: metadata.fromCache ?? current.isFromCache,
      hasPendingWrites: metadata.hasPendingWrites ?? current.hasPendingWrites
    }))
}));
