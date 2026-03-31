const E2E_PORT = 4174;

export default {
  testDir: './tests/e2e',
  webServer: {
    command: `PORT=${E2E_PORT} node scripts/dev-server.mjs`,
    port: E2E_PORT,
    reuseExistingServer: true,
  },
  use: {
    headless: true,
    baseURL: `http://localhost:${E2E_PORT}`,
  },
};
