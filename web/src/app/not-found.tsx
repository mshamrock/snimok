import Link from "next/link";
import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-semibold">Not found</h1>
        <p className="text-muted">This image doesn&apos;t exist or was deleted.</p>
        <Link href="/" className="btn">Go home</Link>
      </main>
    </>
  );
}
