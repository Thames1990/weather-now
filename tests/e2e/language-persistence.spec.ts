import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  await context.route('**/api/weather?**', route => route.abort())
  await context.route('https://api.open-meteo.com/**', route => route.abort())
})

async function languageSelector(page: Page) {
  const settings = page.getByRole('button', { name: /^(Settings|Einstellungen)$/ })
  if (await settings.isVisible()) await settings.click()
  return page.getByRole('combobox', { name: /^(Language|Sprache)$/ }).filter({ visible: true })
}

async function expectLanguage(page: Page, language: 'EN' | 'DE') {
  const label = language === 'EN' ? 'Language' : 'Sprache'
  await expect(page.getByRole('heading', {
    name: language === 'EN' ? 'Hourly forecast' : 'Stündliche Vorhersage', exact: true
  })).toBeVisible({ timeout: 15000 })
  const settings = page.getByRole('button', { name: /^(Settings|Einstellungen)$/ })
  await expect(settings.or(page.getByRole('combobox', { name: /^(Language|Sprache)$/ })))
    .toBeVisible()
  const selector = await languageSelector(page)
  await expect(selector).toHaveAccessibleName(label)
  await expect(selector).toHaveText(language)
  if (await settings.isVisible()) {
    await selector.focus()
    await page.keyboard.press('Escape')
  }
}

for (const browserLocale of ['en-US', 'de-DE']) {
  test.describe(`language persistence with ${browserLocale} browser`, () => {
    test.use({ locale: browserLocale })

    test('keeps each selected language after reload and in a new tab', async ({ page, context }) => {
      await page.goto('./')
      await expectLanguage(page, browserLocale === 'de-DE' ? 'DE' : 'EN')

      const languages = browserLocale === 'de-DE' ? ['EN', 'DE', 'EN'] as const : ['DE', 'EN', 'DE'] as const
      for (const language of languages) {
        const selector = await languageSelector(page)
        await selector.click()
        await page.getByRole('option', { name: language, exact: true }).click()
        await expect.poll(() => page.evaluate(() => localStorage.getItem('weather-now:language')))
          .toBe(JSON.stringify(language.toLowerCase()))
        await page.reload()
        await expectLanguage(page, language)
        await expect.poll(async () => (await context.cookies()).find(cookie => cookie.name === 'i18n_redirected')?.value)
          .toBe(language.toLowerCase())
      }

      const newTab = await context.newPage()
      await newTab.goto('./')
      await expectLanguage(newTab, languages[2])
      await newTab.close()
    })

    test('restores an existing English preference over browser detection and a stale cookie', async ({ page, context }) => {
      await page.goto('./')
      await expectLanguage(page, browserLocale === 'de-DE' ? 'DE' : 'EN')
      await page.evaluate(() => localStorage.setItem('weather-now:language', JSON.stringify('en')))
      const cookies = (await context.cookies()).filter(cookie => cookie.name === 'i18n_redirected')
      expect(cookies).toHaveLength(1)
      await context.addCookies(cookies.map(cookie => ({ ...cookie, value: 'de' })))
      await page.reload()
      await expectLanguage(page, 'EN')
      await expect.poll(async () => (await context.cookies()).find(cookie => cookie.name === 'i18n_redirected')?.value)
        .toBe('en')
    })
  })
}
