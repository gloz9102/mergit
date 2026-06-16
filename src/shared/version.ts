// 버전 문자열 비교 — GitHub Release 태그(vX.Y.Z)와 앱 버전 비교용.
// 'v' 프리픽스 제거, build metadata(+...)는 무시, 누락 자리수는 0으로 본다.

interface ParsedVersion {
  core: [number, number, number]
  prerelease: string[]
}

function parse(v: string): ParsedVersion {
  const withoutPrefix = v.trim().replace(/^v/i, '')
  const withoutBuild = withoutPrefix.split('+')[0]
  const prereleaseAt = withoutBuild.indexOf('-')
  const core = prereleaseAt === -1 ? withoutBuild : withoutBuild.slice(0, prereleaseAt)
  const prerelease = prereleaseAt === -1 ? [] : withoutBuild.slice(prereleaseAt + 1).split('.')
  const parts = core.split('.').map((n) => {
    const num = Number(n)
    return Number.isFinite(num) ? num : 0
  })
  return { core: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0], prerelease }
}

function comparePrerelease(a: string[], b: string[]): -1 | 0 | 1 {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1

  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    const ai = a[i]
    const bi = b[i]
    if (ai === undefined) return -1
    if (bi === undefined) return 1
    if (ai === bi) continue

    const an = Number(ai)
    const bn = Number(bi)
    const aNumeric = Number.isInteger(an) && String(an) === ai
    const bNumeric = Number.isInteger(bn) && String(bn) === bi
    if (aNumeric && bNumeric) return an < bn ? -1 : 1
    if (aNumeric) return -1
    if (bNumeric) return 1
    return ai < bi ? -1 : 1
  }
  return 0
}

// a<b: -1, a==b: 0, a>b: 1
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] < pb.core[i]) return -1
    if (pa.core[i] > pb.core[i]) return 1
  }
  return comparePrerelease(pa.prerelease, pb.prerelease)
}

// latest가 current보다 높을 때만 true
export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) === 1
}
