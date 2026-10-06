import { createFileRoute, notFound } from '@tanstack/react-router';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/manrope';
import { PageTitle } from '@/components/page-title';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * TEMPORARY dev-only page to choose the heading font. Delete it (and the candidate
 * font packages that lose) once a font is picked.
 */
export const Route = createFileRoute('/dev/typography')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: TypographyPreview,
});

const CANDIDATES = [
  { name: 'Bricolage Grotesque', family: "'Bricolage Grotesque Variable'", weight: 800 },
  { name: 'Space Grotesk', family: "'Space Grotesk Variable'", weight: 700 },
  { name: 'Manrope', family: "'Manrope Variable'", weight: 800 },
] as const;

const huf = new Intl.NumberFormat('hu-HU', {
  style: 'currency',
  currency: 'HUF',
  maximumFractionDigits: 0,
});

const TRANSACTIONS = [
  { label: 'Lidl, heti bevásárlás', category: 'Groceries', amount: -18450 },
  { label: 'Rezsi (áram, gáz)', category: 'Utilities', amount: -27480 },
  { label: 'Anna settled up', category: 'Settlement', amount: 12500 },
  { label: 'Pizza Forte', category: 'Eating out', amount: -9990 },
];

function Specimen({ family, weight }: { family: string; weight: number }) {
  const heading = { fontFamily: family, fontWeight: weight };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 style={heading} className="text-4xl leading-[1.05] tracking-tight">
          Shared expenses, sorted.
        </h1>
        <p className="text-muted-foreground">
          Árvíztűrő tükörfúrógép: Hungarian accents in body text.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={heading} className="text-xl tracking-tight">
            October overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-muted-foreground">Anna owes you</p>
            <p style={heading} className="text-positive text-3xl tracking-tight tabular-nums">
              {huf.format(12500)}
            </p>
          </div>
          <ul className="divide-y">
            {TRANSACTIONS.map((t) => (
              <li key={t.label} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.label}</p>
                  <p className="text-muted-foreground text-xs">{t.category}</p>
                </div>
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    t.amount > 0 ? 'text-positive' : 'text-negative',
                  )}
                >
                  {t.amount > 0 ? '+' : ''}
                  {huf.format(t.amount)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button>Add expense</Button>
            <Button variant="outline">Settle up</Button>
            <Badge variant="success">Settled</Badge>
            <a href="#" className="text-link font-medium underline-offset-4 hover:underline">
              View all
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TypographyPreview() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <PageTitle title="Typography preview" />
      <div>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Dev only · body: Inter 14px
        </p>
        <h1 className="font-heading text-2xl font-extrabold">Heading font candidates</h1>
      </div>
      <div className="grid gap-10 md:grid-cols-3">
        {CANDIDATES.map((c) => (
          <section key={c.name} className="space-y-4">
            <h2 className="text-muted-foreground border-b pb-2 text-sm font-medium">{c.name}</h2>
            <Specimen family={c.family} weight={c.weight} />
          </section>
        ))}
      </div>
    </div>
  );
}
