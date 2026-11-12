import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { AccountLayout } from '@/features/account/components/account-layout';
import { AccountTabs } from '@/features/account/components/account-tabs';
import {
  DefaultsSection,
  DisplaySection,
} from '@/features/account/components/preferences-sections';

/**
 * How the app behaves for the signed-in person: display (language, theme) and defaults.
 * Not nested under /account, so it renders as a page of its own and stays open on the
 * demo (which has no account page). Everything it shows is already in the session, so
 * there is no loader and no skeleton.
 */
export const Route = createFileRoute('/_authenticated/account_/preferences')({
  component: PreferencesPage,
});

function PreferencesPage() {
  const { t } = useTranslation('account');

  return (
    <AccountLayout>
      <PageTitle title={t('preferences.title')} />
      {__DEMO_SITE__ ? (
        <PageHeader title={t('preferences.title')} />
      ) : (
        <>
          <PageHeader title={t('title')} description={t('description')} />
          <AccountTabs current="preferences" />
        </>
      )}
      <div className="space-y-6">
        <DisplaySection />
        <DefaultsSection />
      </div>
    </AccountLayout>
  );
}
