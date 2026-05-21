import { FormEvent, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageLoader } from '@/components/common/PageLoader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { settingsService } from '@/services/settingsService';
import { staffAccountService } from '@/services/staffAccountService';
import type { Branch, StaffAccount } from '@/types';
import { formatDateTime } from '@/components/settings/settingsUtils';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { formatPhoneNumber } from '@/utils/formatters';

type StaffModalState =
  | { mode: 'add' }
  | { mode: 'edit'; staff: StaffAccount }
  | { mode: 'reset'; staff: StaffAccount }
  | null;

export function StaffManagement(): JSX.Element {
  const [staffProfiles, setStaffProfiles] = useState<StaffAccount[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [modalState, setModalState] = useState<StaffModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const [staff, branchList] = await Promise.all([
        staffAccountService.getStaffProfiles(),
        settingsService.getBranches()
      ]);
      setStaffProfiles(staff);
      setBranches(branchList);
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Could not load staff users.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSaved = async (successMessage: string): Promise<void> => {
    setModalState(null);
    setMessage(successMessage);
    await loadData();
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;

    setErrorMessage('');
    setMessage('');

    try {
      await staffAccountService.deleteStaffProfile(deleteTarget.id);
      setDeleteTarget(null);
      setMessage('Staff profile deleted successfully. Firebase Auth login was not deleted.');
      await loadData();
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Could not delete staff profile.'));
      setDeleteTarget(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Staff Management</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Create staff login for branch users.</p>
        </div>
        <Button type="button" onClick={() => setModalState({ mode: 'add' })}>
          Create Staff Account
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>Give the staff member their email and temporary password after creating the account.</Alert>
        {message ? <Alert variant="success">{message}</Alert> : null}
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

        {isLoading ? (
          <PageLoader label="Loading staff users..." />
        ) : staffProfiles.length === 0 ? (
          <EmptyState title="No staff users found." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Name</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[240px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffProfiles.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell className="font-medium">{staff.fullName}</TableCell>
                    <TableCell>{formatPhoneNumber(staff.phone)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">staff</Badge>
                    </TableCell>
                    <TableCell>{staff.branch?.name ?? '-'}</TableCell>
                    <TableCell>{formatDateTime(staff.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setModalState({ mode: 'edit', staff })}>
                          Edit
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setModalState({ mode: 'reset', staff })}>
                          Reset Password
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(staff)}>
                          Delete profile
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
          {modalState?.mode === 'add' ? (
            <DialogContent onClose={() => setModalState(null)}>
              <DialogHeader>
                <DialogTitle>Create Staff Account</DialogTitle>
                <DialogDescription>Create a staff login and assign it to a branch.</DialogDescription>
              </DialogHeader>
              <CreateStaffForm
                branches={branches}
                onCancel={() => setModalState(null)}
                onSaved={(successMessage) => void handleSaved(successMessage)}
              />
            </DialogContent>
          ) : null}

          {modalState?.mode === 'edit' ? (
            <DialogContent onClose={() => setModalState(null)}>
              <DialogHeader>
                <DialogTitle>Edit Staff Profile</DialogTitle>
                <DialogDescription>Update the staff name or assigned branch.</DialogDescription>
              </DialogHeader>
              <EditStaffForm
                staff={modalState.staff}
                branches={branches}
                onCancel={() => setModalState(null)}
                onSaved={(successMessage) => void handleSaved(successMessage)}
              />
            </DialogContent>
          ) : null}

          {modalState?.mode === 'reset' ? (
            <DialogContent onClose={() => setModalState(null)} className="max-w-md">
              <DialogHeader>
                <DialogTitle>Reset Staff Password</DialogTitle>
                <DialogDescription>
                  Set a temporary password. Staff must change it after next login.
                </DialogDescription>
              </DialogHeader>
              <ResetPasswordForm
                staff={modalState.staff}
                onCancel={() => setModalState(null)}
                onSaved={(successMessage) => void handleSaved(successMessage)}
              />
            </DialogContent>
          ) : null}
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          title="Delete Staff Profile"
          description="This removes only the profile document. It does not delete the Firebase Auth login."
          confirmLabel="Delete profile"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
      </CardContent>
    </Card>
  );
}

function CreateStaffForm({
  branches,
  onCancel,
  onSaved
}: {
  branches: Branch[];
  onCancel: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fullNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (branches.length === 0) return;

    const hasSelectedBranch = branches.some((branch) => branch.id === branchId);
    if (!hasSelectedBranch) {
      setBranchId(branches[0].id);
    }
  }, [branchId, branches]);

  useEffect(() => {
    fullNameInputRef.current?.focus();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    if (!fullName.trim()) return setErrorMessage('Full name is required.');
    if (!phone.trim()) return setErrorMessage('Mobile number is required.');
    if (phone.replace(/\D/g, '').length < 10) return setErrorMessage('Mobile number must have at least 10 digits.');
    if (!email.trim()) return setErrorMessage('Email is required.');
    if (!password || password.length < 8) return setErrorMessage('Temporary password must be at least 8 characters.');
    if (!branchId) return setErrorMessage('Branch is required.');

    setIsSaving(true);

    try {
      await staffAccountService.createStaffUser({
        fullName,
        phone,
        email,
        password,
        branchId
      });
      onSaved('Staff account created successfully.');
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Could not create staff account.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="staff-name">Full Name</Label>
        <Input
          id="staff-name"
          ref={fullNameInputRef}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff-phone">Mobile Number</Label>
        <Input id="staff-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff-email">Email</Label>
        <Input id="staff-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="staff-password">Temporary Password</Label>
        <Input
          id="staff-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <BranchSelect branches={branches} branchId={branchId} onBranchChange={setBranchId} />
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
      <FormActions onCancel={onCancel} isSaving={isSaving || branches.length === 0} saveLabel="Create Staff Account" />
    </form>
  );
}

function EditStaffForm({
  staff,
  branches,
  onCancel,
  onSaved
}: {
  staff: StaffAccount;
  branches: Branch[];
  onCancel: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const [fullName, setFullName] = useState(staff.fullName ?? '');
  const [phone, setPhone] = useState(staff.phone ?? '');
  const [branchId, setBranchId] = useState(staff.branchId);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    if (!fullName.trim()) return setErrorMessage('Full name is required.');
    if (!phone.trim()) return setErrorMessage('Mobile number is required.');
    if (phone.replace(/\D/g, '').length < 10) return setErrorMessage('Mobile number must have at least 10 digits.');
    if (!branchId) return setErrorMessage('Branch is required.');

    setIsSaving(true);

    try {
      await staffAccountService.updateStaffProfile(staff.id, { fullName: fullName, phone: phone, branchId: branchId });
      onSaved('Staff profile saved successfully.');
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Could not save staff profile.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="edit-staff-name">Full Name</Label>
        <Input id="edit-staff-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-staff-phone">Mobile Number</Label>
        <Input id="edit-staff-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </div>
      <BranchSelect branches={branches} branchId={branchId} onBranchChange={setBranchId} />
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
      <FormActions onCancel={onCancel} isSaving={isSaving} saveLabel="Save" />
    </form>
  );
}

function ResetPasswordForm({
  staff,
  onCancel,
  onSaved
}: {
  staff: StaffAccount;
  onCancel: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage('');

    if (!password || password.length < 8) return setErrorMessage('New temporary password must be at least 8 characters.');

    setIsSaving(true);

    try {
      await staffAccountService.resetStaffPassword(staff.id, password);
      onSaved('Staff password reset successfully.');
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Could not reset staff password.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="reset-staff-password">New Temporary Password</Label>
        <Input
          id="reset-staff-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
      <FormActions onCancel={onCancel} isSaving={isSaving} saveLabel="Reset Password" />
    </form>
  );
}

function BranchSelect({
  branches,
  branchId,
  onBranchChange
}: {
  branches: Branch[];
  branchId: string;
  onBranchChange: (branchId: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor="staff-branch">Branch</Label>
      <Select
        id="staff-branch"
        value={branchId}
        onChange={(event) => onBranchChange(event.target.value)}
        disabled={branches.length === 0}
      >
        {branches.length === 0 ? <option value="">No branches available</option> : null}
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {formatBranchOption(branch)}
          </option>
        ))}
      </Select>
    </div>
  );
}

function formatBranchOption(branch: Branch): string {
  return branch.location ? `${branch.name} - ${branch.location}` : branch.name;
}

function FormActions({
  onCancel,
  isSaving,
  saveLabel
}: {
  onCancel: () => void;
  isSaving: boolean;
  saveLabel: string;
}): JSX.Element {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? 'Saving...' : saveLabel}
      </Button>
    </div>
  );
}
