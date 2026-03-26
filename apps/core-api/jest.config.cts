module.exports = {
  displayName: 'core-api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // Allow ts-jest to transform ESM packages (e.g. @faker-js/faker v10)
  transformIgnorePatterns: [
    'node_modules/(?!(@faker-js/faker)/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/core-api',
};

