import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { networkInterfaces } from 'node:os';
import { createDeviceGateway } from './server/device-gateway.mjs';


const interfaces = networkInterfaces();
const addresses = [...(interfaces.en0 || []), ...Object.values(interfaces).flat()];
const networkHost = addresses.find(address => address.family === 'IPv4' && !address.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address))?.address || '';


export default defineConfig(({ mode }) => {
  // Only VITE_ variables are public. The device credential stays in this process.
  const env = loadEnv(mode, process.cwd(), '');
  const middleware = createDeviceGateway({
    supabaseUrl: env.VITE_SUPABASE_URL,
    publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    deviceKey: env.POS_DEVICE_KEY,
  });
  return {
  plugins: [react(), { name: 'trusted-local-device',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  }],
  build: { rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'] } } } },
  define: { __LOCAL_MENU_HOST__: JSON.stringify(networkHost) },
  };
});
