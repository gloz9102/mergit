import { useTranslation } from 'react-i18next'
import { useUiStore } from '../stores/uiStore'
import { CommitDetail } from './CommitDetail'
import { StagingPanel } from './StagingPanel'

export function RightPanel() {
  const { t } = useTranslation()
  const selected = useUiStore((s) => s.selected)

  return (
    <div className="flex w-80 shrink-0 flex-col overflow-hidden">
      {selected?.type === 'commit' ? (
        <CommitDetail hash={selected.hash} />
      ) : selected?.type === 'wip' ? (
        <StagingPanel />
      ) : (
        <p className="p-4 text-sm text-zinc-500">{t('panel.noCommitSelected')}</p>
      )}
    </div>
  )
}
