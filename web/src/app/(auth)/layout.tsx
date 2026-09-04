import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="flex items-center gap-2">
        <Logo className="h-8 w-8" />
        <span className="text-lg font-semibold">Snimok</span>
      </Link>
      {children}
    </main>
  );
}
