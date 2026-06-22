import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { DiffRequest } from '../stores/uiStore'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import { toastError } from './run'

interface LatestDiffRequest {
  key: string
  title: string
  load: () => Promise<string>
}

export function workingDiffTargetKey(path: string, staged: boolean): string {
  return `working:${staged ? 'staged' : 'unstaged'}:${path}`
}

export function commitDiffTargetKey(hash: string, path: string): string {
  return `commit:${hash}:${path}`
}

export function useLatestDiff(): {
  showDiff(request: LatestDiffRequest): Promise<void>
  clearDiff(): void
} {
  const repoGeneration = useRepoStore((s) => s.repoGeneration)
  const beginDiffRequest = useUiStore((s) => s.beginDiffRequest)
  const openDiffForRequest = useUiStore((s) => s.openDiffForRequest)
  const finishDiffRequest = useUiStore((s) => s.finishDiffRequest)
  const openDiff = useUiStore((s) => s.openDiff)
  const mounted = useRef(true)
  const activeToken = useRef<DiffRequest | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const token = activeToken.current
      if (token) useUiStore.getState().finishDiffRequest(token)
      activeToken.current = null
    }
  }, [])

  const showDiff = useCallback(async (request: LatestDiffRequest): Promise<void> => {
    const token = beginDiffRequest(repoGeneration, request.key)
    activeToken.current = token
    try {
      const text = await request.load()
      if (!mounted.current) return
      if (useRepoStore.getState().repoGeneration !== token.repoGeneration) {
        finishDiffRequest(token)
        clearActiveToken(activeToken, token)
        return
      }
      openDiffForRequest(token, { title: request.title, text, targetKey: request.key })
      clearActiveToken(activeToken, token)
    } catch (err) {
      if (!mounted.current) return
      if (useRepoStore.getState().repoGeneration !== token.repoGeneration) {
        finishDiffRequest(token)
        clearActiveToken(activeToken, token)
        return
      }
      if (finishDiffRequest(token)) toastError(err)
      clearActiveToken(activeToken, token)
    }
  }, [beginDiffRequest, finishDiffRequest, openDiffForRequest, repoGeneration])

  const clearDiff = useCallback(() => {
    openDiff(null)
  }, [openDiff])

  return { showDiff, clearDiff }
}

function clearActiveToken(ref: MutableRefObject<DiffRequest | null>, token: DiffRequest): void {
  if (
    ref.current?.id === token.id &&
    ref.current.repoGeneration === token.repoGeneration &&
    ref.current.targetKey === token.targetKey
  ) {
    ref.current = null
  }
}
