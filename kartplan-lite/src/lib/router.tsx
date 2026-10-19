import { type AnchorHTMLAttributes, useEffect, useState } from "react";

const EVENT = "kp:navigate";

export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  window.dispatchEvent(new Event(EVENT));
  window.scrollTo({ top: 0 });
}

export function usePath(): { path: string; search: URLSearchParams } {
  const read = () => ({
    path: location.pathname.replace(/\/+$/, "") || "/",
    search: new URLSearchParams(location.search),
  });
  const [state, setState] = useState(read);
  useEffect(() => {
    const on = () => setState(read());
    window.addEventListener("popstate", on);
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener("popstate", on);
      window.removeEventListener(EVENT, on);
    };
  }, []);
  return state;
}

export function Link({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.button !== 0 ||
          href.startsWith("http")
        )
          return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
}
