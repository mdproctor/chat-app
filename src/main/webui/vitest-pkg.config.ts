import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['.casehub-packages/packages/channel-activity/src/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
  },
}));
