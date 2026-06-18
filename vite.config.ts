import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Read VITE_NREL_API_KEY (from .env.local) at config time so the dev proxy can
  // inject it server-side, mirroring the Cloudflare Worker — the client never
  // references the key, so it's never inlined into the bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const nrelKey = env.VITE_NREL_API_KEY;

  return {
    plugins: [react(), tailwindcss()],
    base: '/',
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: true,
      proxy: {
      '/api/fema': {
        target: 'https://hazards.fema.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/fema/, '/arcgis'),
      },
      '/api/nwi': {
        target: 'https://fwspublicservices.wim.usgs.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/nwi/, ''),
      },
      // Vite matches longest prefix first, so /api/census-geocoder beats /api/census.
      '/api/census-geocoder': {
        target: 'https://geocoding.geo.census.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/census-geocoder/, ''),
      },
      '/api/census': {
        target: 'https://api.census.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/census/, ''),
      },
      '/api/nrel': {
        target: 'https://developer.nrel.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => {
          const p = path.replace(/^\/api\/nrel/, '');
          if (!nrelKey || /[?&]api_key=/.test(p)) return p;
          return p + (p.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(nrelKey);
        },
      },
      // Water-analysis upstreams proxied for CORS/stability (mirrors worker.ts).
      '/api/nldi': {
        target: 'https://api.water.usgs.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/nldi/, '/nldi'),
      },
      '/api/echo': {
        target: 'https://echodata.epa.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/echo/, '/echo'),
      },
      '/api/drought': {
        target: 'https://services9.arcgis.com',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) =>
          path.replace(/^\/api\/drought/, '/RHVPKKiFTONKtxq3/arcgis/rest/services'),
      },
      },
    },
  };
});
