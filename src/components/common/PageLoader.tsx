import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export function PageLoader({ label = 'Loading...' }: { label?: string }): JSX.Element {
  return (
    <div className="flex min-h-48 items-center justify-center gap-3 rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
      <LoadingSpinner />
      <span>{label}</span>
    </div>
  );
}
