/// <reference types="vite/client" />
import type { GitApi } from '../../shared/api'

declare global {
  interface Window {
    api: GitApi
  }
}

export {}
