module.exports = {
  '**/*.{js,ts,mjs}': filenames => [
    `eslint --fix ${filenames.map(filename => `"${filename}"`).join(' ')}`,
    `prettier --write ${filenames.map(filename => `"${filename}"`).join(' ')}`,
  ],
  '**/*.md': filenames => [
    `prettier --write ${filenames.map(filename => `"${filename}"`).join(' ')}`,
  ],
  '**/*.json': filenames => [
    `prettier --write ${filenames.map(filename => `"${filename}"`).join(' ')}`,
  ],
};
