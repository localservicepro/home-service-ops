/**
 * Starter price lists loaded during onboarding. Prices are AUD, GST-exclusive,
 * pitched at typical metro rates — every row is editable before it's saved.
 */
export interface StarterService {
  name: string
  price: number
  frequency: string
}
export interface StarterAddon {
  name: string
  price: number
  /** Names of services in this pack the add-on is offered with; empty = all. */
  for: string[]
}
export interface Trade {
  key: string
  label: string
  blurb: string
  emoji: string
  services: StarterService[]
  addons: StarterAddon[]
}

export const TRADES: Trade[] = [
  {
    key: 'lawn',
    label: 'Lawn care & gardening',
    blurb: 'Mowing, edging, hedging, green waste',
    emoji: '🌿',
    services: [
      { name: 'Lawn mow — small block', price: 55, frequency: 'Fortnightly' },
      { name: 'Lawn mow — standard block', price: 75, frequency: 'Fortnightly' },
      { name: 'Lawn mow — large block', price: 110, frequency: 'Fortnightly' },
      { name: 'Hedge trimming (per hour)', price: 70, frequency: 'One-off' },
      { name: 'Garden clean-up (per hour)', price: 65, frequency: 'One-off' },
      { name: 'Fertilise & weed control', price: 95, frequency: 'Quarterly' },
    ],
    addons: [
      { name: 'Edging & whipper snip', price: 15, for: [] },
      { name: 'Green waste removal', price: 35, for: [] },
      { name: 'Blow down paths & driveway', price: 10, for: [] },
      { name: 'Weed spray', price: 25, for: ['Lawn mow — small block', 'Lawn mow — standard block', 'Lawn mow — large block'] },
    ],
  },
  {
    key: 'cleaning',
    label: 'House cleaning',
    blurb: 'Regular, deep and end-of-lease cleans',
    emoji: '🧽',
    services: [
      { name: 'Regular clean — 2 bed', price: 140, frequency: 'Fortnightly' },
      { name: 'Regular clean — 3 bed', price: 170, frequency: 'Fortnightly' },
      { name: 'Regular clean — 4 bed', price: 210, frequency: 'Fortnightly' },
      { name: 'Deep clean', price: 320, frequency: 'One-off' },
      { name: 'End-of-lease clean — 2 bed', price: 380, frequency: 'One-off' },
      { name: 'End-of-lease clean — 3 bed', price: 480, frequency: 'One-off' },
    ],
    addons: [
      { name: 'Oven clean', price: 60, for: [] },
      { name: 'Inside fridge', price: 35, for: [] },
      { name: 'Interior windows (per room)', price: 12, for: [] },
      { name: 'Carpet steam (per room)', price: 45, for: ['End-of-lease clean — 2 bed', 'End-of-lease clean — 3 bed', 'Deep clean'] },
    ],
  },
  {
    key: 'pressure',
    label: 'Pressure washing',
    blurb: 'Driveways, roofs, decks and house washes',
    emoji: '💦',
    services: [
      { name: 'Driveway clean (up to 50 m²)', price: 180, frequency: 'One-off' },
      { name: 'House soft wash — single storey', price: 350, frequency: 'Yearly' },
      { name: 'House soft wash — double storey', price: 520, frequency: 'Yearly' },
      { name: 'Roof clean', price: 650, frequency: 'One-off' },
      { name: 'Deck / patio clean', price: 220, frequency: 'One-off' },
    ],
    addons: [
      { name: 'Paths & steps', price: 60, for: [] },
      { name: 'Gutter clean', price: 150, for: [] },
      { name: 'Surface sealing (per m²)', price: 12, for: ['Driveway clean (up to 50 m²)', 'Deck / patio clean'] },
      { name: 'Fence wash (per 10 m)', price: 45, for: [] },
    ],
  },
  {
    key: 'pest',
    label: 'Pest control',
    blurb: 'General pest, termites, rodents',
    emoji: '🐜',
    services: [
      { name: 'General pest treatment — interior & exterior', price: 220, frequency: 'Yearly' },
      { name: 'Cockroach treatment', price: 160, frequency: 'One-off' },
      { name: 'Termite inspection', price: 280, frequency: 'Yearly' },
      { name: 'Rodent control', price: 190, frequency: 'One-off' },
      { name: 'Spider treatment', price: 150, frequency: 'Six-monthly' },
    ],
    addons: [
      { name: 'Roof void treatment', price: 60, for: [] },
      { name: 'Ant perimeter barrier', price: 80, for: [] },
      { name: 'Bait station (each)', price: 25, for: ['Rodent control'] },
      { name: 'Written inspection report', price: 50, for: ['Termite inspection'] },
    ],
  },
  {
    key: 'pool',
    label: 'Pool care',
    blurb: 'Weekly service, green-to-clean, repairs',
    emoji: '🏊',
    services: [
      { name: 'Pool service — standard', price: 85, frequency: 'Weekly' },
      { name: 'Pool service — large / spa combo', price: 110, frequency: 'Weekly' },
      { name: 'Green-to-clean recovery', price: 380, frequency: 'One-off' },
      { name: 'Filter clean', price: 120, frequency: 'Quarterly' },
      { name: 'Equipment check & repair (per hour)', price: 95, frequency: 'One-off' },
    ],
    addons: [
      { name: 'Chemical balance top-up', price: 35, for: [] },
      { name: 'Salt (20 kg bag)', price: 25, for: [] },
      { name: 'Tile line clean', price: 60, for: ['Pool service — standard', 'Pool service — large / spa combo'] },
    ],
  },
  {
    key: 'handyman',
    label: 'Handyman',
    blurb: 'Repairs, assembly, odd jobs',
    emoji: '🛠️',
    services: [
      { name: 'Handyman — first hour', price: 95, frequency: 'One-off' },
      { name: 'Handyman — additional hour', price: 80, frequency: 'One-off' },
      { name: 'Flat-pack assembly (per item)', price: 70, frequency: 'One-off' },
      { name: 'TV wall mount', price: 150, frequency: 'One-off' },
      { name: 'Gutter clean — single storey', price: 180, frequency: 'Six-monthly' },
    ],
    addons: [
      { name: 'Materials & consumables', price: 30, for: [] },
      { name: 'Rubbish removal (per load)', price: 90, for: [] },
      { name: 'Cable concealment', price: 60, for: ['TV wall mount'] },
    ],
  },
]

export const tradeByKey = (key: string | null | undefined) => TRADES.find((t) => t.key === key)
