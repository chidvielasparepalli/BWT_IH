import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) return 'react-vendor';
          if (id.includes('/node_modules/@firebase/firestore') || id.includes('/node_modules/firebase/firestore')) return 'firebase-firestore';
          if (id.includes('/node_modules/@firebase/auth') || id.includes('/node_modules/firebase/auth')) return 'firebase-auth';
          if (id.includes('/node_modules/@firebase/storage') || id.includes('/node_modules/firebase/storage')) return 'firebase-storage';
          if (id.includes('/node_modules/@firebase/functions') || id.includes('/node_modules/firebase/functions')) return 'firebase-functions';
          if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) return 'firebase-core';
          if (id.includes('/node_modules/lucide-react/')) return 'lucide-icons';
        }
      }
    }
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});