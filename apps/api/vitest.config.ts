import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    server: { deps: { inline: ['nestjs-cls'] } },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
