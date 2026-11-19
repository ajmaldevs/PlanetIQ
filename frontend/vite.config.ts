import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/three/')) return 'three';
          if (id.includes('/maplibre-gl/')) return 'maplibre';
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts';
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react';
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true
  }
});
