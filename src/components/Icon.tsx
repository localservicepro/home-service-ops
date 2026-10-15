import type { SVGProps } from 'react'

const P: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z',
  jobs: 'M8 6V4.5A1.5 1.5 0 019.5 3h5A1.5 1.5 0 0116 4.5V6M3.5 8.5A1.5 1.5 0 015 7h14a1.5 1.5 0 011.5 1.5V18a2 2 0 01-2 2h-13a2 2 0 01-2-2zM3.5 12.5h17',
  calendar: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM4 10h16M8 3v4M16 3v4',
  payments: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 10h18M7 15h4',
  clients: 'M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM22 19v-1a4 4 0 00-3-3.87M15.5 3.13a3.5 3.5 0 010 6.74',
  crew: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 0112 0v1M18.5 8.5l1.5 1.5 3-3',
  settings: 'M10.4 2.8h3.2l.45 2.3 1.7.98 2.2-.8 1.6 2.77-1.75 1.53v1.96l1.75 1.53-1.6 2.77-2.2-.8-1.7.98-.45 2.3h-3.2l-.45-2.3-1.7-.98-2.2.8-1.6-2.77 1.75-1.53V9.58L4.2 8.05l1.6-2.77 2.2.8 1.7-.98zM12 13.4a2.7 2.7 0 100-5.4 2.7 2.7 0 000 5.4z',
  quote: 'M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM14 3v5h5M9 13h6M9 17h4',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 6l6 6-6 6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  nav: 'M3 11l18-8-8 18-2-8z',
  play: 'M7 4.5v15l12-7.5z',
  stop: 'M6 6h12v12H6z',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  mail: 'M3 6.5A1.5 1.5 0 014.5 5h15A1.5 1.5 0 0121 6.5v11a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5zM3.5 6l8.5 7 8.5-7',
  camera: 'M4 8a2 2 0 012-2h2l1.5-2h5L16 6h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2zM12 17a4 4 0 100-8 4 4 0 000 8z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  bell: 'M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 20a2 2 0 004 0',
  logout: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 0112 0v1',
  bolt: 'M4 13l7-9-1.4 7H20l-7 9 1.4-7H4z',
  link: 'M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  dollar: 'M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3.2c0 4.8 10 2.5 10 7.3 0 2-2.2 3.5-5 3.5s-5-1.3-5-3.3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  copy: 'M9 9h10v12H9zM5 15V3h10',
  swap: 'M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4',
}

export type IconName = keyof typeof P

export function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  const filled = name === 'bolt' || name === 'play' || name === 'stop'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} aria-hidden {...rest}>
      <path d={P[name]} stroke={filled ? 'none' : 'currentColor'} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.3 }}>
      <Icon name="bolt" size={size * 0.53} style={{ color: '#fff' }} />
    </div>
  )
}
