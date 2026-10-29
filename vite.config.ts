import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { readAuthConfig } from './src/auth/authConfig.ts';

export default defineConfig(({ mode }) => {
  readAuthConfig({ ...process.env, ...loadEnv(mode, process.cwd(), 'VITE_') });
  return {
    server: { host: 'localhost', port: 5173, strictPort: true },
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          callback: fileURLToPath(new URL('./auth/callback.html', import.meta.url)),
        },
      },
    },
  };
});
