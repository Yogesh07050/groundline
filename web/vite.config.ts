import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const api = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': api,
      '/widget.js': api,
      '/health': api,
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
