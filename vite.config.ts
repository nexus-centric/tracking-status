import { defineConfig, type Plugin } from 'vite';
import { APP_DESCRIPTION, APP_NAME, manifest } from './src/core/brand.ts';

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Fills %APP_NAME% / %APP_DESCRIPTION% in index.html and serves/emits manifest.webmanifest from src/core/brand.ts.
function brand(): Plugin {
  const json = () => JSON.stringify(manifest(), null, 2) + '\n';
  return {
    name: 'brand',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', escHtml(APP_NAME)).replaceAll('%APP_DESCRIPTION%', escHtml(APP_DESCRIPTION)),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0].endsWith('/manifest.webmanifest')) return next();
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(json());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: json() });
    },
  };
}

// VITE_BASE is set by the GitHub Pages workflow to /<repo-name>/.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  build: { target: 'es2022' },
  plugins: [brand()],
});
