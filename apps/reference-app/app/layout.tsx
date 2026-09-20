import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@prism-system/ui-system-a/styles.css";
import "@prism-system/ui-system-b/styles.css";
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
