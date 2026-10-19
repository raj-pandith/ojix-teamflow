import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { viteWebPushPlugin } from './server/vitePushPlugin';
import { pushBackend } from './server/pushBackend';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Initialize server push backend with environment variables
  pushBackend.initVapid({
    publicKey: env.VITE_VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || 'mailto:admin@ojix.local',
  });

  return {
    plugins: [react(), viteWebPushPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: ['.trycloudflare.com'],
    },
  };
});
