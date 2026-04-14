const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/mcp-server'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  // ──────────────────────────────────────────────
  // Prisma MUST be external — webpack cannot bundle
  // @prisma/client because $Enums and the query engine
  // are loaded at runtime from node_modules.
  // MCP SDK also has dynamic requires that webpack can't handle.
  // ──────────────────────────────────────────────
  externals: [
    ({ request }, callback) => {
      if (
        request === '@prisma/client' ||
        request?.startsWith('.prisma/') ||
        request === '@modelcontextprotocol/sdk' ||
        request?.startsWith('@modelcontextprotocol/')
      ) {
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
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
  ],
};
