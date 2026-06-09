import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/weather-proxy': {
          target: 'https://api.open-meteo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/weather-proxy/, ''),
        },
        '/api/geocoding-proxy': {
          target: 'https://geocoding-api.open-meteo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/geocoding-proxy/, ''),
        },
        '/api/air-quality-proxy': {
          target: 'https://air-quality-api.open-meteo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/air-quality-proxy/, ''),
        }
      }
    },
  };
});
