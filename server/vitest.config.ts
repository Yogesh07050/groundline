import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      GROQ_API_KEY: '',
      LOG_LEVEL: 'silent',
    },
  },
});
