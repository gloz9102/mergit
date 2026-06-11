export function getRecentRepos(): string[] {
  try {
    return JSON.parse(localStorage.getItem('recentRepos') ?? '[]') as string[]
  } catch {
    return []
  }
}

export function addRecentRepo(path: string): void {
  const list = [path, ...getRecentRepos().filter((p) => p !== path)].slice(0, 10)
  localStorage.setItem('recentRepos', JSON.stringify(list))
}
