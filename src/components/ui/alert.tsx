import * as React from 'react';
import { cn } from '@/utils/cn';

type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'destructive' | 'success' | 'warning';
  autoDismiss?: boolean;
  autoDismissMs?: number;
};

function Alert({
  autoDismiss,
  autoDismissMs = 4000,
  children,
  className,
  variant = 'default',
  ...props
}: AlertProps): JSX.Element | null {
  const [isVisible, setIsVisible] = React.useState(true);
  const shouldAutoDismiss = autoDismiss ?? (variant === 'success' || variant === 'destructive');

  React.useEffect(() => {
    setIsVisible(true);

    if (!shouldAutoDismiss) return;

    const timeoutId = window.setTimeout(() => setIsVisible(false), autoDismissMs);
    return () => window.clearTimeout(timeoutId);
  }, [autoDismissMs, children, shouldAutoDismiss, variant]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        variant === 'default' && 'border-blue-200 bg-blue-50 text-primaryDark',
        variant === 'destructive' && 'border-red-200 bg-red-50 text-danger',
        variant === 'success' && 'border-green-200 bg-green-50 text-success',
        variant === 'warning' && 'border-amber-200 bg-amber-50 text-warning',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Alert };
