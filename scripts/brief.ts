import { readFile } from 'node:fs/promises'
import { parse } from '../src/parse.js'
import { toCompact } from '../src/compact.js'
import { toMarkdown } from '../src/serialise/markdown.js'

const args = process.argv.slice(2)

const filePath = args[0]

if (!filePath) {
  console.error('Usage: pnpm brief <path-to-file.fit> [ftpW] [maxHrBpm] [--timeseries]')
  process.exit(1)
}

const flags = new Set(args.filter((a) => a.startsWith('--')))
const nums = args.filter((a) => !a.startsWith('--'))

const buffer = await readFile(filePath)
const activity = await parse(buffer)
const ftpW = Number(nums[1]) || 200
const maxHrBpm = Number(nums[2]) || 190
const compact = toCompact(activity, {
  ftpW,
  maxHrBpm,
  includeTimeseries: flags.has('--timeseries'),
})
const markdown = toMarkdown(compact)

console.log(markdown)
