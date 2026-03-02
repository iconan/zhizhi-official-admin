import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      server: {
        port: 5525,
        proxy: {
          '/api': {
            changeOrigin: true,
            target: 'http://127.0.0.1:8000',
            ws: true,
          },
        },
      },
    },
  };
});
