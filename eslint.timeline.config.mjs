import nextTs from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';

// Independent of the repository's global src/** ignore. Include the legacy editor,
// while enforcing stricter typing/readability on the new reliability modules.
export default [
  ...nextTs,
  { ignores: ['node_modules/**', '.next/**'], linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: ['src/features/timeline-editor/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'no-unreachable': 'error', 'no-dupe-args': 'error',
      'no-constant-condition': 'error', 'constructor-super': 'error',
      'no-async-promise-executor': 'error', 'no-unsafe-finally': 'error',
      'no-loss-of-precision': 'error', 'no-eval': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/features/timeline-editor/components/TimelineEditor.tsx'],
    rules: {
      // Existing row/gesture signatures still use any; a wholesale rewrite is outside Phases 0–3.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
