const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/core-api'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  // ──────────────────────────────────────────────
  // Prisma MUST be external — webpack cannot bundle
  // @prisma/client because $Enums and the query engine
  // are loaded at runtime from node_modules.
  // ──────────────────────────────────────────────
  externals: [
    ({ request }, callback) => {
      if (request === '@prisma/client' || request?.startsWith('.prisma/')) {
        return callback(null, `commonjs ${request}`);
      }
      callback();
    },
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: [
        './src/assets',
        { glob: '**/*', input: '../../libs/common/src/templates', output: './templates' },
        { glob: '**/*', input: '../../libs/common/src/languages', output: './languages' }
      ],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
  ],
};
