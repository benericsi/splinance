import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { PageTitle } from '@/components/page-title';
import { useAuth } from '@/lib/auth-store';

/**
 * The privacy notice (GDPR Article 13) of splinance.com, public. It describes the deployed
 * setup (docs/deploy.md): change it together with the setup (a new provider, region,
 * processor or retention) and move IN_EFFECT_FROM. The demo site has no accounts and its own
 * landing page, so it has no such page.
 */
export const Route = createFileRoute('/privacy')({
  beforeLoad: () => {
    if (__DEMO_SITE__) throw redirect({ to: '/' });
  },
  component: PrivacyPage,
});

const IN_EFFECT_FROM = '2026-11-04';
const CONTACT_EMAIL = 'bene.richard24@gmail.com';

interface DataRow {
  data: string;
  purpose: string;
  basis: string;
  kept: string;
}

const CONTRACT = 'Contract (Art. 6(1)(b))';
const LEGITIMATE_INTEREST = 'Legitimate interest (Art. 6(1)(f))';

const DATA_ROWS: DataRow[] = [
  {
    data: 'Account: email, display name, a password hash (Argon2id) or your Google account id',
    purpose: 'Your account and signing in',
    basis: CONTRACT,
    kept: 'Until the account is deleted',
  },
  {
    data: 'Household data: members and roles, transactions, splits, payments, categories, rules, budgets, edit history',
    purpose: 'The service itself',
    basis: CONTRACT,
    kept: 'While the household exists; shared entries stay for the other members after you leave, because their balances depend on them',
  },
  {
    data: "Bank imports: the rows you import and the file's name",
    purpose: 'Adding transactions',
    basis: CONTRACT,
    kept: 'Like household data; the file itself is never stored',
  },
  {
    data: 'Sessions: a hashed token per device',
    purpose: 'Keeping you signed in',
    basis: CONTRACT,
    kept: '30 days after last use',
  },
  {
    data: 'Invite links: a hashed token',
    purpose: 'Joining a household',
    basis: CONTRACT,
    kept: '7 days',
  },
  {
    data: "Request logs: the hosting provider's records of each request (IP address, address requested, time); our own logs leave tokens out and hold no IP",
    purpose: 'Security, abuse limits, fixing errors',
    basis: LEGITIMATE_INTEREST,
    kept: 'Visible for 7 days on our plan; Railway may keep them longer',
  },
  {
    data: 'Backups: the database without sessions, encrypted',
    purpose: 'Recovery after a failure',
    basis: LEGITIMATE_INTEREST,
    kept: 'Daily copies 35 days, monthly copies 13 months',
  },
];

const COLUMNS: { key: keyof DataRow; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'basis', label: 'Legal basis' },
  { key: 'kept', label: 'Kept' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-bold tracking-tight">{title}</h2>
      <div className="text-muted-foreground space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

/** A table on wider screens; on phones each row becomes a card with its labels. */
function DataTable() {
  return (
    <div role="table" aria-label="Data, purpose, legal basis and retention" className="text-sm">
      <div role="rowgroup" className="hidden md:block">
        <div
          role="row"
          className="text-foreground grid grid-cols-[1.4fr_0.9fr_1.1fr_1.1fr] gap-4 border-b pb-2 font-medium"
        >
          {COLUMNS.map((column) => (
            <span key={column.key} role="columnheader">
              {column.label}
            </span>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {DATA_ROWS.map((row) => (
          <div
            key={row.data}
            role="row"
            className="grid gap-1 border-b py-3 md:grid-cols-[1.4fr_0.9fr_1.1fr_1.1fr] md:gap-4"
          >
            {COLUMNS.map((column) => (
              <span
                key={column.key}
                role="cell"
                className={column.key === 'data' ? 'text-foreground' : undefined}
              >
                <span className="text-foreground font-medium md:hidden">{column.label}: </span>
                {row[column.key]}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrivacyPage() {
  const { status } = useAuth();

  return (
    <>
      <PageTitle title="Privacy" />
      <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-6 py-6 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <Logo />
          <Link
            to={status === 'authenticated' ? '/' : '/login'}
            className="text-link text-sm font-medium underline-offset-4 hover:underline"
          >
            {status === 'authenticated' ? 'Back to Splinance' : 'Log in'}
          </Link>
        </header>

        <main className="flex-1 space-y-8 py-12">
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">Privacy notice</h1>
            <p className="text-muted-foreground">
              How Splinance handles personal data, under Article 13 of the EU General Data
              Protection Regulation (GDPR).
            </p>
            <p className="text-muted-foreground text-xs">In effect from {IN_EFFECT_FROM}</p>
          </div>

          <Section title="1. Who is responsible">
            <p>
              Richárd Bene, private individual, Hungary,{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-link underline-offset-4 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              . Splinance is a personal project, invite-only and free; there is no business behind
              it.
            </p>
          </Section>

          <Section title="2. What, why, on what basis, how long">
            <DataTable />
            <p>
              Other members of a household see your display name, role and the shared entries, never
              your email. Private entries are visible only to you.
            </p>
          </Section>

          <Section title="3. Signing in with Google">
            <p>
              If you choose it, Google sends us your Google account id, your email, whether Google
              verified it, and your name. We keep the id to recognize you; a new account takes the
              email and the name. We don&apos;t receive your picture, contacts or Google tokens, and
              we can&apos;t act in your Google account. Google acts as an independent controller and
              learns that you signed in to Splinance.
            </p>
          </Section>

          <Section title="4. Who processes data for us">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Railway: hosting and the database, in its EU West region (Amsterdam). Railway is a
                US company; transfers are covered by the EU Standard Contractual Clauses in its data
                processing addendum.
              </li>
              <li>
                Amazon Web Services: the encrypted backups, in Frankfurt. Only the controller holds
                the key to decrypt them.
              </li>
              <li>Cloudflare: the domain&apos;s DNS only, no personal data.</li>
            </ul>
            <p>Nothing is sold, shared for advertising, or used to train AI models.</p>
          </Section>

          <Section title="5. Cookies and storage">
            <p>
              Only what signing in needs: the session cookie (30 days) and, during a Google sign-in,
              two short-lived cookies (10 minutes). Your browser also remembers the theme, the last
              household you opened and your bank choice for imports. No analytics, no trackers, no
              third-party fonts or scripts, so there is no cookie banner.
            </p>
          </Section>

          <Section title="6. Security">
            <p>
              HTTPS everywhere, passwords hashed with Argon2id, database roles with the fewest
              rights they need, and backups encrypted before they leave the server.
            </p>
          </Section>

          <Section title="7. Automated decisions">
            <p>None, and no profiling. Category rules only do what you set them up to do.</p>
          </Section>

          <Section title="8. Your rights">
            <p>
              You can ask for access to your data, its correction or deletion, restricted
              processing, a copy in a portable format, and object to processing based on legitimate
              interest. Write to the email above; requests are answered within one month. Deleted
              data leaves the backups as they expire.
            </p>
            <p>
              You can complain to the Hungarian data protection authority (NAIH, 1055 Budapest, Falk
              Miksa utca 9-11, ugyfelszolgalat@naih.hu, naih.hu) or go to court.
            </p>
          </Section>

          <Section title="9. Other">
            <p>
              Splinance is for people aged 16 and over. Changes to this notice appear on this page
              with a new date.
            </p>
          </Section>
        </main>
      </div>
    </>
  );
}
