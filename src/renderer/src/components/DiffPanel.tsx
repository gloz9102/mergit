import { useTranslation } from 'react-i18next'
import { useUiStore } from '../stores/uiStore'
import { DiffViewer } from './DiffViewer'

// 중앙 영역에서 그래프를 대체해 diff를 크게 보여주는 패널
export function DiffPanel() {
  const { t } = useTranslation()
  const diffView = useUiStore((s) => s.diffView)
  const openDiff = useUiStore((s) => s.openDiff)
  if (!diffView) return null

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-zinc-700">
      <div className="flex items-center gap-2 border-b border-zinc-700 bg-zinc-800 px-3 py-1.5">
        <span title={diffView.title} className="min-w-0 truncate font-mono text-xs text-zinc-300">
          {diffView.title}
        </span>
        <button
          onClick={() => openDiff(null)}
          className="ml-auto shrink-0 rounded px-2 py-0.5 text-sm text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
        >
          ✕ {t('common.close')}
        </button>
      </div>
      <DiffViewer text={diffView.text} />
    </div>
  )
}
