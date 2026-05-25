import { FormEvent, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authService } from '@/services/authService';
import { settingsService } from '@/services/settingsService';
import { useAuthStore } from '@/store/authStore';
import { cacheTags, invalidatePageCache } from '@/store/pageCacheStore';
import { getFriendlyErrorMessage } from '@/utils/errors';

export function AccountPage(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setUser = useAuthStore((state) => state.setUser);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const canChangePassword = profile?.role === 'owner';
  const [isEditingName, setIsEditingName] = useState(false);
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [branchName, setBranchName] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (!isEditingName) {
      setFullName(profile?.fullName ?? '');
    }
  }, [isEditingName, profile?.fullName]);

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

  const handleNameSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');

    const nextName = fullName.trim();

    if (!user || !profile) return setErrorMessage('Unable to load your profile.');
    if (!nextName) return setErrorMessage('Name is required.');

    if (nextName === (profile.fullName ?? '').trim()) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);

    try {
      await authService.updateProfileName(nextName);
      setUser(user, { ...profile, fullName: nextName });
      invalidatePageCache([cacheTags.staff, cacheTags.settings, cacheTags.expenses, cacheTags.reports, cacheTags.user(profile.id)]);
      setIsEditingName(false);
      setMessage('Name updated successfully.');
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, 'Could not update name.'));
    } finally {
      setIsSavingName(false);
    }
  };

  const handleNameCancel = (): void => {
    setFullName(profile?.fullName ?? '');
    setIsEditingName(false);
    setErrorMessage('');
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');

    if (!currentPassword) return setErrorMessage('Current password is required.');
    if (!newPassword || newPassword.length < 8) return setErrorMessage('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setErrorMessage('Confirm password must match.');

    setIsSavingPassword(true);

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
      setIsSavingPassword(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-5">
      <PageHeader title="Account" description={user?.email ?? 'Manage your profile.'} />

      {message ? <Alert variant="success">{message}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">My Profile</CardTitle>
          {!isEditingName ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFullName(profile?.fullName ?? '');
                setMessage('');
                setErrorMessage('');
                setIsEditingName(true);
              }}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Edit Name
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {isEditingName ? (
            <form className="space-y-3 sm:col-span-2" onSubmit={handleNameSubmit}>
              <div className="space-y-2">
                <Label htmlFor="account-name">Name</Label>
                <Input
                  id="account-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleNameCancel} disabled={isSavingName}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSavingName}>
                  {isSavingName ? 'Saving...' : 'Save Name'}
                </Button>
              </div>
            </form>
          ) : (
            <Info label="Name" value={profile?.fullName || '-'} />
          )}
          <Info label="Role" value={profile?.role === 'owner' ? 'Owner' : 'Staff'} />
          <Info label="Email" value={user?.email ?? '-'} />
          <Info
            label="Assigned Branch"
            value={profile?.role === 'owner' ? 'All Branches' : branchName || profile?.branchId || 'Not assigned'}
          />
        </CardContent>
      </Card>

      {canChangePassword ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handlePasswordSubmit}>
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
                <Button type="submit" disabled={isSavingPassword}>
                  {isSavingPassword ? 'Saving...' : 'Change Password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
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
