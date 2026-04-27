import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaSScout",
  description:
    "Find SaaS opportunities hidden in real market pain. Real pain. Real ideas. Real SaaS.",

  icons: {
    icon: "/brand/archive.png",
    shortcut: "/brand/archive.png",
    apple: "/brand/archive.png",
  },
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