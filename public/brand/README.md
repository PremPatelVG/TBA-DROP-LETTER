# TBA brand assets

`tba-logo.webp` is the **official Transworld Business Advisors logo** — a white
knockout mark on a transparent background. It is the primary brand mark on the
login screen and in the advisor / ops / master headers, each of which sits it on
a brand-green surface so the white logo reads.

It is imported through the bundler in `src/components/brand-logo.tsx` (so the
single-file Vite preview build inlines it), and is also served here at
`/brand/tba-logo.webp` by the live Next app.

To replace it, drop the new file in as `tba-logo.webp` (transparent background).
If the image ever fails to load, the component falls back to a typographic "TBA"
wordmark automatically. Set `TBA_LOGO_SRC` to `null` to force that wordmark.

Do not commit a logo you do not have the rights to use.
