import type { CommitDto } from './types'

// %x1f = 필드 구분자, %x1e = 레코드 구분자
export const LOG_FORMAT = '%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e'

export function parseLog(raw: string): CommitDto[] {
  return raw
    .split('\x1e')
    .map((record) => record.replace(/^[\r\n]+/, ''))
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [hash, parents, author, email, date, subject, refs] = record.split('\x1f')
      return {
        hash,
        parents: parents ? parents.split(' ') : [],
        author,
        email,
        date,
        subject,
        refs: refs ? refs.split(', ').filter(Boolean) : []
      }
    })
}
