# Older changes
## 0.5.7 (2026-09-09)
* Repository maintenance: added Node.js 26 to the CI test matrix, updated `@iobroker/testing` to 6.1.0
* No user-facing changes


## 0.5.6 (2026-09-09)
* New: general daily notices from the school (e.g. special schedule, event day - VpMobil/Indiware `<ZusatzInfo><ZiZeile>`) are now parsed and exposed per day as `plan.day<N>.zusatzInfo` (multiple lines joined with " | "), and included as `zusatzInfo` in each entry of `plan.week.days`

## 0.5.5 (2026-09-06)
* Repository quality improvements: TypeScript type-checking (`npm run check`), release-script/adapter-dev tooling, updated `.vscode` settings, `admin/i18n` files converted to the short-format layout, and an updated `@iobroker/adapter-core`
* Fixed several type-safety issues found along the way (defensive null-guards, explicit type coercions)
* No user-facing changes

## 0.5.4 (2026-09-05)
* Homework list can now also include Moodle calendar entries (e.g. assignment due dates), in addition to Home.InfoPoint - see the new optional "Moodle calendar URL" setting
* Each `homework.entries` item is now tagged with `source: "homeinfopoint"` or `"moodle"`

## 0.5.3 (2026-09-05)
* Automated npm releases via trusted publishing (OIDC)
* Fixed CI pipeline (lint script, Node 22/24 test matrix)
* Dependency updates (fast-xml-parser 5, tough-cookie 6); adapter now requires admin >= 7.8.23

## 0.5.2 (2026-09-05)
* Fixed adapter metadata and dependency versions to meet current repository requirements; README translated to English
* Polling now reschedules itself only after the previous poll finishes (instead of a fixed interval), avoiding overlapping requests if a poll runs long
* Full admin UI translations (all supported languages) and a proper CI test/lint/integration workflow

## 0.4.3 (2026-09-05)
Initial release.
* Timetable (VpMobil/Indiware) as a real calendar school week (Monday-Friday, `plan.day1`-`plan.day5`) for EOSW/EGW/EOSH/EGL, including a bundled `plan.week.days` JSON
* Homework, remarks and grades (Home.InfoPoint) for all four schools, including grade averages per subject (`grades.subjects.<subject>.average`/`.averageNote`) and overall (`grades.overallAverage`/`.overallAverageNote`)
* Detection of new entries (`info.lastNewAt`/`info.newItemsCount`, `*.newCount`/`*.newEntries`) as a basis for your own notification automations
* Runs as a daemon (no cron job): immediate first poll, then a configurable interval
* School selection instead of free-form URL configuration - server addresses are hard-coded per school; the EOSH timetable address is marked as unconfirmed and logged accordingly on start
