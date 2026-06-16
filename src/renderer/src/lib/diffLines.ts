export const DIFF_ROW_H = 20
export const DIFF_OVERSCAN = 20

export function diffLineClass(line: string): string {
  if (line.startsWith('--- ') || line.startsWith('+++ ')) return 'text-zinc-500'
  if (line.startsWith('+')) return 'bg-emerald-950 text-emerald-300'
  if (line.startsWith('-')) return 'bg-red-950 text-red-300'
  if (line.startsWith('@@')) return 'text-sky-400'
  return 'text-zinc-400'
}
