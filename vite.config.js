import { defineConfig } from 'vite';

// Relative asset paths let this project work at a GitHub Pages project URL.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
