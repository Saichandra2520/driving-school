import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ErrorStateProps = {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ErrorState({
  title = 'Unable to load data',
  description = 'Please check your connection and try again.',
  actionLabel,
  onAction
}: ErrorStateProps): JSX.Element {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center">
      <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <Button type="button" variant="outline" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
