# JTO / SKT connection status — 2026-09-11

## Result

**No live SKT data was connected during this check.** The deployed service still reported `mode=estimated`, `source=ESTIMATED LIVE`, `provider.configured=false`, and `provider.state=disabled`. Adding an adapter or a relay is not evidence of receiving SKT data, and no accuracy of 80% or 90% has been validated.

## Executed checks

The repository now contains `.github/workflows/check-public-jto.yml`, a manually rerunnable, read-only diagnostic. It has no schedule, reads no secrets, and makes no changes to the application data.

- Run 1: https://github.com/kokoom94-ai/jeju-now-981/actions/runs/34569382124
- Run 2: https://github.com/kokoom94-ai/jeju-now-981/actions/runs/34569539967
- Run 2 observation began at `2026-09-11T06:20:57Z` (15:20:57 KST).

Observed results:

| Target | Result |
| --- | --- |
| Deployed `/health` | HTTP 200; estimated mode; provider disabled |
| Deployed `/api/v1/parks/981/skt/status` | HTTP 200; configured false; state disabled |
| `https://data.ijto.or.kr/robots.txt` | `gaierror: [Errno -3] Temporary failure in name resolution` |
| `https://www.visitjeju.net/robots.txt` | Same name-resolution error |

The diagnostic stopped collection from a host when its automated-access policy could not be retrieved. These results do **not** establish a worldwide site outage, an authentication requirement, or that a Korea-based company network will have the same failure. No unverified IP address, borrowed credential or disabled TLS validation was used.

The application was not switched to an SKT-labelled source, and no mock count was sent to production.

## Public sources checked

1. JTO FAQ: https://data.ijto.or.kr/bbs/BBSMSTR_000000000081/list.do
   It distinguishes 5-minute SKT real-time population from monthly visitor statistics.
2. Official Visit Jeju record for this park: https://www.visitjeju.net/kr/detail/view?contentsid=CNTS_200000000008633
   It shows a congestion badge and links to the official data map. A search-engine copy of the badge has no sufficiently verified source observation timestamp and was not treated as a current feed.
3. Linked data-map page: https://data.ijto.or.kr/bigdata/sub01.do?contentsid=CNTS_200000000008633
   No fresh, park-specific population JSON response was retrieved.
4. Existing `kokoom94-ai/mondak/scripts/collect_tourism.py` uses chart data such as monthly regional visits and card spending. That code does not establish access to this park's current SKT counts. Those statistics were not substituted for current occupancy.
5. Official SKT API guidance: https://puzzle.geovision.co.kr/faq
   It routes API users to SK open API and its individual product documentation; it does not provide an anonymous park-specific data credential.

## Implemented indirect route

`tools/relay-approved-jto.mjs` can send an **already authorized export** from the company-side data system to the existing authenticated ingest endpoint. It does not obtain access to JTO, discover an API, scrape a login session, or manufacture data.

```text
Authorized JTO/SKT export on the company side
    -> relay validates source timestamp, counts and agreed park area
    -> HTTPS POST /api/v1/ingest/skt
    -> existing service data pipeline
```

Required source record fields:

| Field | Required meaning |
| --- | --- |
| `parkId` | `981` |
| `source` | `JTO_SKT_REALTIME`, only for an actual JTO/SKT feed |
| `metric` | `instantaneous-population`, not daily arrivals or monthly visits |
| `scopeType` | `park-boundary`, only when the provider confirms that actual spatial coverage |
| `scopeId` | The provider-agreed area ID, matching `JTO_APPROVED_SCOPE_ID` |
| `observedAt` | Original ISO observation timestamp including timezone, no more than 15 minutes old |
| `people.total`, `people.locals`, `people.tourists` | Non-negative integer counts with locals + tourists = total |

**Do not relabel a surrounding 1,500-metre neighbourhood as the park boundary to pass validation.** If only neighbourhood data is available, it needs a separate neighbourhood indicator and must not replace the park headcount. Source metadata validation cannot independently verify the truth of provider-supplied data or prove physical accuracy.

The relay intentionally rejects missing demographic counts rather than inventing a 23% local-resident share. Contractual suppression or different demographic definitions require an explicitly revised data contract before use.

## Operation by the authorized data operator

Keep source JSON and secrets **outside the web project and outside GitHub**. The current server serves static files from its project directory. Configure `JTO_APPROVED_SCOPE_ID` and `INGEST_TOKEN` in the process environment; use the real Render ingest secret and do not paste it into a public log.

```bash
# Inspect an existing authorized export without transmitting it:
node tools/relay-approved-jto.mjs /private/jto/981.json --check

# Send that validated observation once:
node tools/relay-approved-jto.mjs /private/jto/981.json

# Run offline code tests; this sends nothing to production:
node tools/relay-approved-jto.mjs --self-test
```

The relay runs once and exits; no background schedule was installed. An authorized existing export job can call it when a new observation is produced. A stale file is not made current by sending it repeatedly.

## Tests and remaining gap

Offline tests ran on Node v22.16.0: **17 passed, 0 network requests, no production transmission**. They check data validation and mocked acknowledgements, not SKT availability, end-to-end delivery, or accuracy.

Remaining requirement: a permissioned source/export containing this park's timestamped SKT aggregate and its actual area definition. Once that source exists, an end-to-end receiving test is still required. No connection-complete or accuracy claim is justified before that test and subsequent validation.
