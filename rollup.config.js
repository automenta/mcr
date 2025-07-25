import { babel } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'index.js',
  output: [
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'auto',
    },
    {
      file: 'dist/index.mjs',
      format: 'es',
      sourcemap: true,
      exports: 'auto',
    },
  ],
  plugins: [
    nodeResolve(),
    commonjs(),
    babel({ babelHelpers: 'runtime' }),
  ],
};
