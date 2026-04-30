import type { RawActivity, RawRecord, TimeseriesPoint } from '../types.js'

export interface TimeseriesConfig {
  /** Downsample resolution in seconds (default: 10) */
  resolutionSeconds?: number
}

/**
 * Downsample the 1Hz record stream to a coarser resolution by bucketing
 * records into time windows and averaging each bucket.
 */
export function extractTimeseries(
  activity: RawActivity,
  config: TimeseriesConfig = {},
): readonly TimeseriesPoint[] {
  const resolution = config.resolutionSeconds ?? 10
  const records = activity.records
  if (records.length === 0) return []

  const startTime = records[0]?.timestamp.getTime() ?? 0
  const points: TimeseriesPoint[] = []

  let bucketStart = 0
  let bucket: RawRecord[] = []

  for (const r of records) {
    const offset = (r.timestamp.getTime() - startTime) / 1000
    const bucketIndex = Math.floor(offset / resolution)
    const expectedBucketStart = bucketIndex * resolution

    if (expectedBucketStart > bucketStart && bucket.length > 0) {
      points.push(averageBucket(bucketStart, bucket))
      bucketStart = expectedBucketStart
      bucket = []
    }

    bucket.push(r)
  }

  if (bucket.length > 0) {
    points.push(averageBucket(bucketStart, bucket))
  }

  return points
}

function averageBucket(offsetSeconds: number, records: readonly RawRecord[]): TimeseriesPoint {
  const point: TimeseriesPoint = { offsetSeconds }

  const powers = records.map((r) => r.power).filter((v): v is number => v !== undefined)
  const hrs = records.map((r) => r.heart_rate).filter((v): v is number => v !== undefined)
  const cadences = records.map((r) => r.cadence).filter((v): v is number => v !== undefined)
  const speeds = records.map((r) => r.speed).filter((v): v is number => v !== undefined)
  const altitudes = records.map((r) => r.altitude).filter((v): v is number => v !== undefined)

  return {
    ...point,
    ...(powers.length > 0 ? { powerW: Math.round(avg(powers)) } : {}),
    ...(hrs.length > 0 ? { heartRateBpm: Math.round(avg(hrs)) } : {}),
    ...(cadences.length > 0 ? { cadenceRpm: Math.round(avg(cadences)) } : {}),
    ...(speeds.length > 0 ? { speedKph: Math.round(avg(speeds) * 10) / 10 } : {}),
    ...(altitudes.length > 0 ? { altitudeM: Math.round(avg(altitudes)) } : {}),
  }
}

function avg(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}
