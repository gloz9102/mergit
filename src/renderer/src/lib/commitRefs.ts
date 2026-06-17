export interface CommitRefBadge {
  key: string
  label: string
  kind: 'head' | 'ref'
}

export function commitRefBadges(refs: string[]): CommitRefBadge[] {
  const badges: CommitRefBadge[] = []
  const hasHead = refs.some((ref) => ref === 'HEAD' || ref.startsWith('HEAD -> '))
  const seen = new Set<string>()

  if (hasHead) {
    badges.push({ key: 'head', label: 'HEAD', kind: 'head' })
  }

  for (const ref of refs) {
    const label = ref.startsWith('HEAD -> ') ? ref.replace('HEAD -> ', '') : ref
    if (!label || label === 'HEAD' || seen.has(label)) continue
    seen.add(label)
    badges.push({ key: `ref:${label}`, label, kind: 'ref' })
  }

  return badges
}
