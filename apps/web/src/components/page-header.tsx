import type { ReactNode } from 'react';

/**
 * The page's h1 and optional actions. On desktop the shell places the bell and the account
 * menu at the top right, level with this heading. Where they would overlap the content
 * column the header leaves room for them (`md:pr-28`); from 91rem (1456 px: the sidebar, the
 * 64rem column and the 80 px pair with its gaps) they sit beside the column, and the actions
 * line up with the content's right edge again. On a full-bleed page (the household map) the
 * column is the whole width, so the room stays, and the empty part of the row lets the
 * pointer through to what lies behind it.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4 md:pr-28 min-[91rem]:pr-0 group-has-[[data-bleed]]/main:pointer-events-none min-[91rem]:group-has-[[data-bleed]]/main:pr-28! *:pointer-events-auto">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
