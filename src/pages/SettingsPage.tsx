import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BranchManagement } from '@/components/settings/BranchManagement';
import { DataBackupExport } from '@/components/settings/DataBackupExport';
import { StaffManagement } from '@/components/settings/StaffManagement';
import { useAuthStore } from '@/store/authStore';
import { seedDummyData } from '@/utils/seedData';

export function SettingsPage(): JSX.Element {
  const profile = useAuthStore((state) => state.profile);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');
  const [seedErrorMessage, setSeedErrorMessage] = useState('');

  if (profile?.role !== 'owner') {
    return <Alert variant="destructive">Access denied. Owner only.</Alert>;
  }

  const handleSeedData = async (): Promise<void> => {
    setIsSeeding(true);
    setSeedMessage('');
    setSeedErrorMessage('');

    try {
      await seedDummyData();
      setSeedMessage('Dummy data seeded successfully. Refresh Firebase Console to verify the new collections.');
    } catch (error) {
      setSeedErrorMessage(error instanceof Error ? error.message : 'Unable to seed dummy data.');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader title="Settings" description="Manage branches, staff access, class setup, and backups." />
      {import.meta.env.DEV ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Development Data</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Seed branches, users, students, fees, classes, sessions, tests, expenses, and counters.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {seedMessage ? <Alert variant="success">{seedMessage}</Alert> : null}
            {seedErrorMessage ? <Alert variant="destructive">{seedErrorMessage}</Alert> : null}
            <Button type="button" onClick={() => void handleSeedData()} disabled={isSeeding}>
              {isSeeding ? 'Seeding data...' : 'Seed Dummy Data'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <BranchManagement />
      <StaffManagement />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Class Type Management</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">These class types appear in attendance and training cards.</p>
        </CardHeader>
        <CardContent>
          <Alert>Class types are managed per branch and course from the training card setup already used by attendance.</Alert>
        </CardContent>
      </Card>
      <DataBackupExport />
    </section>
  );
}
