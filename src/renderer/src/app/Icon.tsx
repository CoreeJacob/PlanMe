// Small stroke icons (24×24 grid) drawn inline so the app needs no icon font.

const PATHS = {
  boards: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  panel: 'M4 5h16v14H4zM9 5v14',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  select: 'M6 3l12 9-5.5 1.2L15 19l-2.5 1.2-2.6-5.8L6 18z',
  hand: 'M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.3-5.5-3.5L3.6 13a1.4 1.4 0 0 1 2.2-1.7L8 13.5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  rename: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  reveal: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  left: 'M19 12H5M11 6l-6 6 6 6',
  right: 'M5 12h14M13 6l6 6-6 6',
  tasks: 'M4 6l1.5 1.5L8 5M11 6.5h9M4 12l1.5 1.5L8 11M11 12.5h9M4 18l1.5 1.5L8 17M11 18.5h9',
  minus: 'M5 12h14',
  note: 'M5 4h14v10l-6 6H5zM13 20v-6h6',
  text: 'M5 7V5h14v2M12 5v14M9 19h6',
  box: 'M4 6h16v12H4z',
  toFront: 'M10 10h10v10H10zM14 10V4H4v10h6',
  toBack: 'M4 4h10v10H4zM10 14v6h10V10h-6',
  rounded: 'M8 5h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}
