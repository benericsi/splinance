import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { pingDatabase } from './db/client';
import { logger } from './lib/logger';
import { redactUrl } from './lib/redact-url';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { rateLimiter } from './middleware/rate-limit';
import { requireAuth } from './middleware/require-auth';
import { createAuthRouter, getMe } from './modules/auth/auth.routes';
import { createHouseholdsRouter } from './modules/households/households.routes';
import { createInvitesRouter } from './modules/invites/invites.routes';
import { createHealthRouter, type HealthDeps } from './routes/health';

export type AppDeps = HealthDeps;

const defaultDeps: AppDeps = { pingDatabase };

const IMPORT_PATH = /^\/api\/households\/[^/]+\/imports(\/check)?$/;

export function createApp(deps: AppDeps = defaultDeps) {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      // Default serializers dump every header; keep request logs lean.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: redactUrl(req.url),
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  // Small bodies everywhere, except bank imports: up to a thousand rows of about 500 bytes.
  // No compressed bodies (the web never sends them): the limit then bounds memory directly.
  const smallJson = express.json({ limit: '100kb', inflate: false });
  const importJson = express.json({ limit: '1mb', inflate: false });
  app.use((req, res, next) => {
    (IMPORT_PATH.test(req.path) ? importJson : smallJson)(req, res, next);
  });
  app.use(cookieParser());

  // All API routes live under /api, so they never collide with frontend paths.
  const api = express.Router();
  api.use('/health', createHealthRouter(deps));
  // A ceiling for everything else (health checks stay out of it); the auth, invite and import
  // routes have tighter limits of their own.
  api.use(rateLimiter(1000));
  api.use('/auth', createAuthRouter());
  api.get('/me', requireAuth, getMe);
  api.use('/households', createHouseholdsRouter());
  api.use('/invites', createInvitesRouter());
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
