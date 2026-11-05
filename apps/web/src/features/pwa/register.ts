import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { i18n } from '@/i18n';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Registers the service worker. A new version waits until the person agrees: reloading in
 * the middle of a form would lose it. It is looked for hourly and when the window comes
 * back, so a long-open tab still hears about a security fix.
 */
export function startServiceWorker(): void {
  const update = registerSW({
    onNeedRefresh() {
      toast(i18n.t('shell:update.title'), {
        duration: Infinity,
        action: {
          label: i18n.t('shell:update.reload'),
          onClick: () => void update(true),
        },
      });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        // Offline the check can only fail; the next one will do.
        if (navigator.onLine) registration.update().catch(() => undefined);
      };
      setInterval(check, HOUR_MS);
      window.addEventListener('focus', check);
    },
  });
}
