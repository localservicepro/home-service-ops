// Home Service Ops feature video, v2. 1920x1080, 30fps, 1:58.
// Picture only; narration and music are mixed by build.sh. Scene times match the clean
// narration takes (timing.json); app clips are cut to one demo cycle each (build.sh).
const NAVY = "#08172B";
const BLUE = "#0C6FD0";
const CYAN = "#35C6F4";
const WHITE = "#FFFFFF";
const SOFT = "#C9D6E8";
const FONT = "Inter";
const ICON = { fn: null };

// Scene starts: hook, problem, meet, enquiry form, pipeline, quotes, booking, crew, payments, inbox, close.
const S = [0, 5.59, 12.62, 20.03, 33.18, 41.57, 55.36, 62.81, 78.82, 93.97, 102.17];
const END = 117.92;
const CREW_CARD = [66.81, 76.62]; // crew app between the arrival shot and the finished-lawn shot
const PAY_CARD_END = 88.67;

const fade = (dur, delay = 0, rise = 26, out = true) => [
  {
    property: "opacity",
    keyframes: [
      { at: delay, value: 0, easing: "house" },
      { at: delay + 0.55, value: 1 },
      ...(out ? [{ at: Math.max(delay + 0.6, dur - 0.45), value: 1 }, { at: dur, value: 0 }] : []),
    ],
  },
  { property: "offsetY", from: rise, to: 0, at: delay, duration: 0.7, easing: "house" },
];
const pop = (dur, delay = 0.25, out = true) => [
  ...fade(dur, delay, 40, out),
  { property: "scale", from: 0.94, to: 1, at: delay, duration: 0.9, easing: "house" },
];
// Whole-scene dissolve: in over 0.4s, out over 0.4s.
const dissolve = (dur, out = true) => [
  { property: "opacity", keyframes: [{ at: 0, value: 0 }, { at: 0.4, value: 1 }, ...(out ? [{ at: dur - 0.4, value: 1 }, { at: dur, value: 0 }] : [])] },
];

function Background({ dur, flip = false, out = true }) {
  const drift = (dx, dy) => [...dissolve(dur, out), { property: "offsetX", from: -dx, to: dx, duration: dur, easing: "linear" }, { property: "offsetY", from: -dy, to: dy, duration: dur, easing: "linear" }];
  return [
    <rect x={0} y={0} width={1920} height={1080} fill={{ kind: "linear", angle: flip ? 225 : 135, stops: [{ offset: 0, color: "#0A2142" }, { offset: 0.55, color: NAVY }, { offset: 1, color: "#050E1C" }] }} animate={dissolve(dur, out)} />,
    <rect x={flip ? -500 : 900} y={-300} width={1400} height={1400} radius={700} fill={{ kind: "radial", stops: [{ offset: 0, color: BLUE, opacity: 0.38 }, { offset: 1, color: BLUE, opacity: 0 }] }} animate={drift(flip ? -70 : 70, 30)} />,
    <rect x={flip ? 1300 : -400} y={600} width={1000} height={1000} radius={500} fill={{ kind: "radial", stops: [{ offset: 0, color: CYAN, opacity: 0.14 }, { offset: 1, color: CYAN, opacity: 0 }] }} animate={drift(flip ? 50 : -50, -25)} />,
  ];
}

function Brand({ dur }) {
  return [
    <rect x={96} y={64} width={40} height={40} radius={11} fill={{ kind: "linear", angle: 135, stops: [{ offset: 0, color: CYAN }, { offset: 1, color: BLUE }] }} animate={fade(dur, 0.1, 0)} />,
    <text x={150} y={68} width={600} fontFamily={FONT} fontSize={26} fontWeight={700} color={WHITE} animate={fade(dur, 0.1, 0)}>Home Service Ops</text>,
  ];
}

