import { useLocation, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';

declare module '@tanstack/history' {
  interface HistoryState {
    /** Set by in-app links that open a URL-driven modal, so closing it can go back. */
    modalOpenedInApp?: boolean;
  }
}

/** Pass as `state` on links that open a modal route or `?modal=` modal. */
export const OPEN_MODAL_STATE = { modalOpenedInApp: true };

/**
 * Modals live in the URL (a child route or `?modal=`), so reload, share and the back button
 * work. Closing goes back when the modal was opened inside the app, which keeps history
 * clean (back after closing does not reopen it). Opened from a pasted link there is nothing
 * to go back to, so `fallback` navigates to the underlying page instead (use `replace`).
 */
export function useCloseModal(fallback: () => void): () => void {
  const router = useRouter();
  const openedInApp = useLocation({ select: (l) => l.state.modalOpenedInApp === true });
  return useCallback(() => {
    if (openedInApp) router.history.back();
    else fallback();
  }, [openedInApp, router, fallback]);
}
