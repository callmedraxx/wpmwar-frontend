"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button"; // from shadcn/ui
import ConnectWallet from "@/components/ui/ConnectWallet"; // your separate wallet component

export default function Home() {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-black to-gray-900 text-white flex flex-col">
      {/* Top nav */}
      <header className="flex justify-between items-center p-6">
        <div className="flex items-center gap-4">
          <Image
            src="/logo.png" // place logo.png in /public
            alt="WPM WAR Logo"
            width={40} // adjust to your preferred size
            height={40}
            priority
          />
          <h1 className="text-2xl font-bold tracking-widest font-mono">
            WPM WAR
          </h1>
        </div>
        <ConnectWallet />
      </header>

      {/* Hero Section */}
      <main className="flex flex-1 flex-col items-center justify-center text-center gap-8">
        <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight font-[var(--font-gaming)]">
          Unleash Your Speed.
          <br /> Conquer the Chain.
        </h2>

        <p className="text-gray-300 max-w-xl mx-auto">
          The ultimate multiplayer typing race. Bet tokens. Beat rivals.
          Prove your WPM on-chain.
        </p>

        <Link href="/waiting_room">
          <Button className="text-lg px-8 py-6 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 hover:opacity-90 transition">
            Start a War
          </Button>
        </Link>
      </main>

      {/* Footer */}
      <footer className="text-sm text-gray-500 text-center p-4">
        Built for Gorbagana Testnet · Powered by Backpack Wallet
      </footer>
    </div>
  );
}
