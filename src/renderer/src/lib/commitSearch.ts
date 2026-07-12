import type { HistoryOptions } from '../../../shared/types'

export function commitSearchCacheKey(
  repoPath: string,
  repoGeneration: number,
  historyVersion: number,
  options: HistoryOptions,
  text: string
): string {
  return [
    repoPath,
    repoGeneration,
    historyVersion,
    options.order,
    options.all ? 'all' : 'current',
    text
  ].join('\x00')
}
