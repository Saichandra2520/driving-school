import { Button } from '@/components/ui/button';

type ErrorFallbackProps = {
  message?: string;
  onRetry?: () => void;
};

export function ErrorFallback({
  message = 'Something went wrong. Please try again.',
  onRetry
}: ErrorFallbackProps): JSX.Element {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-red-200 bg-red-50 p-6 text-center">
      <p className="text-sm font-medium text-danger">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
