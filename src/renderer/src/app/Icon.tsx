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
  left: 'M19 12H5M11 6l-6 6 6 6',
  right: 'M5 12h14M13 6l6 6-6 6',
  tasks: 'M4 6l1.5 1.5L8 5M11 6.5h9M4 12l1.5 1.5L8 11M11 12.5h9M4 18l1.5 1.5L8 17M11 18.5h9',
  minus: 'M5 12h14',
  note: 'M5 4h14v10l-6 6H5zM13 20v-6h6',
  text: 'M5 7V5h14v2M12 5v14M9 19h6',
  box: 'M4 6h16v12H4z',
  arrow: 'M5 19L19 5M10 5h9v9',
  oval: 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z',
  diamond: 'M12 3l9 9-9 9-9-9z',
  parallelogram: 'M8 6h13l-5 12H3z',
  cylinder: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3zM4 6c0 1.7 3.6 3 8 3s8-1.3 8-3',
  section: 'M3 8h18v12H3zM3 8V4h8v4',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 4 4 3-3L20 17M15.5 9.5h.01',
  flag: 'M6 21V4M6 4h11l-2.5 4 2.5 4H6',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  elbow: 'M4 6h8v12h8M16 14l4 4-4 4',
  dashed: 'M4 12h3M10.5 12h3M17 12h3',
  heads: 'M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4',
  toFront: 'M10 10h10v10H10zM14 10V4H4v10h6',
  toBack: 'M4 4h10v10H4zM10 14v6h10V10h-6',
  rounded: 'M8 5h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8h.01',
  details: 'M5 6h14M5 10h14M5 14h14M5 18h9',
  bullets: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  themeAuto: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M12 7h4M12 11h6M12 15h5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v10H5z',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  alignLeft: 'M4 3v18M8 6h11v4H8zM8 14h6v4H8z',
  alignCentre: 'M12 3v18M6 6h12v4H6zM9 14h6v4H9z',
  alignRight: 'M20 3v18M5 6h11v4H5zM10 14h6v4h-6z',
  alignTop: 'M3 4h18M6 8h4v11H6zM14 8h4v6h-4z',
  alignMiddle: 'M3 12h18M6 6h4v12H6zM14 9h4v6h-4z',
  alignBottom: 'M3 20h18M6 5h4v11H6zM14 10h4v6h-4z',
  spreadAcross: 'M3 4v16M21 4v16M9 8h6v8H9z',
  spreadDown: 'M4 3h16M4 21h16M8 9h8v6H8z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
  tab: 'M3 20V8h18v12zM3 8V4.5h7.5L12 8',
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
