import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { pingDatabase } from './db/client';
import { logger } from './lib/logger';
import { redactUrl } from './lib/redact-url';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requireAuth } from './middleware/require-auth';
import { createAuthRouter, getMe } from './modules/auth/auth.routes';
import { createHouseholdsRouter } from './modules/households/households.routes';
import { createInvitesRouter } from './modules/invites/invites.routes';
import { createHealthRouter, type HealthDeps } from './routes/health';

export type AppDeps = HealthDeps;

const defaultDeps: AppDeps = { pingDatabase };

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
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // All API routes live under /api, so they never collide with frontend paths.
  const api = express.Router();
  api.use('/health', createHealthRouter(deps));
  api.use('/auth', createAuthRouter());
  api.get('/me', requireAuth, getMe);
  api.use('/households', createHouseholdsRouter());
  api.use('/invites', createInvitesRouter());
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
