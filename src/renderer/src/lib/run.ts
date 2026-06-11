import i18n from '../i18n'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import type { GitErrorDto } from '../../../shared/types'

export function toastError(err: unknown): void {
  const e = err as Partial<GitErrorDto>
  const key = `error.${e.code ?? 'GIT_ERROR'}`
  const message = i18n.exists(key) ? i18n.t(key) : i18n.t('error.GIT_ERROR')
  useUiStore.getState().pushToast(message, e.detail ?? e.message)
}

// git 액션 공통 래퍼: 성공 토스트(옵션) + 에러 토스트 + 저장소 데이터 refresh
export async function run(action: () => Promise<void>, successKey?: string): Promise<void> {
  try {
    await action()
    if (successKey) useUiStore.getState().pushToast(i18n.t(successKey))
  } catch (err) {
    toastError(err)
  } finally {
    await useRepoStore.getState().refresh().catch(() => {})
  }
}
