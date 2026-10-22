import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { viteWebPushPlugin } from './server/vitePushPlugin';
import { pushBackend } from './server/pushBackend';

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const isBuild = command === 'build';
  const env = loadEnv(mode, process.cwd(), '');

  if (!isBuild) {
    // Initialize server push backend only in dev/preview server mode
    pushBackend.initVapid({
      publicKey: env.VITE_VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT || 'mailto:admin@ojix.local',
    });
  }

  return {
    plugins: [
      react(),
      ...(!isBuild ? [viteWebPushPlugin()] : []),
    ],
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
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
          },
        },
      },
    },
  };
});
