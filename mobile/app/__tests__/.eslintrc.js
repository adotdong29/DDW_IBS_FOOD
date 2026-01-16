module.exports = {
  env: {
    jest: true,
    node: true,
  },
  globals: {
    describe: 'readonly',
    test: 'readonly',
    expect: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    it: 'readonly',
    jest: 'readonly',
  },
};
