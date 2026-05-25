// ============================================================
// AI API Relay — Drizzle ORM Schema (6 Core Tables)
// ============================================================

import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ── 1. Users ────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  clerkId: text('clerk_id').unique(),      // Clerk user ID (S1+)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
  index('users_clerk_id_idx').on(table.clerkId),
]);

// ── 2. Organizations ───────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('org_slug_idx').on(table.slug),
]);

// ── 3. Organization Members ─────────────────────────────────

export const orgMembers = pgTable('org_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull().default('member'), // 'owner' | 'member'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('org_members_unique').on(table.orgId, table.userId),
  index('org_members_user_idx').on(table.userId),
]);

// ── 4. API Keys ─────────────────────────────────────────────

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),      // SHA-256 hash of the key
  keyPrefix: text('key_prefix').notNull(),            // First 8 chars for display
  provider: text('provider'),                          // null = all providers
  rateLimit: integer('rate_limit'),                    // per-minute limit (null = default)
  dailyQuota: integer('daily_quota'),
  monthlyQuota: integer('monthly_quota'),
  isActive: integer('is_active').notNull().default(1), // boolean
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('api_keys_hash_idx').on(table.keyHash),
  index('api_keys_org_idx').on(table.orgId),
]);

// ── 5. Usage Quotas ─────────────────────────────────────────

export const usageQuotas = pgTable('usage_quotas', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  period: text('period').notNull(),                     // 'daily' | 'monthly'
  periodKey: text('period_key').notNull(),              // '2026-05-21' or '2026-05'
  requests: integer('requests').notNull().default(0),
  promptTokens: bigint('prompt_tokens', { mode: 'number' }).notNull().default(0),
  completionTokens: bigint('completion_tokens', { mode: 'number' }).notNull().default(0),
  totalTokens: bigint('total_tokens', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('usage_quotas_unique').on(table.orgId, table.period, table.periodKey),
]);
