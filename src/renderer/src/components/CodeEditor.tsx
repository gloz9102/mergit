import { useEffect, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'

export function CodeEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!ref.current) return
    const view = new EditorView({
      doc: value,
      parent: ref.current,
      extensions: [
        basicSetup,
        EditorView.theme({ '&': { height: '100%', fontSize: '12px' } }, { dark: true }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        })
      ]
    })
    viewRef.current = view
    return () => view.destroy()
    // 마운트 시 1회만 생성; 외부 value 변경은 아래 effect가 반영
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={ref} className="h-full min-h-0 overflow-hidden bg-zinc-950" />
}
