import type { Metadata } from "next";
import "./globals.css";
import AppShell from "../components/app-shell";

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
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
