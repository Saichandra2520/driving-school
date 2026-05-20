import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { backupService } from '@/services/backupService';
import { exportService } from '@/services/exportService';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/authStore';
import type { BackupScope } from '@/types';

type ExportKind = 'backup' | 'students' | 'expenses' | 'staff';

const today = new Date().toISOString().slice(0, 10);

export function DataBackupExport(): JSX.Element | null {
  const profile = useAuthStore((state) => state.profile);
  const branchId = useAppStore((state) => state.branchId);
  const [activeExport, setActiveExport] = useState<ExportKind | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (profile?.role !== 'owner') {
    return null;
  }

  const scope: BackupScope = { branchId: branchId ?? 'all' };

  const runExport = async (kind: ExportKind): Promise<void> => {
    setActiveExport(kind);
    setMessage('');
    setErrorMessage('');

    try {
      if (kind === 'backup') {
        const data = await backupService.getFullBackupData(scope);
        backupService.downloadJsonFile(data, `driving-school-backup-${today}.json`);
        setMessage('Backup downloaded successfully.');
        return;
      }

      const exported =
        kind === 'students'
          ? await exportService.exportStudentsCsv(scope)
          : kind === 'expenses'
            ? await exportService.exportExpensesCsv(scope)
            : await exportService.exportStaffCsv(scope);

      setMessage(exported ? 'CSV exported successfully.' : 'No data available to export.');
    } catch {
      setErrorMessage(kind === 'backup' ? 'Unable to download backup.' : 'Unable to export CSV.');
    } finally {
      setActiveExport(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Data Backup & Export</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Download backup regularly and store it safely.
            </p>
          </div>
          <Badge variant="secondary">{branchId ? 'Selected Branch' : 'All Branches'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <Alert variant={message.startsWith('No data') ? 'warning' : 'success'}>{message}</Alert> : null}
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ExportCard
            title="Full Backup JSON"
            description="All owner-accessible records for the selected branch scope."
            buttonText={activeExport === 'backup' ? 'Preparing backup...' : 'Download Full Backup JSON'}
            disabled={activeExport !== null}
            onClick={() => void runExport('backup')}
          />
          <ExportCard
            title="All Students CSV"
            description="Excel-friendly student list with fee balances."
            buttonText={activeExport === 'students' ? 'Preparing export...' : 'Export All Students CSV'}
            disabled={activeExport !== null}
            onClick={() => void runExport('students')}
          />
          <ExportCard
            title="All Expenses CSV"
            description="Expense register with branch, staff, student, and notes."
            buttonText={activeExport === 'expenses' ? 'Preparing export...' : 'Export All Expenses CSV'}
            disabled={activeExport !== null}
            onClick={() => void runExport('expenses')}
          />
          <ExportCard
            title="Staff CSV"
            description="Staff list for the selected branch scope."
            buttonText={activeExport === 'staff' ? 'Preparing export...' : 'Export Staff CSV'}
            disabled={activeExport !== null}
            onClick={() => void runExport('staff')}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ExportCard({
  title,
  description,
  buttonText,
  disabled,
  onClick
}: {
  title: string;
  description: string;
  buttonText: string;
  disabled: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <div className="rounded-md border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 min-h-10 text-sm text-muted-foreground">{description}</p>
      <Button type="button" className="mt-4 w-full" variant="outline" onClick={onClick} disabled={disabled}>
        {buttonText}
      </Button>
    </div>
  );
}
