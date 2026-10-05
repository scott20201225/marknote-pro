import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['test/**/*.spec.ts'],
        pool: 'forks',
        fileParallelism: false,
        testTimeout: 10000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['lib/**/*.ts'],
            exclude: ['lib/index.ts']
        }
    }
});
