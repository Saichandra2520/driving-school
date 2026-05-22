import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { firebaseUsageService } from '@/services/firebaseUsageService';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';
import type { FirebaseUsageMetric, FirebaseUsageMetricKey, FirebaseUsageMetrics } from '@/types';

const metricLabels: Record<FirebaseUsageMetricKey, string> = {
  reads: 'Reads',
  writes: 'Writes',
  deletes: 'Deletes'
};

const metricOrder: FirebaseUsageMetricKey[] = ['reads', 'writes', 'deletes'];

export function FirebaseUsageMetrics(): JSX.Element | null {
  const profile = useAuthStore((state) => state.profile);
  const [usage, setUsage] = useState<FirebaseUsageMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadUsage = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      await firebaseUsageService.flushPendingUsage();
      setUsage(await firebaseUsageService.getUsageMetrics());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load Firebase usage metrics.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.role === 'owner') void loadUsage();
  }, [loadUsage, profile?.role]);

  useEffect(() => {
    if (profile?.role !== 'owner') return undefined;

    return firebaseUsageService.subscribe(() => {
      void loadUsage();
    });
  }, [loadUsage, profile?.role]);

  useEffect(() => {
    const flush = (): void => {
      void firebaseUsageService.flushPendingUsage();
    };

    window.addEventListener('beforeunload', flush);
    window.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('visibilitychange', flush);
    };
  }, []);

  if (profile?.role !== 'owner') {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Firebase Usage</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Approximate Firestore reads, writes, and deletes from all signed-in app users today.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadUsage()} disabled={isLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
        <Alert variant="default">
          Free-plan estimate only. Staff and owner apps sync batched counters here, so Firebase Console usage can still differ.
        </Alert>

        <div className="grid gap-3 md:grid-cols-3">
          {metricOrder.map((key) => (
            <UsageCard key={key} label={metricLabels[key]} metric={usage?.metrics[key] ?? null} isLoading={isLoading} />
          ))}
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Quota window: {usage ? `${formatDateTime(usage.quotaDayStart)} to ${formatDateTime(usage.quotaDayEnd)}` : '-'}</span>
          <span>Last refreshed: {usage ? formatDateTime(usage.generatedAt) : '-'}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageCard({
  label,
  metric,
  isLoading
}: {
  label: string;
  metric: FirebaseUsageMetric | null;
  isLoading: boolean;
}): JSX.Element {
  const percentUsed = metric?.percentUsed ?? 0;
  const statusClass = percentUsed >= 95 ? 'bg-danger' : percentUsed >= 80 ? 'bg-warning' : 'bg-success';

  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className={cn('text-xs font-medium', percentUsed >= 95 && 'text-danger', percentUsed >= 80 && percentUsed < 95 && 'text-warning')}>
          {isLoading && !metric ? 'Loading' : `${percentUsed}%`}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-main-text">
        {metric ? formatNumber(metric.used) : '-'}
        <span className="ml-1 text-sm font-normal text-muted-foreground">/ {metric ? formatNumber(metric.limit) : '-'}</span>
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', statusClass)}
          style={{ width: `${Math.min(100, percentUsed)}%` }}
        />
      </div>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}
