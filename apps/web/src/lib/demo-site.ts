/** Production links its login page to the demo site when this is an http(s) URL. */
export const DEMO_URL = /^https?:\/\//.test(import.meta.env.VITE_DEMO_URL ?? '')
  ? (import.meta.env.VITE_DEMO_URL ?? '')
  : '';

/** Full page loads, behind an object so tests can replace them (jsdom cannot navigate). */
export const pageLoad = {
  replace(path: string) {
    window.location.replace(path);
  },
};
