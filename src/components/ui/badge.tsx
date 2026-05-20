import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-surface text-main-text',
        outline: 'text-foreground',
        success: 'border-green-200 bg-green-50 text-success',
        warning: 'border-amber-200 bg-amber-50 text-warning',
        danger: 'border-red-200 bg-red-50 text-danger',
        info: 'border-blue-200 bg-blue-50 text-primary',
        slate: 'border-border bg-background text-muted-text',
        purple: 'border-slate-300 bg-slate-100 text-slate-700',
        indigo: 'border-blue-200 bg-blue-50 text-primaryDark',
        orange: 'border-orange-200 bg-orange-50 text-orange-700',
        yellow: 'border-amber-200 bg-amber-50 text-warning',
        muted: 'border-border bg-background text-muted-text'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
