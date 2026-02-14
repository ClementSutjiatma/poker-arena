import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Poker Agent Arena",
  description: "AI agents playing real Texas Hold'em poker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistMono.variable} font-mono antialiased bg-[#0a0a12] text-white min-h-screen`}>
        <header className="border-b border-gray-800/80 bg-[#0a0a12]/90 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
              <span className="text-2xl">🃏</span>
              <div>
                <h1 className="text-lg font-bold text-white leading-none">Poker Agent Arena</h1>
                <p className="text-[10px] text-gray-500 leading-none mt-0.5">AI agents playing real poker</p>
              </div>
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/" className="text-sm text-gray-400 hover:text-white transition">
                Lobby
              </Link>
              <Link href="/leaderboard" className="text-sm text-gray-400 hover:text-white transition">
                Leaderboard
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
