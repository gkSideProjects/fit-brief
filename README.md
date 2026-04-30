# fit-brief

A TypeScript library that converts Garmin `.fit` files into a compact, LLM-optimised Markdown representation — designed to be pasted into a coaching conversation at a fraction of the token cost of the raw data, without losing the information a coach actually needs.

## The problem

I've been using LLMs to analyse cycling training data. My workflow is to drop `.fit` files into a conversation after rides and discuss the data. But the raw data from even a short 90-minute ride is ~242,000 tokens — mostly 1Hz sensor readings that burn through a lot of context without adding value.

## The solution

fit-brief extracts the training-relevant information and produces a compact Markdown brief:

**Before** (raw JSON, ~242k tokens):
```json
{
  "records": [
    { "timestamp": "2026-04-29T17:49:46Z", "power": 153, "heart_rate": 118, "cadence": 85, ... },
    { "timestamp": "2026-04-29T17:49:47Z", "power": 154, "heart_rate": 118, "cadence": 86, ... },
    // ... 5,349 more records
  ]
}
```

**After** (compact Markdown, ~656 tokens):
```markdown
# Activity Brief — 2026-04-29

## Summary
- **Duration**: 1:30:06
- **Avg power**: 152 W
- **Normalized power (NP)**: 177 W
- **IF**: 0.71 | **TSS**: 75

## Power Zones (FTP: 250 W)
| Zone | Label | Time |
| 1 | Z1 Active Recovery | 19:08 |
| 2 | Z2 Endurance | 1:06:57 |
...

## Auto-detected Efforts
| # | Start | Duration | Avg W | NP | Avg HR | Avg Speed | Work | Pa:Hr |
| 1 | 5:08 | 1:09:37 | 159 W | 160 W | 143 bpm | — | 665.7 kJ | +1.3% |
| 2 | 1:15:31 | 2:18 | 352 W | 381 W | 173 bpm | — | 48.6 kJ | — |

## Power-Duration Curve Highlights
| Duration | Peak Power |
| 0:05 | 405 W |
| 1:00 | 390 W |
| 1:00:00 | 167 W |
```

**99.7% token reduction.**

## How it works

```
.fit binary → parse() → RawActivity → toCompact() → CompactActivity → toMarkdown() → Markdown
```

Three stages: parse the binary, extract coaching-relevant metrics, serialise to Markdown.

## What it extracts

- **Summary**: duration, distance, work, avg/max/NP power, HR, cadence, TSS, IF, calories
- **Power zones**: Coggan 7-zone model from FTP
- **HR zones**: 5-zone model from max HR
- **Auto-detected efforts**: sustained efforts (60s+, above Z2 floor) and sprints (above 280% FTP), with grace periods to prevent fragmentation
- **Power-duration curve**: peak mean power at standard durations (5s to 1h)
- **Aerobic decoupling**: per-effort Pa:Hr drift with CV gate (only on steady efforts 20min+)

## Design decisions

- **Markdown over JSON**: Markdown is more token-efficient and LLMs parse it well. Tables compress structured data better than nested objects
- **Lossy by design**: 1Hz data is discarded after extraction. The extractors do the numeric analysis; the LLM does the coaching interpretation
- **Decoupling per effort, not per ride**: a hard 2-minute effort at the end of a steady ride would make ride-level decoupling meaningless. Per-effort calculation with a CV gate ensures it's only reported where it's useful
- **Duplicate timestamp merging**: Apple Watch + trainer setups produce multiple records per second from different sensors. These are merged at parse time so downstream extractors get clean 1-per-second data

## Setup

```bash
pnpm install
```

## Usage

```typescript
import { readFile } from 'node:fs/promises'
import { parse, toCompact, toMarkdown } from 'fit-brief'

const buffer = await readFile('ride.fit')
const activity = await parse(buffer)
const compact = toCompact(activity, { ftpW: 250, maxHrBpm: 201 })
const markdown = toMarkdown(compact)

console.log(markdown)
```

Or use the included script:

```bash
pnpm brief <path-to-file.fit> [ftpW] [maxHrBpm] [--timeseries]  # compact markdown
```

## Configuration

```typescript
toCompact(activity, {
  ftpW: 250,                // enables power zones, effort detection, TSS/IF
  maxHrBpm: 201,            // enables HR zones
  graceSeconds: 10,         // grace period for sustained effort detection (default: 10)
  includeTimeseries: false, // include 10s downsampled timeseries (default: false)
  resolutionSeconds: 10,    // timeseries resolution if enabled (default: 10)
})
```

## Limitations

- **Cycling only** — no running, swimming, or other sports in v1
- **Limited device testing** — only tested with .fit files exported from intervals.icu (Apple Watch via Health Sync). Other device chains (Garmin head unit, Wahoo, chest strap vs optical HR) may produce different field sets or data density