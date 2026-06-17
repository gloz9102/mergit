import { useEffect, useRef, type ReactNode } from 'react'

// 우클릭 컨텍스트 메뉴 — 바깥 클릭으로 닫히고, 내부 클릭은 전파를 막는다.
// 항목은 MenuItem으로 구성하며 각 onClick에서 onClose를 호출해 닫는다.
export function ContextMenu({
  x,
  y,
  onClose,
  children
}: {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: PointerEvent): void {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }

    function onContextMenu(e: MouseEvent): void {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }

    // 메뉴를 여는 같은 이벤트를 잡지 않도록 현재 dispatch 뒤에 등록한다.
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown, true)
      window.addEventListener('contextmenu', onContextMenu, true)
      window.addEventListener('keydown', onKeyDown)
    }, 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('contextmenu', onContextMenu, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  // 화면 외곽에서 우클릭해도 메뉴가 뷰포트 밖으로 나가지 않게 클램프
  // (w-56 = 224px, 높이는 항목 4개 기준 추정치)
  const left = Math.min(x, window.innerWidth - 232)
  const top = Math.min(y, window.innerHeight - 140)

  return (
    <div
      ref={ref}
      className="fixed z-50 w-56 rounded border border-zinc-600 bg-zinc-800 py-1 text-sm shadow-xl"
      style={{ left, top }}
    >
      {children}
    </div>
  )
}

export function MenuItem({
  label,
  onClick,
  disabled,
  danger
}: {
  label: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`block w-full px-3 py-1 text-left hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? 'text-red-400' : ''
      }`}
    >
      {label}
    </button>
  )
}
