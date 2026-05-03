import type { PdPoint, RawActivity } from '../types.js'

// Standard power-duration curve durations to report (seconds)
const PD_DURATIONS = [5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200] as const

/**
 * Compute peak mean power for standard durations from the 1-second power stream.
 * Returns only durations where a full window exists in the activity.
 */
export function extractPdCurve(activity: RawActivity): readonly PdPoint[] {
  const powers = activity.records
    .map((r) => r.power)
    .filter((p): p is number => p !== undefined)

  if (powers.length === 0) return []

  return PD_DURATIONS.flatMap((duration): PdPoint[] => {
    if (powers.length < duration) return []
    const peak = peakMeanPower(powers, duration)
    return [{ durationSeconds: duration, powerW: Math.round(peak) }]
  })
}

function peakMeanPower(powers: readonly number[], windowSize: number): number {
  let windowSum = 0
  for (let i = 0; i < windowSize; i++) windowSum += powers[i] ?? 0

  let max = windowSum
  for (let i = windowSize; i < powers.length; i++) {
    windowSum += (powers[i] ?? 0) - (powers[i - windowSize] ?? 0)
    if (windowSum > max) max = windowSum
  }

  return max / windowSize
}
