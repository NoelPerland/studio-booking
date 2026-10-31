import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Forma Studio — Time, well spent", description: "A thoughtful appointment booking demo by Noel Perland. Choose a session, find a time, and manage your booking." };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
