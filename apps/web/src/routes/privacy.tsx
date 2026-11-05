import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Logo } from '@/components/logo';
import { PageTitle } from '@/components/page-title';
import { useAuth } from '@/lib/auth-store';
import { CONTACT_EMAIL } from '@/lib/contact';

/**
 * The privacy notice (GDPR Article 13) of splinance.com, public, in English and Hungarian
 * (`privacy` catalogs). It describes the deployed setup (docs/deploy.md): change both
 * languages together with the setup (a new provider, region, processor or retention) and
 * move IN_EFFECT_FROM. The demo site has no accounts and its own landing page, so it has no
 * such page.
 */
export const Route = createFileRoute('/privacy')({
  beforeLoad: () => {
    if (__DEMO_SITE__) throw redirect({ to: '/' });
  },
  component: PrivacyPage,
});

const IN_EFFECT_FROM = '2026-11-05';

const ROWS = ['account', 'household', 'imports', 'sessions', 'invites', 'logs', 'backups'] as const;
/** Logs and backups rest on legitimate interest; everything else on the contract. */
const LEGITIMATE_INTEREST_ROWS = new Set<(typeof ROWS)[number]>(['logs', 'backups']);
const COLUMNS = ['data', 'purpose', 'basis', 'kept'] as const;

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
  const { t } = useTranslation('privacy');
  const cell = (row: (typeof ROWS)[number], column: (typeof COLUMNS)[number]) =>
    column === 'basis'
      ? LEGITIMATE_INTEREST_ROWS.has(row)
        ? t('legitimateInterest')
        : t('contract')
      : t(`rows.${row}.${column}`);

  return (
    <div role="table" aria-label={t('tableLabel')} className="text-sm">
      <div role="rowgroup" className="hidden md:block">
        <div
          role="row"
          className="text-foreground grid grid-cols-[1.4fr_0.9fr_1.1fr_1.1fr] gap-4 border-b pb-2 font-medium"
        >
          {COLUMNS.map((column) => (
            <span key={column} role="columnheader">
              {t(`columns.${column}`)}
            </span>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {ROWS.map((row) => (
          <div
            key={row}
            role="row"
            className="grid gap-1 border-b py-3 md:grid-cols-[1.4fr_0.9fr_1.1fr_1.1fr] md:gap-4"
          >
            {COLUMNS.map((column) => (
              <span
                key={column}
                role="cell"
                className={column === 'data' ? 'text-foreground' : undefined}
              >
                <span className="text-foreground font-medium md:hidden">
                  {t(`columns.${column}`)}:{' '}
                </span>
                {cell(row, column)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrivacyPage() {
  const { t } = useTranslation('privacy');
  const { status } = useAuth();

  return (
    <>
      <PageTitle title={t('pageTitle')} />
      <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-6 py-6 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <Logo />
          <Link
            to={status === 'authenticated' ? '/' : '/login'}
            className="text-link text-sm font-medium underline-offset-4 hover:underline"
          >
            {status === 'authenticated' ? t('backToApp') : t('logIn')}
          </Link>
        </header>

        <main className="flex-1 space-y-8 py-12">
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">{t('title')}</h1>
            <p className="text-muted-foreground">{t('intro')}</p>
            <p className="text-muted-foreground text-xs">
              {t('inEffect', { date: IN_EFFECT_FROM })}
            </p>
          </div>

          <Section title={t('s1.title')}>
            <p>
              <Trans
                t={t}
                i18nKey="s1.body"
                values={{ email: CONTACT_EMAIL }}
                components={{
                  a: (
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="text-link underline-offset-4 hover:underline"
                    />
                  ),
                }}
              />
            </p>
          </Section>

          <Section title={t('s2.title')}>
            <DataTable />
            <p>{t('s2.body')}</p>
          </Section>

          <Section title={t('s3.title')}>
            <p>{t('s3.body')}</p>
          </Section>

          <Section title={t('s4.title')}>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t('s4.railway')}</li>
              <li>{t('s4.aws')}</li>
              <li>{t('s4.cloudflare')}</li>
            </ul>
            <p>{t('s4.nothingSold')}</p>
          </Section>

          <Section title={t('s5.title')}>
            <p>{t('s5.body')}</p>
          </Section>

          <Section title={t('s6.title')}>
            <p>{t('s6.body')}</p>
          </Section>

          <Section title={t('s7.title')}>
            <p>{t('s7.body')}</p>
          </Section>

          <Section title={t('s8.title')}>
            <p>{t('s8.body')}</p>
            <p>{t('s8.complaint')}</p>
          </Section>

          <Section title={t('s9.title')}>
            <p>{t('s9.body')}</p>
          </Section>
        </main>
      </div>
    </>
  );
}
