// Home Service Ops feature video. 1920x1080, 30fps, about 2:05.
// Picture only; narration and music are mixed afterwards with ffmpeg.
const NAVY = "#08172B";
const BLUE = "#0C6FD0";
const CYAN = "#35C6F4";
const WHITE = "#FFFFFF";
const SOFT = "#C9D6E8";
const FONT = "Inter";
const ICON = { fn: null };

// Scene starts, matched to the narration lines (each line starts 0.3s in).
const S = [0, 10.76, 17.19, 24.0, 36.55, 44.34, 57.53, 64.38, 87.72, 102.27, 111.14];
const END = 124.69;

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

const pop = (dur, delay = 0.25) => [
  ...fade(dur, delay, 40),
  { property: "scale", from: 0.94, to: 1, at: delay, duration: 0.9, easing: "house" },
];

function Background() {
  return [
    <rect x={0} y={0} width={1920} height={1080} fill={{ kind: "linear", angle: 135, stops: [{ offset: 0, color: "#0A2142" }, { offset: 0.55, color: NAVY }, { offset: 1, color: "#050E1C" }] }} />,
    <rect x={900} y={-300} width={1400} height={1400} radius={700} fill={{ kind: "radial", stops: [{ offset: 0, color: BLUE, opacity: 0.38 }, { offset: 1, color: BLUE, opacity: 0 }] }} />,
    <rect x={-400} y={600} width={1000} height={1000} radius={500} fill={{ kind: "radial", stops: [{ offset: 0, color: CYAN, opacity: 0.14 }, { offset: 1, color: CYAN, opacity: 0 }] }} />,
  ];
}

function Brand({ dur }) {
  return [
    <rect x={96} y={64} width={40} height={40} radius={11} fill={{ kind: "linear", angle: 135, stops: [{ offset: 0, color: CYAN }, { offset: 1, color: BLUE }] }} animate={fade(dur, 0, 0)} />,
    <text x={150} y={68} width={600} fontFamily={FONT} fontSize={26} fontWeight={700} color={WHITE} animate={fade(dur, 0, 0)}>Home Service Ops</text>,
  ];
}

// Left column copy for a feature scene.
function Copy({  dur, num, eyebrow, title, bullets, width = 660, y = 250, titleSize = 66, bulletStart = 1.4, bulletGap = 0.55 }) {
  const lines = Math.ceil(title.length / (width / (titleSize * 0.52)));
  const by = y + 70 + lines * titleSize * 1.12 + 36;
  return [
    <text x={96} y={y} width={width} fontFamily={FONT} fontSize={22} fontWeight={700} letterSpacing={3} color={CYAN} animate={fade(dur, 0.15)}>{`${num}   ${eyebrow}`}</text>,
    <text x={96} y={y + 44} width={width} fontFamily={FONT} fontSize={titleSize} fontWeight={900} lineHeight={1.08} color={WHITE} animate={fade(dur, 0.3)}>{title}</text>,
    ...bullets.flatMap((b, i) => {
      const yy = by + i * 62;
      const d = bulletStart + i * bulletGap;
      return [
        <rect x={96} y={yy + 9} width={22} height={22} radius={11} fill={CYAN} animate={fade(dur, d, 14)} />,
        ICON.fn("check", { x: 99, y: yy + 12, size: 16, color: NAVY, strokeWidth: 3.5, animate: fade(dur, d, 14) }),
        <text x={136} y={yy} width={width - 40} fontFamily={FONT} fontSize={30} fontWeight={600} color={SOFT} animate={fade(dur, d, 14)}>{b}</text>,
      ];
    }),
  ];
}

