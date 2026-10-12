import { createApp } from './app.js';
import { createVerifier } from './auth/verifyToken.js';

const app = createApp({
  verify: createVerifier({ supabaseUrl: process.env.SUPABASE_URL }),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
});

const port = process.env.PORT ?? 8000;
app.listen(port, () => console.log(`API running on http://localhost:${port}/v1`));
