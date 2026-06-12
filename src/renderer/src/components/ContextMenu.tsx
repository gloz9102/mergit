import { useEffect, type ReactNode } from 'react'

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
  useEffect(() => {
    window.addEventListener('click', onClose)
    return () => window.removeEventListener('click', onClose)
  }, [onClose])

  // 화면 외곽에서 우클릭해도 메뉴가 뷰포트 밖으로 나가지 않게 클램프
  // (w-56 = 224px, 높이는 항목 4개 기준 추정치)
  const left = Math.min(x, window.innerWidth - 232)
  const top = Math.min(y, window.innerHeight - 140)

  return (
    <div
      className="fixed z-50 w-56 rounded border border-zinc-600 bg-zinc-800 py-1 text-sm shadow-xl"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
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
  label: string
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
