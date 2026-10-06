import { useSyncExternalStore } from 'react';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

// Keep in sync with the inline script in index.html, which applies the theme before first paint.
export const THEME_STORAGE_KEY = 'splinance-theme';

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_PREFERENCES.find((p) => p === stored) ?? 'system';
  } catch {
    // Storage can be blocked (private mode, disabled cookies): fall back to the OS setting.
    return 'system';
  }
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return darkQuery().matches ? 'dark' : 'light';
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  // Native controls (scrollbars, date pickers) follow the theme too.
  root.style.colorScheme = resolved;
}

function createThemeStore() {
  const preference = readPreference();
  let state: ThemeState = { preference, resolved: resolve(preference) };
  const listeners = new Set<() => void>();

  const update = (preference: ThemePreference) => {
    const next = { preference, resolved: resolve(preference) };
    apply(next.resolved);
    if (next.preference === state.preference && next.resolved === state.resolved) return;
    state = next;
    listeners.forEach((listener) => {
      listener();
    });
  };

  apply(state.resolved);
  // Follow OS changes live while the preference is "system".
  darkQuery().addEventListener('change', () => {
    if (state.preference === 'system') update('system');
  });

  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPreference: (preference: ThemePreference) => {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, preference);
      } catch {
        // Not persisted, but still applied for this visit.
      }
      update(preference);
    },
  };
}

export const themeStore = createThemeStore();

export function useTheme(): ThemeState {
  return useSyncExternalStore(themeStore.subscribe, themeStore.getState);
}
