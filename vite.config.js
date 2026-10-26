import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const LOCAL_ONLY_MODELS = [
  'models/babys',
  'models/agumon_bond_of_bravery.glb',
];

export default defineConfig({
  plugins: [
    (() => {
      let outDir = 'dist';

      return {
        name: 'exclude-local-only-models',
        apply: 'build',
        enforce: 'post',
        configResolved(config) {
          outDir = config.build.outDir;
        },
        async closeBundle() {
          await Promise.all(
            LOCAL_ONLY_MODELS.map((path) =>
              rm(resolve(outDir, path), { recursive: true, force: true }),
            ),
          );
        },
      };
    })(),
  ],
});
