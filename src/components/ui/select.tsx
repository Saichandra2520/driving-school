import * as React from 'react';
import { cn } from '@/utils/cn';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-10 w-full rounded-md border border-input bg-surface px-3 text-sm shadow-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export { Select };
