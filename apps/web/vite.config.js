// apps/web/vite.config.js
import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // The repo has more than one React (web + mobile). Always use the web app's own copy.
    dedupe: ['react', 'react-dom'],
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
