import { defineConfig } from "vitest/config";
import path from "node:path";

// Load .env.test into process.env so the integration project can pass
// DATABASE_URL down to the test workers. process.loadEnvFile is Node's
// built-in reader for .env files, the same mechanism as `node --env-file`.
process.loadEnvFile(".env.test");

export default defineConfig({
  test: {
    maxWorkers: 1,
    // A "project" is a named group of test files with its own settings.
    // Two groups here because they have opposite database needs:
    //   unit        -> database faked, fast, no network
    //   integration -> real database, proves the SQL actually works
    // `npm test` runs both; `npm test -- --project=unit` runs one.
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
          setupFiles: ["./test/setup.ts"],
        },
        resolve: {
          alias: [
            {
              find: /^.*\/db\.js$/,
              replacement: path.resolve(
                import.meta.dirname,
                "./test/mocks/db.ts",
              ),
            },
          ],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["./test/setup.integration.ts"],
          env: {
            DATABASE_URL: process.env.DATABASE_URL ?? "",
          },
          fileParallelism: false,
          testTimeout: 20000,
          hookTimeout: 20000,
        },
      },
    ],
  },
});
