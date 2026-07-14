const GIT_LOCALE_ENV = {
  LC_ALL: 'C',
  LANG: 'C',
  LANGUAGE: 'C'
} as const

export function configureGitEnvironment(target: NodeJS.ProcessEnv = process.env): void {
  Object.assign(target, GIT_LOCALE_ENV)
}
