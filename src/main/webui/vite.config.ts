import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

const PAGES = path.resolve(__dirname, '../../../../pages/packages');
const CHANNEL_ACTIVITY = path.resolve(__dirname, '../../../../blocks-ui/components/channel-activity');
const CASEHUB_PKG = path.resolve(__dirname, '.casehub-packages/packages');

const pagesExists = fs.existsSync(path.resolve(PAGES, 'pages-primitives/src'));

const aliases: { find: string | RegExp; replacement: string }[] = [];

if (pagesExists) {
  for (const pkg of ['pages-primitives', 'pages-ui-tokens', 'pages-component', 'pages-data', 'pages-runtime', 'pages-ui', 'pages-viz']) {
    aliases.push({ find: `@casehubio/${pkg}`, replacement: path.resolve(PAGES, `${pkg}/src`) });
    aliases.push({ find: `@casehubio/${pkg}/dist`, replacement: path.resolve(PAGES, `${pkg}/src`) });
  }
}

// blocks-ui channel-activity from source if available
if (fs.existsSync(path.resolve(CHANNEL_ACTIVITY, 'src'))) {
  aliases.push({ find: '@casehubio/blocks-ui-channel-activity', replacement: path.resolve(CHANNEL_ACTIVITY, 'src') });
}

// Packages imported via /src/ subpath need root-level alias (not dist)
const SRC_IMPORT_PKGS = new Set(['@casehubio/blocks-ui-commitment-viz']);

// All @casehubio/* packages: resolve through .casehub-packages to ensure single copy.
// Two aliases per package: dist/ prefix first (identity, prevents double-dist),
// then bare name → dist/ (maps source-style imports to compiled output).
const casehubPkgs = fs.existsSync(CASEHUB_PKG) ? fs.readdirSync(CASEHUB_PKG) : [];
for (const dir of casehubPkgs) {
  const pkgJsonPath = path.resolve(CASEHUB_PKG, dir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) continue;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    if (!pkg.name) continue;
    const pkgRoot = path.resolve(CASEHUB_PKG, dir);
    const distDir = path.resolve(pkgRoot, 'dist');
    if (!fs.existsSync(distDir)) continue;
    const alreadyAliased = aliases.some(a => typeof a.find === 'string' && a.find === pkg.name);
    if (SRC_IMPORT_PKGS.has(pkg.name)) {
      // Package imported via /src/ subpath — alias to root so both /src/ and /dist/ work
      if (!alreadyAliased) aliases.push({ find: pkg.name, replacement: pkgRoot });
    } else {
      // 1) @pkg/dist/x → pkgRoot/dist/x (identity — compiled imports stay correct)
      aliases.push({ find: `${pkg.name}/dist`, replacement: distDir });
      // 2) @pkg → pkgRoot/dist (bare import + source-style subpaths)
      if (!alreadyAliased) aliases.push({ find: pkg.name, replacement: distDir });
    }
  } catch {}
}

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
