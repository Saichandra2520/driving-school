import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/cn';

type FilterBarProps = {
  children: ReactNode;
  className?: string;
};

export function FilterBar({ children, className }: FilterBarProps): JSX.Element {
  return (
    <Card className="shadow-sm">
      <CardContent className={cn('grid gap-3 p-4', className)}>{children}</CardContent>
    </Card>
  );
}
