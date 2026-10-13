"use client";
import { useState } from "react";

/**
 * TBA brand lockup (Transworld Business Advisors).
 *
 * Shows the official logo image when it is present, and otherwise a clean,
 * intentional typographic wordmark — "TBA" in the brand green with the full
 * "Transworld Business Advisors" name beneath it. The wordmark is the default,
 * so a missing logo file never shows a broken/placeholder image.
 *
 * ── Swapping in the official logo ─────────────────────────────────────────────
 * Drop the official file here (transparent background; SVG preferred, PNG fine):
 *
 *       public/brand/tba-logo.svg
 *
 * It is then picked up automatically everywhere this component is used — the
 * login screen and the advisor / ops / master headers. No other code change is
 * needed. To use a different path or file name, or to force the wordmark, edit
 * TBA_LOGO_SRC below (set it to null to always render the wordmark).
 *
 * Do NOT commit a third-party trademarked logo unless TBA has provided it / you
 * have the rights to use it. The wordmark below is a plain typographic placeholder.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export const TBA_LOGO_SRC: string | null = "/brand/tba-logo.svg";

type Size = "sm" | "lg";
type Tone = "brand" | "inverse";
type Align = "start" | "center";

// Literal class strings (not constructed) so Tailwind keeps them in the build.
const SIZE: Record<Size, { img: string; tba: string; sub: string; gap: string }> = {
  sm: { img: "h-8 w-auto", tba: "text-lg leading-none", sub: "text-[9px] leading-tight tracking-[0.1em]", gap: "gap-0.5" },
  lg: { img: "h-16 w-auto", tba: "text-5xl leading-none", sub: "text-[11px] leading-tight tracking-[0.14em]", gap: "gap-1.5" },
};
const TONE: Record<Tone, { tba: string; sub: string }> = {
  brand: { tba: "text-green-700", sub: "text-slate-500" },
  inverse: { tba: "text-white", sub: "text-green-100" },
};

/**
 * Brand lockup for headers (size="sm") and the login screen (size="lg").
 * tone="inverse" is for the green advisor top bar; tone="brand" for white surfaces.
 */
export function BrandLogo({
  size = "sm",
  tone = "brand",
  subtitle = true,
  align = "start",
  className = "",
}: {
  size?: Size;
  tone?: Tone;
  subtitle?: boolean;
  align?: Align;
  className?: string;
}) {
  // The image is shown only once it has actually loaded; until then (and if it
  // never loads, e.g. the file is absent) the wordmark below stays on screen.
  const [imgLoaded, setImgLoaded] = useState(false);
  const s = SIZE[size];
  const t = TONE[tone];
  const col = align === "center" ? "items-center text-center" : "items-start";

  return (
    <span
      role="img"
      aria-label="Transworld Business Advisors"
      className={`inline-flex ${align === "center" ? "justify-center" : ""} ${className}`}
    >
      {TBA_LOGO_SRC && (
        // A plain <img> (not next/image): the logo is a small brand mark with an
        // onLoad fallback, and the Vite preview build does not shim next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={TBA_LOGO_SRC}
          alt=""
          className={`${s.img} object-contain`}
          style={{ display: imgLoaded ? "block" : "none" }}
          onLoad={() => setImgLoaded(true)}
        />
      )}
      {!imgLoaded && (
        <span aria-hidden className={`flex flex-col ${s.gap} ${col}`}>
          <span className={`font-extrabold tracking-tight ${s.tba} ${t.tba}`}>TBA</span>
          {subtitle && (
            <span className={`whitespace-nowrap font-semibold uppercase ${s.sub} ${t.sub}`}>
              Transworld Business Advisors
            </span>
          )}
        </span>
      )}
    </span>
  );
}
