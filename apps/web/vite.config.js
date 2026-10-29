// apps/web/vite.config.js
import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { getVersion } from '../../scripts/version.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The app version, 1.0.<commit count> (scripts/version.mjs), shown in the footer.
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
  },
  resolve: {
    // The repo has more than one React (web + mobile). Always use the web app's own copy.
    // supabase-js is imported from apps/shared/supabase.js, outside this folder. Without
    // dedupe Vite looks for it above apps/shared, which only works on a laptop that also
    // ran `npm install` at the repo root; CI installs inside apps/web only.
    dedupe: ['react', 'react-dom', '@supabase/supabase-js'],
  },
  server: {
    host: true, // Listen on all network addresses (0.0.0.0 and ::)
    port: 5173,
    cors: true, // Allow cross-origin requests for local network & Firefox
    proxy: {
      '/v1': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
