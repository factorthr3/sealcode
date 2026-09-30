/**
 * Sealcode's schema. No table stores prompt or completion content, and none may: the audit log is
 * request metadata only. Every tenant table carries `org_id`, and every tenant query is scoped by
 * it (see tenant.ts).
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => ts('created_at').notNull().defaultNow();
const tokens = (name: string) => bigint(name, { mode: 'number' }).notNull().default(0);

export const orgStatus = pgEnum('org_status', ['trial', 'active', 'suspended']);
export const plan = pgEnum('plan', ['trial', 'team', 'business', 'enterprise']);
export const role = pgEnum('role', ['owner', 'admin', 'developer', 'billing']);
export const budgetMode = pgEnum('budget_mode', ['hard', 'soft']);
export const billingInterval = pgEnum('billing_interval', ['monthly', 'annual']);
export const budgetScope = pgEnum('budget_scope', ['org', 'seat']);

export const orgs = pgTable(
  'orgs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    status: orgStatus('status').notNull().default('trial'),
    plan: plan('plan').notNull().default('trial'),
    /** Purchased seats. On a trial, the trial seat limit applies instead. */
    seats: integer('seats').notNull().default(0),
    billingInterval: billingInterval('billing_interval').notNull().default('monthly'),
    trialEndsAt: ts('trial_ends_at'),
    budgetMode: budgetMode('budget_mode').notNull().default('soft'),
    /** Per-key requests per minute; `null` uses the plan default. */
    rateLimitRpm: integer('rate_limit_rpm'),
    createdAt: created(),
    activatedAt: ts('activated_at'),
    /** The company email domain that started this self-serve trial: one trial per domain. */
    trialDomain: text('trial_domain'),
  },
  (t) => [
    uniqueIndex('orgs_trial_domain_uniq')
      .on(t.trialDomain)
      .where(sql`trial_domain is not null`),
  ],
);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  /** AES-256-GCM ciphertext of the TOTP secret, keyed by a sealed env var. */
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabledAt: ts('totp_enabled_at'),
  isStaff: boolean('is_staff').notNull().default(false),
  createdAt: created(),
  lastLoginAt: ts('last_login_at'),
});

export const memberships = pgTable(
  'memberships',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: role('role').notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index('memberships_user_idx').on(t.userId)],
);

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: role('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: created(),
    expiresAt: ts('expires_at').notNull(),
    acceptedAt: ts('accepted_at'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('invites_org_idx').on(t.orgId)],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** The developer (seat) the key belongs to, who created it. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Device label, for example the laptop's hostname. */
    name: text('name').notNull(),
    /** HMAC-SHA256 of the key with the server-side pepper. The key itself is never stored. */
    hash: text('hash').notNull().unique(),
    prefix: text('prefix').notNull(),
    last4: text('last4').notNull(),
    createdAt: created(),
    lastUsedAt: ts('last_used_at'),
    revokedAt: ts('revoked_at'),
    revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('api_keys_org_idx').on(t.orgId), index('api_keys_user_idx').on(t.userId)],
);

/** The audit log: one row per gateway request, metadata only. */
export const usageEvents = pgTable(
  'usage_events',
  {
    requestId: text('request_id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    keyId: uuid('key_id').notNull(),
    endpoint: text('endpoint').notNull(),
    modelAlias: text('model_alias'),
    upstreamModel: text('upstream_model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull(),
    ttfbMs: integer('ttfb_ms'),
    status: smallint('status').notNull(),
    errorType: text('error_type'),
    receiptId: text('receipt_id'),
    stream: boolean('stream').notNull().default(false),
    createdAt: created(),
  },
  (t) => [
    index('usage_events_org_time_idx').on(t.orgId, t.createdAt),
    index('usage_events_receipt_idx').on(t.receiptId),
  ],
);

/** Daily rollups for the usage charts, by seat, key and model. */
export const usageDaily = pgTable(
  'usage_daily',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    userId: uuid('user_id').notNull(),
    keyId: uuid('key_id').notNull(),
    modelAlias: text('model_alias').notNull(),
    requests: integer('requests').notNull().default(0),
    inputTokens: tokens('input_tokens'),
    outputTokens: tokens('output_tokens'),
    cacheReadTokens: tokens('cache_read_tokens'),
    cacheWriteTokens: tokens('cache_write_tokens'),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.day, t.userId, t.keyId, t.modelAlias] })],
);

