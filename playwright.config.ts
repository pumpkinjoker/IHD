import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    launchOptions: {
      args: ["--single-process", "--disable-features=MojoIpcz"]
    },
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
