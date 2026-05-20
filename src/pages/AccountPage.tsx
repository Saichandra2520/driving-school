import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authService } from '@/services/authService';
import { settingsService } from '@/services/settingsService';
import { useAuthStore } from '@/store/authStore';
import { getFriendlyErrorMessage } from '@/utils/errors';

type AccountPageProps = {
  forceChange?: boolean;
};

export function AccountPage({ forceChange = false }: AccountPageProps): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [branchName, setBranchName] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAssignedBranch = async (): Promise<void> => {
      if (!profile?.branchId) {
        setBranchName('');
        return;
      }

      try {
        const branch = await settingsService.getBranchById(profile.branchId);
        if (isMounted) {
          setBranchName(branch?.name ?? '');
        }
      } catch {
        if (isMounted) {
          setBranchName('');
        }
      }
    };

    void loadAssignedBranch();

    return () => {
      isMounted = false;
    };
  }, [profile?.branchId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');

    if (!currentPassword) return setErrorMessage('Current password is required.');
    if (!newPassword || newPassword.length < 8) return setErrorMessage('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setErrorMessage('Confirm password must match.');

    setIsSaving(true);

    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password changed successfully.');
      await restoreSession();
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Could not change password.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-5">
      <PageHeader title="Account" description={user?.email ?? 'Manage your profile and password.'} />

      {forceChange ? (
        <Alert variant="warning">Please change your temporary password before continuing.</Alert>
      ) : null}
      {message ? <Alert variant="success">{message}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info label="Name" value={profile?.fullName || '-'} />
          <Info label="Role" value={profile?.role === 'owner' ? 'Owner' : 'Staff'} />
          <Info label="Email" value={user?.email ?? '-'} />
          <Info
            label="Assigned Branch"
            value={profile?.role === 'owner' ? 'All Branches' : branchName || profile?.branchId || 'Not assigned'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Change Password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
