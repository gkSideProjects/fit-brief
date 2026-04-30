// ── Raw types (fit-file-parser output, typed for our use) ──────────────────

export interface RawRecord {
  readonly timestamp: Date
  readonly power?: number
  readonly heart_rate?: number
  readonly cadence?: number
  readonly speed?: number      // km/h (parser configured with speedUnit: 'km/h')
  readonly distance?: number   // km
  readonly altitude?: number   // m
  readonly position_lat?: number
  readonly position_long?: number
  readonly temperature?: number
  readonly elapsed_time?: number  // seconds from activity start (includes pauses)
  readonly timer_time?: number    // seconds from activity start (excludes pauses)
}

export interface RawSession {
  readonly start_time: Date
  readonly total_elapsed_time: number    // seconds
  readonly total_timer_time: number      // seconds (excludes pauses)
  readonly total_distance: number        // km
  readonly total_work?: number           // J
  readonly avg_power?: number            // W
  readonly max_power?: number            // W
  readonly avg_heart_rate?: number       // bpm
  readonly max_heart_rate?: number       // bpm
  readonly avg_cadence?: number          // rpm
  readonly avg_speed?: number            // km/h
  readonly max_speed?: number            // km/h
  readonly total_ascent?: number         // m
  readonly total_descent?: number        // m
  readonly normalized_power?: number     // W
  readonly training_stress_score?: number
  readonly intensity_factor?: number
  readonly total_calories?: number       // kcal
  readonly sport?: string
  readonly sub_sport?: string
}

export interface RawLap {
  readonly start_time: Date
  readonly total_elapsed_time: number
  readonly total_distance: number        // km
  readonly avg_power?: number
  readonly max_power?: number
  readonly avg_heart_rate?: number
  readonly max_heart_rate?: number
  readonly avg_cadence?: number
  readonly normalized_power?: number
  readonly lap_trigger?: string
}

export interface RawActivity {
  readonly records: readonly RawRecord[]
  readonly sessions: readonly RawSession[]
  readonly laps: readonly RawLap[]
  readonly sport?: string
}

// ── Compact types (our LLM-optimised representation) ─────────────────────

export interface ActivitySummary {
  readonly startTime: Date
  readonly durationSeconds: number
  readonly distanceKm: number
  readonly elevationGainM: number
  readonly workKj: number
  readonly avgPowerW?: number
  readonly maxPowerW?: number
  readonly normalizedPowerW?: number
  readonly avgHeartRateBpm?: number
  readonly maxHeartRateBpm?: number
  readonly avgCadenceRpm?: number
  readonly avgSpeedKph?: number
  readonly caloriesKcal?: number
  readonly trainingStressScore?: number
  readonly intensityFactor?: number
}

export interface ZoneTime {
  readonly zone: number
  readonly label: string
  readonly seconds: number
}

export interface PowerZones {
  readonly zones: readonly ZoneTime[]
  /** FTP used for zone boundaries, if known */
  readonly ftpW?: number
}

export interface HrZones {
  readonly zones: readonly ZoneTime[]
  /** Max HR used for zone boundaries, if known */
  readonly maxHrBpm?: number
  /** Lactate threshold HR, if known */
  readonly lthrBpm?: number
}

export interface Effort {
  readonly startOffsetSeconds: number
  readonly durationSeconds: number
  readonly avgPowerW?: number
  readonly maxPowerW?: number
  readonly normalizedPowerW?: number
  readonly avgHrBpm?: number
  readonly avgSpeedKph?: number
  readonly workKj: number
  readonly aerobicDecoupling?: number
}

export interface PdPoint {
  readonly durationSeconds: number
  readonly powerW: number
}

export interface TimeseriesPoint {
  readonly offsetSeconds: number
  readonly powerW?: number
  readonly heartRateBpm?: number
  readonly cadenceRpm?: number
  readonly speedKph?: number
  readonly altitudeM?: number
}

export const FORMAT_VERSION = '1'

export interface CompactActivity {
  readonly formatVersion: typeof FORMAT_VERSION
  readonly summary: ActivitySummary
  readonly powerZones: PowerZones
  readonly hrZones: HrZones
  readonly efforts: readonly Effort[]
  readonly pdCurveHighlights: readonly PdPoint[]
  readonly timeseries: readonly TimeseriesPoint[]
}

// ── Internal fit-file-parser shape (for safe casting) ────────────────────

/** Minimal typing of the raw fit-file-parser callback data object */
export interface FitData {
  readonly records?: readonly unknown[]
  readonly sessions?: readonly unknown[]
  readonly laps?: readonly unknown[]
  readonly activity?: unknown
}
