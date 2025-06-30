/* eslint-disable */

"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { useWpmwarProgram } from "../lib/useWpmwarProgram";
import * as anchor from "@coral-xyz/anchor";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function WaitingRoom() {
  const { publicKey, connected } = useWallet();
  const program = useWpmwarProgram();
  const router = useRouter();

  const [status, setStatus] = useState("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState("");

  const VAULT_PUBKEY = new anchor.web3.PublicKey(
    "ADaMYwVnw816Kspt7rBcMc4fdyLcVPJpdKRPdp4he1i"
  );

  // ✅ Auto-redirect if player is already in an active game room
  useEffect(() => {
    const checkIfAlreadyJoined = async () => {
      if (!program || !publicKey) return;

      const [gameRoomPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("game_room")],
        program.programId
      );

      try {
        // @ts-expect-error: ignore missing gameRoom type until IDL is updated
        const gameRoom = await program.account.gameRoom.fetch(gameRoomPDA);
        //console.log("🔍 Existing GameRoom:", gameRoom);

        if (
          (gameRoom.player1?.toBase58() === publicKey.toBase58() ||
            gameRoom.player2?.toBase58() === publicKey.toBase58()) &&
          gameRoom.status !== 2 // 2 = ended
        ) {
          toast.info("You are already in an active match. Redirecting to war room...");
          router.push("/war_room");
        }
      } catch (e) {
        //console.log("No active game found for player yet.", e);
      }
    };

    checkIfAlreadyJoined();
  }, [program, publicKey]);

  async function handleJoinMatch() {
    if (!program || !publicKey) {
      toast.error("Connect your wallet first!");
      return;
    }

    const parsedAmount = parseFloat(betAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid stake amount.");
      return;
    }

    const lamports = parsedAmount * 1_000_000_000;

    setStatus("joining");
    toast.info("Joining match...");

    try {
      const [profilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("profile"), publicKey.toBuffer()],
        program.programId
      );

      const [gameRoomPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("game_room")],
        program.programId
      );

      const [globalStatsPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("global_stats")],
        program.programId
      );

      //console.log("🔍 Debugging JoinMatch:");
      //console.log("Program ID:", program.programId.toBase58());
      //console.log("Player pubkey:", publicKey.toBase58());
      //console.log("Vault pubkey:", VAULT_PUBKEY.toBase58());
      //console.log("Profile PDA:", profilePDA.toBase58());
      //console.log("Game Room PDA:", gameRoomPDA.toBase58());
      //console.log("Global Stats PDA:", globalStatsPDA.toBase58());
      //console.log("Lamports:", lamports);

      // ✅ Get transaction and fresh blockhash to avoid duplicate tx
      const tx = await program.methods
        .joinMatch(new anchor.BN(lamports))
        .accounts({
          player: publicKey,
          vault: VAULT_PUBKEY,
          playerProfile: profilePDA,
          gameRoom: gameRoomPDA,
          globalStats: globalStatsPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .transaction();

      const latestBlockhash = await program.provider.connection.getLatestBlockhash();
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = publicKey;

      if (!program.provider.wallet || !program.provider.wallet.signTransaction) {
        toast.error("Wallet not available for signing transactions.");
        setStatus("idle");
        return;
      }
      const signedTx = await program.provider.wallet.signTransaction(tx);
      const txSig = await program.provider.connection.sendRawTransaction(
        signedTx.serialize(),
        { skipPreflight: false }
      );

      //console.log("✅ Join match TX signature:", txSig);
      await program.provider.connection.confirmTransaction(txSig, "confirmed");
      //console.log(`👉 Explorer: https://explorer.gorbagana.devnet.solana.com/tx/${txSig}`);

      setSignature(txSig);
      setStatus("waiting");

      toast.success("Match joined! Redirecting to war room...");
      setTimeout(() => {
        router.push("/war_room");
      }, 1500);
    } catch (err: any) {
      console.error("❌ Join match failed:", err);

      if (err.logs) {
        //console.log("📝 Program logs:", err.logs);
      } else if (err.getLogs) {
        const logs = await err.getLogs();
        //console.log("📝 Simulation logs:", logs);
      }

      if (err.message?.includes("AccountNotInitialized")) {
        toast.error("The global_stats account is not initialized. Run your initialize script first.");
      } else if (err.message?.includes("Attempt to debit an account")) {
        toast.error("Insufficient balance. Fund your wallet and try again.");
      } else if (err.message?.includes("Blockhash not found")) {
        toast.error("Your RPC may be stale. Try again or switch RPC nodes.");
      } else if (err.message?.includes("Transaction was not confirmed")) {
        toast.error("Network congestion: Transaction took too long. Try again.");
      } else {
        toast.error(`Something went wrong: ${err.message}`);
      }

      setStatus("idle");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 text-white flex flex-col items-center justify-center gap-8">
      <h1 className="text-4xl font-bold tracking-widest">Waiting Room</h1>

      {connected ? (
        <p className="text-zinc-400">
          Connected as {publicKey?.toBase58().slice(0, 4)}...
          {publicKey?.toBase58().slice(-4)}
        </p>
      ) : (
        <p className="text-red-400">Wallet not connected</p>
      )}

      <div className="flex flex-col items-center gap-2">
        <label htmlFor="stakeAmount" className="text-zinc-200 font-medium">
          Stake Amount (GOR)
        </label>
        <input
          id="stakeAmount"
          min="0"
          step="0.0001"
          placeholder="0.0"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          className="w-72 px-4 py-3 rounded-lg border-2 border-purple-500 text-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <Button
        disabled={status !== "idle"}
        onClick={handleJoinMatch}
        className="text-lg px-8 py-6 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 hover:opacity-90 transition"
      >
        {status === "joining"
          ? "Joining Match..."
          : status === "waiting"
          ? "Waiting for opponent..."
          : "Join Match"}
      </Button>

      {signature && (
        <p className="text-sm text-zinc-500">
          View on explorer:{" "}
          <a
            href={`https://explorer.gorbagana.devnet.solana.com/tx/${signature}`}
            target="_blank"
            className="underline"
          >
            {signature.slice(0, 8)}...
          </a>
        </p>
      )}
    </div>
  );
}
