import type { HrZones, PowerZones, RawActivity, ZoneTime } from '../types.js'

export interface ZoneConfig {
  /** FTP in watts for power zone boundaries */
  ftpW?: number
  /** Max HR in bpm for HR zone boundaries */
  maxHrBpm?: number
  /** Lactate threshold HR in bpm (optional alternative to maxHR-based zones) */
  lthrBpm?: number
}

/**
 * Compute time-in-zone for power using 7-zone Coggan model (% of FTP).
 * Falls back to zone counts without boundaries if ftpW is not provided.
 */
export function extractPowerZones(activity: RawActivity, config: ZoneConfig): PowerZones {
  const boundaries = config.ftpW ? cogganBoundaries(config.ftpW) : null

  const zoneTotals = new Map<number, number>()
  for (let z = 1; z <= 7; z++) zoneTotals.set(z, 0)

  for (const r of activity.records) {
    if (r.power === undefined) continue
    const zone = boundaries ? classifyPowerZone(r.power, boundaries) : null
    if (zone !== null) zoneTotals.set(zone, (zoneTotals.get(zone) ?? 0) + 1)
  }

  const zones: ZoneTime[] = POWER_ZONE_LABELS.map((label, i) => ({
    zone: i + 1,
    label,
    seconds: zoneTotals.get(i + 1) ?? 0,
  }))

  return {
    zones,
    ...(config.ftpW !== undefined ? { ftpW: config.ftpW } : {}),
  }
}

/**
 * Compute time-in-zone for HR using 5-zone model based on max HR.
 */
export function extractHrZones(activity: RawActivity, config: ZoneConfig): HrZones {
  const boundaries = config.maxHrBpm ? hrBoundaries(config.maxHrBpm) : null

  const zoneTotals = new Map<number, number>()
  for (let z = 1; z <= 5; z++) zoneTotals.set(z, 0)

  for (const r of activity.records) {
    if (r.heart_rate === undefined) continue
    const zone = boundaries ? classifyHrZone(r.heart_rate, boundaries) : null
    if (zone !== null) zoneTotals.set(zone, (zoneTotals.get(zone) ?? 0) + 1)
  }

  const zones: ZoneTime[] = HR_ZONE_LABELS.map((label, i) => ({
    zone: i + 1,
    label,
    seconds: zoneTotals.get(i + 1) ?? 0,
  }))

  return {
    zones,
    ...(config.maxHrBpm !== undefined ? { maxHrBpm: config.maxHrBpm } : {}),
    ...(config.lthrBpm !== undefined ? { lthrBpm: config.lthrBpm } : {}),
  }
}

// Coggan 7-zone boundaries as % of FTP
export function cogganBoundaries(ftp: number): readonly number[] {
  return [0.55, 0.75, 0.90, 1.05, 1.20, 1.50].map((f) => Math.round(f * ftp))
}

export function classifyPowerZone(power: number, boundaries: readonly number[]): number {
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (power >= (boundaries[i] ?? 0)) return i + 2
  }
  return 1
}

function hrBoundaries(maxHr: number): readonly number[] {
  return [0.60, 0.70, 0.80, 0.90].map((f) => Math.round(f * maxHr))
}

function classifyHrZone(hr: number, boundaries: readonly number[]): number {
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (hr >= (boundaries[i] ?? 0)) return i + 2
  }
  return 1
}

const POWER_ZONE_LABELS = [
  'Z1 Active Recovery',
  'Z2 Endurance',
  'Z3 Tempo',
  'Z4 Threshold',
  'Z5 VO2max',
  'Z6 Anaerobic',
  'Z7 Neuromuscular',
] as const

const HR_ZONE_LABELS = [
  'Z1 Recovery',
  'Z2 Aerobic',
  'Z3 Tempo',
  'Z4 Threshold',
  'Z5 VO2max',
] as const