// Feature copy: eyebrow, headline, ticked points. x moves it to either side of the frame.
function Copy({ dur, x = 96, num, eyebrow, title, bullets, width = 660, y = 250, titleSize = 66, bulletStart = 1.4, bulletGap = 0.55 }) {
  const lines = Math.ceil(title.length / (width / (titleSize * 0.52)));
  const by = y + 70 + lines * titleSize * 1.12 + 36;
  return [
    <text x={x} y={y} width={width} fontFamily={FONT} fontSize={22} fontWeight={700} letterSpacing={3} color={CYAN} animate={fade(dur, 0.15)}>{`${num}   ${eyebrow}`}</text>,
    <text x={x} y={y + 44} width={width} fontFamily={FONT} fontSize={titleSize} fontWeight={900} lineHeight={1.08} color={WHITE} animate={fade(dur, 0.3)}>{title}</text>,
    ...bullets.flatMap((b, i) => {
      const yy = by + i * 62;
      const d = bulletStart + i * bulletGap;
      return [
        <rect x={x} y={yy + 9} width={22} height={22} radius={11} fill={CYAN} animate={fade(dur, d, 14)} />,
        ICON.fn("check", { x: x + 3, y: yy + 12, size: 16, color: NAVY, strokeWidth: 3.5, animate: fade(dur, d, 14) }),
        <text x={x + 40} y={yy} width={width - 40} fontFamily={FONT} fontSize={30} fontWeight={600} color={SOFT} animate={fade(dur, d, 14)}>{b}</text>,
      ];
    }),
  ];
}

// Pops in, then pushes in slowly for the rest of the scene so a held frame never sits still.
// Scale anchors at the top-left, so the offsets keep it centred.
function pushIn(dur, delay, w, h, end = 1.035) {
  const settle = delay + 0.9;
  const shift = (sc, size) => -((sc - 1) * size) / 2;
  return [
    ...fade(dur, delay, 0).filter((a) => a.property === "opacity"),
    { property: "scale", keyframes: [{ at: delay, value: 0.94, easing: "house" }, { at: settle, value: 1, easing: "linear" }, { at: dur, value: end }] },
    { property: "offsetX", keyframes: [{ at: delay, value: shift(0.94, w), easing: "house" }, { at: settle, value: 0, easing: "linear" }, { at: dur, value: shift(end, w) }] },
    { property: "offsetY", keyframes: [{ at: delay, value: shift(0.94, h) + 40, easing: "house" }, { at: settle, value: 0, easing: "linear" }, { at: dur, value: shift(end, h) }] },
  ];
}

function Card({ file, x, y, w, h, dur, delay = 0.25, radius = 22 }) {
  return [
    <rect x={x - 10} y={y - 10} width={w + 20} height={h + 20} radius={radius + 8} fill="#FFFFFF" opacity={0.1} animate={pushIn(dur, delay, w + 20, h + 20)} />,
    <media file={file} x={x} y={y} width={w} height={h} fit="cover" radius={radius} shadow={{ x: 0, y: 30, blur: 70, color: "rgba(0,0,0,0.55)" }} animate={pushIn(dur, delay, w, h)} />,
  ];
}

// Lower-left chapter label over b-roll.
function Caption({ dur, label, sub }) {
  return [
    <rect x={0} y={680} width={1920} height={400} fill={{ kind: "linear", angle: 90, stops: [{ offset: 0, color: "#000000", opacity: 0 }, { offset: 1, color: "#000000", opacity: 0.62 }] }} animate={fade(dur, 0, 0)} />,
    <rect x={96} y={884} width={6} height={sub ? 92 : 52} radius={3} fill={CYAN} animate={fade(dur, 0.2, 10)} />,
    <text x={124} y={880} width={1400} fontFamily={FONT} fontSize={44} fontWeight={700} color={WHITE} animate={fade(dur, 0.25)}>{label}</text>,
    ...(sub ? [<text x={124} y={940} width={1400} fontFamily={FONT} fontSize={28} fontWeight={400} color={SOFT} animate={fade(dur, 0.45)}>{sub}</text>] : []),
  ];
}

function Subtitle({ dur, delay, text, y = 860, size = 54, color = WHITE }) {
  return <text x={160} y={y} width={1600} align="center" fontFamily={FONT} fontSize={size} fontWeight={700} color={color} shadow={{ x: 0, y: 4, blur: 24, color: "rgba(0,0,0,0.7)" }} animate={fade(dur, delay)}>{text}</text>;
}

