"use client";

import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  AnchorProvider,
  Program,
  web3,
  type Idl
} from "@coral-xyz/anchor";
import idl from "../../idl/wpmwar_program.json";

export const PROGRAM_ID = new web3.PublicKey(
  "6YnWTXBsLgFcEygmvA9r6FzVWu5gLxfgcpw4vXiQPUBJ"
);

export function useWpmwarProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

   
    return new Program<Idl>(idl as Idl, provider);
  }, [connection, wallet]);
}
