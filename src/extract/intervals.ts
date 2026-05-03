import type { Effort, RawActivity, RawRecord } from '../types.js'
import { computeDecoupling } from './decoupling.js'
import { classifyPowerZone, cogganBoundaries } from './zones.js'

export interface IntervalConfig {
  ftpW?: number
}

const ZONE_MIN_DURATION: Record<number, number> = {
  2: 20 * 60,
  3: 5 * 60,
  4: 3 * 60,
  5: 60,
  6: 20,
  7: 5,
}

const ZONE_GRACE: Record<number, number> = {
  2: 30,
  3: 10,
  4: 5,
  5: 5,
  6: 3,
  7: 3,
}

export function extractIntervals(activity: RawActivity, config: IntervalConfig = {}): readonly Effort[] {
  if (!config.ftpW) return []

  const boundaries = cogganBoundaries(config.ftpW)
  const records = stripPauses(activity.records)
  if (records.length === 0) return []

  const sessionStartMs = activity.sessions[0]?.start_time.getTime() ?? 0
  return detectZoneEfforts(records, sessionStartMs, boundaries)
}

function stripPauses(records: readonly RawRecord[]): readonly RawRecord[] {
  return records.filter((r, i) => {
    if (i === 0) return r.power !== undefined
    if (r.power === undefined) return false
    const prev = records[i - 1]
    if (!prev) return true
    return (r.timestamp.getTime() - prev.timestamp.getTime()) / 1000 <= 2
  })
}

function detectZoneEfforts(
  records: readonly RawRecord[],
  sessionStartMs: number,
  boundaries: readonly number[],
): Effort[] {
  const efforts: Effort[] = []

  let blockStartMs = 0
  let blockZone = 0
  let blockLen = 0
  let graceCount = 0
  let graceTarget = 0
  let blockRecs: RawRecord[] = []

  function finalize(keepLen: number): void {
    if (keepLen === 0) return
    const recs = blockRecs.slice(0, keepLen)
    if (durationFromTimestamps(recs) < (ZONE_MIN_DURATION[blockZone] ?? 0)) return
    efforts.push(buildEffort(
      Math.round((blockStartMs - sessionStartMs) / 1000),
      recs,
      blockZone,
    ))
  }

  const TAIL_BUFFER = 1

  function transition(): void {
    if (graceTarget >= 2) {
      const fullTail = blockRecs.slice(-graceCount)
      const firstTarget = fullTail.findIndex((r) => {
        const p = r.power ?? 0
        return p > 0 && classifyPowerZone(p, boundaries) === graceTarget
      })
      const trimStart = firstTarget >= 0 ? Math.max(0, firstTarget - TAIL_BUFFER) : 0
      const tail = fullTail.slice(trimStart)
      blockStartMs = tail[0]!.timestamp.getTime()
      blockZone = graceTarget
      blockLen = tail.length
      blockRecs = tail
    } else {
      blockZone = 0
      blockLen = 0
      blockRecs = []
    }
    graceCount = 0
    graceTarget = 0
  }

  for (const r of records) {
    const power = r.power ?? 0
    const zone = power > 0 ? classifyPowerZone(power, boundaries) : 0

    if (blockZone === 0) {
      if (zone >= 2) {
        blockStartMs = r.timestamp.getTime()
        blockZone = zone
        blockLen = 1
        blockRecs = [r]
      }
      continue
    }

    blockRecs.push(r)

    if (zone === blockZone) {
      if (graceCount > 0) {
        const blipLen = blockRecs.length - 1 - blockLen
        if (blipLen > 0) blockRecs.splice(blockLen, blipLen)
        graceCount = 0
        graceTarget = 0
      }
      blockLen = blockRecs.length
      continue
    }

    if (zone !== graceTarget) graceTarget = zone
    graceCount++

    if (graceCount >= (ZONE_GRACE[blockZone] ?? 10)) {
      finalize(blockLen)
      transition()
    }
  }

  finalize(blockLen)
  return efforts.sort((a, b) => a.startOffsetSeconds - b.startOffsetSeconds)
}

function durationFromTimestamps(records: readonly RawRecord[]): number {
  if (records.length <= 1) return records.length
  return Math.floor(
    (records[records.length - 1]!.timestamp.getTime() - records[0]!.timestamp.getTime()) / 1000,
  ) + 1
}

function buildEffort(startOffset: number, records: readonly RawRecord[], zone: number): Effort {
  const powers = records.map((r) => r.power ?? 0)
  const hrs = records.map((r) => r.heart_rate).filter((v): v is number => v !== undefined)
  const speeds = records.map((r) => r.speed).filter((v): v is number => v !== undefined)

  const avgPower = avg(powers)
  const workKj = powers.reduce((s, p) => s + p, 0) / 1000
  const np = computeNormalizedPower(powers)
  const decoupling = computeDecoupling(records)

  return {
    startOffsetSeconds: startOffset,
    durationSeconds: durationFromTimestamps(records),
    zone,
    avgPowerW: Math.round(avgPower),
    maxPowerW: Math.max(...powers),
    normalizedPowerW: Math.round(np),
    ...(hrs.length > 0 ? { avgHrBpm: Math.round(avg(hrs)) } : {}),
    ...(speeds.length > 0 ? { avgSpeedKph: Math.round(avg(speeds) * 10) / 10 } : {}),
    workKj: Math.round(workKj * 10) / 10,
    ...(decoupling !== null ? { aerobicDecoupling: decoupling } : {}),
  }
}

function avg(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

function computeNormalizedPower(powers: readonly number[]): number {
  if (powers.length < 30) return avg(powers)

  const rolling: number[] = []
  for (let i = 29; i < powers.length; i++) {
    let sum = 0
    for (let j = i - 29; j <= i; j++) sum += powers[j] ?? 0
    rolling.push(sum / 30)
  }

  const fourthPowerAvg = rolling.reduce((s, v) => s + v ** 4, 0) / rolling.length
  return fourthPowerAvg ** 0.25
}
