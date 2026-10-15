import * as React from "react";

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  replace?: boolean;
  scroll?: boolean;
};

export default function Link({ href, onClick, ...props }: LinkProps) {
  const hashHref = toHashHref(href);

  return (
    <a
      {...props}
      href={hashHref}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        window.location.hash = hashHref.slice(1);
      }}
    />
  );
}

function toHashHref(href: string) {
  if (href.startsWith("#")) {
    return href;
  }

  return `#${href.startsWith("/") ? href : `/${href}`}`;
}
