import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { networkInterfaces } from 'node:os';

const interfaces = networkInterfaces();
const addresses = [...(interfaces.en0 || []), ...Object.values(interfaces).flat()];
const networkHost = addresses.find(address => address.family === 'IPv4' && !address.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address))?.address || '';

export default defineConfig({
  plugins: [react()],
  define: { __LOCAL_MENU_HOST__: JSON.stringify(networkHost) },
});
