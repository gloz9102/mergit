import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (
              id.includes('/@codemirror/state/') ||
              id.includes('/@lezer/')
            ) {
              return 'editor-state'
            }
            if (
              id.includes('/@codemirror/view/') ||
              id.includes('/crelt/') ||
              id.includes('/style-mod/') ||
              id.includes('/w3c-keyname/')
            ) {
              return 'editor-view'
            }
            if (id.includes('/@codemirror/') || id.includes('/codemirror/')) return 'editor-features'
            if (id.includes('/react-dom/')) return 'react-dom'
            if (id.includes('/react/') || id.includes('/scheduler/')) {
              return 'react'
            }
            if (id.includes('/i18next/') || id.includes('/react-i18next/')) return 'i18n'
            return 'vendor'
          }
        }
      }
    }
  }
})
