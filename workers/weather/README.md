# Weather API Worker

Separate Cloudflare Worker for the existing **api** service at
**https://api.mohrworks.com**. The Pages frontend, Nuxt server routes, and
`NUXT_PUBLIC_API_MODE=external` remain unchanged. The backend is active in
production as version `06493413-ffbe-42df-bf51-4a75cde59ffd` (October 6, 2026),
which adds localized/ID location lookups and `/ip-location`. Deployment status
confirms 100% traffic, and the existing custom domain remains attached to `api`
in the production environment. Health, Berlin forecast, default and German
search, ID lookup (known and unknown), IP location, invalid input, and allowed
and denied CORS origins passed production smoke checks. Its rollback version
is the first backend release, `eb40b221-ad8a-432d-b46f-ff6c4e746d7a`; the
original Hello World version is `a53035d0-f185-4dc2-b752-048fe5ba98a5`.

The first attempt (`c231d12f-7d85-47a8-83c3-4447c67829a8`) was immediately
rolled back after health still returned Hello World. An authorized retry
succeeded after checking propagation with no-cache requests. The precise cause
of the first attempt's stale response was not established.
The Worker imports only framework-independent validation, normalization, and
type contracts from `app/`; it does not bundle Nuxt or Nitro.

## Local setup and checks

Run from the repository root (Node 22.12 or newer supported by Wrangler/Vitest):

```bash
pnpm --dir workers/weather install --frozen-lockfile
pnpm --dir workers/weather typecheck
pnpm --dir workers/weather test
pnpm --dir workers/weather build
pnpm --dir workers/weather dev
```

The Worker has its own manifest, lockfile, and pnpm configuration, so installing
it does not change the Pages dependency graph. Its pnpm configuration permits
the required esbuild and workerd install scripts. `build` is only
`wrangler deploy --dry-run`: it does not publish.
Run repository lint with `pnpm exec eslint workers/weather`.

Wrangler serves http://localhost:8787 with locally simulated rate-limit
bindings. A small number of non-destructive smoke requests:

```bash
curl -i http://localhost:8787/health
curl -i 'http://localhost:8787/weather?latitude=52.52&longitude=13.40'
curl -i 'http://localhost:8787/locations?q=Berlin'
curl -i 'http://localhost:8787/locations?q=Berlin&language=de&count=100'
curl -i 'http://localhost:8787/locations/2950159?language=de'
curl -i http://localhost:8787/ip-location
curl -i 'http://localhost:8787/weather?latitude=91&longitude=0'
curl -i -H 'Origin: https://weather.mohrworks.com' http://localhost:8787/health
```

Local API requests still use the public providers and count toward their quotas.
Routine tests use mocked fetch, bindings, and clocks, never live APIs. Local
frontend browser origins are deliberately not allowed; use curl for local API
checks. The frontend uses this Worker in its `worker` API mode; see the
[root README](../../README.md#api-modes).

## HTTP contract

Only GET and restricted OPTIONS preflight are supported. Unknown paths return
404; unsupported methods return 405 with `Allow: GET, OPTIONS`.
All responses use `Cache-Control: no-store`. No caching or retries are enabled.
Only `https://weather.mohrworks.com` receives CORS permission, without
credentials or custom request headers. Other browser origins receive 403.
Requests without Origin (including mobile/native clients) are allowed but still
rate limited. **CORS is neither authentication nor abuse protection.** Public
weather data does not require user accounts or client-side secrets.

| Endpoint | Query | Successful JSON |
| --- | --- | --- |
| `/health` | None | `{"status":"ok"}` |
| `/weather` | Required latitude [-90, 90], longitude [-180, 180] | Existing `WeatherResponse` contract |
| `/locations` | Required `q`, trimmed length 2-100; optional `language`, `count` | `{"results":[LocationResult,...]}` |
| `/locations/{id}` | Optional `language` | `{"results":[LocationResult]}` |
| `/ip-location` | None | `IpLocation` (see below) |

Coordinates must be finite decimal strings (maximum 24 characters); empty
values, exponent/hex notation, repeated parameters, and unknown parameters are
400 errors. Search rejects control characters.

`language` is optional on both location endpoints and must exactly match one of
the app's locales: `en` or `de`. It defaults to `en`, so existing callers keep
their behavior. `count` is optional on search: a plain integer from 1 to 100
without leading zeros, defaulting to 5. The Worker rejects provider responses
that contain more results than requested. Names fall back to the provider-native
name when no translation exists. No matches return `{"results":[]}`, not an
error.

`/locations/{id}` looks up an Open-Meteo/GeoNames location ID with geocoding
`/v1/get`. The ID must be a positive safe integer written in decimal without
leading zeros, with no trailing path segment. The provider returns one bare
location object; the Worker requires its `id` to match the requested ID and
wraps it in the search contract, so `parseGeocodingResults` handles both
endpoints. Open-Meteo answers an unknown ID with HTTP 400
`{"reason":"Location ID not found.","error":true}`, which the Worker maps to
404 `location_not_found`. Any other provider 400 remains a 502.

Example location response:

```json
{
  "results": [{
    "id": 2950159,
    "name": "Berlin",
    "country": "Germany",
    "latitude": 52.52,
    "longitude": 13.41,
    "timezone": "Europe/Berlin",
    "admin1": "Berlin"
  }]
}
```

`LocationResult` has optional `id` and `admin1`. A missing provider country
becomes an empty string, matching the existing app contract.

### IP location

`/ip-location` returns the approximate location Cloudflare assigns to the
connecting IP (`request.cf`). It makes no third-party request and sends the
client IP nowhere. The shape matches `parseIpLocationResult`:

```json
{"name":"Berlin","region":"Land Berlin","country":"DE","latitude":52.52437,"longitude":13.41053}
```

`name` (city) and `country` (ISO 3166-1 alpha-2) are empty strings when
Cloudflare does not provide them. `region` appears only when known. When
Cloudflare provides no valid latitude/longitude (for example, in some local or
non-edge contexts), the Worker returns 503 `ip_location_unavailable`. It never
returns a guessed location.

**Accuracy differs from ipinfo.io**, the source behind the current frontend and
Nuxt route. Cloudflare's IP geolocation is approximate (often city-level or
coarser), may resolve to the ISP's location or a VPN/relay exit, and can differ
from ipinfo's database. Treat it as a coarse fallback after denied browser
geolocation, not a precise position. The endpoint counts against the per-client
limit only; it does not use the provider limit.

