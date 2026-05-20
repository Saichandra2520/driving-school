import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

function Dialog({ open, onOpenChange, children }: DialogProps): JSX.Element | null {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/45" onClick={() => onOpenChange(false)} aria-hidden="true" />
      {children}
    </div>
  );
}

function DialogContent({
  className,
  children,
  onClose
}: {
  className?: string;
  children: React.ReactNode;
  onClose?: () => void;
}): JSX.Element {
  return (
    <div
      className={cn(
        'relative z-10 max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-white p-6 text-foreground shadow-xl',
        className
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {onClose ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
      {children}
    </div>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('mb-5 space-y-1', className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>): JSX.Element {
  return <h2 className={cn('text-lg font-semibold tracking-tight', className)} {...props} />;
}

function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): JSX.Element {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription };
