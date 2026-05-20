import * as React from 'react';
import { cn } from '@/utils/cn';

function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>): JSX.Element {
  return <table className={cn('w-full caption-bottom text-sm', className)} {...props} />;
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <thead className={cn('bg-background [&_tr]:border-b', className)} {...props} />;
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>): JSX.Element {
  return <tr className={cn('border-b border-border transition-colors hover:bg-blue-50/60', className)} {...props} />;
}

function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <th
      className={cn('h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-text', className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return <td className={cn('px-3 py-3 align-middle', className)} {...props} />;
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
