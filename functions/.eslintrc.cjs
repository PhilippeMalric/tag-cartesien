// functions/.eslintrc.cjs (ou .js)
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked'
  ],
  ignorePatterns: ['lib/**', 'node_modules/**', 'index.js'],
  rules: {
    // assouplis (ou garde strict + --fix)
    'max-len': ['warn', 120],
    'object-curly-spacing': ['error', 'always'],
    'comma-dangle': ['error', 'always-multiline'],
    'no-multi-spaces': 'off',
    '@typescript-eslint/no-explicit-any': 'off'
  }
};
