import type { CompactActivity, Effort } from '../types.js'

export function toHistoryLine(activity: CompactActivity): string {
  const s = activity.summary
  const date = s.startTime.toISOString().slice(0, 10)
  const dur = fmtDur(s.durationSeconds)
  const dist = `${s.distanceKm.toFixed(0)}km`

  const power = [
    s.avgPowerW !== undefined ? `${s.avgPowerW}W` : null,
    s.normalizedPowerW !== undefined ? `${s.normalizedPowerW}NP` : null,
  ].filter(Boolean).join('/')

  const hr = s.avgHeartRateBpm !== undefined ? `${s.avgHeartRateBpm}bpm` : null
  const tss = s.trainingStressScore !== undefined ? `TSS ${Math.round(s.trainingStressScore)}` : null
  const iff = s.intensityFactor !== undefined ? `IF ${s.intensityFactor.toFixed(2)}` : null

  const efforts = activity.efforts.map(fmtEffort).join('; ')

  return [date, dur, dist, power, hr, tss, iff, efforts].filter(Boolean).join(' | ')
}

function fmtEffort(e: Effort): string {
  const parts = [`Z${e.zone}`, fmtDur(e.durationSeconds)]
  if (e.avgPowerW !== undefined) parts.push(`${e.avgPowerW}W`)
  if (e.avgHrBpm !== undefined) parts.push(`${e.avgHrBpm}bpm`)
  if (e.aerobicDecoupling !== undefined) {
    parts.push(`${e.aerobicDecoupling >= 0 ? '+' : ''}${e.aerobicDecoupling}%`)
  }
  return parts.join(' ')
}

function fmtDur(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
