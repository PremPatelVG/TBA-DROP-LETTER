"use client";
import { useState } from "react";
// The official TBA logo, imported through the bundler so it is self-contained:
// - Next (webpack) returns a StaticImageData object and emits the file under
//   /_next/static/; the same asset also ships at /brand/tba-logo.webp in public/.
// - The Vite preview build inlines it as a `data:` URI string (it is tiny), so the
//   single-file artifact carries the logo with no external request.
import tbaLogo from "../../public/brand/tba-logo.webp";

/**
 * TBA brand lockup (Transworld Business Advisors).
 *
 * The official logo image is the primary brand mark. The typographic wordmark
 * below ("TBA" + the full name) is only an automatic fallback, shown if the image
 * ever fails to load, so a broken image never leaves an empty brand spot.
 *
 * The supplied logo is a WHITE knockout mark (transparent background), so every
 * place it is used sits it on a brand-green surface where it reads clearly — the
 * login hero, the advisor top bar, and the ops/master header strip.
 *
 * ── Swapping the logo ─────────────────────────────────────────────────────────
 * Replace public/brand/tba-logo.webp with the new file (keep the name, or update
 * the import above). It is picked up everywhere this component is used. Set
 * TBA_LOGO_SRC to null to force the wordmark instead.
 * ──────────────────────────────────────────────────────────────────────────────
 */
// Next yields a StaticImageData object; Vite yields a plain URL/`data:` string.
// Normalise both to a usable src (null → always render the wordmark).
const logoAsset = tbaLogo as unknown;
export const TBA_LOGO_SRC: string | null =
  typeof logoAsset === "string" ? logoAsset : ((logoAsset as { src?: string } | null)?.src ?? null);

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
 * tone="inverse" is for green surfaces (the default placement for the white logo);
 * tone="brand" styles the wordmark fallback for white surfaces.
 */
export function BrandLogo({
  size = "sm",
  tone = "inverse",
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
