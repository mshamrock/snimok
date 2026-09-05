# Snimok

A Gyazo-style screenshot service: a tiny macOS app captures a region of the
screen, uploads it, and opens a unique link in your browser. Everything else
(viewing, editing, resizing, the timeline of past captures, accounts) lives in
the web app.

```
web/       Next.js 16 app for Vercel (Postgres via Neon, images in Vercel Blob)
desktop/   Swift menu-bar app for macOS 13+ (SwiftPM, no Xcode project needed)
```

## How it works

1. Click the Snimok icon (Dock/Launchpad/menu bar) or press **⌘⇧7**. The cursor
   becomes a crosshair; drag over the area you want (Space toggles window mode,
   Esc cancels).
2. The PNG is POSTed to `/api/upload` with the device's API token. The server
   stores it in Vercel Blob, records it in Postgres and returns a permalink
   `https://<host>/i/<id>`.
3. The link is copied to the clipboard and opened in the default browser.
4. The capture page mirrors Gyazo: Share menu (link, image URL, Markdown,
   HTML), Edit (pen, marker, line, arrow, rectangle, ellipse, text, pixelate,
   crop, resize; drawn objects stay selectable until crop/resize/save: move,
   resize with handles, delete, recolour, re-edit text by double-click; saving
   replaces the image in place so the link never changes),
   Lock (anyone with the link / only me), Copy image, Download, Delete, ← →
   navigation through your timeline, tags with suggestions, a description, and
   metadata: user, upload time, app, source page (title + URL) and the text
   recognised on the image.
5. `/captures` is the timeline grouped by day with search across titles,
   descriptions, tags (`#tag`), OCR text, app and source, plus tag / app / day
   filters.
6. The desktop app records the frontmost app, its window title and, for
   browsers, the URL of the active tab, runs Apple Vision OCR on the image
   (Russian + English) and sends everything with the upload. ⌘⇧7 captures an
   area, ⌘⇧8 a window.

Signing in is optional. Every install has a random device id; uploads without
an account are stored as anonymous captures owned by that device, and the app
opens links through `/claim?device=…&next=…`, which drops a device cookie in the
browser so it can edit those captures and see them under `/captures`. When the
user registers or logs in (in that browser, or via the app's device-code sign-in
from the menu bar), all anonymous captures of the device are linked to the
account. Accounts are email + password.

## Storage: Cloudflare R2 (recommended)

Images live in an S3-compatible bucket. Cloudflare R2's free tier (10 GB,
1 M writes and 10 M reads per month, no egress fees) fits a personal library;
Vercel Blob on the Hobby plan gets suspended for 30 days once its limits are hit.

1. Cloudflare dashboard → **R2 Object Storage** → *Create bucket* (e.g. `snimok`,
   location Automatic).
2. R2 → *Manage R2 API Tokens* → *Create API token*: permission **Object Read &
   Write**, scoped to that bucket. Copy the Access Key ID and Secret Access Key.
   The Account ID is shown on the same page (also in the dashboard URL).
