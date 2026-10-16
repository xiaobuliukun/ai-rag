import * as React from "react";

export function usePathname() {
  const [pathname, setPathname] = React.useState(readPathname);

  React.useEffect(() => {
    const update = () => setPathname(readPathname());
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  return pathname;
}

export function readHashLocation() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.hash.slice(1) || "/";
}

function readPathname() {
  const location = readHashLocation();
  return location.split("?", 1)[0] || "/";
}
