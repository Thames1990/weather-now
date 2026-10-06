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
The 7-day forecast keeps consistent column widths when switching cities, with
long condition labels wrapping and horizontal scrolling on narrow screens.

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
deploy to https://weather.mohrworks.com/ only after all checks pass;
pull requests never deploy. The workflow builds for the site root in `worker`
API mode with `NUXT_PUBLIC_API_BASE_URL=https://api.mohrworks.com`, so forecasts
and city search go through the [weather Worker](workers/weather/README.md).

## API modes

`NUXT_PUBLIC_API_MODE` is read at build time:

| Mode | Forecast and search | Used by |
| --- | --- | --- |
| `server` (default) | Nuxt server routes under `/api` | `pnpm dev`, `pnpm build` |
| `external` | Open-Meteo directly from the browser | Static fallback |
| `worker` | `NUXT_PUBLIC_API_BASE_URL` (`/weather`, `/locations`) | GitHub Pages |

`worker` mode requires `NUXT_PUBLIC_API_BASE_URL` to be an absolute http(s) URL
without query or fragment; the build fails otherwise. Unknown modes also fail.
The Worker does not cover reverse geocoding, IP location, or localized favorite
labels, so outside `server` mode those still call Open-Meteo, BigDataCloud, and
ipinfo directly. Worker search results are English only.

Worker requests are never retried automatically. A `429` shows a rate-limit
message and pauses further Worker requests for the `Retry-After` delay, or 60
seconds if the browser cannot read it (the Worker does not currently expose that
header via CORS). A `503` shows a temporary-unavailability message; network and
other errors keep the existing forecast/search error messages.

In the repository settings, set **Pages → Source** to **GitHub Actions** once
before the first deployment, then set **Pages → Custom domain** to
`weather.mohrworks.com` and enforce HTTPS. In DNS, create a DNS-only `CNAME`
record `weather` pointing to `thames1990.github.io`. No `CNAME` file is needed
for Actions-based deployments.

## Validation

```bash
pnpm lint
pnpm test
pnpm build
```

To reproduce the GitHub Pages static production build:

```bash
NUXT_PUBLIC_API_MODE=worker NUXT_PUBLIC_API_BASE_URL=https://api.mohrworks.com pnpm generate
```

To run browser tests against a served production build instead of the development
server, set `PLAYWRIGHT_BASE_URL` to its URL, including the trailing slash:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000/ pnpm test:e2e tests/e2e/language-persistence.spec.ts
```
