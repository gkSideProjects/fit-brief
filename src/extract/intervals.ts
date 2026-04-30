import type { Effort, RawActivity, RawRecord } from '../types.js'
import { computeDecoupling } from './decoupling.js'

export interface IntervalConfig {
  /** FTP in watts — required for effort detection thresholds */
  ftpW?: number
  /** Grace period in seconds: dips below threshold shorter than this don't end an effort (default: 10) */
  graceSeconds?: number
}

/**
 * Auto-detect efforts/intervals from the power stream.
 *
 * Two tiers:
 * - Sustained efforts (60s+): power above Z2 floor (55% FTP)
 * - Sprints (1–30s): power above Z6 floor (150% FTP)
 *
 * Paused sections are stripped before detection.
 * Brief dips below threshold (grace period) don't split an effort.
 */
export function extractIntervals(activity: RawActivity, config: IntervalConfig = {}): readonly Effort[] {
  if (!config.ftpW) return []

  const ftp = config.ftpW
  const grace = config.graceSeconds ?? 10
  const z2Floor = Math.round(ftp * 0.55)
  const sprintFloor = Math.round(ftp * 2.80)

  const records = stripPauses(activity.records)
  if (records.length === 0) return []

  const startTime = activity.sessions[0]?.start_time.getTime() ?? 0

  const sustained = detectSustainedEfforts(records, startTime, z2Floor, grace)
  const sprints = detectSprints(records, startTime, sprintFloor)

  return [...sustained, ...sprints].sort((a, b) => a.startOffsetSeconds - b.startOffsetSeconds)
}

/**
 * Strip paused sections: if two consecutive records are more than 2 seconds
 * apart, that's a pause — drop the gap.
 */
function stripPauses(records: readonly RawRecord[]): readonly RawRecord[] {
  return records.filter((r, i) => {
    if (i === 0) return r.power !== undefined
    if (r.power === undefined) return false
    const prev = records[i - 1]
    if (!prev) return true
    const gap = (r.timestamp.getTime() - prev.timestamp.getTime()) / 1000
    return gap <= 2
  })
}

/**
 * Detect sustained efforts (60s+) above a power threshold.
 * Brief dips below threshold (up to graceSeconds) don't end the effort.
 */
function detectSustainedEfforts(
  records: readonly RawRecord[],
  startTime: number,
  threshold: number,
  graceSeconds: number,
): Effort[] {
  const efforts: Effort[] = []

  let effortStart: number | null = null
  let effortRecords: RawRecord[] = []
  let belowCount = 0

  for (const r of records) {
    const power = r.power ?? 0
    const offset = (r.timestamp.getTime() - startTime) / 1000

    if (power >= threshold) {
      if (effortStart === null) effortStart = offset
      effortRecords.push(r)
      belowCount = 0
    } else {
      belowCount++

      if (effortStart !== null && belowCount <= graceSeconds) {
        effortRecords.push(r)
      }

      if (effortStart !== null && belowCount > graceSeconds) {
        if (effortRecords.length >= 60) {
          efforts.push(buildEffort(effortStart, effortRecords))
        }
        effortStart = null
        effortRecords = []
      }
    }
  }

  if (effortStart !== null && effortRecords.length >= 60) {
    efforts.push(buildEffort(effortStart, effortRecords))
  }

  return efforts
}

function detectSprints(
  records: readonly RawRecord[],
  startTime: number,
  sprintFloor: number,
): Effort[] {
  const sprints: Effort[] = []
  const graceSeconds = 3

  let sprintStart: number | null = null
  let powers: number[] = []
  let belowCount = 0

  for (const r of records) {
    const power = r.power ?? 0
    const offset = (r.timestamp.getTime() - startTime) / 1000

    if (power >= sprintFloor && powers.length < 30) {
      if (sprintStart === null) sprintStart = offset
      powers.push(power)
      belowCount = 0
    } else {
      if (sprintStart !== null) {
        belowCount++
        if (belowCount <= graceSeconds && powers.length < 30) {
          powers.push(power)
        } else {
          if (powers.length >= 1) {
            sprints.push(buildSprintEffort(sprintStart, powers))
          }
          sprintStart = null
          powers = []
          belowCount = 0
        }
      }
    }
  }

  if (sprintStart !== null && powers.length >= 1) {
    sprints.push(buildSprintEffort(sprintStart, powers))
  }

  return sprints
}


function buildEffort(
  startOffset: number,
  records: readonly RawRecord[],
): Effort {
  const powers = records.map((r) => r.power ?? 0)
  const hrs = records.map((r) => r.heart_rate).filter((v): v is number => v !== undefined)
  const speeds = records.map((r) => r.speed).filter((v): v is number => v !== undefined)

  const avgPower = avg(powers)
  const maxPower = Math.max(...powers)
  const workKj = powers.reduce((s, p) => s + p, 0) / 1000
  const np = computeNormalizedPower(powers)
  const decoupling = computeDecoupling(records)

  return {
    startOffsetSeconds: Math.round(startOffset),
    durationSeconds: powers.length,
    avgPowerW: Math.round(avgPower),
    maxPowerW: maxPower,
    normalizedPowerW: Math.round(np),
    ...(hrs.length > 0 ? { avgHrBpm: Math.round(avg(hrs)) } : {}),
    ...(speeds.length > 0 ? { avgSpeedKph: Math.round(avg(speeds) * 10) / 10 } : {}),
    workKj: Math.round(workKj * 10) / 10,
    ...(decoupling !== null ? { aerobicDecoupling: decoupling } : {}),
  }
}

function buildSprintEffort(startOffset: number, powers: readonly number[]): Effort {
  const avgPower = avg(powers)
  const maxPower = Math.max(...powers)
  const workKj = powers.reduce((s, p) => s + p, 0) / 1000
  const np = computeNormalizedPower(powers)

  return {
    startOffsetSeconds: Math.round(startOffset),
    durationSeconds: powers.length,
    avgPowerW: Math.round(avgPower),
    maxPowerW: maxPower,
    normalizedPowerW: Math.round(np),
    workKj: Math.round(workKj * 10) / 10,
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
