import { describe, expect, it } from 'vitest'
import type { RawActivity } from './types.js'
import { toCompact } from './compact.js'
import { toMarkdown } from './serialise/markdown.js'

// Minimal synthetic activity that exercises the full pipeline without a real .fit file
function makeActivity(overrides: Partial<RawActivity> = {}): RawActivity {
  const start = new Date('2024-06-01T08:00:00Z')

  const records = Array.from({ length: 3600 }, (_, i) => ({
    timestamp: new Date(start.getTime() + i * 1000),
    power: 200 + Math.round(Math.sin(i / 60) * 50),
    heart_rate: 145 + Math.round(Math.sin(i / 120) * 10),
    cadence: 90,
    speed: 30,
    distance: i * (30 / 3600),
    altitude: 100 + i * 0.05,
    elapsed_time: i,
  }))

  return {
    records,
    sessions: [
      {
        start_time: start,
        total_elapsed_time: 3600,
        total_timer_time: 3600,
        total_distance: 30,
        total_work: 720000,
        avg_power: 200,
        max_power: 350,
        avg_heart_rate: 145,
        max_heart_rate: 165,
        avg_cadence: 90,
        avg_speed: 30,
        total_ascent: 180,
        normalized_power: 210,
        training_stress_score: 65,
        intensity_factor: 0.75,
        sport: 'cycling',
      },
    ],
    laps: [],
    sport: 'cycling',
    ...overrides,
  }
}

describe('toCompact', () => {
  it('returns a compact activity with the correct format version', () => {
    const compact = toCompact(makeActivity(), { ftpW: 280 })
    expect(compact.formatVersion).toBe('1')
  })

  it('extracts summary fields from the session', () => {
    const compact = toCompact(makeActivity(), { ftpW: 280 })
    expect(compact.summary.distanceKm).toBe(30)
    expect(compact.summary.durationSeconds).toBe(3600)
    expect(compact.summary.avgPowerW).toBe(200)
  })

  it('detects at least one effort', () => {
    const compact = toCompact(makeActivity(), { ftpW: 280 })
    expect(compact.efforts.length).toBeGreaterThan(0)
  })

  it('produces PD curve highlights', () => {
    const compact = toCompact(makeActivity(), { ftpW: 280 })
    expect(compact.pdCurveHighlights.length).toBeGreaterThan(0)
    const durations = compact.pdCurveHighlights.map((p) => p.durationSeconds)
    expect(durations).toContain(5)
    expect(durations).toContain(300)
  })

  it('computes aerobic decoupling on qualifying efforts', () => {
    const compact = toCompact(makeActivity(), { ftpW: 280 })
    const withDecoupling = compact.efforts.filter((e) => e.aerobicDecoupling !== undefined)
    expect(withDecoupling.length).toBeGreaterThan(0)
  })

  it('downsamples timeseries to ~10s resolution when enabled', () => {
    const compact = toCompact(makeActivity(), { includeTimeseries: true })
    // 3600 records at 1Hz → ~360 points at 10s
    expect(compact.timeseries.length).toBeCloseTo(360, -1)
  })

  it('throws if the activity has no sessions', () => {
    expect(() => toCompact(makeActivity({ sessions: [] }))).toThrow()
  })
})

describe('toMarkdown', () => {
  it('produces a non-empty Markdown string', () => {
    const md = toMarkdown(toCompact(makeActivity(), { ftpW: 280 }))
    expect(md).toContain('# Activity Brief')
    expect(md).toContain('## Summary')
    expect(md).toContain('format_version: 1')
  })

  it('is deterministic', () => {
    const activity = makeActivity()
    const md1 = toMarkdown(toCompact(activity, { ftpW: 280 }))
    const md2 = toMarkdown(toCompact(activity, { ftpW: 280 }))
    expect(md1).toBe(md2)
  })

  it('includes power zones when FTP is provided', () => {
    const md = toMarkdown(toCompact(makeActivity(), { ftpW: 280 }))
    expect(md).toContain('## Power Zones')
    expect(md).toContain('280 W')
  })

  it('omits power zones section when no power data', () => {
    const base = makeActivity()
    const session = base.sessions[0]
    if (!session) throw new Error('expected session')
    const nopower: RawActivity = {
      ...base,
      records: base.records.map(({ power: _, ...r }) => r),
      sessions: [{ ...session, avg_power: undefined, max_power: undefined }],
    }
    const md = toMarkdown(toCompact(nopower))
    expect(md).not.toContain('## Power Zones')
  })
})
