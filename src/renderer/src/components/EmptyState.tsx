import { useTranslation } from 'react-i18next'
import { addRecentRepo, getRecentRepos } from '../lib/recentRepos'
import { toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'

export function EmptyState() {
  const { t } = useTranslation()
  const openRepo = useRepoStore((s) => s.openRepo)
  const recent = getRecentRepos()

  async function open(path: string): Promise<void> {
    try {
      await openRepo(path)
      addRecentRepo(path)
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <p className="text-lg text-zinc-400">{t('app.noRepo')}</p>
      {recent.length > 0 && (
        <div className="w-96">
          <p className="mb-1 text-xs uppercase text-zinc-500">{t('app.recentRepos')}</p>
          {recent.map((path) => (
            <button
              key={path}
              onClick={() => void open(path)}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm text-emerald-400 hover:bg-zinc-800"
            >
              {path}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
