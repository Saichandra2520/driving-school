import { Button } from '@/components/ui/button';

type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center">
      <p className="text-base font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button type="button" variant="outline" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
