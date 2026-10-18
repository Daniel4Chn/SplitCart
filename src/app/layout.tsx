import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SplitCart",
  description: "Review a grocery receipt. Split every cent.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
