import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
