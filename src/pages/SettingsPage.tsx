import { PageHeader } from '@/components/common/PageHeader';
import { Alert } from '@/components/ui/alert';
import { BranchManagement } from '@/components/settings/BranchManagement';
import { DataBackupExport } from '@/components/settings/DataBackupExport';
import { FirebaseUsageMetrics } from '@/components/settings/FirebaseUsageMetrics';
import { StaffManagement } from '@/components/settings/StaffManagement';
import { useAuthStore } from '@/store/authStore';

export function SettingsPage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);

  if (profile?.role !== 'owner') {
    return <Alert variant="destructive">Access denied. Owner only.</Alert>;
  }

  return (
    <section className="space-y-5">
      <PageHeader title="Settings" description="Manage branches, staff access, and backups." />
      <BranchManagement />
      <StaffManagement />
      <DataBackupExport />
      <FirebaseUsageMetrics />
    </section>
  );
}
