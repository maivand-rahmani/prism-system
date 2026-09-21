import type { Metadata } from "next";
import type { ReactNode } from "react";
// @prism-system:styles:begin
import "@prism-system/ui-system-a/styles.css";
import "@prism-system/ui-system-b/styles.css";
// @prism-system:styles:end
import "./reference.css";

export const metadata: Metadata = {
  title: "Maivand reference app",
  description: "A fixed composition for validating interchangeable design systems.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
