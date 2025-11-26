"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import BurnForm from "./components/BurnForm";
import { MagmaBadge } from "./components/MagmaBadge";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center gap-8 p-6">
      <h1 className="text-3xl font-bold">Base Incinerator</h1>
      <MagmaBadge />
      <ConnectButton />
      <BurnForm />
    </main>
  );
}
