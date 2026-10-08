# Weather API Worker

Separate Cloudflare Worker for the existing **api** service at
**https://api.mohrworks.com**. The Pages frontend, Nuxt server routes, and
`NUXT_PUBLIC_API_MODE=external` remain unchanged. The backend is active in
production as version `c94d80de-f49f-4b2f-88f8-e07c861ebf38` (October 7, 2026),
with 100% traffic on the existing custom domain. This version adds structured
request summaries and query-string redaction, and disables persistent Workers
Logs and Issues because Cloudflare retains sensitive request metadata.
Traces remain disabled. `/health` returned HTTP 200 after the deployment.
An isolated check verified Issues grouping but found retained location-ID
paths and selected headers; production was not fault-injected.
Earlier production smoke checks covered the Berlin forecast, default and
German search, ID lookup (known and unknown), IP location, invalid input, and
allowed and denied CORS origins. The original Hello World version is
`a53035d0-f185-4dc2-b752-048fe5ba98a5`.

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
credentials or custom request headers; that origin can read the `Retry-After`
response header. Other browser origins receive 403.
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
use the stable fields defined in `shared/weather/types.ts`.

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

## Observability and operations

Persistent Workers Logs, Issues, and native tracing are disabled because
available redaction does not satisfy the location privacy requirements.
Each invocation still emits exactly one structured
`event: "request"` summary with only `route`, `method`, `status`, error `code`,
`duration_ms`, `upstream_outcome`, `upstream_ms`, and deployment `version`.
The application summary uses route templates and does not include IPs, request
bodies, headers, provider payloads, coordinates, search terms, location IDs,
exception messages, or stacks. Stable error codes provide safe grouping context
without copying untrusted exception text.

