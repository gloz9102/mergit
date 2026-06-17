import type { BranchDto } from '../../../shared/types'

export interface LimitedList<T> {
  visible: T[]
  hiddenCount: number
}

export function limitList<T>(items: T[], limit: number, bypassLimit: boolean): LimitedList<T> {
  if (bypassLimit) return { visible: items, hiddenCount: 0 }
  const safeLimit = Math.max(1, Math.floor(limit))
  return {
    visible: items.slice(0, safeLimit),
    hiddenCount: Math.max(0, items.length - safeLimit)
  }
}

export function limitBranches(
  branches: BranchDto[],
  limit: number,
  bypassLimit: boolean,
  keepCurrentVisible: boolean
): LimitedList<BranchDto> {
  if (bypassLimit) return { visible: branches, hiddenCount: 0 }
  const safeLimit = Math.max(1, Math.floor(limit))
  const visible = branches.slice(0, safeLimit)
  if (!keepCurrentVisible || visible.some((branch) => branch.current)) {
    return { visible, hiddenCount: Math.max(0, branches.length - safeLimit) }
  }
  const current = branches.find((branch) => branch.current)
  if (!current) return { visible, hiddenCount: Math.max(0, branches.length - safeLimit) }
  return {
    visible: [current, ...visible.filter((branch) => branch.name !== current.name).slice(0, safeLimit - 1)],
    hiddenCount: Math.max(0, branches.length - safeLimit)
  }
}
