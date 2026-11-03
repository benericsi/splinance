import { z } from 'zod';

// The first import of main.tsx: it must run before any schema exists. Zod 4 compiles object
// parsers with `new Function` and probes for it when an object schema is created. The
// production CSP has no 'unsafe-eval', and the browser reports even that caught probe as a
// violation (the smoke suite fails on it). Without the JIT, parsing is a little slower and
// still far below anything a form or an API response notices.
z.config({ jitless: true });
