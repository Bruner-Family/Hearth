import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Web-only HTML shell for the static export (`expo export --platform web`).
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <title>Hearth — home asset & maintenance tracker</title>
        <meta
          name="description"
          content="Home asset & maintenance tracker for the household"
        />
        {/* PWA: installable to a home screen (ADR-001 §2.6) */}
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* Matches --c-bg; ThemeProvider rewrites this when the scheme changes
            so Safari's status-bar/toolbar areas follow the in-app theme. */}
        <meta name="theme-color" content="#FAF7F2" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-1024.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
