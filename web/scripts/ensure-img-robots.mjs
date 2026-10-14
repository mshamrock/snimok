#!/usr/bin/env node
/**
 * Runs during the Vercel build: writes robots.txt to the root of the R2 bucket
 * behind img.snimok.xyz, so search engines do not index users' screenshots
 * while chat and social link previews (which fetch og:image) keep working.
 * Idempotent and never fails the build.
 */
const bucket = process.env.R2_BUCKET;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const endpoint =
  process.env.R2_ENDPOINT ??
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

const PREVIEW_BOTS = [
  "Twitterbot",
  "facebookexternalhit",
  "Facebot",
  "Slackbot",
  "Slackbot-LinkExpanding",
  "TelegramBot",
  "Discordbot",
  "LinkedInBot",
  "WhatsApp",
  "Applebot",
  "redditbot",
];

const body =
  "# Screenshots are shared by link, not for search engines.\n" +
  PREVIEW_BOTS.map((ua) => `User-agent: ${ua}\nAllow: /\n`).join("\n") +
  "\nUser-agent: *\nDisallow: /\n";

if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
  console.log("[img-robots] R2 not configured, skipping");
  process.exit(0);
}

try {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region: "auto", endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: "robots.txt",
      Body: body,
      ContentType: "text/plain; charset=utf-8",
      CacheControl: "public, max-age=3600",
    }),
  );
  console.log("[img-robots] robots.txt written to the image bucket");
} catch (err) {
  console.warn("[img-robots] could not write robots.txt:", err?.message ?? err);
}