function Card({ file, x, y, w, h, dur, delay = 0.25, radius = 22 }) {
  return [
    <rect x={x - 10} y={y - 10} width={w + 20} height={h + 20} radius={radius + 8} fill="#FFFFFF" opacity={0.1} animate={pop(dur, delay)} />,
    <media file={file} x={x} y={y} width={w} height={h} fit="cover" radius={radius} shadow={{ x: 0, y: 30, blur: 70, color: "rgba(0,0,0,0.55)" }} animate={pop(dur, delay)} />,
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

function Subtitle({ dur, delay, text, y = 860, size = 54 }) {
  return <text x={160} y={y} width={1600} align="center" fontFamily={FONT} fontSize={size} fontWeight={700} color={WHITE} shadow={{ x: 0, y: 4, blur: 24, color: "rgba(0,0,0,0.7)" }} animate={fade(dur, delay)}>{text}</text>;
}

export default async function edit({ project, icon }) {
  ICON.fn = icon;
  const p = await project({ size: "1920x1080", fps: 30, background: NAVY });
  const b = [];
  for (let i = 0; i <= 8; i++) b.push(await p.add(`media/b${i}s.mp4`));
  const ui = {};
  for (const n of ["hero", "pipeline", "quote", "schedule", "pay", "crew", "crm", "leadform"]) ui[n] = await p.add(`media/${n}_2x.mp4`);

  // ---- Spine: cinematic b-roll ----
  p.cut(b[0], { from: 0, dur: S[1] - S[0], at: S[0] });
  p.cut(b[1], { from: 0, dur: S[2] - S[1], at: S[1] });
  p.cut(b[2], { from: 0.3, dur: 3.5, at: S[5] });
  p.cut(b[3], { from: 0.3, dur: 2.5, at: S[6] });
  p.cut(b[4], { from: 0.5, dur: 4.0, at: S[7] });
  p.cut(b[5], { from: 0.5, dur: 4.34, at: 83.38 });
  p.cut(b[6], { from: 0.5, dur: 5.0, at: 97.27 });
  p.cut(b[7], { from: 0.5, dur: 3.0, at: S[9] });
  p.cut(b[8], { from: 0.3, dur: 5.0, at: S[10] });

  // ---- 0. Hook ----
  {
    const d = S[1] - S[0];
    p.compose([
      <rect x={0} y={700} width={1920} height={380} fill={{ kind: "linear", angle: 90, stops: [{ offset: 0, color: "#000000", opacity: 0 }, { offset: 1, color: "#000000", opacity: 0.55 }] }} animate={fade(d, 0, 0)} />,
      <Subtitle dur={5.6} delay={0.6} text="You started your business to do great work." />,
      <group at={S[0] + 5.6} duration={d - 5.6}><Subtitle dur={d - 5.6} delay={0} text="Not to drown in paperwork." /></group>,
    ], { at: S[0], dur: d, name: "hook" });
  }

  // ---- 1. The problem ----
  {
    const d = S[2] - S[1];
    p.compose([
      <rect x={0} y={0} width={1920} height={1080} fill="#000000" opacity={0.25} />,
      <text x={160} y={330} width={1600} align="center" fontFamily={FONT} fontSize={60} fontWeight={700} color={WHITE} animate={fade(d, 0.3)}>Quotes on scraps of paper.</text>,
      <text x={160} y={440} width={1600} align="center" fontFamily={FONT} fontSize={60} fontWeight={700} color={WHITE} animate={fade(d, 2.0)}>Jobs juggled in your head.</text>,
      <text x={160} y={550} width={1600} align="center" fontFamily={FONT} fontSize={60} fontWeight={700} color={CYAN} animate={fade(d, 3.7)}>Invoices chased at midnight.</text>,
    ], { at: S[1], dur: d, name: "problem" });
  }

  // ---- 2. Meet the app ----
  {
    const d = S[3] - S[2];
    p.compose([
      ...Background(),
      <rect x={96} y={300} width={88} height={88} radius={24} fill={{ kind: "linear", angle: 135, stops: [{ offset: 0, color: CYAN }, { offset: 1, color: BLUE }] }} animate={pop(d, 0.1)} />,
      <text x={96} y={420} width={900} fontFamily={FONT} fontSize={96} fontWeight={900} lineHeight={1.0} color={WHITE} animate={fade(d, 0.3)}>{"Home Service\nOps"}</text>,
      <text x={96} y={630} width={900} fontFamily={FONT} fontSize={30} fontWeight={600} color={CYAN} animate={fade(d, 0.8)}>by Local Service Pro</text>,
      <text x={96} y={700} width={820} fontFamily={FONT} fontSize={36} fontWeight={600} color={SOFT} animate={fade(d, 1.6)}>Everything your service business needs, in one app.</text>,
      ...Card({ file: ui.hero, x: 1040, y: 230, w: 780, h: 619, dur: d, delay: 0.5 }),
    ], { at: S[2], dur: d, name: "meet" });
  }

  // ---- 3. Website enquiry form ----
  {
    const d = S[4] - S[3];
    const snippet = '<script src=".../embed" data-hso-form="greenway" async></script>';
    p.compose([
      ...Background(),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "01", eyebrow: "WEBSITE ENQUIRY FORM", title: "Catch every lead from your website", bullets: ["Name, phone and address", "The services they need", "Photos of the job", "Straight into your account"], y: 200, bulletStart: 2.2, bulletGap: 0.9 }),
      <rect x={96} y={790} width={880} height={150} radius={18} fill="#030A14" opacity={0.9} strokeColor="#1E3A5F" strokeWidth={2} animate={fade(d, 3.2)} />,
      <text x={124} y={808} width={820} fontFamily={FONT} fontSize={20} fontWeight={700} letterSpacing={2} color={CYAN} animate={fade(d, 3.2)}>ONE LINE OF CODE ON YOUR WEBSITE</text>,
      <text x={124} y={850} width={830} fontFamily="JetBrains Mono" fontSize={21} fontWeight={400} lineHeight={1.4} color="#E6EEF8" animate={fade(d, 3.4)}>{snippet}</text>,
      // phone
      <rect x={1176} y={70} width={468} height={952} radius={62} fill="#0B0F17" strokeColor="#2A3A52" strokeWidth={3} shadow={{ x: 0, y: 40, blur: 80, color: "rgba(0,0,0,0.6)" }} animate={pop(d, 0.4)} />,
      <media file={ui.leadform} x={1196} y={92} width={428} height={908} fit="cover" radius={46} animate={pop(d, 0.4)} />,
      // lands in your account
      <group at={S[3] + 9.2} duration={d - 9.2}>
        <rect x={1500} y={760} width={380} height={126} radius={20} fill={WHITE} shadow={{ x: 0, y: 20, blur: 50, color: "rgba(0,0,0,0.45)" }} animate={pop(d - 9.2, 0)} />
        <rect x={1522} y={784} width={44} height={44} radius={12} fill={BLUE} animate={pop(d - 9.2, 0)} />
        <text x={1522} y={790} width={44} align="center" fontFamily={FONT} fontSize={24} fontWeight={900} color={WHITE} animate={pop(d - 9.2, 0)}>+</text>
        <text x={1582} y={782} width={290} fontFamily={FONT} fontSize={22} fontWeight={700} color={NAVY} animate={pop(d - 9.2, 0)}>New enquiry</text>
        <text x={1582} y={814} width={290} fontFamily={FONT} fontSize={19} fontWeight={400} color="#3B4B63" lineHeight={1.3} animate={pop(d - 9.2, 0)}>{"Sarah Mitchell\nLawn mowing, hedges"}</text>
      </group>,
    ], { at: S[3], dur: d, name: "leadform" });
  }

  // ---- 4. Pipeline ----
  {
    const d = S[5] - S[4];
    p.compose([
      ...Background(),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "02", eyebrow: "LEADS AND JOBS PIPELINE", title: "See every job at a glance", width: 640, bullets: ["New and quoted", "Booked and in progress", "Invoiced and paid"], y: 290, bulletStart: 1.6, bulletGap: 0.8 }),
      ...Card({ file: ui.pipeline, x: 800, y: 270, w: 1020, h: 547, dur: d }),
    ], { at: S[4], dur: d, name: "pipeline" });
  }

  // ---- 5. Quotes ----
  p.compose(Caption({ dur: 3.5, label: "Quote on site", sub: "Straight from your phone" }), { at: S[5], dur: 3.5, name: "cap-quote" });
  {
    const at = S[5] + 3.5, d = S[6] - at;
    p.compose([
      ...Background(),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "03", eyebrow: "QUOTES", title: "Professional quotes in seconds", width: 640, bullets: ["Your own price list", "GST and notes added", "Sent by text or email", "Accepted online, booked as a job"], y: 230, bulletStart: 1.2, bulletGap: 1.3 }),
      ...Card({ file: ui.quote, x: 900, y: 220, w: 920, h: 634, dur: d }),
    ], { at, dur: d, name: "quote" });
  }

  // ---- 6. Booking ----
  p.compose(Caption({ dur: 2.5, label: "Booked in", sub: "Customers reminded automatically" }), { at: S[6], dur: 2.5, name: "cap-book" });
  {
    const at = S[6] + 2.5, d = S[7] - at;
    p.compose([
      ...Background(),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "04", eyebrow: "BOOKING AND SCHEDULE", title: "Book it. Sync it. Remind them.", width: 640, bullets: ["Drag-and-drop schedule", "Google Calendar sync", "Automatic reminders"], y: 280, bulletStart: 0.6, bulletGap: 0.6 }),
      ...Card({ file: ui.schedule, x: 800, y: 260, w: 1020, h: 585, dur: d, delay: 0.1 }),
    ], { at, dur: d, name: "schedule" });
  }

  // ---- 7. Crew app ----
  p.compose(Caption({ dur: 4.0, label: "Your crew, on the way", sub: "Each person sees only their own jobs" }), { at: S[7], dur: 4.0, name: "cap-crew" });
  {
    const at = S[7] + 4.0, d = 83.38 - at;
    p.compose([
      ...Background(),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "05", eyebrow: "STAFF ACCESS AND CREW APP", title: "Your team, on the job", width: 660, bullets: ["Only their own jobs", "One tap for directions on the map", "Job timer from arrival", "Photos of the finished work", "See who's on the job, live"], y: 220, bulletStart: 0.8, bulletGap: 2.4 }),
      ...Card({ file: ui.crew, x: 1000, y: 120, w: 820, h: 837, dur: d }),
    ], { at, dur: d, name: "crew" });
  }
  p.compose(Caption({ dur: 4.34, label: "Job complete", sub: "Photo proof, sent with the invoice" }), { at: 83.38, dur: 4.34, name: "cap-done" });

  // ---- 8. Payments ----
  {
    const at = S[8], d = 97.27 - at;
    p.compose([
      ...Background(),
      ...Brand({ dur: d }),
      ...Copy({ dur: d, num: "06", eyebrow: "INVOICES AND PAYMENTS", title: "Get paid, faster", width: 640, bullets: ["Invoice the moment it's done", "Card payments with Stripe or Square", "Direct debit for regulars", "Marks itself paid"], y: 260, bulletStart: 2.0, bulletGap: 1.6 }),
      ...Card({ file: ui.pay, x: 900, y: 250, w: 920, h: 572, dur: d }),
    ], { at, dur: d, name: "pay" });
  }
  p.compose(Caption({ dur: 5.0, label: "Paid at the door", sub: "Tap, done, marked paid" }), { at: 97.27, dur: 5.0, name: "cap-paid" });

  // ---- 9. Inbox and integrations ----
  p.compose(Caption({ dur: 3.0, label: "Back at the office", sub: "Every conversation in one place" }), { at: S[9], dur: 3.0, name: "cap-office" });
  {
    const at = S[9] + 3.0, d = S[10] - at;
    const chips = ["LeadConnector", "Xero", "Google reviews", "Stripe", "Square"];
    let cx = 1190;
    p.compose([
      ...Background(),
      ...Brand({ dur: d }),
      <text x={96} y={170} width={800} fontFamily={FONT} fontSize={22} fontWeight={700} letterSpacing={3} color={CYAN} animate={fade(d, 0.1)}>07   INBOX AND INTEGRATIONS</text>,
      <text x={96} y={214} width={900} fontFamily={FONT} fontSize={66} fontWeight={900} lineHeight={1.08} color={WHITE} animate={fade(d, 0.2)}>One inbox for every client</text>,
      <text x={96} y={300} width={900} fontFamily={FONT} fontSize={30} fontWeight={600} color={SOFT} animate={fade(d, 0.5)}>Text your customers from one shared inbox.</text>,
      ...chips.flatMap((c, i) => {
        const w = 44 + c.length * 15;
        if (i === 3) cx = 1190;
        const x = cx; cx += w + 16;
        const y = i < 3 ? 200 : 272;
        return [
          <rect x={x} y={y} width={w} height={54} radius={27} fill="#1A3354" strokeColor={CYAN} strokeWidth={2} animate={fade(d, 1.6 + i * 0.35, 12)} />,
          <text x={x} y={y + 12} width={w} align="center" fontFamily={FONT} fontSize={24} fontWeight={700} color={WHITE} animate={fade(d, 1.6 + i * 0.35, 12)}>{c}</text>,
        ];
      }),
      ...Card({ file: ui.crm, x: 160, y: 420, w: 1600, h: 544, dur: d }),
    ], { at, dur: d, name: "crm" });
  }

  // ---- 10. Close ----
  {
    const d = 5.0;
    p.compose([
      <rect x={0} y={0} width={1920} height={1080} fill="#000000" opacity={0.3} />,
      <text x={160} y={430} width={1600} align="center" fontFamily={FONT} fontSize={110} fontWeight={900} color={WHITE} shadow={{ x: 0, y: 6, blur: 30, color: "rgba(0,0,0,0.6)" }} animate={fade(d, 0.3)}>Home Service Ops</text>,
      <text x={160} y={580} width={1600} align="center" fontFamily={FONT} fontSize={46} fontWeight={700} color={CYAN} shadow={{ x: 0, y: 4, blur: 20, color: "rgba(0,0,0,0.6)" }} animate={fade(d, 1.4)}>Less admin. More jobs.</text>,
    ], { at: S[10], dur: d, name: "close" });
  }
  {
    const at = S[10] + 5.0, d = END - at;
    p.compose([
      ...Background(),
      <rect x={916} y={210} width={88} height={88} radius={24} fill={{ kind: "linear", angle: 135, stops: [{ offset: 0, color: CYAN }, { offset: 1, color: BLUE }] }} animate={pop(d, 0.1)} />,
      <text x={160} y={330} width={1600} align="center" fontFamily={FONT} fontSize={96} fontWeight={900} color={WHITE} animate={fade(d, 0.25, 26, false)}>Home Service Ops</text>,
      <text x={160} y={455} width={1600} align="center" fontFamily={FONT} fontSize={30} fontWeight={600} color={SOFT} animate={fade(d, 0.5, 26, false)}>Quotes, jobs, crews and payments. One app.</text>,
      <rect x={700} y={560} width={520} height={96} radius={48} fill={{ kind: "linear", angle: 90, stops: [{ offset: 0, color: BLUE }, { offset: 1, color: CYAN }] }} shadow={{ x: 0, y: 18, blur: 50, color: "rgba(12,111,208,0.55)" }} animate={pop(d, 1.0)} />,
      <text x={700} y={586} width={520} align="center" fontFamily={FONT} fontSize={36} fontWeight={700} color={WHITE} animate={pop(d, 1.0)}>Start your free trial</text>,
      <text x={160} y={700} width={1600} align="center" fontFamily={FONT} fontSize={40} fontWeight={700} color={WHITE} animate={fade(d, 1.5, 20, false)}>home.localservicepro.com.au</text>,
      <text x={160} y={930} width={1600} align="center" fontFamily={FONT} fontSize={22} fontWeight={600} letterSpacing={3} color={SOFT} animate={fade(d, 2.0, 10, false)}>BY LOCAL SERVICE PRO</text>,
      <rect x={0} y={0} width={1920} height={1080} fill="#000000" animate={[{ property: "opacity", keyframes: [{ at: 0, value: 0 }, { at: d - 1.2, value: 0 }, { at: d, value: 1 }] }]} />,
    ], { at, dur: d, name: "outro" });
  }

  for (const t of [3, 13, 20, 30, 40, 52, 62, 75, 92, 108, 113, 121]) await p.frame(t, `renders/f${String(t).padStart(3, "0")}.png`);
}
