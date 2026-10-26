import express from 'express';
import cors from 'cors';
import { routes, PUBLIC, SENSOR } from './permissions.js';
import { requireAuth, allow } from './auth/middleware.js';
import { handlers as defaultHandlers } from './handlers.js';
import { requireHttps as httpsOnly } from './https.js';

const notImplemented = (req, res) =>
  res.status(501).json({ code: 'NOT_IMPLEMENTED', message: `${req.method} ${req.path} is not built yet` });

export function createApp({ verify, handlers = defaultHandlers, corsOrigins = [], requireHttps = false, trustProxy = false }) {
  const app = express();
  app.set('trust proxy', trustProxy);
  if (requireHttps) app.use(httpsOnly());
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json());

  const v1 = express.Router();
  for (const [method, path, roles] of routes) {
    const handler = handlers[`${method} ${path}`] ?? notImplemented;
    if (roles === PUBLIC) {
      v1[method](path, handler);
    } else if (roles === SENSOR) {
      v1[method](path, notImplemented); // X-Sensor-Key check comes with the sensor ticket
    } else {
      v1[method](path, requireAuth(verify), allow(...roles), handler);
    }
  }
  app.use('/v1', v1);
  app.use((req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'No such endpoint' }));
  app.use(errorHandler);
  return app;
}

// Last stop for errors. Answers in the same { code, message } shape as every
// other response, never Express's default HTML page or a stack trace.
// Express 5 also routes rejected promises from async handlers here.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'INVALID_JSON', message: 'Request body is not valid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' });
  }
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Something went wrong on the server' });
}
