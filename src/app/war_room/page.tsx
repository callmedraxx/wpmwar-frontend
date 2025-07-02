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
import { useRouter } from "next/navigation";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;
console.log("🔗 Connecting to socket:", SOCKET_URL);
const socket = io(SOCKET_URL);

export default function WarRoom() {
  const { publicKey } = useWallet();
  const program = useWpmwarProgram();
  const router = useRouter();

  const [gameRoom, setGameRoom] = useState<any>(null);
  const [paragraph, setParagraph] = useState("");
  const [typedText, setTypedText] = useState("");   // Your own input
  const [startTime, setStartTime] = useState<number | null>(null);
  const [wpm, setWpm] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [progress, setProgress] = useState(0);          // Your progress
  const [opponentProgress, setOpponentProgress] = useState(0); // Opponent's progress

  const [loading, setLoading] = useState(true);
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

        if (room.player1?.toBase58() === publicKey.toBase58()) {
          setLoading(false);
        } else if (room.player2?.toBase58() === publicKey.toBase58()) {
          setLoading(false);
        }
      } catch {
        // Still waiting for room to appear
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

  // === Calculate WPM ===
  useEffect(() => {
    if (startTime && typedText.length > 0) {
      const duration = (Date.now() - startTime) / 60000;
      const wordsTyped = typedText.trim().split(/\s+/).length;
      setWpm(Math.round(wordsTyped / duration));
    }
  }, [typedText, startTime]);

  // === Forfeit logic ===
  useEffect(() => {
    const interval = setInterval(() => {
      if (gameRoom?.startTime) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - Number(gameRoom.startTime);
        const remaining = Math.max(600 - elapsed, 0);

        setForfeitCountdown(remaining);
        setForfeitAvailable(elapsed >= 600 && gameRoom.player2 === null);
      } else {
        setForfeitCountdown(0);
        setForfeitAvailable(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [gameRoom]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
  if (winner) return;  // ✅ Block typing if winner exists

  if (!startTime) setStartTime(Date.now());

  const input = e.target.value;
  const nextChar = input.slice(-1);
  const current = typedText.length;

  if (paragraph[current] === nextChar) {
    setTypedText(input);

    const newProgress = Math.min((input.length / paragraph.length) * 100, 100);
    setProgress(newProgress);

    socket.emit("progressUpdate", { progress: newProgress });
  }
}


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
    <div className="min-h-screen flex flex-col items-center justify-start p-4 md:p-8 bg-gradient-to-b from-black via-gray-900 to-black text-white overflow-y-auto font-orbitron">
      <h1 className="text-4xl md:text-6xl text-center mb-2 neon-text">🚗 WPM War Room 🚗</h1>

      <div className="text-sm md:text-base mb-6 text-zinc-400 text-center">
        Stake your skills — type fast, race hard!
      </div>

      {gameRoom && (
        <div className="bg-zinc-900/70 backdrop-blur-md p-4 md:p-6 rounded-2xl w-full max-w-3xl mb-4 border border-zinc-700">
          <h2 className="text-lg md:text-xl mb-2 text-lime-400">🏁 Players</h2>
          <p>Player 1: {gameRoom.player1?.toBase58().slice(0, 4)}...{gameRoom.player1?.toBase58().slice(-4)}</p>
          <p>Player 2: {gameRoom.player2
            ? `${gameRoom.player2.toBase58().slice(0, 4)}...${gameRoom.player2.toBase58().slice(-4)}`
            : "Waiting for player 2..."}</p>
          
          <p>Total Stake: {gameRoom.player2 ? ((gameRoom.betAmount * 2) / 1e9).toFixed(2) : (gameRoom.betAmount / 1e9).toFixed(2)} GOR</p>
          <p>⏳ Forfeit in: {forfeitCountdown}s</p>
        </div>
      )}

      <Button
        onClick={forfeitMatch}
        className={`mt-2 ${forfeitAvailable ? "bg-red-600" : "bg-gray-700 cursor-not-allowed"}`}
        disabled={!forfeitAvailable}
      >
        Forfeit Match
      </Button>

      {/* Always show claim button if you are the winner */}
{winner === socket.id && (
  <Button onClick={claimReward} className="mt-6 bg-lime-600 hover:bg-lime-700">
    🏆 Claim Reward
  </Button>
)}


      <div className="w-full max-w-3xl bg-zinc-800/50 rounded-xl p-4 mb-6 border border-zinc-700">
        <h2 className="text-md md:text-lg mb-2 text-cyan-300">📜 Paragraph</h2>
        <p className="text-zinc-300 text-center">{paragraph || "Waiting for match..."}</p>
      </div>

      <div className="relative w-full max-w-5xl h-32 md:h-48 border-y-4 border-lime-500 bg-zinc-900 rounded-xl overflow-hidden mb-6">
        <div
          className="absolute top-1/3 transform -translate-y-1/2 text-4xl md:text-7xl transition-all duration-200"
          style={{ left: `${progress}%` }}
        >
          🚗
        </div>
        <div
          className="absolute top-2/3 transform -translate-y-1/2 text-4xl md:text-7xl transition-all duration-200"
          style={{ left: `${opponentProgress}%` }}
        >
          🚙
        </div>
      </div>

      <input
  value={typedText}
  onChange={handleInput}
  disabled={!!winner}  // ✅ disables input for both players
  placeholder="Type here to race..."
  className="w-full max-w-2xl p-4 md:p-6 rounded-xl border-2 border-cyan-500 bg-black text-white placeholder-zinc-500 text-lg md:text-xl focus:outline-none focus:ring-4 focus:ring-cyan-600 disabled:opacity-50"
/>


      <p className="mt-4 text-lime-400 text-lg md:text-xl">💨 WPM: {wpm}</p>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
  <DialogContent>
    <DialogTitle className="text-lime-500">🏆 Match Finished!</DialogTitle>
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
