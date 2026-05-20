import * as React from 'react';
import { cn } from '@/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-20 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
