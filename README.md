# Weather Now

A polished Nuxt weather app for live conditions, hourly and 7-day forecasts, location search, and clothing recommendations.

## Features

- Search for cities and use current location detection
- View current weather conditions and detailed metrics
- Explore hourly and 7-day forecasts
- Save favorite locations with city and region names in every selectable language
- Switch locales and adjust clothing recommendations
- Responsive, accessible UI built with Nuxt and Nuxt UI

## Stack

- Nuxt 4
- Vue 3
- TypeScript
- Nuxt UI
- Open-Meteo and geocoding APIs via Nitro server routes

## Favorites

Favorites automatically follow the selected language, including cities saved
before multilingual favorites were introduced. Names are stored on your device
for offline language switching. Existing favorites are updated when the app
opens; if a lookup fails, the original city is kept and the favorites menu offers
a retry.

## Local development

```bash
pnpm install
pnpm dev
```

Then open http://localhost:3000.

## Production build

```bash
pnpm build
pnpm preview
```

## GitHub Pages

Pull requests targeting `main`, pushes to `main`, and manual workflow runs
check lint, unit tests, and a static production build. Pushes and manual runs
deploy to https://thames1990.github.io/weather-now/ only after all checks pass;
pull requests never deploy. The workflow uses the repository
subpath and calls the public Open-Meteo, BigDataCloud, and ipinfo APIs directly,
so the existing site at https://thames1990.github.io/ is not replaced.

In the repository settings, set **Pages → Source** to **GitHub Actions** once
before the first deployment.

## Validation

```bash
pnpm lint
pnpm test
pnpm build
```

To reproduce the GitHub Pages static production build:

```bash
NUXT_APP_BASE_URL=/weather-now/ NUXT_PUBLIC_API_MODE=external pnpm generate
```
