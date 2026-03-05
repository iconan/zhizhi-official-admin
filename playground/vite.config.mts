import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            // rewrite: (path) => path.replace(/^\/api/, ''),
            // mock代理目标地址
            target: 'http://192.168.3.12:8000',
            ws: true,
          },
        },
      },
    },
  };
});
