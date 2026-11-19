import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.spec.mjs"],
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  reporter: process.env.CI ? [["github"],["list"]] : "list",
  use: { baseURL: "http://127.0.0.1:5173", timezoneId: "Asia/Shanghai", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } }
  ],
  webServer: { command: "npm run dev", url: "http://127.0.0.1:5173", timeout: 90000, reuseExistingServer: !process.env.CI }
});
