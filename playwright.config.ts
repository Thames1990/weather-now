import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60000
  },
  projects: [
    {
      name: 'iphone-se',
      use: { ...devices['iPhone SE'] }
    },
    {
      name: 'iphone-15-pro',
      use: { ...devices['iPhone 15 Pro'] }
    },
    {
      name: 'pixel-8',
      use: { ...devices['Pixel 8'] }
    },
    {
      name: 'iphone-13',
      use: { ...devices['iPhone 13'] }
    },
    {
      name: 'ipad-mini',
      use: { ...devices['iPad Mini'] }
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
