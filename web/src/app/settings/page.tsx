import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { Header } from "@/components/Header";
import { NewTokenForm } from "@/components/NewTokenForm";
import { ProfileForm } from "@/components/ProfileForm";
import { GyazoImport } from "@/components/GyazoImport";
import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { revokeToken } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const tokens = await (await db())
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, user.id))
    .orderBy(desc(schema.apiTokens.createdAt));
  const fmt = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8">
        <section className="card p-6 space-y-3">
          <h1 className="text-lg font-semibold">Account</h1>
          <ProfileForm email={user.email} displayName={user.displayName} />
        </section>

        <section className="card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Desktop app</h2>
            <p className="text-sm text-muted">
              Sign-in is optional: the app uploads anonymously and links the
              captures to your account once you log in. To upload straight into
              this account from the app, use menu bar icon → “Sign In…”.{" "}
              <Link href="/download" className="underline">
                Get the app
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Import from Gyazo</h2>
          <GyazoImport />
        </section>

        <section className="card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">API tokens</h2>
            <p className="text-sm text-muted">
              Tokens let any tool upload on your behalf:{" "}
              <code className="font-mono text-xs">
                curl -H &quot;Authorization: Bearer TOKEN&quot; -F
                imagedata=@shot.png {appUrl()}/api/upload
              </code>
            </p>
          </div>
          <NewTokenForm />
          {tokens.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted">
                      <span className="font-mono">…{t.token.slice(-6)}</span>
                      {" · created "}
                      {fmt.format(t.createdAt)}
                      {t.lastUsedAt
                        ? ` · last used ${fmt.format(t.lastUsedAt)}`
                        : " · never used"}
                    </div>
                  </div>
                  <form action={revokeToken}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn btn-danger">Revoke</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No tokens yet.</p>
          )}
        </section>
      </main>
    </>
  );
}