/** Monthly token totals per seat, read on every request for budget checks. */
export const usageMonthly = pgTable(
  'usage_monthly',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    period: text('period').notNull(),
    tokens: tokens('tokens'),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.period, t.userId] })],
);

/**
 * Monthly token caps. `scope = org` with no user is the org cap (default: the pooled allowance);
 * `scope = seat` with no user is the default cap for every seat; with a user, that seat's cap.
 */
export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    scope: budgetScope('scope').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    monthlyTokens: bigint('monthly_tokens', { mode: 'number' }).notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('budgets_scope_uniq').on(t.orgId, t.scope, t.userId).nullsNotDistinct()],
);

/** One row per threshold crossed per period, so each alert is sent once. */
export const budgetAlerts = pgTable(
  'budget_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    scope: budgetScope('scope').notNull(),
    userId: uuid('user_id'),
    period: text('period').notNull(),
    threshold: smallint('threshold').notNull(),
    createdAt: created(),
  },
  (t) => [
    unique('budget_alerts_uniq')
      .on(t.orgId, t.scope, t.userId, t.period, t.threshold)
      .nullsNotDistinct(),
  ],
);

/** Outbox for email the gateway triggers. Payloads are metadata; recipients resolve at send. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull().$type<Record<string, string | number | null>>(),
    createdAt: created(),
    sentAt: ts('sent_at'),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [
    index('notifications_pending_idx')
      .on(t.createdAt)
      .where(sql`sent_at is null`),
  ],
);

/** The record of each manual commercial agreement (contact-us billing). */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    plan: plan('plan').notNull(),
    seats: integer('seats').notNull(),
    interval: billingInterval('interval').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    source: text('source').notNull().default('manual'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: created(),
  },
  (t) => [index('subscriptions_org_idx').on(t.orgId)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeOrgId: uuid('active_org_id').references(() => orgs.id, { onDelete: 'set null' }),
    mfaVerifiedAt: ts('mfa_verified_at'),
    createdAt: created(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const magicLinks = pgTable('magic_links', {
  tokenHash: text('token_hash').primaryKey(),
  email: text('email').notNull(),
  next: text('next'),
  createdAt: created(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
});

/** CLI device-code logins. The API key is minted on the first poll after approval, never stored. */
export const deviceCodes = pgTable('device_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceCodeHash: text('device_code_hash').notNull().unique(),
  userCode: text('user_code').notNull().unique(),
  clientName: text('client_name').notNull(),
  createdAt: created(),
  expiresAt: ts('expires_at').notNull(),
  approvedAt: ts('approved_at'),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  keyId: uuid('key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
  consumedAt: ts('consumed_at'),
  deniedAt: ts('denied_at'),
});

/** Sales and activation enquiries from the contact form. */
export const salesEnquiries = pgTable('sales_enquiries', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company').notNull(),
  teamSize: text('team_size').notNull(),
  planInterest: text('plan_interest').notNull(),
  seats: integer('seats'),
  message: text('message'),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'set null' }),
  source: text('source').notNull(),
  status: text('status').notNull().default('new'),
  createdAt: created(),
  handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
  handledAt: ts('handled_at'),
});

/** Admin actions (keys issued and revoked, members changed, budgets set, org activated). */
export const adminEvents = pgTable(
  'admin_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, string | number | boolean | null>>(),
    createdAt: created(),
  },
  (t) => [index('admin_events_org_time_idx').on(t.orgId, t.createdAt)],
);

export const playgroundUsageDaily = pgTable('playground_usage_daily', {
  day: date('day', { mode: 'string' }).primaryKey(),
  requests: integer('requests').notNull().default(0),
  tokens: tokens('tokens'),
});

export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type Role = (typeof role.enumValues)[number];
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type UsageEventRow = typeof usageEvents.$inferSelect;
