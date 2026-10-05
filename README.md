# Weather Now

A polished Nuxt weather app for live conditions, hourly and 7-day forecasts, location search, and clothing recommendations.

## Features

- Search for cities and use current location detection
- View current weather conditions and detailed metrics
- Explore hourly and 7-day forecasts
- Save favorite locations with city and region names in every selectable language
- Switch locales, choose system/light/dark appearance, and adjust clothing recommendations
- Responsive, accessible UI built with Nuxt and Nuxt UI

Hourly forecast, Temperature trend, and Precipitation outlook share an inclusive
Now-to-+12-hour window (13 readings when available). Narrow hourly cards and charts
scroll horizontally to keep every reading and its label accessible without overlap.

The selected language persists across reloads and new tabs, including on GitHub
Pages. On the first visit, the app follows the browser language; a saved choice
takes precedence on subsequent visits.

On startup, the dashboard waits for preferences, weather, and fonts to settle.
Fast loads go straight to the completed layout; a quiet loading indicator appears
only if setup takes more than 600ms after preferences are restored, with its icon
and text shown together. The dashboard then fades in as one layout, without
staggered placeholder flashes. Reduced-motion users see it without the fade.
Subsequent weather refreshes keep the dashboard visible; loading failures reveal
the existing error message and retry action.

## Stack

- Nuxt 4
- Vue 3
- TypeScript
- Nuxt UI
- Open-Meteo and geocoding APIs via Nitro server routes

## Favorites

On desktop, use the visible **Search a city** field or its attached **Saved cities**
button. Search shows autocomplete suggestions as you type; the button shows the saved-city count
and opens only favorites management. On phones and portrait tablets, open **Search and saved
cities** to access the same features. Search results appear in a separate section
above the favorites controls and saved cities in the mobile picker. Selecting a
city clears the search. Closing the mobile picker or pressing Escape in desktop
search also clears it; leaving the desktop input preserves the query. On phones
and portrait tablets, language and theme controls are available under
**Settings**. Choose **System** to follow your device's light or dark appearance,
or select **Light** or **Dark** to set it manually.

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

To run browser tests against a served production build instead of the development
server, set `PLAYWRIGHT_BASE_URL` to its URL, including the trailing slash and
repository subpath when applicable:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000/weather-now/ pnpm test:e2e tests/e2e/language-persistence.spec.ts
```
