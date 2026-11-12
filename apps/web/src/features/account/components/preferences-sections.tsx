import type { OverviewView, SpendingView, TransactionVisibility } from '@splinance/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-store';
import { type ThemePreference, themeStore, useTheme } from '@/lib/theme';
import { useSavePreferences } from '../hooks';
import { LanguageSwitch } from './language-switch';
import { PillToggle } from './pill-toggle';

/** A titled group of settings: one card, a row per setting. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-muted-foreground mb-2 px-0.5 text-sm font-medium">{title}</h2>
      <Card className="divide-y py-0">{children}</Card>
    </section>
  );
}

/** Title and description on the left, the control on the right (below it on a phone). */
function Row({
  title,
  description,
  badge,
  control,
}: {
  title: string;
  description: string;
  badge?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4">
      <div className="min-w-0 flex-1 basis-64">
        <h3 className="flex items-center gap-2 font-medium">
          {title}
          {badge && (
            <Badge variant="outline" className="text-muted-foreground font-normal">
              {badge}
            </Badge>
          )}
        </h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {control}
    </div>
  );
}

const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** How the app looks: the language (follows the account) and the theme (this device). */
export function DisplaySection() {
  const { t } = useTranslation(['account', 'common']);
  const { preference } = useTheme();

  return (
    <Section title={t('preferences.display')}>
      <Row
        title={t('preferences.language.title')}
        description={t('preferences.language.description')}
        control={<LanguageSwitch />}
      />
      <Row
        title={t('common:theme.label')}
        description={t('preferences.theme.description')}
        badge={t('preferences.thisDevice')}
        control={
          <PillToggle
            label={t('common:theme.label')}
            value={preference}
            onChange={(next) => {
              themeStore.setPreference(next);
            }}
            options={THEMES.map((value) => ({ value, label: t(`common:theme.${value}`) }))}
          />
        }
      />
    </Section>
  );
}

/** Defaults saved to the account; each only fills in what a link leaves open. */
export function DefaultsSection() {
  const { t } = useTranslation('account');
  const { user } = useAuth();
  const save = useSavePreferences();
  if (!user) return null;
  const { preferences } = user;

  return (
    <Section title={t('preferences.defaults')}>
      <Row
        title={t('preferences.overview.title')}
        description={t('preferences.overview.description')}
        control={
          <PillToggle<OverviewView>
            label={t('preferences.overview.title')}
            value={preferences.overviewView}
            onChange={(overviewView) => {
              save.mutate({ overviewView });
            }}
            options={[
              { value: 'cards', label: t('preferences.overview.cards') },
              { value: 'map', label: t('preferences.overview.map') },
            ]}
          />
        }
      />
      <Row
        title={t('preferences.visibility.title')}
        description={t('preferences.visibility.description')}
        control={
          <PillToggle<TransactionVisibility>
            label={t('preferences.visibility.title')}
            value={preferences.transactionVisibility}
            onChange={(transactionVisibility) => {
              save.mutate({ transactionVisibility });
            }}
            options={[
              { value: 'shared', label: t('preferences.visibility.shared') },
              { value: 'private', label: t('preferences.visibility.private') },
            ]}
          />
        }
      />
      <Row
        title={t('preferences.spending.title')}
        description={t('preferences.spending.description')}
        control={
          <PillToggle<SpendingView>
            label={t('preferences.spending.title')}
            value={preferences.spendingView}
            onChange={(spendingView) => {
              save.mutate({ spendingView });
            }}
            options={[
              { value: 'household', label: t('preferences.spending.household') },
              { value: 'mine', label: t('preferences.spending.mine') },
            ]}
          />
        }
      />
    </Section>
  );
}