Weather uses the field lists in `src/index.ts`, matching the existing Nuxt route:
current conditions, hourly forecast, and seven daily forecasts. Temperatures
are Celsius, wind speeds km/h, precipitation mm, probabilities/humidity percent,
sunshine duration seconds, and wind direction degrees. `current.time`,
`hourly.time`, `daily.sunrise`, and `daily.sunset` are UTC ISO instant strings;
`daily.time` contains local `YYYY-MM-DD` dates. `timezone` is the provider's
timezone identifier. Provider metadata (including `utc_offset_seconds` and unit
objects) may also be present, as with existing normalization; consumers should
use the stable fields defined in `app/types/weather.ts`.

Errors have one shape, e.g.:

```json
{"error":{"code":"invalid_request","message":"Coordinates are outside supported bounds"}}
```

| Status | Codes | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Invalid input |
| 403 | `origin_not_allowed`, `preflight_not_allowed` | Browser request denied |
| 404 | `not_found`, `location_not_found` | Path unsupported / unknown location ID |
| 405 | `method_not_allowed` | Method unsupported |
| 429 | `rate_limited`, `upstream_rate_limited` | Local edge or provider limit; `Retry-After: 60` |
| 502 | `upstream_network`, `upstream_status`, `upstream_invalid` | Network, non-2xx, JSON/schema or size failure |
| 503 | `rate_limit_unavailable` | Missing or failed abuse protection; no provider request |
| 503 | `ip_location_unavailable` | Cloudflare supplied no valid edge geolocation |
| 504 | `upstream_timeout` | Eight-second total provider deadline |
| 500 | `internal_error` | Unexpected internal failure |

The eight-second deadline covers response headers **and body consumption**.
Bodies are limited to 1 MB. Redirects are rejected. Upstream URLs are fixed to
`api.open-meteo.com/v1/forecast`,
`geocoding-api.open-meteo.com/v1/search`, and
`geocoding-api.open-meteo.com/v1/get`; callers cannot supply destinations,
field lists, credentials, or forecast lengths. Provider errors and exception
details are not echoed to clients.

## Provider terms and deployment prerequisites

