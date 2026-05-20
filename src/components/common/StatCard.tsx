import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/cn';

type StatCardProps = {
  label: string;
  value: ReactNode;
  helper?: string;
  tone?: 'default' | 'good' | 'warning' | 'danger';
};

export function StatCard({ label, value, helper, tone = 'default' }: StatCardProps): JSX.Element {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full bg-primary',
              tone === 'good' && 'bg-success',
              tone === 'warning' && 'bg-warning',
              tone === 'danger' && 'bg-danger'
            )}
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <p className={cn('mt-2 text-2xl font-semibold tracking-tight text-main-text', tone === 'danger' && 'text-danger', tone === 'good' && 'text-success', tone === 'warning' && 'text-warning')}>{value}</p>
        {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