3. In the Vercel project add the environment variables (Production + Preview):
   `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
   Optional `R2_PUBLIC_BASE_URL` if the bucket has a public custom domain
   (then images are served straight from Cloudflare instead of through `/r/<id>`).
4. Redeploy. `GET /api/debug/blob?key=$DEBUG_KEY` shows a `default-storage (r2)`
   probe that puts, reads and deletes a test object.
5. Move existing captures off Vercel Blob:

   ```bash
   cd web && SNIMOK_URL=https://snimok.xyz ADMIN_KEY=<DEBUG_KEY> node scripts/migrate-storage.mjs
   ```

   The server route copies 25 captures per call; captures imported from Gyazo
   are re-fetched from Gyazo when the Blob store is unreachable.

## Deploying the web app to Vercel

1. In the Vercel dashboard open the project → **Storage** and create:
   - a **Neon Postgres** database (injects `DATABASE_URL`),
   - a **Blob** store (injects `BLOB_READ_WRITE_TOKEN`, or `BLOB_STORE_ID` with
     OIDC auth on newer connections; both work). If you created the store with
     **private** access, add the env var `BLOB_ACCESS=private`: images are then
     streamed through `/r/<id>` instead of being served from the blob URL.
2. Optionally set `NEXT_PUBLIC_APP_URL` to your public URL (custom domain).
   Without it the production URL of the project is used.
3. Redeploy. `npm run build` runs `scripts/migrate.mjs`, which applies the SQL
   migrations in `web/drizzle/` before `next build`.

To deploy from a git repo set the project **Root Directory** to `web`.

### Local development

```bash
cd web
npm install
npm run dev
```

Without `DATABASE_URL` the app uses an embedded Postgres (PGlite) in
`web/.pglite`, and without `BLOB_READ_WRITE_TOKEN` uploads are stored in
`web/.uploads`. Both are development-only fallbacks.

Schema changes: edit `src/db/schema.ts`, then `npm run db:generate`.

## Building the macOS app

```bash
cd desktop
SNIMOK_SERVER_URL=https://your-app.vercel.app ./build.sh
open build            # Snimok.app and Snimok.zip
```

The app is ad-hoc signed, so on first launch right-click → Open (or run
`xattr -dr com.apple.quarantine Snimok.app`). macOS will ask for **Screen
Recording** permission the first time. The server URL can be changed later from
the menu bar icon → *Server URL…*.

**Screen Recording permission and rebuilds.** macOS ties the permission to the
app's code signature. With the default ad-hoc signature every rebuild looks like
a new app and asks again (old entries linger in System Settings → Privacy &
Security → Screen Recording; remove them or run
`tccutil reset ScreenCapture com.snimok.mac`). For a stable identity create a
self-signed *Code Signing* certificate named "Snimok Dev" (Keychain Access →
Certificate Assistant → Create a Certificate → type "Code Signing", or with
`openssl req -x509` + `security import` + `security add-trusted-cert -p codeSign`);
`build.sh` picks it up automatically, or pass `SNIMOK_SIGN_IDENTITY=<name>`.

Launching the app starts a capture. To start it silently (for example as a
login item) pass `--no-capture`; the menu bar icon and the ⌘⇧7 hotkey still work.

## Importing from Gyazo

**In the browser:** Settings → *Import from Gyazo* → paste a Gyazo access token
(https://gyazo.com/oauth/applications → *New application*, any name, callback
`http://localhost` → **Your access token**) → *Import from Gyazo*. The page
calls `POST /api/import/gyazo` in slices (each under Vercel's 60 s limit) until
the whole library is copied: images keep their original capture dates, app,
page title and URL, description and OCR text, and get the tag `gyazo`. Imports
are idempotent (`captures.source_id = gyazo:<image_id>`), so re-running only
adds what is missing. The token is held in the page during the import and never
stored server-side.

**From the command line** (same result, useful for very large libraries):
`web/scripts/import-gyazo.mjs`.

1. Get a Gyazo API token as above.
2. In Snimok open **Settings → API tokens** and create a token.
3. Run (Node 18+):

   ```bash
   cd web
   GYAZO_TOKEN=... SNIMOK_TOKEN=... npm run import:gyazo -- --dry-run   # preview
   GYAZO_TOKEN=... SNIMOK_TOKEN=... npm run import:gyazo                # import
   ```

Progress is saved to `import-gyazo.state.json`, so the script can be re-run to
resume or retry failures. Options: `--limit N`, `--concurrency N`,
`--from-json file.json` (use a saved Gyazo API response instead of the API).
Images over 4.4 MB are skipped (Vercel's request limit); Gyazo GIF/video
captures without a downloadable image URL are skipped too. Set `SNIMOK_URL` to
point at another deployment.

## API

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/upload` | `Authorization: Bearer <token>` for account uploads, or `X-Snimok-Device: <id>` for anonymous ones; multipart field `imagedata` (Gyazo-compatible) or raw `image/*` body. Optional fields: `title`, `desc`, `tags` (comma-separated), `app`, `source_title`, `referer_url`, `ocr`, `access_policy` (`anyone`/`only_me`), `created_at`. Returns `permalink_url`, `image_url`, tags, size. |
| `GET` | `/claim?device=&next=` | Sets the device cookie and redirects to `next` (used by the app to open links). |
| `GET` | `/api/captures/:id` | Public JSON metadata. |
| `PUT` | `/api/captures/:id` | Owner (account or device) only, replaces the image (used by the editor). |
| `DELETE` | `/api/captures/:id` | Owner (account or device) only. |
| `GET` | `/r/:id` | 302 to the current image file (stable direct link). |
| `POST` | `/api/desktop/code` | Start device sign-in → `{code, verify_url}`. |
| `GET` | `/api/desktop/poll?code=` | `pending` → `{status:"ok", token}` once approved. |

Personal API tokens for scripts can be created under **Settings**.
