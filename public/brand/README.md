# TBA brand assets

Drop the **official Transworld Business Advisors logo** here as:

    public/brand/tba-logo.svg

- Transparent background. **SVG preferred**; a transparent PNG also works.
- Once this file exists it is used automatically on the login screen and in the
  advisor / ops / master headers — no code change needed.
- Until it exists, the app shows a clean typographic "TBA" wordmark instead
  (see `src/components/brand-logo.tsx`).

To use a different file name/path, or to force the wordmark, edit `TBA_LOGO_SRC`
in `src/components/brand-logo.tsx`.

Do not commit a logo you do not have the rights to use.
