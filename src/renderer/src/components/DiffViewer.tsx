export function DiffViewer({ text }: { text: string }) {
  return (
    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre font-mono text-xs leading-5">
      {text.split('\n').map((line, i) => {
        const cls = line.startsWith('--- ') || line.startsWith('+++ ')
          ? 'text-zinc-500'
          : line.startsWith('+')
            ? 'bg-emerald-950 text-emerald-300'
            : line.startsWith('-')
              ? 'bg-red-950 text-red-300'
              : line.startsWith('@@')
                ? 'text-sky-400'
                : 'text-zinc-400'
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}
