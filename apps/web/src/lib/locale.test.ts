import { getValidationLocale, householdNameSchema } from '@splinance/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n';
import { createAuthStore } from './auth-store';
import { detectLocale, followUserLocale, LOCALE_STORAGE_KEY, localeStore } from './locale';
import { testUser } from '../../test/utils';

function browserLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detectLocale', () => {
  it("prefers this device's choice, then the first browser language we have, then English", () => {
    browserLanguages(['de-DE', 'hu-HU', 'en-US']);
    expect(detectLocale()).toBe('hu');

    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    expect(detectLocale()).toBe('en');

    localStorage.setItem(LOCALE_STORAGE_KEY, 'xx');
    browserLanguages(['de-DE', 'fr']);
    expect(detectLocale()).toBe('en');
  });
});

describe('localeStore', () => {
  it('switches the strings, the schema messages, Zod and <html lang> together', async () => {
    await localeStore.setLocale('hu');

    expect(localeStore.getState()).toBe('hu');
    expect(i18n.t('shell:nav.overview')).toBe('Áttekintés');
    expect(getValidationLocale()).toBe('hu');
    expect(householdNameSchema.safeParse('').error?.issues[0]?.message).toBe('Add meg a nevet');
    expect(document.documentElement.lang).toBe('hu');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('hu');

    await localeStore.setLocale('en', { persist: false });
    expect(i18n.t('shell:nav.overview')).toBe('Overview');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('hu');
  });

  it('lets the last of two overlapping switches win', async () => {
    await Promise.all([localeStore.setLocale('hu'), localeStore.setLocale('en')]);
    expect(localeStore.getState()).toBe('en');
    expect(i18n.language).toBe('en');
  });
});

describe('followUserLocale', () => {
  it("applies a signed-in user's saved language, also when it changes later", async () => {
    const auth = createAuthStore();
    await followUserLocale(auth);
    expect(localeStore.getState()).toBe('en');

    auth.setSession('token', { ...testUser, locale: 'hu' });
    await vi.waitFor(() => {
      expect(localeStore.getState()).toBe('hu');
    });

    // null follows the device: nothing changes.
    auth.setUser({ ...testUser, locale: null });
    await Promise.resolve();
    expect(localeStore.getState()).toBe('hu');
  });
});
