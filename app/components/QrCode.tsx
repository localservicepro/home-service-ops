import { useMemo } from "react";
import qrcode from "qrcode-generator";

// Crisp SVG QR code (one path), for "scan with your phone" links.
export function QrCode({ value, size = 180, className }: { value: string; size?: number; className?: string }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { path: d, n: count + 4 };
  }, [value]);
  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#08172B" />
    </svg>
  );
}
