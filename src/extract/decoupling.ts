import type { RawRecord } from '../types.js'

/**
 * Compute aerobic decoupling (Pa:Hr) as a percentage for a set of records.
 *
 * Splits the records into two equal halves and compares the power-to-HR ratio.
 * A value >5% suggests the aerobic system was under increasing stress.
 *
 * Returns null if insufficient paired data, too short (<240 paired records),
 * or power too variable (CV >0.20).
 */
export function computeDecoupling(records: readonly RawRecord[]): number | null {
  const paired = records.filter(
    (r) => r.power !== undefined && r.heart_rate !== undefined,
  )

  if (paired.length < 240) return null

  const powers = paired.map((r) => r.power ?? 0)
  if (coefficientOfVariation(powers) > 0.20) return null

  const firstTime = paired[0]!.timestamp.getTime()
  const lastTime = paired[paired.length - 1]!.timestamp.getTime()
  const midTime = firstTime + (lastTime - firstTime) / 2

  const ratio1 = avgPowerHrRatio(paired.filter((r) => r.timestamp.getTime() < midTime))
  const ratio2 = avgPowerHrRatio(paired.filter((r) => r.timestamp.getTime() >= midTime))

  if (ratio1 === 0) return null

  return Math.round(((ratio1 - ratio2) / ratio1) * 1000) / 10
}

function avgPowerHrRatio(records: readonly RawRecord[]): number {
  let sumPower = 0
  let sumHr = 0

  for (const r of records) {
    if (r.power !== undefined && r.heart_rate !== undefined) {
      sumPower += r.power
      sumHr += r.heart_rate
    }
  }

  if (sumHr === 0) return 0
  return sumPower / sumHr
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}
