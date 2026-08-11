/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  setupFiles: ["<rootDir>/test/support/jest.setup.ts"],
  testTimeout: 20000,
  // Integration suites each boot a real Nest app against one shared
  // Postgres container. Running test files in parallel workers causes
  // intermittent resource-contention failures under load (observed
  // directly during Module 4 verification: a clean run took ~53s, a
  // contended one took ~124s and produced 23 spurious failures across
  // 5 suites). Playwright already pins workers to 1 for the same class
  // of reason; do the same here rather than let this get flakier as
  // more integration suites are added module by module.
  maxWorkers: 1,
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  coverageDirectory: "./coverage",
};
