import express from 'express';
import cors from 'cors';
import { routes, PUBLIC, SENSOR } from './permissions.js';
import { requireAuth, allow } from './auth/middleware.js';
import { handlers as defaultHandlers } from './handlers.js';

const notImplemented = (req, res) =>
  res.status(501).json({ code: 'NOT_IMPLEMENTED', message: `${req.method} ${req.path} is not built yet` });

export function createApp({ verify, handlers = defaultHandlers, corsOrigins = [] }) {
  const app = express();
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
  v1.use((req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'No such endpoint' }));

  app.use('/v1', v1);
  return app;
}