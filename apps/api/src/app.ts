import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { pingDatabase } from './db/client';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
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
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', createHealthRouter(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
