import { describe, expect, it } from 'vitest'
import type { RawActivity, RawRecord } from '../types.js'
import { extractIntervals } from './intervals.js'

interface Seg {
  power: number
  durationSeconds: number
}

function makeActivity(segments: Seg[]): RawActivity {
  const start = new Date('2024-06-01T08:00:00Z')
  const powers: number[] = []
  for (const seg of segments) {
    for (let i = 0; i < seg.durationSeconds; i++) powers.push(seg.power)
  }
  const records: RawRecord[] = powers.map((p, i) => ({
    timestamp: new Date(start.getTime() + i * 1000),
    power: p,
    heart_rate: 140,
    speed: 30,
  }))

  return {
    records,
    sessions: [{
      start_time: start,
      total_elapsed_time: powers.length,
      total_timer_time: powers.length,
      total_distance: powers.length * (30 / 3600),
      total_work: powers.reduce((s, p) => s + p, 0),
    }],
    laps: [],
    sport: 'cycling',
  }
}

// Coggan zones at FTP 250:
// Z1: <138W, Z2: 138-187W, Z3: 188-224W, Z4: 225-262W, Z5: 263-299W, Z6: 300-374W, Z7: 375W+
// Min durations: Z2=1200s, Z3=300s, Z4=180s, Z5=60s, Z6=20s, Z7=5s
// Grace: Z2=30, Z3=10, Z4=5, Z5=5, Z6=3, Z7=3

const FTP = 250

describe('extractIntervals', () => {
  it('returns empty for empty records', () => {
    const activity: RawActivity = {
      records: [],
      sessions: [{ start_time: new Date(), total_elapsed_time: 0, total_timer_time: 0, total_distance: 0, total_work: 0 }],
      laps: [],
    }
    expect(extractIntervals(activity, { ftpW: FTP })).toEqual([])
  })

  it('returns empty when no FTP provided', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 150, durationSeconds: 1500 },
    ]))
    expect(efforts).toEqual([])
  })

  it('detects a single continuous Z2 effort', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 150, durationSeconds: 1500 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(1)
    expect(efforts[0]!.zone).toBe(2)
    expect(efforts[0]!.durationSeconds).toBe(1500)
  })

  it('discards a Z2 block shorter than 20 min', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 150, durationSeconds: 900 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(0)
  })

  it('keeps a short dip within grace as one effort', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 240, durationSeconds: 240 },
      { power: 100, durationSeconds: 3 },
      { power: 240, durationSeconds: 180 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(1)
    expect(efforts[0]!.zone).toBe(4)
    expect(efforts[0]!.durationSeconds).toBe(423)
  })

  it('splits effort when dip exceeds grace period', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 240, durationSeconds: 240 },
      { power: 100, durationSeconds: 7 },
      { power: 240, durationSeconds: 240 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(2)
    expect(efforts[0]!.zone).toBe(4)
    expect(efforts[1]!.zone).toBe(4)
  })

  it('uses blockZone grace for all transitions', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 150, durationSeconds: 900 },
      { power: 280, durationSeconds: 10 },
      { power: 150, durationSeconds: 600 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(1)
    expect(efforts[0]!.zone).toBe(2)
    expect(efforts[0]!.durationSeconds).toBe(1510)
  })

  it('splits when Z5 spike exceeds Z2 grace', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 150, durationSeconds: 1500 },
      { power: 280, durationSeconds: 35 },
      { power: 150, durationSeconds: 1500 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(2)
    expect(efforts[0]!.zone).toBe(2)
    expect(efforts[1]!.zone).toBe(2)
  })

  it('detects multiple zones in sequence', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 240, durationSeconds: 240 },
      { power: 150, durationSeconds: 1500 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(2)
    expect(efforts[0]!.zone).toBe(4)
    expect(efforts[0]!.avgPowerW).toBe(240)
    expect(efforts[1]!.zone).toBe(2)
  })

  it('excludes blip records from avg power via splice', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 240, durationSeconds: 240 },
      { power: 100, durationSeconds: 3 },
      { power: 240, durationSeconds: 180 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(1)
    expect(efforts[0]!.avgPowerW).toBe(240)
  })

  it('handles a third zone during grace without early split', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 150, durationSeconds: 600 },
      { power: 100, durationSeconds: 2 },
      { power: 240, durationSeconds: 3 },
      { power: 150, durationSeconds: 600 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(1)
    expect(efforts[0]!.zone).toBe(2)
  })

  it('handles multiple blips within a single grace period', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 240, durationSeconds: 360 },
      { power: 100, durationSeconds: 2 },
      { power: 240, durationSeconds: 10 },
      { power: 100, durationSeconds: 2 },
      { power: 240, durationSeconds: 360 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(1)
    expect(efforts[0]!.zone).toBe(4)
  })

  it('detects a short Z5 effort meeting minimum duration', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 150, durationSeconds: 1200 },
      { power: 280, durationSeconds: 65 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(2)
    expect(efforts[0]!.zone).toBe(2)
    expect(efforts[1]!.zone).toBe(5)
    expect(efforts[1]!.durationSeconds).toBeGreaterThanOrEqual(60)
  })

  it('detects a Z7 sprint after Z6', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 320, durationSeconds: 25 },
      { power: 400, durationSeconds: 10 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(2)
    expect(efforts[0]!.zone).toBe(6)
    expect(efforts[1]!.zone).toBe(7)
  })

  it('discards a Z7 sprint shorter than minimum duration', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 320, durationSeconds: 25 },
      { power: 400, durationSeconds: 3 },
    ]), { ftpW: FTP })
    expect(efforts).toHaveLength(1)
    expect(efforts[0]!.zone).toBe(6)
  })

  it('finalizes block during multi-zone ramp-up', () => {
    const efforts = extractIntervals(makeActivity([
      { power: 200, durationSeconds: 300 },
      { power: 100, durationSeconds: 3 },
      { power: 150, durationSeconds: 3 },
      { power: 240, durationSeconds: 3 },
      { power: 400, durationSeconds: 30 },
    ]), { ftpW: FTP })
    const zones = efforts.map((e) => e.zone)
    expect(zones).toContain(3)
    expect(zones).toContain(7)
  })
})
