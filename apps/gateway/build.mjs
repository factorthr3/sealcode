// Bundle the gateway into one file so the image carries no node_modules. The bundle is part of
// the attested image, so the build must be deterministic: no timestamps, no minified names that
// change between runs.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  legalComments: 'none',
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
