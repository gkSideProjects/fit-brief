import { describe, expect, it } from 'vitest'
import type { RawActivity } from './types.js'
import { toCompact } from './compact.js'
import { toMarkdown } from './serialise/markdown.js'

function makeActivity(overrides: Partial<RawActivity> = {}): RawActivity {
  const start = new Date('2024-06-01T08:00:00Z')

  const records = Array.from({ length: 3600 }, (_, i) => {
    const min = i / 60
    const power = min < 40 ? 150 : min < 45 ? 280 : 150

    return {
      timestamp: new Date(start.getTime() + i * 1000),
      power,
      heart_rate: 140 + Math.round(Math.sin(i / 120) * 5),
      cadence: 90,
      speed: 30,
      distance: i * (30 / 3600),
      altitude: 100 + i * 0.05,
      elapsed_time: i,
    }
  })

  return {
    records,
    sessions: [{
      start_time: start,
      total_elapsed_time: 3600,
      total_timer_time: 3600,
      total_distance: 30,
      total_work: 720000,
      avg_power: 165,
      max_power: 300,
      avg_heart_rate: 140,
      max_heart_rate: 155,
      avg_cadence: 90,
      avg_speed: 30,
      total_ascent: 180,
      normalized_power: 185,
      training_stress_score: 65,
      intensity_factor: 0.75,
      sport: 'cycling',
    }],
    laps: [],
    sport: 'cycling',
    ...overrides,
  }
}

describe('toCompact', () => {
  it('extracts summary fields from the session', () => {
    const compact = toCompact(makeActivity(), { ftpW: 250 })
    expect(compact.formatVersion).toBe('1')
    expect(compact.summary.distanceKm).toBe(30)
    expect(compact.summary.durationSeconds).toBe(3600)
    expect(compact.summary.avgPowerW).toBe(165)
  })

  it('produces efforts, PD curve, and decoupling', () => {
    const compact = toCompact(makeActivity(), { ftpW: 250 })
    expect(compact.efforts.length).toBeGreaterThan(0)
    expect(compact.pdCurveHighlights.length).toBeGreaterThan(0)
    expect(compact.efforts.some((e) => e.aerobicDecoupling !== undefined)).toBe(true)
  })

  it('downsamples timeseries when enabled', () => {
    const compact = toCompact(makeActivity(), { includeTimeseries: true })
    expect(compact.timeseries.length).toBeCloseTo(360, -1)
  })

  it('throws if the activity has no sessions', () => {
    expect(() => toCompact(makeActivity({ sessions: [] }))).toThrow()
  })
})

describe('toMarkdown', () => {
  it('produces deterministic Markdown with expected sections', () => {
    const activity = makeActivity()
    const md1 = toMarkdown(toCompact(activity, { ftpW: 250 }))
    const md2 = toMarkdown(toCompact(activity, { ftpW: 250 }))
    expect(md1).toBe(md2)
    expect(md1).toContain('# Activity Brief')
    expect(md1).toContain('## Summary')
    expect(md1).toContain('## Power Zones')
    expect(md1).toContain('format_version: 1')
  })

  it('omits power zones when no power data', () => {
    const base = makeActivity()
    const { avg_power: _, max_power: __, ...session } = base.sessions[0]!
    const nopower: RawActivity = {
      ...base,
      records: base.records.map(({ power: _, ...r }) => r),
      sessions: [session],
    }
    expect(toMarkdown(toCompact(nopower))).not.toContain('## Power Zones')
  })
})
