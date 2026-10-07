import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // The repo has more than one React (web + mobile). Always use the web app's own copy.
    dedupe: ['react', 'react-dom'],
  },
})