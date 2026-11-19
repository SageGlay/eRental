const paths = {
  refresh: 'M20 4v6h-6 M4 20v-6h6 M19.5 9A8 8 0 0 0 6 6 M4.5 15A8 8 0 0 0 18 18',
  search: 'm21 21-4.4-4.4 M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  mapPin:
    'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  arrowRight: 'M4 12h16 m-6-6 6 6-6 6',
  arrowLeft: 'M20 12H4 m6-6-6 6 6 6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  x: 'm6 6 12 12 M18 6 6 18',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  plus: 'M12 4v16 M4 12h16',
  check: 'm5 12 4 4L19 6',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3 m-4 9 3 3 5-6',
  home: 'm3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8',
  car: 'M3 16V9l3-5h12l3 5v7H3 M3 10h18 M7 16v4 M17 16v4 M6 13h2 M16 13h2',
  building: 'M4 21V3h12v18 M16 9h4v12 M8 7h4 M8 11h4 M8 15h4 M8 21v-3h4v3',
  tree: 'm12 2-6 7h3l-5 7h7v6h2v-6h7l-5-7h3l-6-7',
  tool: 'M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3',
  laptop: 'M4 4h16v12H4V4 M2 20l2-4h16l2 4H2',
  party: 'm4 20 4-13 9 9-13 4 M8 7l9 9 M15 2v4 M20 5l-3 3 M22 12h-4 M7 15l2 2',
  armchair:
    'M6 10V5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5 M5 10a3 3 0 0 0-3 3v5h20v-5a3 3 0 0 0-6 0v2H8v-2a3 3 0 0 0-3-3 M5 18v4 M19 18v4',
  shirt: 'm8 3-6 4 3 5 3-2v12h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0',
  box: 'm12 2 9 5v10l-9 5-9-5V7l9-5 M3 7l9 5 9-5 M12 12v10 M7 5l10 5',
  calendar: 'M4 5h16v16H4V5 M8 2v6 M16 2v6 M4 10h16 M8 14h2 M14 14h2',
  message: 'M21 4H3v14h5l4 4 4-4h5V4 M7 9h10 M7 13h6',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-3a8 8 0 0 1 16 0v3',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 1v2 M12 21v2 M1 12h2 M21 12h2 m-3-8-2 2 M6 18l-2 2 M4 4l2 2 m12 12 2 2',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10',
  monitor: 'M3 3h18v14H3V3 M12 17v5 M7 22h10',
  sliders: 'M4 3v18 M12 3v18 M20 3v18 M1 8h6 M9 16h6 M17 8h6',
  image: 'M3 3h18v18H3V3 m0 14 6-6 5 5 3-3 4 4 M16 7h1',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6',
  upload: 'M12 16V2 m-5 5 5-5 5 5 M3 15v7h18v-7',
  key: 'M22 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M13 11 3 21 M3 17l4 4 M7 13l4 4',
  logOut: 'M10 3H3v18h7 M8 12h14 m-5-5 5 5-5 5',
  grid: 'M3 3h7v7H3V3 M14 3h7v7h-7V3 M3 14h7v7H3v-7 M14 14h7v7h-7v-7',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2',
}

export default function Icon({
  name = 'box',
  size = 20,
  className = '',
  ...props
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.box} />
    </svg>
  )
}
