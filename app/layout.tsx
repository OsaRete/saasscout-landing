import type { Metadata } from "next";
import "./globals.css";
import AppShell from "../components/app-shell";
import BetaWorkspaceAccess from "../components/beta-workspace-access";
import { getValidationReleasePolicy } from "@/lib/validation/server/release-policy";

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
  const validation = getValidationReleasePolicy();
  return (
    <html lang="en">
      <body><AppShell><BetaWorkspaceAccess validationAvailable={validation.privateInterviews || validation.privateSurveys}>{children}</BetaWorkspaceAccess></AppShell></body>
    </html>
  );
}
