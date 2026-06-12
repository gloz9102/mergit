// 패널 사이 세로 드래그 핸들 — 드래그 중 deltaX를 콜백으로 전달
export function ResizeHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  function onMouseDown(e: React.MouseEvent): void {
    e.preventDefault()
    let lastX = e.clientX
    function onMove(ev: MouseEvent): void {
      onDrag(ev.clientX - lastX)
      lastX = ev.clientX
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-emerald-500/60 active:bg-emerald-500"
    />
  )
}
