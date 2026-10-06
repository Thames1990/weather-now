// https://nuxt.com/docs/api/configuration/nuxt-config
import { resolveApiConfig } from './app/utils/api-config'

const apiConfig = resolveApiConfig(process.env)

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || '/',
    head: {
      title: 'Weather Now — Live conditions and forecasts',
      meta: [
        { name: 'description', content: 'Live conditions, hourly and 7-day forecasts, trends, and clothing guidance for any location.' },
        { name: 'theme-color', content: '#0c4a6e' },
        { property: 'og:title', content: 'Weather Now' },
        { property: 'og:description', content: 'Live conditions, hourly and 7-day forecasts, trends, and clothing guidance for any location.' },
        { property: 'og:type', content: 'website' }
      ]
    }
  },
  runtimeConfig: {
    public: {
      apiMode: apiConfig.apiMode,
      apiBaseUrl: apiConfig.apiBaseUrl
    }
  },
  modules: ['@nuxt/ui', '@nuxt/fonts', '@nuxtjs/i18n', '@nuxt/eslint'],
  components: [
    { path: '~/components/charts', pathPrefix: false },
    '~/components'
  ],
  experimental: {
    viewTransition: true
  },
  fonts: {
    families: [
      { name: 'Inter', provider: 'google', weights: [400, 500, 600, 700] }
    ]
  },
  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    vueI18n: 'i18n.config.ts',
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'de', name: 'Deutsch', file: 'de.json' }
    ]
  },
  css: ['~/assets/css/main.css']
})
