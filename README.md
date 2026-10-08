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
- Open-Meteo weather and geocoding services via the selected API mode

## Responsive layout modes

The layout follows the available viewport space rather than a device name.
Dashboard and toolbar modes are selected independently and update when the
window is resized or the device rotates.

### Forecast layout

| Mode | Viewport condition | Behavior |
| --- | --- | --- |
| Single-column | Width below `48rem` (768px) | Cards stack vertically and the page scrolls naturally. |
| Two-column | Width at least `48rem` (768px), unless dense mode qualifies | Cards flow in two columns; the daily forecast and sun-hours chart span both columns. The page scrolls naturally. |
| Dense dashboard | Width at least `80rem` (1280px) **and** height at least `56rem` (896px) | Cards use a 12-column grid with content-driven minimum row heights. The forecast area scrolls internally when content needs more space. |

A wide but short window still uses the flowing layout: width alone does not
activate the dense dashboard. Hourly forecasts and charts retain horizontal
scrolling where needed, and chart value labels have reserved vertical space
independent of the plot height.

### Header and favorites

| Mode | Viewport condition | Behavior |
| --- | --- | --- |
| Desktop toolbar | Landscape orientation, width at least `64rem` (1024px), **and** height at least `31rem` (496px) | Search, language, and theme controls are expanded. Favorites management opens in a bounded popover. |
| Compact landscape header | Landscape orientation, width at least `30rem` (480px), **and** height at most `30rem` (480px) | Essential controls fit in one row, with language and theme under **Settings**. Outside dense mode, the header scrolls away naturally with the page. |
| Default header | Neither toolbar condition matches | Search uses the mobile picker; language and theme are under **Settings**. |

Whenever the desktop toolbar is inactive, favorites open in a fluid drawer
that fills the available width and respects dynamic viewport height and
safe-area insets. This includes portrait tablets, even when they are wider
than 1024px.

For example, a Pixel 7-sized viewport at 412 x 915 uses stacked cards and the
default header; rotating to 915 x 412 gives it two columns and the compact
header. An 11-inch iPad-sized viewport at 1194 x 834 uses two columns with the
desktop toolbar, not the dense dashboard. A 1440 x 1000 landscape viewport
qualifies for both the dense dashboard and desktop toolbar.

Dimensions are CSS viewport sizes, not physical screen pixels. Pixel
equivalents above assume 16px per `rem`; the implemented thresholds use `rem`.

## Favorites

In desktop-toolbar mode, use the visible **Search a city** field or its attached
**Saved cities** button. Search shows autocomplete suggestions as you type; the
button shows the saved-city count and opens only favorites management. In other
header modes, open **Search and saved cities** to access the same features.
Search results appear in a separate section
above the favorites controls and saved cities in the mobile picker. Selecting a
city clears the search. Closing the mobile picker or pressing Escape in desktop
search also clears it; leaving the desktop input preserves the query. Without
the desktop toolbar, language and theme controls are available under **Settings**.
Choose **System** to follow your device's light or dark appearance,
or select **Light** or **Dark** to set it manually.

Favorites automatically follow the selected language, including cities saved
before multilingual favorites were introduced. Names are stored on your device
for offline language switching. Existing favorites are updated when the app
opens; if a lookup fails, the original city is kept and the favorites menu offers
a retry. Stored labels and favorite data are preserved when a lookup fails.

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
For Worker observability settings, data handling, manual checks, and rollback
steps, see its
[observability runbook](workers/weather/README.md#observability-and-operations).

## API modes

`NUXT_PUBLIC_API_MODE` is read at build time:

| Mode | Forecast and location services | Used by |
| --- | --- | --- |
| `server` (default) | Nuxt server routes under `/api`; provider calls stay server-side and do not depend on Cloudflare | `pnpm dev`, `pnpm build` |
| `external` | Forecasts and location search call Open-Meteo from the browser; IP and reverse geocoding use their existing direct-provider paths | Static fallback |
| `worker` | `NUXT_PUBLIC_API_BASE_URL` (`/weather`, `/locations`, `/locations/{id}`, `/ip-location`) | GitHub Pages |

`worker` mode requires `NUXT_PUBLIC_API_BASE_URL` to be an absolute http(s) URL
without query or fragment; the build fails otherwise. Unknown modes also fail.

In `worker` mode, forecasts, location search, favorite-name localization, and IP
location use the Worker. Search uses
`GET /locations?q=<name>&language=en|de&count=1..100` (default language `en`,
count `5`); favorite lookups use
`GET /locations/{id}?language=en|de`. Both location responses use the
`{ results: [...] }` shape. Unknown saved IDs are reported as not found, and
failed lookups keep the saved favorite and its labels intact.

The only direct provider request in production Worker mode is BigDataCloud
reverse geocoding for the current device position. It runs in the browser
because the free endpoint rejects server-side requests. Favorites do not call
BigDataCloud in Worker mode: legacy entries without an ID are matched using
their saved name, country, administrative area, and coordinates against
Open-Meteo search results. Ambiguous or unmatched entries remain usable as
saved and show a recoverable localization error. Worker mode does not call
`api.open-meteo.com`, `geocoding-api.open-meteo.com`, or `ipinfo.io` from the
browser.

Worker requests are never retried automatically. A `429` shows a rate-limit
message and pauses further Worker API requests for the
`Retry-After` delay, or 60 seconds if the header is missing or malformed. The
Worker exposes that header to the allowed browser origin through CORS. A `503`
shows a temporary-unavailability message; other errors keep the relevant
forecast, search, or favorite-localization message.

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
