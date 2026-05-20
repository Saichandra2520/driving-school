import * as React from 'react';
import { cn } from '@/utils/cn';

type TabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
};

function Tabs({ children }: TabsProps): JSX.Element {
  return <div className="space-y-4">{children}</div>;
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn('inline-flex h-10 items-center rounded-md bg-background p-1 text-muted-text', className)}
      {...props}
    />
  );
}

type TabsTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
  activeValue: string;
  onValueChange: (value: string) => void;
};

function TabsTrigger({
  className,
  value,
  activeValue,
  onValueChange,
  children,
  ...props
}: TabsTriggerProps): JSX.Element {
  const isActive = value === activeValue;

  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 items-center justify-center rounded px-3 text-sm font-medium transition-colors',
        isActive ? 'bg-surface text-main-text shadow-sm' : 'hover:text-main-text',
        className
      )}
      onClick={() => onValueChange(value)}
      {...props}
    >
      {children}
    </button>
  );
}

function TabsContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('space-y-4', className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