Authoritative sources checked October 6, 2026:
[forecast contract](https://open-meteo.com/en/docs),
[geocoding contract](https://open-meteo.com/en/docs/geocoding-api),
[terms](https://open-meteo.com/en/terms), and
[licence](https://open-meteo.com/en/licence).

The **free endpoints are non-commercial only**, with **less than 10,000 calls
per day, 5,000 per hour, and 600 per minute**. Advertising, subscriptions,
commercial products, and promotional activities are commercial examples in
the terms. Data requires CC BY 4.0 attribution to Open-Meteo; geocoding data is
based on GeoNames. Verify attribution in every consumer before release.
The provider can block misuse, provides no availability/accuracy warranty,
and may retain logs including coordinates for 90 days.

**Do not deploy until the owner confirms non-commercial eligibility and an
operational quota budget across all consumers**, including the existing
frontend's direct API calls. If commercial or higher-volume use is intended,
obtain a suitable provider plan and implement its authenticated server-side
contract first. This implementation has no paid-provider mode or API key.

### Reverse geocoding is not proxied

The frontend currently calls BigDataCloud's free
`api.bigdatacloud.net/data/reverse-geocode-client` endpoint from the browser.
This Worker deliberately provides **no `/reverse-geocode` endpoint**. BigDataCloud's
[free client-side API page](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api)
and [fair use policy](https://www.bigdatacloud.com/docs/article/fair-use-policy-for-free-client-side-reverse-geocoding-api)
(checked October 6, 2026) require these calls to come directly from the client,
using the device's current location from standard platform location APIs.
Server-side calls to the client endpoint are prohibited and can cause an IP
ban, which returns HTTP 402. A Worker proxy would make every user share
Cloudflare egress IPs under one ban. BigDataCloud directs server-side use to
its keyed [Reverse Geocode to City API](https://www.bigdatacloud.com/reverse-geocoding/reverse-geocode-to-city-api),
which requires an account/API key and plan quota. Labeling stored favorite
coordinates may also fall outside the client endpoint's current-location rule.

Options, which require an owner decision:

1. **BigDataCloud server-side API (recommended if keeping this provider):** add
   an API key as a Wrangler secret, fail closed without it, and keep the same
   validation, limits, and response contract as `parseReverseGeocodeResult`.
   Confirm the plan's quota and terms first.
2. **Avoid reverse geocoding for favorites:** favorites with an Open-Meteo ID
   already localize through `/locations/{id}`. Only use reverse geocoding for
   the device's current position, called directly by the browser under the
   fair use policy.
3. Another provider with explicit server-side terms (for example, OSM
   Nominatim's usage policy: max 1 request/second, identifying User-Agent,
   attribution). This adds a new provider and its own compliance review.

## Abuse protection and operational limits

Cloudflare's [native rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
is configured in `wrangler.jsonc`: **20 requests/minute per client IP** across
all data endpoints (weather, both location endpoints, and IP location), plus
**60 provider requests/minute in aggregate** for endpoints that call Open-Meteo.
The client IP comes from Cloudflare's edge `CF-Connecting-IP`; absent IPs share
one anonymous bucket. IPs are not logged. Shared NATs can share the client cap.
Health and preflight do not call providers and are excluded from these caps.
Missing/failed bindings cause 503: there is no unprotected fallback.

**These are permissive, eventually consistent limits per Cloudflare location,
not global counters or exact provider-quota accounting.** Distributed traffic
can exceed them globally; 60/minute sustained can also exceed daily quotas.
They provide practical initial burst protection, not a guarantee against
distributed abuse or quota exhaustion. No caching or distributed state layer
is added. Before deployment, reserve unique namespace IDs `1001` and `1002`
in the account (change them if already used), confirm binding availability,
and arrange traffic/quota monitoring plus an operator who can disable the
data endpoints or roll back if the budget is at risk. A globally guaranteed
quota would require a separately designed centralized limiter.

Workers Logs are enabled. Automatic invocation logs are disabled to avoid
logging URLs containing coordinates/searches. Structured application errors
include only event, code, and status; no IP, query, body, or exception details.
Use `pnpm --dir workers/weather exec wrangler tail --format json` after
authentication to observe errors. Review Cloudflare dashboard log/trace and
retention settings for request metadata before publishing. No Sentry DSN or
placeholder integration is included.

## Manual deployment to the existing service

**Deployment requires authorization.** The authorized rollout and production
verification above are complete; further changes still require authorization.
No secrets/env variables are required by this free-provider implementation.
Use interactive `wrangler login` locally, or a least-privilege
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the operator's environment.
Never put credentials in committed files or browser/mobile clients.
Local secrets, if needed later, belong in ignored `.dev.vars`.

After authorization and prerequisites above:

1. Authenticate with `pnpm --dir workers/weather exec wrangler login` and verify
   the intended account with `pnpm --dir workers/weather exec wrangler whoami`.
2. In Cloudflare, verify the existing **api** Worker already owns
   **api.mohrworks.com**. Record its current deployment/version ID for rollback,
   and inspect existing bindings/settings before replacing Hello World.
3. Run the checks above, then `pnpm --dir workers/weather deploy`.
   The name is already `api`; do not create a differently named Worker.
   No routes or custom domains are declared here: retain the existing dashboard
   custom-domain attachment, and verify it before and after publishing.
   `workers_dev` and preview URLs stay disabled.
4. Check `/health`, a Berlin forecast/search, localized search and ID lookup,
   `/ip-location`, invalid input, and CORS at
   `https://api.mohrworks.com`. Check rate-limit denial with controlled traffic
   and inspect Workers Logs. Do not reconfigure DNS, Pages, or frontend API mode.

For rollback, select the recorded pre-deployment version in the existing
Worker's dashboard, or use
`pnpm --dir workers/weather exec wrangler rollback <VERSION_ID>`.
Verify `/health`/Hello World as appropriate and the unchanged hostname
afterward. Rollback restores code, not necessarily changed bindings/settings;
restore any settings changed during rollout separately. Stop local Wrangler
with Ctrl-C when finished.
