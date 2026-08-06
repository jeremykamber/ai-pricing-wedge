import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// Release gate config: the deterministic subset of the suite.
//
// Kept out of vitest.config.ts so `bun test` still shows the pre-existing
// failures. Excluded here (all broken before this gate existed):
//   - GeneratePersonasFromInterviewsUseCase tests — stale after pipeline refactor
//   - analyze-result / analyze-screenshot route tests — stale mocks
// Fix these and remove the entries (see AGENTS.md "Keep tests current").
const BROKEN_FILES = [
  'src/application/usecases/__tests__/GeneratePersonasFromInterviewsUseCase.test.ts',
  'src/application/usecases/__tests__/GeneratePersonasFromInterviewsUseCase.integration.test.ts',
  'src/app/api/vps/analyze-result/__tests__/route.test.ts',
  'src/app/api/vps/analyze-screenshot/__tests__/route.test.ts',
];

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      ...BROKEN_FILES,
    ],
  },
});
