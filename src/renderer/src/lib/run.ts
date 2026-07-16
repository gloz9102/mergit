import i18n from '../i18n'
import { useRepoStore, type RefreshScope } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import type { GitErrorDto } from '../../../shared/types'

export function toastError(err: unknown): void {
  const e = err as Partial<GitErrorDto>
  const key = `error.${e.code ?? 'GIT_ERROR'}`
  const message = i18n.exists(key) ? i18n.t(key) : i18n.t('error.GIT_ERROR')
  const errorCode = e.code ?? 'GIT_ERROR'
  useUiStore.getState().pushToast(message, e.detail ?? e.message, 'error', {
    errorCode,
    persistent: errorCode === 'AUTH' || errorCode === 'REMOTE'
  })
}

// git 액션 공통 래퍼: 성공 토스트(옵션) + 에러 토스트 + 저장소 데이터 refresh
// busyKey를 주면 작업 동안 uiStore.pending[busyKey]가 켜져 진행 표시에 쓰인다
export async function run(
  action: () => Promise<void>,
  successKey?: string,
  busyKey?: string,
  refreshScope?: RefreshScope
): Promise<void> {
  const ui = useUiStore.getState()
  const mutation = ui.beginGitMutation(busyKey ?? 'git')
  if (!mutation) return
  if (busyKey) ui.setPending(busyKey, true)
  try {
    await action()
    if (successKey) useUiStore.getState().pushToast(i18n.t(successKey), undefined, 'success')
  } catch (err) {
    toastError(err)
  } finally {
    // refresh까지 끝나야 화면이 최신이므로 그 뒤에 진행 표시를 끈다
    await useRepoStore.getState().refresh(refreshScope).catch(toastError)
    if (busyKey) useUiStore.getState().setPending(busyKey, false)
    useUiStore.getState().endGitMutation(mutation)
  }
}
