import type { CompactActivity, RawActivity } from './types.js'
import { FORMAT_VERSION } from './types.js'
import { extractIntervals, type IntervalConfig } from './extract/intervals.js'
import { extractPdCurve } from './extract/curve.js'
import { extractSummary, type SummaryConfig } from './extract/summary.js'
import { extractTimeseries, type TimeseriesConfig } from './extract/timeseries.js'
import { extractHrZones, extractPowerZones, type ZoneConfig } from './extract/zones.js'

export interface CompactConfig extends ZoneConfig, IntervalConfig, TimeseriesConfig, SummaryConfig {
  /** Include the coarse timeseries in the output (default: false) */
  includeTimeseries?: boolean
}

/**
 * Convert a RawActivity into a CompactActivity ready for serialisation.
 *
 * @example
 * const raw = await parse(buffer)
 * const compact = toCompact(raw, { ftpW: 280 })
 */
export function toCompact(activity: RawActivity, config: CompactConfig = {}): CompactActivity {
  return {
    formatVersion: FORMAT_VERSION,
    summary: extractSummary(activity, config),
    powerZones: extractPowerZones(activity, config),
    hrZones: extractHrZones(activity, config),
    efforts: extractIntervals(activity, config),
    pdCurveHighlights: extractPdCurve(activity),
    timeseries: config.includeTimeseries ? extractTimeseries(activity, config) : [],
  }
}
