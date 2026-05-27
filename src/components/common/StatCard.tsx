import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/cn';

type StatCardProps = {
  label: string;
  value: ReactNode;
  helper?: string;
  icon?: ReactNode;
  tone?: 'default' | 'good' | 'warning' | 'danger';
};

export function StatCard({ label, value, helper, icon, tone = 'default' }: StatCardProps): JSX.Element {
  return (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-primary',
              tone === 'good' && 'border-green-200 bg-green-50 text-success',
              tone === 'warning' && 'border-amber-200 bg-amber-50 text-warning',
              tone === 'danger' && 'border-red-200 bg-red-50 text-danger'
            )}
            aria-hidden="true"
          >
            {icon ?? (
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full bg-primary',
                  tone === 'good' && 'bg-success',
                  tone === 'warning' && 'bg-warning',
                  tone === 'danger' && 'bg-danger'
                )}
              />
            )}
          </span>
        </div>
        <p className={cn('mt-2 text-2xl font-semibold tracking-tight text-main-text', tone === 'danger' && 'text-danger', tone === 'good' && 'text-success', tone === 'warning' && 'text-warning')}>{value}</p>
        {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
