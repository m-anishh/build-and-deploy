import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies API + probe routes to the Express app on :3000, so
// `npm run dev` (Vite, :5173) and the backend work together with no CORS.
// `base: './'` makes the production build use relative asset paths, so Express
// can serve it from any mount path.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/ready': 'http://localhost:3000',
      '/metrics': 'http://localhost:3000',
    },
  },
});
