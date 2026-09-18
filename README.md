# Weather Now

A polished Nuxt weather app for live conditions, hourly and 7-day forecasts, location search, and clothing recommendations.

## Features

- Search for cities and use current location detection
- View current weather conditions and detailed metrics
- Explore hourly and 7-day forecasts
- Save favorite locations
- Switch locales and adjust clothing recommendations
- Responsive, accessible UI built with Nuxt and Nuxt UI

## Stack

- Nuxt 4
- Vue 3
- TypeScript
- Nuxt UI
- Open-Meteo and geocoding APIs via Nitro server routes

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

Every push to `main` generates and deploys the static site to
https://thames1990.github.io/weather-now/. The workflow uses the repository
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
