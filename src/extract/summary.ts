import type { ActivitySummary, RawActivity } from '../types.js'

export interface SummaryConfig {
  /** FTP in watts — required for TSS and IF computation */
  ftpW?: number
}

/**
 * Extract high-level summary statistics from the first session.
 * The FIT session message is the authoritative source for aggregate fields —
 * prefer it over recomputing from records, which may have gaps.
 */
export function extractSummary(activity: RawActivity, config: SummaryConfig = {}): ActivitySummary {
  const session = activity.sessions[0]
  if (!session) throw new Error('Activity contains no sessions')

  const powers = activity.records
    .map((r) => r.power)
    .filter((p): p is number => p !== undefined)

  const cadences = activity.records
    .map((r) => r.cadence)
    .filter((c): c is number => c !== undefined)

  const avgPower = session.avg_power ?? (powers.length > 0 ? Math.round(avg(powers)) : undefined)
  const maxPower = session.max_power ?? (powers.length > 0 ? Math.max(...powers) : undefined)
  const np = session.normalized_power ?? (powers.length >= 30 ? computeNormalizedPower(powers) : undefined)
  const avgCadence = session.avg_cadence ?? (cadences.length > 0 ? Math.round(avg(cadences)) : undefined)

  const intensityFactor = session.intensity_factor ?? (np !== undefined && config.ftpW ? Math.round((np / config.ftpW) * 100) / 100 : undefined)
  const tss = session.training_stress_score ?? (np !== undefined && intensityFactor !== undefined && config.ftpW
    ? Math.round((session.total_timer_time * np * intensityFactor) / (config.ftpW * 3600) * 100)
    : undefined)

  const calories = session.total_calories !== undefined && session.total_calories > 0
    ? session.total_calories
    : undefined

  return {
    startTime: session.start_time,
    durationSeconds: session.total_timer_time,
    distanceKm: session.total_distance,
    elevationGainM: session.total_ascent ?? computeElevationGain(activity),
    workKj: session.total_work !== undefined ? session.total_work / 1000 : computeWorkKj(activity),
    ...(avgPower !== undefined ? { avgPowerW: avgPower } : {}),
    ...(maxPower !== undefined ? { maxPowerW: maxPower } : {}),
    ...(np !== undefined ? { normalizedPowerW: np } : {}),
    ...(session.avg_heart_rate !== undefined ? { avgHeartRateBpm: session.avg_heart_rate } : {}),
    ...(session.max_heart_rate !== undefined ? { maxHeartRateBpm: session.max_heart_rate } : {}),
    ...(avgCadence !== undefined ? { avgCadenceRpm: avgCadence } : {}),
    ...(session.avg_speed !== undefined ? { avgSpeedKph: session.avg_speed } : {}),
    ...(calories !== undefined ? { caloriesKcal: calories } : {}),
    ...(tss !== undefined ? { trainingStressScore: tss } : {}),
    ...(intensityFactor !== undefined ? { intensityFactor } : {}),
  }
}

function computeElevationGain(activity: RawActivity): number {
  let gain = 0
  let prev: number | undefined
  for (const r of activity.records) {
    if (r.altitude === undefined) continue
    if (prev !== undefined && r.altitude > prev) gain += r.altitude - prev
    prev = r.altitude
  }
  return gain
}

function computeWorkKj(activity: RawActivity): number {
  let joules = 0
  for (const r of activity.records) {
    if (r.power !== undefined) joules += r.power
  }
  return joules / 1000
}

function computeNormalizedPower(powers: readonly number[]): number {
  const rolling: number[] = []
  for (let i = 29; i < powers.length; i++) {
    let sum = 0
    for (let j = i - 29; j <= i; j++) sum += powers[j] ?? 0
    rolling.push(sum / 30)
  }
  const fourthPowerAvg = rolling.reduce((s, v) => s + v ** 4, 0) / rolling.length
  return Math.round(fourthPowerAvg ** 0.25)
}

function avg(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}
