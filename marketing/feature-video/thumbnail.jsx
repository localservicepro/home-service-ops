// YouTube thumbnail, rendered at 1920x1080 and exported at 1280x720.
// media/bg.png: b-roll b3 (pool technician) at 2.5s. media/quote.png: last frame of the quote clip (Accepted).
export default async function edit({ project, icon }) {
  const p = await project({ size: "1920x1080", fps: 30, background: "#08172B" });
  const bg = await p.add("media/bg.png");
  const quote = await p.add("media/quote.png");
  const NAVY = "#08172B", BLUE = "#0C6FD0", CYAN = "#35C6F4", WHITE = "#FFFFFF";
  p.compose([
    // The photo with his face clear on the right; navy fades in from the left behind the headline.
    <media file={bg} x={140} y={0} width={1920} height={1080} fit="cover" />,
    <rect x={0} y={0} width={1920} height={1080} fill={{ kind: "linear", angle: 90, stops: [{ offset: 0, color: NAVY, opacity: 1 }, { offset: 0.34, color: NAVY, opacity: 0.96 }, { offset: 0.52, color: NAVY, opacity: 0.45 }, { offset: 0.66, color: NAVY, opacity: 0 }] }} />,
    <rect x={0} y={860} width={1920} height={220} fill={{ kind: "linear", angle: 180, stops: [{ offset: 0, color: NAVY, opacity: 0 }, { offset: 1, color: NAVY, opacity: 0.55 }] }} />,

    // Brand pill.
    <rect x={80} y={78} width={470} height={78} radius={39} fill="#0F2747" strokeColor={CYAN} strokeWidth={3} />,
    <rect x={98} y={92} width={50} height={50} radius={14} fill={{ kind: "linear", angle: 135, stops: [{ offset: 0, color: CYAN }, { offset: 1, color: BLUE }] }} />,
    icon("zap", { x: 108, y: 102, size: 30, color: WHITE, strokeWidth: 2.6 }),
    <text x={164} y={97} width={380} fontFamily="Inter" fontSize={36} fontWeight={900} color={WHITE}>Home Service Ops</text>,

    // Headline.
    <text x={80} y={215} width={1000} fontFamily="Inter" fontSize={168} fontWeight={900} lineHeight={0.98} color={WHITE} shadow={{ x: 0, y: 8, blur: 30, color: "rgba(0,0,0,0.45)" }}>{"QUOTE.\nBOOK."}</text>,
    <text x={80} y={545} width={1100} fontFamily="Inter" fontSize={168} fontWeight={900} lineHeight={0.98} color={CYAN} shadow={{ x: 0, y: 8, blur: 30, color: "rgba(0,0,0,0.45)" }}>GET PAID.</text>,
    <rect x={84} y={745} width={640} height={10} radius={5} fill={{ kind: "linear", angle: 90, stops: [{ offset: 0, color: CYAN }, { offset: 1, color: BLUE }] }} />,
    <text x={80} y={790} width={900} fontFamily="Inter" fontSize={52} fontWeight={700} color={WHITE}>One app for your whole</text>,
    <text x={80} y={856} width={900} fontFamily="Inter" fontSize={52} fontWeight={700} color={WHITE}>service business</text>,

    // The real quote card with its Accepted stamp, by his phone.
    <rect x={990} y={630} width={560} height={387} radius={26} fill="#FFFFFF" opacity={0.18} />,
    <media file={quote} x={1000} y={640} width={540} height={367} fit="cover" radius={20} shadow={{ x: 0, y: 30, blur: 60, color: "rgba(0,0,0,0.55)" }} />,

    // Payment alert, styled like the app's, for the same $418 quote.
    <rect x={1380} y={560} width={500} height={130} radius={24} fill="#0E1B2E" shadow={{ x: 0, y: 24, blur: 50, color: "rgba(0,0,0,0.5)" }} />,
    <rect x={1404} y={584} width={82} height={82} radius={22} fill="#1FAE6B" />,
    icon("check", { x: 1421, y: 601, size: 48, color: WHITE, strokeWidth: 3.4 }),
    <text x={1508} y={582} width={360} fontFamily="Inter" fontSize={40} fontWeight={900} color={WHITE}>Paid $418</text>,
    <text x={1508} y={634} width={360} fontFamily="Inter" fontSize={26} fontWeight={600} color="#A9BBD3">Straight to your account</text>,
  ], { at: 0, dur: 1 });
  await p.frame(0.5, "renders/thumb.png");
}
