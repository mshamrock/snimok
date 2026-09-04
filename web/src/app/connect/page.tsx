import { Header } from "@/components/Header";
import { ConnectForm } from "@/components/ConnectForm";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Connect desktop app" };

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await searchParams;
  const codeStr = typeof code === "string" ? code.trim().toLowerCase() : "";
  const user = await requireUser(`/connect?code=${encodeURIComponent(codeStr)}`);
  return (
    <>
      <Header />
      <main className="flex flex-1 items-center justify-center p-6">
        {codeStr ? (
          <ConnectForm code={codeStr} email={user.email} />
        ) : (
          <div className="card w-full max-w-md p-8 text-center text-sm text-muted">
            Open this page from the Snimok desktop app (menu bar icon →
            “Connect account…”).
          </div>
        )}
      </main>
    </>
  );
}
