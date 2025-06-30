"use client";

import { Button } from "@/components/ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

export default function ConnectWallet() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  return connected ? (
    <Button
      variant="outline"
      onClick={() => disconnect()}
      className="bg-transparent hover:bg-zinc-800 border-zinc-500 text-white uppercase font-semibold"
    >
      {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
    </Button>
  ) : (
    <Button
      variant="default"
      onClick={() => setVisible(true)}
      className="uppercase font-semibold"
    >
      Connect Wallet
    </Button>
  );
}

