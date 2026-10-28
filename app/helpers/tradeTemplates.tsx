// Shared: trades offered at sign-up and a starter price list for each (AUD, editable).

export type TradeKey = "lawn" | "cleaning" | "pressure" | "pest" | "handyman" | "pool" | "other";
export type StarterService = { name: string; price: number; freq: string };

export const TRADES: { key: TradeKey; label: string; services: StarterService[] }[] = [
  {
    key: "lawn",
    label: "Lawn & garden",
    services: [
      { name: "Lawn mowing & edging", price: 65, freq: "Bi-weekly" },
      { name: "Hedge trimming", price: 120, freq: "One-time" },
      { name: "Garden clean-up", price: 180, freq: "One-time" },
      { name: "Weeding & mulching", price: 150, freq: "One-time" },
      { name: "Lawn fertilising", price: 90, freq: "Seasonal" },
      { name: "Green waste removal", price: 80, freq: "One-time" },
    ],
  },
  {
    key: "cleaning",
    label: "Cleaning",
    services: [
      { name: "Regular home clean", price: 150, freq: "Weekly" },
      { name: "Deep clean", price: 280, freq: "One-time" },
      { name: "End of lease clean", price: 380, freq: "One-time" },
      { name: "Oven clean", price: 110, freq: "One-time" },
      { name: "Window cleaning", price: 160, freq: "One-time" },
      { name: "Carpet steam clean", price: 180, freq: "One-time" },
    ],
  },
  {
    key: "pressure",
    label: "Pressure washing",
    services: [
      { name: "Driveway clean", price: 220, freq: "One-time" },
      { name: "House soft wash", price: 450, freq: "One-time" },
      { name: "Deck clean & seal", price: 380, freq: "One-time" },
      { name: "Roof clean", price: 650, freq: "One-time" },
      { name: "Gutter clean", price: 190, freq: "Seasonal" },
      { name: "Solar panel clean", price: 180, freq: "Seasonal" },
    ],
  },
  {
    key: "pest",
    label: "Pest control",
    services: [
      { name: "General pest treatment", price: 180, freq: "Seasonal" },
      { name: "Termite inspection", price: 290, freq: "One-time" },
      { name: "Ant treatment", price: 150, freq: "One-time" },
      { name: "Rodent control", price: 220, freq: "One-time" },
      { name: "Spider treatment", price: 140, freq: "Seasonal" },
    ],
  },
  {
    key: "handyman",
    label: "Handyman & maintenance",
    services: [
      { name: "Handyman callout (first hour)", price: 90, freq: "One-time" },
      { name: "Furniture assembly", price: 120, freq: "One-time" },
      { name: "TV wall mounting", price: 150, freq: "One-time" },
      { name: "Minor repairs", price: 180, freq: "One-time" },
      { name: "Painting touch-ups", price: 250, freq: "One-time" },
    ],
  },
  {
    key: "pool",
    label: "Pool care",
    services: [
      { name: "Pool clean & chemical balance", price: 110, freq: "Weekly" },
      { name: "Green pool recovery", price: 350, freq: "One-time" },
      { name: "Filter clean", price: 90, freq: "Monthly" },
      { name: "Equipment check", price: 120, freq: "One-time" },
    ],
  },
  { key: "other", label: "Something else", services: [] },
];

export const tradeByKey = (k: string) => TRADES.find((t) => t.key === k);
