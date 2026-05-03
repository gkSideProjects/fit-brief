import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from '../src/parse.js'
import { toCompact } from '../src/compact.js'
import type { CompactActivity } from '../src/types.js'
import { toHistoryLine } from '../src/serialise/history.js'

const args = process.argv.slice(2)
const dirPath = args[0]

if (!dirPath) {
  console.error('Usage: pnpm history <folder> [ftpW] [maxHrBpm] [outputFile]')
  process.exit(1)
}

const ftpW = Number(args[1]) || 200
const maxHrBpm = Number(args[2]) || 190
const outputPath = args[3] ?? 'training-history.md'

const files = (await readdir(dirPath)).filter((f) => f.endsWith('.fit')).sort()

if (files.length === 0) {
  console.error(`No .fit files found in ${dirPath}`)
  process.exit(1)
}

const compacts: CompactActivity[] = []
const lines: string[] = []
let failed = 0

for (const file of files) {
  try {
    const buffer = await readFile(join(dirPath, file))
    const activity = await parse(buffer)
    const compact = toCompact(activity, { ftpW, maxHrBpm })
    compacts.push(compact)
    lines.push(toHistoryLine(compact))
  } catch {
    failed++
    console.error(`  skipped: ${file}`)
  }
}

lines.sort()

const PD_DURATIONS = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200]

function buildPdBests(activities: CompactActivity[]): string[] {
  const best = new Map<number, { power: number; date: string }>()
  for (const a of activities) {
    const date = a.summary.startTime.toISOString().slice(0, 10)
    for (const p of a.pdCurveHighlights) {
      const cur = best.get(p.durationSeconds)
      if (!cur || p.powerW > cur.power) {
        best.set(p.durationSeconds, { power: p.powerW, date })
      }
    }
  }

  const rows: string[] = []
  for (const d of PD_DURATIONS) {
    const b = best.get(d)
    if (!b) continue
    const m = Math.floor(d / 60)
    const s = d % 60
    const label = d >= 60 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(d).padStart(2, '0')}`
    rows.push(`| ${label} | ${b.power}W | ${b.date} |`)
  }
  return rows
}

const pdRows = buildPdBests(compacts)
const pdSection = pdRows.length > 0
  ? ['## All-Time Power PBs', '| Duration | Power | Date |', '|----------|-------|------|', ...pdRows, '']
  : []

const header = [
  '# Training History',
  '',
  `${lines.length} rides | FTP: ${ftpW}W | Max HR: ${maxHrBpm}bpm`,
  '',
  ...pdSection,
]

await writeFile(outputPath, [...header, ...lines, ''].join('\n'))
console.log(`${lines.length} rides → ${outputPath}${failed > 0 ? ` (${failed} skipped)` : ''}`)