Application summaries use `console.log` below HTTP 500 and `console.error` for
HTTP 500 and above. Cloudflare Workers Issues records error logs and groups
occurrences. An isolated check of the real handler with synthetic bindings
confirmed that validation (400), unknown-route (404), and rate-limit (429)
responses did not create issues. The `observability.issues.enabled` setting
requires Wrangler 4.134 or newer; this Worker uses Wrangler 4.147
([Issues documentation](https://developers.cloudflare.com/workers/observability/issues/)).
Local tests verify that one sanitized `console.error` summary is emitted for
unexpected 5xx failures and that expected 4xx responses use `console.log`.
An isolated Cloudflare Worker check on October 7, 2026 confirmed that handled
5xx responses are grouped without persistent logs: seven 500/503 requests
produced seven occurrences in one issue, with no duplicate occurrences or
issues from the preceding 4xx checks. Query values were redacted.
Occurrences retain raw request paths, including the synthetic location ID,
and selected headers
(`user-agent`, `cf-ipcountry`, and `cf-ray`). Errors are grouped under the
generic title `request`, without the original exception stack or the summary's
error code in occurrence details. Issues therefore does not yet meet the
location privacy and useful diagnostic-context requirements. The temporary
Worker was removed after verification; production was not fault-injected.
Issues is now disabled to stop new occurrences; existing occurrence details
may remain available for the documented seven-day retention period.
Invocation logs are disabled, and persistent custom log storage
is disabled because Cloudflare attaches sensitive request metadata to each log
event. The structured application summary is still emitted, but it is not
available in the dashboard's persistent Logs or Query Builder. `version` is
Cloudflare Version Metadata's deployment ID; local runs use `local`.
`redact_query_string` removes incoming query values from request-context
metadata, but does not redact request headers, geolocation fields, or path
segments. A real-time `wrangler tail` also includes that sensitive metadata;
do not use it for routine production debugging while this privacy limitation
remains.

**Notifications are not configured.** The account was inspected on October 7,
2026; no existing Issues notification destinations or automations were found.
Cloudflare Issues supports automations to external
destinations, but this change does not create an account, integration, or relay.
Issues is disabled for privacy, so it is not an active investigation baseline.
Verify adequate metadata redaction and a suitable destination before enabling
Issues or notifications.

### Sampling, tracing, and privacy

Persistent Workers Logs are disabled (`observability.logs.persist: false`).
Application log sampling is configured to 1.0, but no application log events
are persisted for dashboard queries. Issues is also disabled
(`observability.issues.enabled: false`): the isolated check found that it
independently retains location-ID paths and selected request headers.
Disabling persistent logs alone does not disable Issues occurrence storage.
Use existing aggregate Worker metrics and manual checks while privacy-safe
diagnostics remain unavailable. See [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
and [Observability pricing](https://developers.cloudflare.com/observability/pricing/).

Cloudflare attaches request-context metadata to custom log events in addition
to the application summary. A production tail confirmed that this metadata
includes client IP headers and IP-geolocation fields (including city and
coordinates), as well as the request path. Query redaction is enabled and
removes query values from the incoming URL, but `/locations/{id}` can still
expose the location ID in the path. Cloudflare's available redaction setting
covers query strings, not request headers, geolocation fields, or path
segments. Persistent Workers Logs have therefore been disabled until adequate
redaction is available. The earlier deployed version did not redact query
strings; its existing log events may remain queryable until the account's
retention period expires.

Native tracing is explicitly disabled. Cloudflare's documented automatic
attributes include incoming `url.full`/`url.query`, request metadata, and
outbound fetch `url.full`/`url.query`. The weather provider URL contains
coordinates and geocoding URLs contain search text or location IDs. Query
redaction does not remove path segments, so these attributes cannot be made
privacy-safe by lowering the head-sampling rate; therefore production tracing
is not enabled. Do not enable it unless Cloudflare provides a way to exclude
or redact those attributes and that behavior has been verified against a real
span. This review uses Cloudflare's published
[span and attribute list](https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/);
no production trace was enabled or inspected. Issues is also disabled because
its independently retained occurrence metadata includes raw location-ID paths
and selected headers.

### Manual checks and recovery

- Check `https://api.mohrworks.com/health`; expect HTTP 200 and
  `{"status":"ok"}`.
- Load `https://weather.mohrworks.com/` and verify the dashboard loads.
- Check [Open-Meteo status](https://status.open-meteo.com/) for provider
  incidents and [GitHub status](https://www.githubstatus.com/) for Pages or
  Actions incidents; check [Cloudflare status](https://www.cloudflarestatus.com/)
  for Worker platform incidents.
- Review existing aggregate Worker metrics and manual checks. Persistent Logs
  and Issues are disabled pending adequate request-metadata redaction.
- Roll back the Worker to a recorded healthy version with
  `pnpm --dir workers/weather exec wrangler rollback <VERSION_ID>`.
- Roll back Pages by redeploying the previous known-good commit through the
  repository's Pages workflow.

There are no independent uptime probes: complete DNS, hosting, or application
outages may be found only by the maintainer or users. The DNS-only GitHub Pages
site also has no browser telemetry, so client-side JavaScript errors and
real-user frontend performance are not visible to Workers Observability.

## Automated production deployment

`.github/workflows/deploy-worker.yml` is independent of the GitHub Pages
workflow. Every pull request targeting `main` reports the required
`Validate Worker` check. Worker-related changes run lint, type-checking, tests,
and a Wrangler dry-run build; unrelated PRs report success without running
those checks. Relevant changes include the Worker, its shared source imports,
dependency/lint configuration, and its workflow; see the
[workflow overview](../../.github/workflows/README.md).
These jobs receive no Cloudflare credentials and never publish. Changes to
`workers/weather/**` or `shared/weather/**` pushed to `main` run the full
checks and then deploy the
existing **api** Worker. The `main` branch requires successful status checks
for pull requests but does not require changes to arrive through a pull
request: direct pushes to `main` are allowed and trigger the same workflows.
Worker deployments still wait for Worker validation and the production
Environment approval. Manual Worker workflow runs validate only and never
deploy. Deployments are serialized and record
`Deploy <short SHA>: <commit subject>` in Cloudflare's deployment history.

Before the first deployment, configure the GitHub **production** Environment
with required reviewers (and prevent self-review where available) so the
deploy job pauses for approval. Add
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as Environment secrets.
Create the token for the Cloudflare account containing the existing **api**
Worker, scoped to that Worker with the **Editor** role (legacy permission:
**Workers Scripts: Edit**). Do not grant Workers Routes Write: the Wrangler
configuration intentionally leaves the existing dashboard-managed
`api.mohrworks.com` custom-domain attachment unchanged. Keep these credentials
out of repository-level secrets and local files.

To deploy through a pull request, wait for its checks and merge it; to deploy
through a direct push, push the Worker change to `main`. Both paths require
Worker validation and production Environment approval before publishing. A
manual workflow run can be used to validate a selected branch, but not to
deploy. For recovery, roll back to a recorded healthy version using the
procedure below; rerunning the workflow does not roll back.

## Manual rollback

Use the Cloudflare dashboard to roll back to a recorded healthy version, or
use an authorized operator's Wrangler session:
`pnpm --dir workers/weather exec wrangler rollback <VERSION_ID>`.
Treat rollback as an emergency recovery action, not a routine deployment.
Verify `/health` and the unchanged hostname afterward. Rollback restores code,
not necessarily changed bindings/settings; restore any settings changed during
rollout separately.
