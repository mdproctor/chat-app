import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

const PAGES = path.resolve(__dirname, '../../../../pages/packages');
const BLOCKS = path.resolve(__dirname, '../../../../blocks-ui/packages');
const CHANNEL_ACTIVITY = path.resolve(__dirname, '../../../../blocks-ui/components/channel-activity');
const COMMITMENT_VIZ = path.resolve(__dirname, '../../../../blocks-ui/components/commitment-viz');

const siblingAlias = (find: string, replacement: string) =>
  fs.existsSync(replacement) ? { find, replacement } : null;

const aliases = [
  siblingAlias('@casehubio/blocks-ui-channel-activity', path.resolve(CHANNEL_ACTIVITY, 'src')),
  siblingAlias('@casehubio/blocks-ui-commitment-viz', COMMITMENT_VIZ),
  siblingAlias('@casehubio/pages-component/dist', path.resolve(PAGES, 'pages-component/src')),
  siblingAlias('@casehubio/pages-data/dist', path.resolve(PAGES, 'pages-data/src')),
  siblingAlias('@casehubio/pages-ui/dist', path.resolve(PAGES, 'pages-ui/src')),
  siblingAlias('@casehubio/pages-viz/dist', path.resolve(PAGES, 'pages-viz/src')),
  siblingAlias('@casehubio/pages-ui-tokens/dist', path.resolve(PAGES, 'pages-ui-tokens/src')),
  siblingAlias('@casehubio/blocks-ui-core', path.resolve(BLOCKS, 'blocks-ui-core/src')),
  siblingAlias('@casehubio/pages-primitives', path.resolve(PAGES, 'pages-primitives/src')),
  siblingAlias('@casehubio/pages-ui-tokens', path.resolve(PAGES, 'pages-ui-tokens/src')),
  siblingAlias('@casehubio/pages-component', path.resolve(PAGES, 'pages-component/src')),
  siblingAlias('@casehubio/pages-data', path.resolve(PAGES, 'pages-data/src')),
  siblingAlias('@casehubio/pages-runtime', path.resolve(PAGES, 'pages-runtime/src')),
  siblingAlias('@casehubio/pages-ui', path.resolve(PAGES, 'pages-ui/src')),
  siblingAlias('@casehubio/pages-viz', path.resolve(PAGES, 'pages-viz/src')),
].filter(Boolean) as { find: string; replacement: string }[];

export default defineConfig({
  root: 'src',
  server: { hmr: { overlay: false } },
  resolve: {
    dedupe: ['lit', '@lit/reactive-element'],
    alias: aliases,
  },
  esbuild: {
    target: 'es2022',
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
});
