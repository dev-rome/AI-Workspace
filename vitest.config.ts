import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: [
      {
        find: /^.*\/db\.js$/,
        replacement: path.resolve(import.meta.dirname, "./test/mocks/db.ts"),
      },
    ],
  },
});
