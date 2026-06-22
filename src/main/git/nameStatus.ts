import type { FileChangeDto } from '../../shared/types'

export function parseNameStatus(raw: string): FileChangeDto[] {
  if (raw.length === 0) return []

  const tokens = raw.split('\0')
  if (tokens[tokens.length - 1] === '') tokens.pop()

  const result: FileChangeDto[] = []
  let index = 0
  while (index < tokens.length) {
    const statusToken = tokens[index++]
    if (!statusToken) throw new Error('malformed name-status output: missing status token')

    const kind = statusToken[0]
    const scoreText = statusToken.slice(1)
    if (scoreText && !/^\d+$/.test(scoreText)) {
      throw new Error(`malformed name-status output: invalid score '${statusToken}'`)
    }

    if (kind === 'R' || kind === 'C') {
      const oldPath = tokens[index++]
      const path = tokens[index++]
      if (!oldPath || !path) {
        throw new Error(`malformed name-status output: ${kind} record requires old and new paths`)
      }
      const change: FileChangeDto = { kind, path, oldPath }
      if (scoreText) change.score = Number(scoreText)
      result.push(change)
      continue
    }

    if (scoreText) {
      throw new Error(`malformed name-status output: score is only valid for rename/copy records`)
    }

    const path = tokens[index++]
    if (!path) throw new Error(`malformed name-status output: ${kind} record requires a path`)
    result.push({ kind, path })
  }

  return result
}
