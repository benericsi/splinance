import { pageTitle } from '@/lib/page-title';

/**
 * Sets the document title. React 19 hoists <title> into <head>; render exactly one
 * per page (pages render it, layouts never do) because multiple titles are unsupported.
 */
export function PageTitle({ title }: { title?: string }) {
  return <title>{pageTitle(title)}</title>;
}
