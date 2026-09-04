import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { CaptureView } from "@/components/CaptureView";
import { Icon } from "@/components/Icon";
import { getCurrentUser, getUserById } from "@/lib/auth";
import {
  canManage,
  canView,
  getCapture,
  imageUrl,
  neighborIds,
  ownerName,
  topTags,
  type CaptureOwner,
} from "@/lib/captures";
import { captureUrl } from "@/lib/env";
import type { AccessPolicy } from "@/db/schema";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await getCapture(id);
  if (!c) return { title: "Not found" };
  if (c.accessPolicy === "only_me") return { title: "Private capture", robots: { index: false } };
  const title = c.title ?? `Screenshot ${c.createdAt.toISOString().slice(0, 10)}`;
  return {
    title,
    description: c.description ?? undefined,
    openGraph: {
      title,
      url: captureUrl(c.id),
      images: [{ url: imageUrl(c), width: c.width ?? undefined, height: c.height ?? undefined }],
    },
    twitter: { card: "summary_large_image", images: [imageUrl(c)] },
  };
}

export default async function CapturePage({ params }: Props) {
  const { id } = await params;
  const [capture, user] = await Promise.all([getCapture(id), getCurrentUser()]);
  if (!capture) notFound();
  const isOwner = await canManage(capture, user);

  if (!(await canView(capture, user))) {
    const next = `?next=${encodeURIComponent(`/i/${capture.id}`)}`;
    return (
      <>
        <Header />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <Icon name="lock" className="h-10 w-10 text-muted" />
          <h1 className="text-2xl font-semibold">This capture is private</h1>
          <p className="max-w-md text-sm text-muted">
            Its owner allowed only themselves to view it. If it is yours, log in.
          </p>
          <Link href={`/login${next}`} className="btn btn-primary">Log in</Link>
        </main>
      </>
    );
  }

  const ownerUser = capture.userId
    ? user?.id === capture.userId
      ? user
      : await getUserById(capture.userId)
    : null;
  const owner: CaptureOwner | null = capture.userId
    ? { userId: capture.userId }
    : capture.deviceId
      ? { deviceId: capture.deviceId }
      : null;
  const [neighbors, suggestions] =
    isOwner && owner
      ? await Promise.all([neighborIds(owner, capture), topTags(owner)])
      : [{ newer: null, older: null }, []];
  const appTag = capture.app
    ? capture.app.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")
    : null;
  const tagSuggestions = [...new Set([...(appTag ? [appTag] : []), ...suggestions])];

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <CaptureView
          capture={{
            id: capture.id,
            url: imageUrl(capture),
            contentType: capture.contentType,
            width: capture.width,
            height: capture.height,
            sizeBytes: capture.sizeBytes,
            title: capture.title,
            description: capture.description,
            tags: capture.tags,
            app: capture.app,
            sourceTitle: capture.sourceTitle,
            sourceUrl: capture.sourceUrl,
            ocrText: capture.ocrText,
            accessPolicy: capture.accessPolicy as AccessPolicy,
            createdAt: capture.createdAt.toISOString(),
            updatedAt: capture.updatedAt.toISOString(),
          }}
          permalink={captureUrl(capture.id)}
          isOwner={isOwner}
          anonymous={!capture.userId}
          signedIn={!!user}
          ownerLabel={ownerName(ownerUser)}
          neighbors={neighbors}
          tagSuggestions={tagSuggestions}
        />
      </main>
    </>
  );
}
