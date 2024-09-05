const globals = require('globals');
const js = require('@eslint/js');

const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

module.exports = [
    {
        ignores: ['.dev-server/**'],
    },
    ...compat.extends('eslint:recommended', 'plugin:prettier/recommended'),
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.mocha,
            },

            ecmaVersion: 2022,
            sourceType: 'commonjs',

            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },

        rules: {
            indent: ['error', 4, { SwitchCase: 1 }],

            'prettier/prettier': ['off', { endOfLine: 'auto' }],
            'no-unused-vars': 'off',
            'no-console': 'off',
            'no-var': 'error',
            'no-trailing-spaces': 'error',
            'prefer-const': 'warn',

            quotes: [
                'error',
                'single',
                {
                    avoidEscape: true,
                    allowTemplateLiterals: true,
                },
            ],
        },
    },
];
