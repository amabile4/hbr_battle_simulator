export default {
  testDir: './tests/e2e',
  webServer: {
    command: 'node scripts/dev-server.mjs',
    port: 4173,
    reuseExistingServer: true,
  },
  use: {
    headless: true,
    baseURL: 'http://localhost:4173',
  },
};
