import type { CompactActivity, Effort, PdPoint, TimeseriesPoint, ZoneTime } from '../types.js'

/**
 * Serialise a CompactActivity to a Markdown string optimised for LLM consumption.
 * The output is deterministic: same input → identical output.
 */
export function toMarkdown(activity: CompactActivity): string {
  const sections: string[] = [
    header(activity),
    summarySection(activity),
    powerZonesSection(activity),
    hrZonesSection(activity),
    effortsSection(activity),
    pdCurveSection(activity),
    timeseriesSection(activity),
  ]

  return sections.filter(Boolean).join('\n\n') + '\n'
}

function header(a: CompactActivity): string {
  const date = a.summary.startTime.toISOString().slice(0, 10)
  return `# Activity Brief — ${date}\n\n_format_version: ${a.formatVersion}_`
}

function summarySection(a: CompactActivity): string {
  const s = a.summary
  const lines = [
    '## Summary',
    `- **Date**: ${s.startTime.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    `- **Duration**: ${formatDuration(s.durationSeconds)}`,
    `- **Distance**: ${s.distanceKm.toFixed(1)} km`,
    `- **Elevation gain**: ${Math.round(s.elevationGainM)} m`,
    `- **Work**: ${s.workKj.toFixed(0)} kJ`,
  ]

  if (s.caloriesKcal !== undefined) lines.push(`- **Calories**: ${s.caloriesKcal} kcal`)
  if (s.avgPowerW !== undefined) lines.push(`- **Avg power**: ${s.avgPowerW} W`)
  if (s.normalizedPowerW !== undefined) lines.push(`- **Normalized power (NP)**: ${s.normalizedPowerW} W`)
  if (s.maxPowerW !== undefined) lines.push(`- **Max power**: ${s.maxPowerW} W`)
  if (s.avgHeartRateBpm !== undefined) lines.push(`- **Avg HR**: ${s.avgHeartRateBpm} bpm`)
  if (s.maxHeartRateBpm !== undefined) lines.push(`- **Max HR**: ${s.maxHeartRateBpm} bpm`)
  if (s.avgCadenceRpm !== undefined) lines.push(`- **Avg cadence**: ${s.avgCadenceRpm} rpm`)
  if (s.avgSpeedKph !== undefined) lines.push(`- **Avg speed**: ${s.avgSpeedKph.toFixed(1)} km/h`)
  if (s.intensityFactor !== undefined) lines.push(`- **Intensity factor (IF)**: ${s.intensityFactor.toFixed(2)}`)
  if (s.trainingStressScore !== undefined) lines.push(`- **TSS**: ${s.trainingStressScore.toFixed(0)}`)

  return lines.join('\n')
}

function powerZonesSection(a: CompactActivity): string {
  if (a.powerZones.zones.every((z) => z.seconds === 0)) return ''

  const header = a.powerZones.ftpW
    ? `## Power Zones (FTP: ${a.powerZones.ftpW} W)`
    : '## Power Zones'

  return [header, zoneTable(a.powerZones.zones)].join('\n')
}

function hrZonesSection(a: CompactActivity): string {
  if (a.hrZones.zones.every((z) => z.seconds === 0)) return ''

  const header = a.hrZones.maxHrBpm
    ? `## HR Zones (max HR: ${a.hrZones.maxHrBpm} bpm)`
    : '## HR Zones'

  return [header, zoneTable(a.hrZones.zones)].join('\n')
}

function zoneTable(zones: readonly ZoneTime[]): string {
  const rows = zones
    .filter((z) => z.seconds > 0)
    .map((z) => `| ${z.zone} | ${z.label} | ${formatDuration(z.seconds)} |`)

  if (rows.length === 0) return '_No time in zones recorded._'

  return ['| Zone | Label | Time |', '|------|-------|------|', ...rows].join('\n')
}

function effortsSection(a: CompactActivity): string {
  if (a.efforts.length === 0) return ''

  const rows = a.efforts.map((e, i) => effortRow(i + 1, e))
  return [
    '## Auto-detected Efforts',
    '| # | Start | Duration | Avg W | NP | Avg HR | Avg Speed | Work | Pa:Hr |',
    '|---|-------|----------|-------|----|--------|-----------|------|-------|',
    ...rows,
  ].join('\n')
}

function effortRow(n: number, e: Effort): string {
  const start = formatDuration(e.startOffsetSeconds)
  const dur = formatDuration(e.durationSeconds)
  const avgP = e.avgPowerW !== undefined ? `${e.avgPowerW} W` : '—'
  const np = e.normalizedPowerW !== undefined ? `${e.normalizedPowerW} W` : '—'
  const hr = e.avgHrBpm !== undefined ? `${e.avgHrBpm} bpm` : '—'
  const speed = e.avgSpeedKph !== undefined ? `${e.avgSpeedKph} km/h` : '—'
  const decoup = e.aerobicDecoupling !== undefined
    ? `${e.aerobicDecoupling >= 0 ? '+' : ''}${e.aerobicDecoupling}%`
    : '—'
  return `| ${n} | ${start} | ${dur} | ${avgP} | ${np} | ${hr} | ${speed} | ${e.workKj} kJ | ${decoup} |`
}

function pdCurveSection(a: CompactActivity): string {
  if (a.pdCurveHighlights.length === 0) return ''

  const rows = a.pdCurveHighlights.map((p) => pdRow(p))
  return [
    '## Power-Duration Curve Highlights',
    '| Duration | Peak Power |',
    '|----------|------------|',
    ...rows,
  ].join('\n')
}

function pdRow(p: PdPoint): string {
  return `| ${formatDuration(p.durationSeconds)} | ${p.powerW} W |`
}

function timeseriesSection(a: CompactActivity): string {
  if (a.timeseries.length === 0) return ''

  const cols = detectColumns(a.timeseries)
  const header = buildTimeseriesHeader(cols)
  const rows = a.timeseries.map((p) => timeseriesRow(p, cols))

  return ['## Coarse Time-Series (10 s resolution)', header.header, header.sep, ...rows].join('\n')
}

type TimeseriesCol = 'powerW' | 'heartRateBpm' | 'cadenceRpm' | 'speedKph' | 'altitudeM'

function detectColumns(points: readonly TimeseriesPoint[]): readonly TimeseriesCol[] {
  const cols: TimeseriesCol[] = []
  if (points.some((p) => p.powerW !== undefined)) cols.push('powerW')
  if (points.some((p) => p.heartRateBpm !== undefined)) cols.push('heartRateBpm')
  if (points.some((p) => p.cadenceRpm !== undefined)) cols.push('cadenceRpm')
  if (points.some((p) => p.speedKph !== undefined)) cols.push('speedKph')
  if (points.some((p) => p.altitudeM !== undefined)) cols.push('altitudeM')
  return cols
}

const COL_LABEL: Record<TimeseriesCol, string> = {
  powerW: 'Power (W)',
  heartRateBpm: 'HR (bpm)',
  cadenceRpm: 'Cadence (rpm)',
  speedKph: 'Speed (km/h)',
  altitudeM: 'Alt (m)',
}

function buildTimeseriesHeader(cols: readonly TimeseriesCol[]): { header: string; sep: string } {
  const labels = ['Time', ...cols.map((c) => COL_LABEL[c])]
  const header = `| ${labels.join(' | ')} |`
  const sep = `|${labels.map(() => '---').join('|')}|`
  return { header, sep }
}

function timeseriesRow(p: TimeseriesPoint, cols: readonly TimeseriesCol[]): string {
  const time = formatDuration(p.offsetSeconds)
  const values = cols.map((c) => {
    const v = p[c]
    return v !== undefined ? String(v) : '—'
  })
  return `| ${[time, ...values].join(' | ')} |`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
