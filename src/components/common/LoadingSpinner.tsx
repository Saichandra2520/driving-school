import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export function LoadingSpinner({ className }: { className?: string }): JSX.Element {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} aria-hidden="true" />;
}
