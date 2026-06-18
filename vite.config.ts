import { defineConfig } from 'vite';

// Vanilla TS SPA. The app is fully client-side; `public/` assets (favicon, img/,
// player-images.txt) are served verbatim at the site root.
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
