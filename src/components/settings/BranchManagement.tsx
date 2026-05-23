import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageLoader } from '@/components/common/PageLoader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCachedAsync } from '@/hooks/useCachedData';
import { settingsService } from '@/services/settingsService';
import { cacheTags, createPageCacheKey, invalidatePageCache } from '@/store/pageCacheStore';
import type { Branch } from '@/types';
import { formatDateTime, notifyBranchesChanged } from '@/components/settings/settingsUtils';

type BranchModalState = { mode: 'add' } | { mode: 'edit'; branch: Branch } | null;

export function BranchManagement(): JSX.Element {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [modalState, setModalState] = useState<BranchModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const fetchBranches = useCallback(() => settingsService.getBranches(), []);
  const {
    data: cachedBranches,
    error: branchesError,
    isLoading,
    isRefreshing,
    refresh: refreshBranches
  } = useCachedAsync<Branch[]>({
    cacheKey: createPageCacheKey('settings-branches'),
    fetcher: fetchBranches,
    tags: [cacheTags.settings, cacheTags.branches]
  });

  const loadBranches = useCallback(async (force = false): Promise<void> => {
    setErrorMessage('');
    await refreshBranches({ force });
  }, [refreshBranches]);

  useEffect(() => {
    setBranches(cachedBranches ?? []);
  }, [cachedBranches]);

  useEffect(() => {
    if (!branchesError) return;
    setErrorMessage(branchesError.message || 'Could not load branches.');
  }, [branchesError]);

  const handleSaved = async (successMessage: string): Promise<void> => {
    setModalState(null);
    setMessage(successMessage);
    notifyBranchesChanged();
    invalidatePageCache([
      cacheTags.settings,
      cacheTags.branches,
      cacheTags.dashboard,
      cacheTags.reports
    ]);
    await loadBranches(true);
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;

    setErrorMessage('');
    setMessage('');

    try {
      await settingsService.deleteBranch(deleteTarget.id);
      setDeleteTarget(null);
      setMessage('Branch deleted successfully.');
      notifyBranchesChanged();
      invalidatePageCache([
        cacheTags.settings,
        cacheTags.branches,
        cacheTags.dashboard,
        cacheTags.reports
      ]);
      await loadBranches(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete branch.');
      setDeleteTarget(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Branch Management</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Add and maintain driving school branches.</p>
        </div>
        <Button type="button" onClick={() => setModalState({ mode: 'add' })}>
          Add Branch
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <Alert variant="success">{message}</Alert> : null}
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

        {isLoading ? (
          <PageLoader label="Loading branches..." />
        ) : branches.length === 0 ? (
          <EmptyState title="No branches found. Add your first branch." />
        ) : (
          <div className={`overflow-x-auto rounded-md border ${isRefreshing ? 'opacity-60' : ''}`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium">{branch.name}</TableCell>
                    <TableCell>{branch.location || '-'}</TableCell>
                    <TableCell>{formatDateTime(branch.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setModalState({ mode: 'edit', branch })}>
                          Edit
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(branch)}>
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={modalState !== null} onOpenChange={(open) => !open && setModalState(null)}>
          {modalState ? (
            <DialogContent onClose={() => setModalState(null)}>
              <DialogHeader>
                <DialogTitle>{modalState.mode === 'add' ? 'Add Branch' : 'Edit Branch'}</DialogTitle>
                <DialogDescription>Branch name is required. Location is optional.</DialogDescription>
              </DialogHeader>
              <BranchForm
                branch={modalState.mode === 'edit' ? modalState.branch : null}
                onCancel={() => setModalState(null)}
                onSaved={(successMessage) => void handleSaved(successMessage)}
              />
            </DialogContent>
          ) : null}
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          title="Delete Branch"
          description="This will only work if the branch has no staff, students, or expenses."
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
      </CardContent>
    </Card>
  );
}

function BranchForm({
  branch,
  onCancel,
  onSaved
}: {
  branch: Branch | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const [name, setName] = useState(branch?.name ?? '');
  const [location, setLocation] = useState(branch?.location ?? '');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    if (!name.trim()) {
      setErrorMessage('Branch name is required.');
      return;
    }

    setIsSaving(true);

    try {
      if (branch) {
        await settingsService.updateBranch(branch.id, { name, location });
        onSaved('Branch updated successfully.');
      } else {
        await settingsService.createBranch({ name, location });
        onSaved('Branch added successfully.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save branch.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="branch-name">Name</Label>
        <Input id="branch-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="branch-location">Location</Label>
        <Input id="branch-location" value={location ?? ''} onChange={(event) => setLocation(event.target.value)} />
      </div>
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
