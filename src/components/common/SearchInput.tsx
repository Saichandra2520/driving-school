import { Search } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/utils/cn';

export function SearchInput({ className, ...props }: InputProps): JSX.Element {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input className={cn('pl-9', className)} {...props} />
    </div>
  );
}
