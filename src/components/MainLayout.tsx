import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Bell, ClipboardCheck, CreditCard, LayoutDashboard, LogOut, ReceiptText, Settings, UserCircle, Users } from 'lucide-react';
import { AlertPanel } from '@/components/alerts/AlertPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { settingsService } from '@/services/settingsService';
import { useAlertStore } from '@/store/alertStore';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import type { AlertFilters, Branch } from '@/types';
import { cn } from '@/utils/cn';

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
  const alerts = useAlertStore((state) => state.alerts);
  const isAlertsLoading = useAlertStore((state) => state.isLoading);
  const alertErrorMessage = useAlertStore((state) => state.errorMessage);
  const hasShownLoginPopup = useAlertStore((state) => state.hasShownLoginPopup);
  const fetchAlerts = useAlertStore((state) => state.fetchAlerts);
  const setHasShownLoginPopup = useAlertStore((state) => state.setHasShownLoginPopup);
  const clearAlerts = useAlertStore((state) => state.clearAlerts);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [importantDialogOpen, setImportantDialogOpen] = useState(false);
  const location = useLocation();

  const isOwner = profile?.role === 'owner';
  const navItems = isOwner ? ownerNavItems : staffNavItems;
  const alertFilters = useMemo<AlertFilters | null>(() => {
    if (!profile) return null;

    return {
      role: profile.role,
      userBranchId: profile.branchId ?? undefined,
      branchId: profile.role === 'owner' ? branchId ?? 'all' : profile.branchId ?? undefined
    };
  }, [branchId, profile]);
  const urgentAlerts = alerts.filter((alert) => alert.severity === 'danger');

  const loadBranches = useCallback(async (): Promise<void> => {
    try {
      if (profile?.role === 'staff') {
        if (!profile.branchId) {
          setBranches([]);
          return;
        }

        const branch = await settingsService.getBranchById(profile.branchId);
        setBranches(branch ? [branch] : []);
        return;
      }

      const data = await settingsService.getBranches();
      setBranches([...data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  }, [profile]);

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
    void loadBranches();
    window.addEventListener('branches-changed', loadBranches);

    return () => {
      window.removeEventListener('branches-changed', loadBranches);
    };
  }, [loadBranches]);

  useEffect(() => {
    if (alertFilters) {
      void fetchAlerts(alertFilters);
    }
  }, [alertFilters, fetchAlerts, location.pathname]);

  useEffect(() => {
    if (!hasShownLoginPopup && urgentAlerts.length > 0) {
      setImportantDialogOpen(true);
    }
  }, [hasShownLoginPopup, urgentAlerts.length]);

  const branchName = useMemo(() => {
    if (isOwner && !branchId) {
      return 'All Branches';
    }

    if (!branchId) {
      return 'Branch not assigned';
    }

    return branches.find((branch) => branch.id === branchId)?.name ?? branchId;
  }, [branchId, branches, isOwner]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-72 shrink-0 flex-col border-r border-[#1E293B] bg-[#0F172A]">
        <div className="border-b border-[#1E293B] px-5 py-5">
          <p className="text-base font-semibold text-white">Driving School Manager</p>
          <p className="text-xs text-[#CBD5E1]">Daily branch administration</p>
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
        <div className="border-t border-[#1E293B] p-3">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-[#CBD5E1] hover:bg-white/10 hover:text-white"
            onClick={() => {
              clearAlerts();
              void signOut();
            }}
          >
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Logout
          </Button>
        </div>
      </aside>

      <div className="ml-72 flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-surface/95 px-6 backdrop-blur">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Showing: {branchName}</p>
            <p className="truncate text-xs text-muted-foreground">Use the sidebar for daily work: students, attendance, payments, and expenses.</p>
          </div>

          <div className="flex items-center gap-3">
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
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setAlertsOpen((open) => !open)}
                aria-label="Open alerts"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {alerts.length > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">
                    {alerts.length}
                  </span>
                ) : null}
              </Button>
              {alertsOpen ? (
                <div className="absolute right-0 top-11 z-40 w-[420px] max-w-[calc(100vw-2rem)] rounded-md border bg-surface p-4 shadow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Alerts</p>
                      <p className="text-xs text-muted-foreground">{alerts.length} active</p>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAlertsOpen(false)}>
                      Close
                    </Button>
                  </div>
                  <div className="max-h-[70vh] overflow-y-auto pr-1">
                    <AlertPanel
                      alerts={alerts}
                      isLoading={isAlertsLoading}
                      errorMessage={alertErrorMessage}
                      filters={alertFilters}
                      onClose={() => setAlertsOpen(false)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <Button variant="outline" asChild>
              <Link to="/account">
                <UserCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                Account
              </Link>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>

      <Dialog
        open={importantDialogOpen}
        onOpenChange={(open) => {
          setImportantDialogOpen(open);
          if (!open) setHasShownLoginPopup(true);
        }}
      >
        <DialogContent onClose={() => {
          setImportantDialogOpen(false);
          setHasShownLoginPopup(true);
        }}>
          <DialogHeader>
            <DialogTitle>Important Alerts</DialogTitle>
            <DialogDescription>Urgent reminders that may need attention today.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {urgentAlerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="rounded-md border p-3">
                <p className="text-sm font-medium">{alert.studentName}</p>
                <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{alert.branchName ?? alert.branchId}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setImportantDialogOpen(false);
                setHasShownLoginPopup(true);
              }}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                setImportantDialogOpen(false);
                setHasShownLoginPopup(true);
                setAlertsOpen(true);
              }}
            >
              View All Alerts
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
