import type { AnchorHTMLAttributes } from "react";
import { HASH_ROUTES, navigate } from "./navigation";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean };

export default function Link({ href, onClick, prefetch: _prefetch, ...rest }: Props) {
  void _prefetch;
  return (
    <a
      // With hash routes the link is a real one (open in a new tab, copy link); in the viewer it is only an anchor.
      href={HASH_ROUTES ? `#${href}` : `#${href.replace(/[^a-zA-Z0-9]/g, "-")}`}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (HASH_ROUTES && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return; // new tab or window
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
}
