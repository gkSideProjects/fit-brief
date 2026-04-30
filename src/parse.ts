import FitParser from 'fit-file-parser'
import type { FitData, RawActivity, RawLap, RawRecord, RawSession } from './types.js'

/**
 * Parse a Garmin .fit file buffer into a typed RawActivity.
 *
 * @example
 * const buffer = await fs.readFile('ride.fit')
 * const activity = await parse(buffer)
 */
export function parse(buffer: Buffer): Promise<RawActivity> {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: 'km/h',
      lengthUnit: 'km',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'list',
    })

    parser.parse(buffer, (error: Error | null, data: unknown) => {
      if (error) {
        reject(error)
        return
      }
      try {
        resolve(toRawActivity(data as FitData))
      } catch (e) {
        reject(e)
      }
    })
  })
}

function toRawActivity(data: FitData): RawActivity {
  const sessions = (data.sessions ?? []).map(toRawSession)
  const sport = sessions[0]?.sport

  return {
    records: mergeByTimestamp((data.records ?? []).map(toRawRecord)),
    sessions,
    laps: (data.laps ?? []).map(toRawLap),
    ...(sport !== undefined ? { sport } : {}),
  }
}

function mergeByTimestamp(records: RawRecord[]): RawRecord[] {
  if (records.length === 0) return []

  const merged: RawRecord[] = []
  let current = records[0]!

  for (let i = 1; i < records.length; i++) {
    const r = records[i]!
    if (r.timestamp.getTime() === current.timestamp.getTime()) {
      current = { ...current, ...stripUndefined(r) }
    } else {
      merged.push(current)
      current = r
    }
  }

  merged.push(current)
  return merged
}

function stripUndefined(rec: RawRecord): Partial<RawRecord> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (v !== undefined) result[k] = v
  }
  return result as Partial<RawRecord>
}

function toRawRecord(r: unknown): RawRecord {
  const rec = r as Record<string, unknown>
  return {
    timestamp: rec['timestamp'] as Date,
    ...(rec['power'] !== undefined ? { power: rec['power'] as number } : {}),
    ...(rec['heart_rate'] !== undefined ? { heart_rate: rec['heart_rate'] as number } : {}),
    ...(rec['cadence'] !== undefined ? { cadence: rec['cadence'] as number } : {}),
    ...(rec['speed'] !== undefined ? { speed: rec['speed'] as number } : {}),
    ...(rec['distance'] !== undefined ? { distance: rec['distance'] as number } : {}),
    ...(rec['altitude'] !== undefined ? { altitude: rec['altitude'] as number } : {}),
    ...(rec['position_lat'] !== undefined ? { position_lat: rec['position_lat'] as number } : {}),
    ...(rec['position_long'] !== undefined ? { position_long: rec['position_long'] as number } : {}),
    ...(rec['temperature'] !== undefined ? { temperature: rec['temperature'] as number } : {}),
    ...(rec['elapsed_time'] !== undefined ? { elapsed_time: rec['elapsed_time'] as number } : {}),
    ...(rec['timer_time'] !== undefined ? { timer_time: rec['timer_time'] as number } : {}),
  }
}

function toRawSession(s: unknown): RawSession {
  const sess = s as Record<string, unknown>
  return {
    start_time: sess['start_time'] as Date,
    total_elapsed_time: sess['total_elapsed_time'] as number,
    total_timer_time: sess['total_timer_time'] as number,
    total_distance: sess['total_distance'] as number,
    ...(sess['total_work'] !== undefined ? { total_work: sess['total_work'] as number } : {}),
    ...(sess['avg_power'] !== undefined ? { avg_power: sess['avg_power'] as number } : {}),
    ...(sess['max_power'] !== undefined ? { max_power: sess['max_power'] as number } : {}),
    ...(sess['avg_heart_rate'] !== undefined ? { avg_heart_rate: sess['avg_heart_rate'] as number } : {}),
    ...(sess['max_heart_rate'] !== undefined ? { max_heart_rate: sess['max_heart_rate'] as number } : {}),
    ...(sess['avg_cadence'] !== undefined ? { avg_cadence: sess['avg_cadence'] as number } : {}),
    ...(sess['avg_speed'] !== undefined ? { avg_speed: sess['avg_speed'] as number } : {}),
    ...(sess['max_speed'] !== undefined ? { max_speed: sess['max_speed'] as number } : {}),
    ...(sess['total_ascent'] !== undefined ? { total_ascent: sess['total_ascent'] as number } : {}),
    ...(sess['total_descent'] !== undefined ? { total_descent: sess['total_descent'] as number } : {}),
    ...(sess['normalized_power'] !== undefined ? { normalized_power: sess['normalized_power'] as number } : {}),
    ...(sess['training_stress_score'] !== undefined ? { training_stress_score: sess['training_stress_score'] as number } : {}),
    ...(sess['intensity_factor'] !== undefined ? { intensity_factor: sess['intensity_factor'] as number } : {}),
    ...(sess['total_calories'] !== undefined ? { total_calories: sess['total_calories'] as number } : {}),
    ...(sess['sport'] !== undefined ? { sport: sess['sport'] as string } : {}),
    ...(sess['sub_sport'] !== undefined ? { sub_sport: sess['sub_sport'] as string } : {}),
  }
}

function toRawLap(l: unknown): RawLap {
  const lap = l as Record<string, unknown>
  return {
    start_time: lap['start_time'] as Date,
    total_elapsed_time: lap['total_elapsed_time'] as number,
    total_distance: lap['total_distance'] as number,
    ...(lap['avg_power'] !== undefined ? { avg_power: lap['avg_power'] as number } : {}),
    ...(lap['max_power'] !== undefined ? { max_power: lap['max_power'] as number } : {}),
    ...(lap['avg_heart_rate'] !== undefined ? { avg_heart_rate: lap['avg_heart_rate'] as number } : {}),
    ...(lap['max_heart_rate'] !== undefined ? { max_heart_rate: lap['max_heart_rate'] as number } : {}),
    ...(lap['avg_cadence'] !== undefined ? { avg_cadence: lap['avg_cadence'] as number } : {}),
    ...(lap['normalized_power'] !== undefined ? { normalized_power: lap['normalized_power'] as number } : {}),
    ...(lap['lap_trigger'] !== undefined ? { lap_trigger: lap['lap_trigger'] as string } : {}),
  }
}
