import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";
import { WalletConnectionProvider } from "@/components/WalletProvider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  title: "WPM War",
  description: "EARN WHILE YOU LEARN TO TYPE FASTER",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      
      <body className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} antialiased`}>
        <WalletConnectionProvider>
        {children}
        <Toaster richColors position="top-right" />
        </WalletConnectionProvider>
      </body>
     
    </html>
  );
}
