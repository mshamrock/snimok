import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

// Device-code flow used by the desktop app to obtain an API token.
export const deviceCodes = pgTable("device_codes", {
  code: text("code").primaryKey(),
  token: text("token"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const captures = pgTable(
  "captures",
  {
    id: text("id").primaryKey(),
    // Null for anonymous uploads; such captures belong to `deviceId` until the
    // device's owner signs in, which links them to the account.
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id"),
    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    // "public": blobUrl is directly fetchable (public Blob store / local dev).
    // "private": the store is private, images are streamed through /r/<id>.
    access: text("access").notNull().default("public"),
    contentType: text("content_type").notNull().default("image/png"),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    title: text("title"),
    description: text("description"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Context recorded by the desktop app at capture time.
    app: text("app"),
    sourceTitle: text("source_title"),
    sourceUrl: text("source_url"),
    ocrText: text("ocr_text"),
    // "anyone": anyone with the link can view. "only_me": owner/device only.
    accessPolicy: text("access_policy").notNull().default("anyone"),
    // Origin of imported captures, e.g. "gyazo:<image_id>"; used to skip duplicates.
    sourceId: text("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("captures_user_created_idx").on(t.userId, t.createdAt),
    index("captures_device_created_idx").on(t.deviceId, t.createdAt),
    index("captures_source_idx").on(t.userId, t.sourceId),
  ],
);

export type AccessPolicy = "anyone" | "only_me";

export type User = typeof users.$inferSelect;
export type Capture = typeof captures.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
