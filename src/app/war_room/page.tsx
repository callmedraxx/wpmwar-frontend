/* eslint-disable */

"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWpmwarProgram } from "../lib/useWpmwarProgram";
import * as anchor from "@coral-xyz/anchor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import io from "socket.io-client";
import { useRouter } from "next/navigation"; // ✅ For redirect

const SOCKET_URL = "http://localhost:4000";
const socket = io(SOCKET_URL);

export default function WarRoom() {
  const { publicKey } = useWallet();
  const program = useWpmwarProgram();
  const router = useRouter();

  const [gameRoom, setGameRoom] = useState<any>(null);
  const [paragraph, setParagraph] = useState("");
  const [typedText, setTypedText] = useState("");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [wpm, setWpm] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [opponentProgress, setOpponentProgress] = useState(0);
  const [progress, setProgress] = useState(0);

  const [loading, setLoading] = useState(true); // ✅ Spinner state
  const [forfeitAvailable, setForfeitAvailable] = useState(false);
  const [forfeitCountdown, setForfeitCountdown] = useState(0);

  const OWNER_FEE_PUBLIC_KEY = new anchor.web3.PublicKey(
    "5YXqWPPLV36J8fvssCkwbrfFB5wYnJaTVvETef43apaW"
  );

  // === Poll for GameRoom ===
  useEffect(() => {
    if (!program || !publicKey) return;

    const interval = setInterval(async () => {
      try {
        const [gameRoomPDA] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("game_room")],
          program.programId
        );
        // @ts-expect-error: ignore missing gameRoom type until IDL is updated
        const room = await program.account.gameRoom.fetch(gameRoomPDA);
        setGameRoom(room);
        console.log("✅ GameRoom state:", room);

        if (room.player1?.toBase58() === publicKey.toBase58()) {
          console.log("✅ You are Player1");
          setLoading(false);
        } else if (room.player2?.toBase58() === publicKey.toBase58()) {
          console.log("✅ You are Player2");
          setLoading(false);
        }
      } catch {
        console.log("⏳ Waiting for on-chain GameRoom...");
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [program, publicKey]);

  // === Socket events ===
  useEffect(() => {
    if (!publicKey) return;

    socket.emit("joinMatch");

    socket.on("waiting", (msg) => {
      toast.info(msg.message);
    });

    socket.on("startMatch", (data) => {
      setParagraph(data.paragraph);
      console.log("🚀 Match started with paragraph:", data.paragraph);
    });

    socket.on("opponentProgress", ({ progress }) => {
      setOpponentProgress(progress);
    });

    socket.on("matchEnded", ({ winner }) => {
      setWinner(winner);
      setModalOpen(true);
      toast.success(
        winner === socket.id ? "You won the match!" : "You lost the match."
      );
    });

    socket.on("opponentLeft", ({ message }) => {
      toast.info(message);
    });

    return () => {
      socket.off("waiting");
      socket.off("startMatch");
      socket.off("opponentProgress");
      socket.off("matchEnded");
      socket.off("opponentLeft");
    };
  }, [publicKey]);

  // === WPM ===
  useEffect(() => {
    if (startTime && typedText.length > 0) {
      const duration = (Date.now() - startTime) / 60000;
      const wordsTyped = typedText.trim().split(/\s+/).length;
      setWpm(Math.round(wordsTyped / duration));
    }
  }, [typedText, startTime]);

  // === Forfeit timer ===
  useEffect(() => {
    const interval = setInterval(() => {
      if (gameRoom?.startTime) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - Number(gameRoom.startTime);
        const remaining = Math.max(600 - elapsed, 0);

        console.log(`⏳ Forfeit elapsed: ${elapsed}s, remaining: ${remaining}s`);

        setForfeitCountdown(remaining);
        setForfeitAvailable(elapsed >= 600 && gameRoom.player2 === null);

      } else {
        setForfeitCountdown(0);
        setForfeitAvailable(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [gameRoom]);

  async function forfeitMatch() {
    if (!program || !publicKey || !gameRoom) return;

    const [VAULT_PUBLIC_KEY] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - Number(gameRoom.startTime);
    if (elapsed < 600) {
      toast.error(`Too early! Wait ${600 - elapsed}s more.`);
      return;
    }

    await program.methods
      .forfeitMatch()
      .accounts({
        claimer: publicKey,
        owner: OWNER_FEE_PUBLIC_KEY,
        vault: VAULT_PUBLIC_KEY,
        gameRoom: gameRoom.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    toast.success("Forfeit successful!");
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!startTime) setStartTime(Date.now());

    const input = e.target.value;
    const nextChar = input.slice(-1);
    const current = typedText.length;

    if (paragraph[current] === nextChar) {
      setTypedText(input);

      const newProgress = Math.min((input.length / paragraph.length) * 100, 100);
      setProgress(newProgress);

      socket.emit("progressUpdate", { progress: newProgress });

      if (newProgress >= 100) {
        console.log("✅ Finished!");
      }
    }
  }

  async function claimReward() {
    if (!program || !publicKey || !gameRoom) return;

    const [profilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), publicKey.toBuffer()],
      program.programId
    );

    const loserKey = gameRoom?.player1?.equals(publicKey)
      ? gameRoom?.player2
      : gameRoom?.player1;

    const [loserProfilePDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), loserKey.toBuffer()],
      program.programId
    );

    const [globalStatsPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("global_stats")],
      program.programId
    );

    await program.methods
      .claimReward(publicKey, loserKey, wpm)
      .accounts({
        winner: publicKey,
        winnerProfile: profilePDA,
        loser: loserKey,
        loserProfile: loserProfilePDA,
        gameRoom: gameRoom.publicKey,
        globalStats: globalStatsPDA,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .rpc();

    toast.success("Reward claimed!");
    setModalOpen(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>⏳ Waiting for your stake to confirm on-chain...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl mb-4">🚗 War Room 🚗</h1>

      {gameRoom && (
        <div className="mb-4 w-full max-w-4xl">
          <p>Players:</p>
          <p>Player 1: {gameRoom.player1?.toBase58().slice(0, 4)}...{gameRoom.player1?.toBase58().slice(-4)}</p>
          <p>Player 2: {gameRoom.player2
            ? `${gameRoom.player2.toBase58().slice(0, 4)}...${gameRoom.player2.toBase58().slice(-4)}`
            : "Waiting for player 2..."
          }</p>
          <p>Bet Amount per Player: {(gameRoom.betAmount / 1e9).toFixed(2)} GOR</p>
          <p>Total Stake: {gameRoom.player2 ? ((gameRoom.betAmount * 2) / 1e9).toFixed(2) : (gameRoom.betAmount / 1e9).toFixed(2)} GOR</p>
          <p>⏳ Forfeit eligible in: {forfeitCountdown}s</p>
        </div>
      )}

      <Button
        onClick={forfeitMatch}
        className={`mt-4 ${forfeitAvailable ? "bg-red-600" : "bg-gray-600 cursor-not-allowed"}`}
        disabled={!forfeitAvailable}
      >
        Forfeit Match
      </Button>

      <div className="mb-4 w-full max-w-4xl">
        <p>Paragraph:</p>
        <p className="text-zinc-400">{paragraph || "Waiting for match..."}</p>
      </div>

      <div className="w-full max-w-4xl relative h-32 border-t border-b border-gray-600 my-8">
        <div
          className="absolute top-1/4 transform -translate-y-1/2"
          style={{ left: `${progress}%` }}
        >
          🚗
        </div>
        <div
          className="absolute top-3/4 transform -translate-y-1/2"
          style={{ left: `${opponentProgress}%` }}
        >
          🚙
        </div>
      </div>

      <input
        value={typedText}
        onChange={handleInput}
        className="w-full max-w-2xl p-4 border border-gray-600 rounded bg-black text-white"
        placeholder="Start typing..."
      />

      <p>WPM: {wpm}</p>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogTitle>🏆 Match Finished!</DialogTitle>
          <DialogDescription>
            Winner: {winner === socket.id ? "You" : "Opponent"} <br />
            WPM: {wpm}
          </DialogDescription>
          {winner === socket.id && (
            <Button onClick={claimReward} className="mt-4">
              Claim Reward
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
