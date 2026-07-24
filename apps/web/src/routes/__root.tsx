import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "Duskline — Model deprecation tracker",
      },
      {
        name: "description",
        content:
          "Provider-authoritative model deprecation and deletion dates in one view.",
      },
    ],
    links: [{ rel: "stylesheet", href: styles }],
  }),
  component: Root,
});

function Root() {
  return (
    <html className="scheme-light" lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-w-80 bg-stone-50 text-stone-950 antialiased">
        <a
          className="fixed top-4 left-4 z-50 -translate-y-[200%] bg-stone-950 px-3 py-2 text-sm text-white focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-950"
          href="#models"
        >
          Skip to model table
        </a>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
