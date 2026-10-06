const APP_NAME = 'Splinance';

/** "Log in · Splinance"; just the app name when no page title is given. */
export function pageTitle(title?: string): string {
  return title ? `${title} · ${APP_NAME}` : APP_NAME;
}