export default async function edit({ project, icon }) {
  ICON.fn = icon;
  const p = await project({ size: "1920x1080", fps: 30, background: NAVY });
  const b = [];
  for (let i = 0; i <= 8; i++) b.push(await p.add(`media/b${i}.mp4`));
  const ui = {};
  for (const n of ["hero", "pipeline", "quote", "schedule", "pay", "crew", "crm", "leadform"]) ui[n] = await p.add(`media/${n}.mp4`);

  // ---- Spine: cinematic b-roll ----
  p.cut(b[0], { from: 0, dur: S[1] - S[0], at: S[0] });
  p.cut(b[1], { from: 0, dur: S[2] - S[1], at: S[1] });
  p.cut(b[2], { from: 0.3, dur: 3.5, at: S[5] });
  p.cut(b[3], { from: 0.3, dur: 2.5, at: S[6] });
  p.cut(b[4], { from: 0.5, dur: CREW_CARD[0] - S[7], at: S[7] });
  p.cut(b[5], { from: 0.5, dur: S[8] - CREW_CARD[1], at: CREW_CARD[1] });
  p.cut(b[6], { from: 0.5, dur: S[9] - PAY_CARD_END, at: PAY_CARD_END });
  p.cut(b[7], { from: 0.5, dur: 2.6, at: S[9] });
  p.cut(b[8], { from: 0.3, dur: 4.5, at: S[10] });

  // ---- 0. Hook ----
  {
    const d = S[1] - S[0];
    p.compose([
      <rect x={0} y={700} width={1920} height={380} fill={{ kind: "linear", angle: 90, stops: [{ offset: 0, color: "#000000", opacity: 0 }, { offset: 1, color: "#000000", opacity: 0.55 }] }} animate={fade(d, 0, 0)} />,
      <Subtitle dur={d} delay={0.5} text="You started your business to do great work." />,
      <Subtitle dur={d} delay={3.0} y={935} size={44} color={CYAN} text="Not to drown in paperwork." />,
    ], { at: S[0], dur: d, name: "hook" });
  }

  // ---- 1. The problem ----
  {
    const d = S[2] - S[1];
    p.compose([
      <rect x={0} y={0} width={1920} height={1080} fill="#000000" opacity={0.28} />,
      <text x={160} y={330} width={1600} align="center" fontFamily={FONT} fontSize={60} fontWeight={700} color={WHITE} animate={fade(d, 0.4)}>Quotes on scraps of paper.</text>,
      <text x={160} y={440} width={1600} align="center" fontFamily={FONT} fontSize={60} fontWeight={700} color={WHITE} animate={fade(d, 2.1)}>Jobs juggled in your head.</text>,
      <text x={160} y={550} width={1600} align="center" fontFamily={FONT} fontSize={60} fontWeight={700} color={CYAN} animate={fade(d, 3.8)}>Invoices chased at midnight.</text>,
    ], { at: S[1], dur: d, name: "problem" });
  }

  // ---- 2. Meet the app ----
  {
    const d = S[3] - S[2];
    p.compose([
      ...Background({ dur: d }),
      <rect x={96} y={300} width={88} height={88} radius={24} fill={{ kind: "linear", angle: 135, stops: [{ offset: 0, color: CYAN }, { offset: 1, color: BLUE }] }} animate={pop(d, 0.1)} />,
      <text x={96} y={420} width={900} fontFamily={FONT} fontSize={96} fontWeight={900} lineHeight={1.0} color={WHITE} animate={fade(d, 0.3)}>{"Home Service\nOps"}</text>,
      <text x={96} y={630} width={900} fontFamily={FONT} fontSize={30} fontWeight={600} color={CYAN} animate={fade(d, 0.8)}>by Local Service Pro</text>,
      <text x={96} y={700} width={820} fontFamily={FONT} fontSize={36} fontWeight={600} color={SOFT} animate={fade(d, 2.6)}>Everything your service business needs, in one app.</text>,
      ...Card({ file: ui.hero, x: 1040, y: 230, w: 780, h: 619, dur: d, delay: 0.5 }),
    ], { at: S[2], dur: d, name: "meet" });
  }

  // ---- 3. Website enquiry form (phone right) ----
  {
    const d = S[4] - S[3];
    const snippet = '<script src=".../embed" data-hso-form="greenway" async></script>';
    const sent = 10.0; // "Request sent" in the trimmed clip
    p.compose([
      ...Background({ dur: d }),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "01", eyebrow: "WEBSITE ENQUIRY FORM", title: "Catch every lead from your website", bullets: ["Name, phone and address", "The services they need", "Photos of the job", "Straight into your account"], y: 200, bulletStart: 2.2, bulletGap: 1.0 }),
      <rect x={96} y={790} width={880} height={150} radius={18} fill="#030A14" opacity={0.9} strokeColor="#1E3A5F" strokeWidth={2} animate={fade(d, 3.4)} />,
      <text x={124} y={808} width={820} fontFamily={FONT} fontSize={20} fontWeight={700} letterSpacing={2} color={CYAN} animate={fade(d, 3.4)}>ONE LINE OF CODE ON YOUR WEBSITE</text>,
      <text x={124} y={850} width={830} fontFamily="JetBrains Mono" fontSize={21} fontWeight={400} lineHeight={1.4} color="#E6EEF8" animate={fade(d, 3.6)}>{snippet}</text>,
      <rect x={1176} y={70} width={468} height={952} radius={62} fill="#0B0F17" strokeColor="#2A3A52" strokeWidth={3} shadow={{ x: 0, y: 40, blur: 80, color: "rgba(0,0,0,0.6)" }} animate={pushIn(d, 0.4, 468, 952, 1.025)} />,
      <media file={ui.leadform} x={1196} y={92} width={428} height={908} fit="cover" radius={46} animate={pushIn(d, 0.4, 428, 908, 1.025)} />,
      <group at={S[3] + sent} duration={d - sent}>
        <rect x={1500} y={760} width={380} height={126} radius={20} fill={WHITE} shadow={{ x: 0, y: 20, blur: 50, color: "rgba(0,0,0,0.45)" }} animate={pop(d - sent, 0)} />
        <rect x={1522} y={784} width={44} height={44} radius={12} fill={BLUE} animate={pop(d - sent, 0)} />
        <text x={1522} y={790} width={44} align="center" fontFamily={FONT} fontSize={24} fontWeight={900} color={WHITE} animate={pop(d - sent, 0)}>+</text>
        <text x={1582} y={782} width={290} fontFamily={FONT} fontSize={22} fontWeight={700} color={NAVY} animate={pop(d - sent, 0)}>New enquiry</text>
        <text x={1582} y={814} width={290} fontFamily={FONT} fontSize={19} fontWeight={400} color="#3B4B63" lineHeight={1.3} animate={pop(d - sent, 0)}>{"Sarah Mitchell\nLawn mowing, hedges"}</text>
      </group>,
    ], { at: S[3], dur: d, name: "leadform" });
  }

  // ---- 4. Pipeline (card right) ----
  {
    const d = S[5] - S[4];
    p.compose([
      ...Background({ dur: d, flip: true }),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "02", eyebrow: "LEADS AND JOBS PIPELINE", title: "See every job at a glance", width: 640, bullets: ["New and quoted", "Booked and in progress", "Invoiced and paid"], y: 290, bulletStart: 1.6, bulletGap: 1.2 }),
      ...Card({ file: ui.pipeline, x: 800, y: 270, w: 1020, h: 547, dur: d }),
    ], { at: S[4], dur: d, name: "pipeline" });
  }

  // ---- 5. Quotes (card left) ----
  p.compose(Caption({ dur: 3.5, label: "Quote on site", sub: "Straight from your phone" }), { at: S[5], dur: 3.5, name: "cap-quote" });
  {
    const at = S[5] + 3.5, d = S[6] - at;
    p.compose([
      ...Background({ dur: d }),
      ...Brand({ dur: d }),
      ...Card({ file: ui.quote, x: 100, y: 220, w: 920, h: 634, dur: d }),
      ...Copy({ dur: d, x: 1130, num: "03", eyebrow: "QUOTES", title: "Professional quotes in seconds", width: 690, bullets: ["Your own price list", "GST and notes added", "Sent by text or email", "Accepted online, booked as a job"], y: 230, bulletStart: 0.8, bulletGap: 1.6 }),
    ], { at, dur: d, name: "quote" });
  }

  // ---- 6. Booking (card right) ----
  p.compose(Caption({ dur: 2.5, label: "Booked in", sub: "Customers reminded automatically" }), { at: S[6], dur: 2.5, name: "cap-book" });
  {
    const at = S[6] + 2.5, d = S[7] - at;
    p.compose([
      ...Background({ dur: d, flip: true }),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "04", eyebrow: "BOOKING AND SCHEDULE", title: "Book it. Sync it. Remind them.", width: 640, bullets: ["Drag-and-drop schedule", "Google Calendar sync", "Automatic reminders"], y: 280, bulletStart: 0.5, bulletGap: 0.9 }),
      ...Card({ file: ui.schedule, x: 800, y: 260, w: 1020, h: 585, dur: d, delay: 0.1 }),
    ], { at, dur: d, name: "schedule" });
  }

  // ---- 7. Crew app (phone left) ----
  p.compose(Caption({ dur: CREW_CARD[0] - S[7], label: "Your crew, on the way", sub: "Each person sees only their own jobs" }), { at: S[7], dur: CREW_CARD[0] - S[7], name: "cap-crew" });
  {
    const [at, until] = CREW_CARD, d = until - at;
    p.compose([
      ...Background({ dur: d }),
      ...Brand({ dur: d }),
      ...Card({ file: ui.crew, x: 100, y: 125, w: 820, h: 837, dur: d }),
      ...Copy({ dur: d, x: 1060, num: "05", eyebrow: "STAFF ACCESS AND CREW APP", title: "Your team, on the job", width: 760, bullets: ["One tap for directions on the map", "Job timer from arrival", "Photos of the finished work", "See who's on the job, live"], y: 230, bulletStart: 0.4, bulletGap: 2.1 }),
    ], { at, dur: d, name: "crew" });
  }
  p.compose(Caption({ dur: S[8] - CREW_CARD[1], label: "Job complete", sub: "Photo proof, sent with the invoice" }), { at: CREW_CARD[1], dur: S[8] - CREW_CARD[1], name: "cap-done" });

  // ---- 8. Payments (card right) ----
  {
    const at = S[8], d = PAY_CARD_END - at;
    p.compose([
      ...Background({ dur: d, flip: true }),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "06", eyebrow: "INVOICES AND PAYMENTS", title: "Get paid, faster", width: 640, bullets: ["Invoice the moment it's done", "Card payments with Stripe or Square", "Direct debit for regulars", "Marks itself paid"], y: 260, bulletStart: 1.6, bulletGap: 1.7 }),
      ...Card({ file: ui.pay, x: 900, y: 250, w: 920, h: 572, dur: d }),
    ], { at, dur: d, name: "pay" });
  }
  p.compose(Caption({ dur: S[9] - PAY_CARD_END, label: "Paid at the door", sub: "Tap, done, marked paid" }), { at: PAY_CARD_END, dur: S[9] - PAY_CARD_END, name: "cap-paid" });

  // ---- 9. Inbox and integrations (wide card) ----
  p.compose(Caption({ dur: 2.6, label: "Back at the office", sub: "Every conversation in one place" }), { at: S[9], dur: 2.6, name: "cap-office" });
  {
    const at = S[9] + 2.6, d = S[10] - at;
    const chips = ["LeadConnector", "Xero", "Google reviews", "Stripe", "Square"];
    let cx = 1190;
    p.compose([
      ...Background({ dur: d }),
      ...Brand({ dur: d }),
      <text x={96} y={170} width={800} fontFamily={FONT} fontSize={22} fontWeight={700} letterSpacing={3} color={CYAN} animate={fade(d, 0.1)}>07   INBOX AND INTEGRATIONS</text>,
      <text x={96} y={214} width={900} fontFamily={FONT} fontSize={66} fontWeight={900} lineHeight={1.08} color={WHITE} animate={fade(d, 0.2)}>One inbox for every client</text>,
      <text x={96} y={300} width={900} fontFamily={FONT} fontSize={30} fontWeight={600} color={SOFT} animate={fade(d, 0.5)}>Text your customers from one shared inbox.</text>,
      ...chips.flatMap((c, i) => {
        const w = 44 + c.length * 15;
        if (i === 3) cx = 1190;
        const x = cx;
        cx += w + 16;
        const y = i < 3 ? 200 : 272;
        return [
          <rect x={x} y={y} width={w} height={54} radius={27} fill="#1A3354" strokeColor={CYAN} strokeWidth={2} animate={fade(d, 1.2 + i * 0.3, 12)} />,
          <text x={x} y={y + 12} width={w} align="center" fontFamily={FONT} fontSize={24} fontWeight={700} color={WHITE} animate={fade(d, 1.2 + i * 0.3, 12)}>{c}</text>,
        ];
      }),
      ...Card({ file: ui.crm, x: 160, y: 420, w: 1600, h: 544, dur: d }),
    ], { at, dur: d, name: "crm" });
  }

  // ---- 10. Close: name over the team shot, then the end card ----
  {
    const d = 4.5;
    p.compose([
      <rect x={0} y={0} width={1920} height={1080} fill="#000000" opacity={0.3} />,
      <text x={160} y={430} width={1600} align="center" fontFamily={FONT} fontSize={110} fontWeight={900} color={WHITE} shadow={{ x: 0, y: 6, blur: 30, color: "rgba(0,0,0,0.6)" }} animate={fade(d, 0.3)}>Home Service Ops</text>,
      <text x={160} y={580} width={1600} align="center" fontFamily={FONT} fontSize={46} fontWeight={700} color={CYAN} shadow={{ x: 0, y: 4, blur: 20, color: "rgba(0,0,0,0.6)" }} animate={fade(d, 1.3)}>Less admin. More jobs.</text>,
    ], { at: S[10], dur: d, name: "close" });
  }
  {
    const at = S[10] + 4.5, d = END - at;
    const recap = ["Enquiry form", "Quotes", "Booking", "Crew app", "Payments", "Inbox"];
    const widths = recap.map((r) => 56 + r.length * 15);
    const total = widths.reduce((a, w) => a + w, 0) + 14 * (recap.length - 1);
    let rx = (1920 - total) / 2;
    p.compose([
      ...Background({ dur: d, out: false }),
      <rect x={916} y={150} width={88} height={88} radius={24} fill={{ kind: "linear", angle: 135, stops: [{ offset: 0, color: CYAN }, { offset: 1, color: BLUE }] }} animate={pop(d, 0.1, false)} />,
      <text x={160} y={270} width={1600} align="center" fontFamily={FONT} fontSize={96} fontWeight={900} color={WHITE} animate={fade(d, 0.25, 26, false)}>Home Service Ops</text>,
      <text x={160} y={395} width={1600} align="center" fontFamily={FONT} fontSize={30} fontWeight={600} color={SOFT} animate={fade(d, 0.5, 26, false)}>Everything your service business needs, in one app.</text>,
      ...recap.flatMap((r, i) => {
        const x = rx;
        rx += widths[i] + 14;
        return [
          <rect x={x} y={470} width={widths[i]} height={52} radius={26} fill="#122A4A" strokeColor={CYAN} strokeWidth={2} animate={fade(d, 0.9 + i * 0.18, 10, false)} />,
          <text x={x} y={482} width={widths[i]} align="center" fontFamily={FONT} fontSize={22} fontWeight={700} color={WHITE} animate={fade(d, 0.9 + i * 0.18, 10, false)}>{r}</text>,
        ];
      }),
      <rect x={700} y={590} width={520} height={96} radius={48} fill={{ kind: "linear", angle: 90, stops: [{ offset: 0, color: BLUE }, { offset: 1, color: CYAN }] }} shadow={{ x: 0, y: 18, blur: 50, color: "rgba(12,111,208,0.55)" }} animate={pop(d, 2.2, false)} />,
      <text x={700} y={616} width={520} align="center" fontFamily={FONT} fontSize={36} fontWeight={700} color={WHITE} animate={pop(d, 2.2, false)}>Start your free trial</text>,
      <text x={160} y={725} width={1600} align="center" fontFamily={FONT} fontSize={40} fontWeight={700} color={WHITE} animate={fade(d, 2.6, 20, false)}>home.localservicepro.com.au</text>,
      <text x={160} y={950} width={1600} align="center" fontFamily={FONT} fontSize={22} fontWeight={600} letterSpacing={3} color={SOFT} animate={fade(d, 3.0, 10, false)}>BY LOCAL SERVICE PRO</text>,
      <rect x={0} y={0} width={1920} height={1080} fill="#000000" animate={[{ property: "opacity", keyframes: [{ at: 0, value: 0 }, { at: d - 1.3, value: 0 }, { at: d, value: 1 }] }]} />,
    ], { at, dur: d, name: "outro" });
  }

  for (const t of [2, 9, 16, 30, 38, 50, 60, 70, 85, 99, 110, 116]) await p.frame(t, `renders/f${String(t).padStart(3, "0")}.png`);
}
