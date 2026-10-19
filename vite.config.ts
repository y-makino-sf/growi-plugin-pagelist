import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GROWIが参照するルートのエントリ名を維持し、Reactはファクトリで本体から受け取ります。
export default defineConfig({
  plugins: [react({ jsxRuntime: 'classic' })],
  build: {
    manifest: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: 'client-entry.tsx', preserveEntrySignatures: 'strict' },
  },
  test: {
    environment: 'jsdom',
    clearMocks: true,
    // 配布済みディレクティブの拡張子なしimportも、ブラウザと同じVite経路で解決します。
    server: { deps: { inline: ['@growi/remark-growi-directive'] } },
  },
});