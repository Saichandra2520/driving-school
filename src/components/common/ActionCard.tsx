import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/cn';

type ActionCardProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  onClick: () => void;
};

export function ActionCard({ title, description, icon, onClick }: ActionCardProps): JSX.Element {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className={cn('h-full shadow-sm transition-colors hover:border-primary/40 hover:bg-blue-50/60')}>
        <CardContent className="flex h-full items-start gap-3 p-4">
          {icon ? <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">{icon}</div> : null}
          <div>
            <p className="font-semibold">{title}</p>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
