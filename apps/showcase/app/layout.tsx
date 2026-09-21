import type { Metadata } from "next";
import type { ReactNode } from "react";
// @prism-system:styles:begin
import "@prism-system/ui-system-a/styles.css";
import "@prism-system/ui-system-b/styles.css";
// @prism-system:styles:end
import "./showcase.css";

export const metadata: Metadata = {
  title: "Maivand design systems · Showcase",
  description: "A component laboratory for portable Maivand design systems.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
