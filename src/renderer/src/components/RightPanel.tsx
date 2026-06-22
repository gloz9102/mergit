import { useTranslation } from 'react-i18next'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import { CommitDetail } from './CommitDetail'
import { StashDetail } from './StashDetail'
import { StagingPanel } from './StagingPanel'

export function RightPanel() {
  const { t } = useTranslation()
  const selected = useUiStore((s) => s.selected)
  // 커밋 후 WIP 행이 사라지면 staging 패널 대신 안내 문구로 떨어지도록
  const hasWip = useRepoStore((s) => (s.status?.files.length ?? 0) > 0)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {selected?.type === 'commit' ? (
        <CommitDetail hash={selected.hash} />
      ) : selected?.type === 'stash' ? (
        <StashDetail oid={selected.oid} />
      ) : selected?.type === 'wip' && hasWip ? (
        <StagingPanel />
      ) : (
        <p className="p-4 text-sm text-zinc-500">{t('panel.noCommitSelected')}</p>
      )}
    </div>
  )
}
