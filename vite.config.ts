import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-public-filtered',
      apply: 'build',
      closeBundle() {
        const publicDir = path.resolve(__dirname, 'public');
        const distDir = path.resolve(__dirname, 'dist');

        if (fs.existsSync(publicDir)) {
          const files = fs.readdirSync(publicDir);
          files.forEach(file => {
            if (!file.includes('copy')) {
              try {
                const src = path.join(publicDir, file);
                const dest = path.join(distDir, file);
                const stat = fs.statSync(src);
                if (stat.isFile()) {
                  fs.copyFileSync(src, dest);
                }
              } catch (e) {
                console.warn(`Skipping ${file}`);
              }
            }
          });
        }
      }
    }
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  publicDir: false,
  build: {
    copyPublicDir: false,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.includes('backup') || assetInfo.name?.includes('copy')) {
            return 'ignored/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  }
});
