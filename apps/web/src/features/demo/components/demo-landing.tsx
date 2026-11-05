import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/logo';
import { PageTitle } from '@/components/page-title';
import { ThemeToggle } from '@/components/theme-toggle';
import overviewDark from '@/assets/demo/overview-dark.jpg';
import overviewLight from '@/assets/demo/overview-light.jpg';
import phoneDark from '@/assets/demo/phone-dark.jpg';
import phoneLight from '@/assets/demo/phone-light.jpg';
import tourDark from '@/assets/demo/tour-dark.webm';
import tourLight from '@/assets/demo/tour-light.webm';
import { Button } from '@/components/ui/button';
import { LanguageSwitch } from '@/features/account/components/language-switch';
import { useLocale } from '@/lib/locale';
import { useTheme } from '@/lib/theme';
import { useMediaQuery } from '@/lib/use-media-query';
import { useStartDemo } from '../hooks';

const REPO = 'https://github.com/benericsi/splinance';

const STATS = ['months', 'banks', 'click'] as const;

const STACK = [
  'React 19',
  'TypeScript',
  'TanStack Router and Query',
  'Express 5',
  'PostgreSQL 18',
  'Drizzle',
  'Zod',
  'Vitest and Playwright',
  'Python and Polars',
  'Airflow',
  'dbt',
  'Terraform on AWS',
];

const LINKS = [
  { href: `${REPO}/blob/main/docs/architecture.md`, label: 'architecture' },
  { href: REPO, label: 'source' },
  { href: `${REPO}/blob/main/docs/data-track.md`, label: 'pipeline' },
] as const;

/**
 * The demo site's home page: what Splinance is, a tour on the brand's blue tile, and
 * "Try the demo", which seeds a household and signs the visitor in.
 */
export function DemoLanding() {
  const { t } = useTranslation('demo');
  const start = useStartDemo();
  const navigate = useNavigate();

  const tryDemo = () => {
    start.mutate(undefined, {
      onSuccess: ({ householdId }) => {
        void navigate({ to: '/h/$householdId', params: { householdId } });
      },
    });
  };

  return (
    <>
      <PageTitle title={t('pageTitle')} />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 md:px-8">
        <section className="mx-auto max-w-2xl pt-8 text-center md:pt-14">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base text-balance md:text-lg">
            {t('lead')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button size="lg" onClick={tryDemo} disabled={start.isPending}>
              {start.isPending ? t('settingUp') : t('try')}
              {!start.isPending && <ArrowRight aria-hidden />}
            </Button>
            <p className="text-muted-foreground text-sm">{t('noSignUp')}</p>
          </div>
        </section>

        <AppPreview />

        <section aria-label={t('inTheDemo')} className="mt-16 md:mt-20">
          <dl className="grid gap-6 text-center sm:grid-cols-3">
            {STATS.map((stat) => (
              <div key={stat}>
                <dt className="font-heading text-3xl font-extrabold tracking-tight">
                  {t(`stats.${stat}.value`)}
                </dt>
                <dd className="text-muted-foreground mt-1 text-sm">{t(`stats.${stat}.label`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-16 grid gap-8 border-t pt-10 md:mt-20 md:grid-cols-2">
          <div>
            <h2 className="font-heading text-2xl font-bold tracking-tight">{t('built.title')}</h2>
            <p className="text-muted-foreground mt-2">{t('built.description')}</p>
            <ul className="mt-4 flex flex-wrap gap-2" aria-label={t('built.technologies')}>
              {STACK.map((name) => (
                <li
                  key={name}
                  className="text-muted-foreground rounded-full border px-3 py-1 text-xs"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <ul className="flex flex-col justify-center gap-1 md:items-start">
            {LINKS.map(({ href, label }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link inline-flex items-center gap-1 py-1 font-medium underline-offset-4 hover:underline"
                >
                  {t(`links.${label}`)}
                  <ArrowUpRight className="size-4" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-muted-foreground mt-12 text-center text-xs text-balance">
          {t('madeUp')}
        </p>
      </main>
    </>
  );
}

/**
 * The recorded tour on the brand's blue tile, the phone overlapping its corner. Recorded
 * with `pnpm capture:demo` (e2e/capture), in the theme the page is in. With reduced motion
 * the video waits on its poster with controls instead of playing by itself.
 */
function AppPreview() {
  const { t } = useTranslation('demo');
  const locale = useLocale();
  const { resolved } = useTheme();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const dark = resolved === 'dark';

  return (
    <section aria-label={t('tour.label')} className="relative mt-12 pb-8 md:mt-16">
      <div className="bg-brand-blue rounded-3xl p-4 pr-20 sm:p-8 sm:pr-36 md:p-12 md:pr-48">
        <video
          // A new element when the theme flips, so the other recording loads.
          key={resolved}
          src={dark ? tourDark : tourLight}
          poster={dark ? overviewDark : overviewLight}
          aria-label={t('tour.video')}
          autoPlay={!reduceMotion}
          controls={reduceMotion}
          preload={reduceMotion ? 'none' : 'auto'}
          muted
          loop
          playsInline
          className="bg-background aspect-[16/10] w-full rounded-xl"
        />
      </div>
      <img
        src={dark ? phoneDark : phoneLight}
        alt={t('tour.phone')}
        loading="lazy"
        className="border-foreground bg-background absolute right-4 bottom-0 aspect-[390/844] w-20 rounded-[1.25rem] border-4 object-cover sm:right-8 sm:w-28 sm:rounded-[1.75rem] md:right-12 md:w-36"
      />
      {/* The recordings are of the English app (re-recording per language is not worth it). */}
      {locale !== 'en' && <p className="text-muted-foreground mt-3 text-xs">{t('tour.english')}</p>}
    </section>
  );
}
