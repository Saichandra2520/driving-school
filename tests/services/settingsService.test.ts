import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeBranchNameKey, settingsService } from '@/services/settingsService';
import { collections, getCollection } from '@/services/firestoreUtils';

const { addDocMock, updateDocMock } = vi.hoisted(() => ({
  addDocMock: vi.fn(),
  updateDocMock: vi.fn()
}));

vi.mock('@/services/firebase', () => ({
  db: {}
}));

vi.mock('@/services/firebaseUsageService', () => ({
  firebaseUsageService: {
    trackUsage: vi.fn()
  }
}));

vi.mock('@/services/firestoreUtils', () => ({
  collections: {
    branches: 'branches',
    users: 'users',
    students: 'students',
    expenses: 'expenses'
  },
  createdAt: () => 'created-at',
  getCollection: vi.fn(),
  getDocument: vi.fn(),
  subscribeCollection: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  collection: (_db: unknown, collectionName: string) => ({ collectionName }),
  deleteDoc: vi.fn(),
  doc: (_db: unknown, collectionName: string, id: string) => ({ collectionName, id }),
  getCountFromServer: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  where: vi.fn()
}));

describe('settingsService branch names', () => {
  beforeEach(() => {
    vi.mocked(getCollection).mockReset();
    addDocMock.mockReset();
    updateDocMock.mockReset();
  });

  it('normalizes branch name keys', () => {
    expect(normalizeBranchNameKey('  Main   Branch  ')).toBe('main branch');
  });

  it('rejects duplicate branch names case-insensitively', async () => {
    vi.mocked(getCollection).mockResolvedValue([{ id: 'branch-1', name: 'Main Branch' }]);

    await expect(settingsService.createBranch({ name: ' main   branch ' })).rejects.toThrow('A branch with this name already exists.');
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('stores nameKey when creating and updating branches', async () => {
    vi.mocked(getCollection).mockResolvedValue([]);

    await settingsService.createBranch({ name: ' North   Branch ', location: ' Town ' });
    expect(addDocMock).toHaveBeenCalledWith(
      { collectionName: collections.branches },
      expect.objectContaining({ name: 'North Branch', nameKey: 'north branch', location: 'Town' })
    );

    await settingsService.updateBranch('branch-1', { name: ' South Branch ', location: '' });
    expect(updateDocMock).toHaveBeenCalledWith(
      { collectionName: collections.branches, id: 'branch-1' },
      expect.objectContaining({ name: 'South Branch', nameKey: 'south branch', location: null })
    );
  });
});
