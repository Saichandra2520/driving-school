import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { BarChart3, ClipboardCheck, CreditCard, LayoutDashboard, LogOut, ReceiptText, Settings, UserCircle, Users } from 'lucide-react';
import { CachedDataNotice } from '@/components/common/CachedDataNotice';
import { MaryLogo } from '@/components/common/MaryLogo';
import { SyncStatusBadge } from '@/components/common/SyncStatusBadge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { feeService } from '@/services/feeService';
import { settingsService } from '@/services/settingsService';
import { useAlertStore } from '@/store/alertStore';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import { useSyncStore } from '@/store/syncStore';
import type { Branch } from '@/types';
import { cn } from '@/utils/cn';
import { getFriendlyErrorMessage } from '@/utils/errors';

const ownerNavItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/attendance', label: 'Attendance', icon: ClipboardCheck },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/expenses', label: 'Expenses', icon: ReceiptText },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/account', label: 'Account', icon: UserCircle }
];

const staffNavItems = ownerNavItems.filter(
  (item) => item.label !== 'Reports' && item.label !== 'Settings'
);

export function MainLayout(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const signOut = useAuthStore((state) => state.signOut);
  const branchId = useAppStore((state) => state.branchId);
  const setBranchId = useAppStore((state) => state.setBranchId);
  const clearAlerts = useAlertStore((state) => state.clearAlerts);
  const isOnline = useSyncStore((state) => state.isOnline);
  const setOnlineStatus = useSyncStore((state) => state.setOnlineStatus);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchLoadError, setBranchLoadError] = useState('');

  const isOwner = profile?.role === 'owner';
  const navItems = isOwner ? ownerNavItems : staffNavItems;

  useEffect(() => {
    setOnlineStatus(navigator.onLine);

    const handleOnline = (): void => setOnlineStatus(true);
    const handleOffline = (): void => setOnlineStatus(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnlineStatus]);

  useEffect(() => {
    if (!isOnline) return;
    const syncBranchId = profile?.role === 'staff' ? profile.branchId : branchId;
    if (profile?.role === 'staff' && !syncBranchId) return;

    void feeService.syncPendingPayments({ branchId: syncBranchId }).catch((error) => {
      console.error('Failed to sync pending payments:', error);
    });
  }, [branchId, isOnline, profile?.branchId, profile?.role]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    if (profile.role === 'staff') {
      setBranchId(profile.branchId);
    } else {
      setBranchId(null);
    }
  }, [profile, setBranchId]);

  useEffect(() => {
    if (!profile) {
      setBranches([]);
      setBranchLoadError('');
      return;
    }

    if (profile.role === 'staff') {
      if (!profile.branchId) {
        setBranches([]);
        setBranchLoadError('');
        return;
      }

      let isActive = true;
      void settingsService.getBranchById(profile.branchId)
        .then((branch) => {
          if (!isActive) return;
          setBranches(branch ? [branch] : []);
          setBranchLoadError(branch ? '' : `Assigned branch was not found in Firebase for ID: ${profile.branchId}`);
        })
        .catch((error) => {
          console.error(`Failed to load branch ${profile.branchId}:`, error);
          if (!isActive) return;
          setBranches([]);
          setBranchLoadError(getFriendlyErrorMessage(error, 'Could not load your assigned branch from Firebase.'));
        });

      return () => {
        isActive = false;
      };
    }

    const unsubscribe = settingsService.subscribeBranches(
      (data) => {
        setBranches([...data].sort((a, b) => a.name.localeCompare(b.name)));
        setBranchLoadError('');
      },
      (error) => {
        console.error('Failed to load branches:', error);
        setBranches([]);
        setBranchLoadError(getFriendlyErrorMessage(error, 'Could not load branches from Firebase.'));
      }
    );

    return unsubscribe;
  }, [profile?.branchId, profile?.role]);

  const branchName = useMemo(() => {
    if (isOwner && !branchId) {
      return 'All Branches';
    }

    if (!branchId) {
      return 'Branch not assigned';
    }

    return branches.find((branch) => branch.id === branchId)?.name ?? (profile?.role === 'staff' ? 'Assigned Branch' : 'Selected Branch');
  }, [branchId, branches, isOwner, profile?.role]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-72 shrink-0 flex-col border-r border-[#1E293B] bg-[#0F172A]">
        <div className="border-b border-[#1E293B] px-5 py-5">
          <div className="flex items-center gap-3">
            <MaryLogo compact className="h-14 w-16 rounded-md bg-white p-1" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-white">Mary Driving School</p>
              <p className="text-xs text-[#CBD5E1]">Daily branch administration</p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.06] p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-sm font-semibold text-white">
                {(profile?.fullName || profile?.role || 'U').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{profile?.fullName || 'Signed in'}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-[#CBD5E1]">
                    {profile?.role === 'owner' ? 'Owner' : 'Staff'}
                  </span>
                  <span className="truncate text-xs text-[#94A3B8]">{profile?.role === 'staff' ? branchName : 'All branches'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-[#CBD5E1] transition-colors hover:bg-white/10 hover:text-white',
                    isActive && 'bg-[#2563EB] text-white shadow-sm hover:bg-[#2563EB] hover:text-white'
                  )
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="ml-72 flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-surface/95 px-6 backdrop-blur">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Showing: {branchName}</p>
            <p className="truncate text-xs text-muted-foreground">Use the sidebar for daily work: students, attendance, payments, and expenses.</p>
          </div>

          <div className="flex items-center gap-3">
            <SyncStatusBadge />
            {isOwner ? (
              <select
                className="h-9 rounded-md border border-input bg-surface px-3 text-sm shadow-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                value={branchId ?? 'all'}
                onChange={(event) =>
                  setBranchId(event.target.value === 'all' ? null : event.target.value)
                }
              >
                <option value="all">All Branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button variant="outline" asChild>
              <Link to="/account">
                <UserCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                Account
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                clearAlerts();
                void signOut();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Logout
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">
          {branchLoadError ? <Alert variant="destructive" className="mb-4">{branchLoadError}</Alert> : null}
          <CachedDataNotice />
          <Outlet />
        </main>
      </div>

    </div>
  );
}
