import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  tsconfig: 'tsconfig.build.json',
  noExternal: ['@syncforge/shared'],
  external: ['ws', 'yjs', 'y-protocols', 'zod', 'react', 'react-dom'],
});
