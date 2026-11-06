// Formatos das respostas do painel (apps/api/src/routes/panel.ts).
import type { Role } from "./session";

export type Env = "test" | "live";

export interface Overview {
  ready: boolean;
  steps: { application: boolean; api_key: boolean; device: boolean; line: boolean; first_verification: boolean };
  subscription_status: SubscriptionStatus;
  problem_devices: { id: string; name: string; health: Health; last_seen_at: string | null; line_status: LineStatus | null; sms_permission_denied: boolean }[];
  failed_verifications: { id: string; phone: string; reason: string | null; created_at: string }[];
  failed_webhooks_24h: number;
  verified_total: number;
}

export interface ApiKey {
  id: string;
  name: string;
  environment: Env;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface AgentKey {
  id: string;
  name: string;
  prefix: string;
  allow_live: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface Webhook {
  id: string;
  environment: Env;
  url: string;
  enabled: boolean;
  created_at: string;
}

export interface Application {
  id: string;
  name: string;
  display_name: string;
  live_enabled: boolean;
  allowed_redirect_urls: string[];
  created_at: string;
  keys: ApiKey[];
  webhooks: Webhook[];
}

export type Health = "online" | "degraded" | "offline" | "revoked";
export type LineStatus = "pending_check" | "active" | "disabled";

export interface Device {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  android_version: string | null;
  app_version: string | null;
  status: "active" | "revoked";
  health: Health;
  last_seen_at: string | null;
  paired_at: string;
  diagnostics: Record<string, unknown> | null;
  line: { phone_number: string; status: LineStatus; verified_at: string | null } | null;
}

export interface Pairing {
  id: string;
  code: string;
  expires_at: string;
  api_base_url: string;
  qr_payload: string;
}

export type VerificationStatus = "pending" | "verified" | "expired" | "cancelled" | "failed";

export interface VerificationRow {
  id: string;
  application: string;
  environment: Env;
  phone: string;
  purpose: string;
  reference: string;
  status: VerificationStatus;
  failure_reason: string | null;
  webhook: "pending" | "succeeded" | "failed" | null;
  created_at: string;
  verified_at: string | null;
}

export interface CreatedVerification {
  id: string;
  status: VerificationStatus;
  phone_masked: string;
  receiver_number: string;
  message_body: string | null;
  verification_url: string | null;
  sms_uri: string | null;
  expires_at: string;
}

export interface Delivery {
  id: string;
  event_id: string;
  type: string;
  environment: Env;
  verification_id: string | null;
  url: string;
  status: "pending" | "succeeded" | "failed";
  attempt_count: number;
  last_status_code: number | null;
  last_error: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
  attempts: { number: number; status_code: number | null; error: string | null; duration_ms: number | null; at: string }[];
}

export interface Members {
  members: { id: string; user_id: string; name: string; email: string; role: Role; joined_at: string }[];
  invitations: { id: string; email: string; role: Role; expires_at: string }[];
}

export type SubscriptionStatus = "sandbox" | "active" | "suspended" | "cancelled";

export interface Subscription {
  plan_code: string;
  plan_name: string;
  status: SubscriptionStatus;
  limits: { live_applications: number; devices: number };
  usage: { live_applications: number; devices: number };
  plans: { code: string; name: string; price_cents: number; live_applications: number; devices: number }[];
}

export interface AuditRow {
  id: string;
  action: string;
  actor_type: string;
  target_type: string | null;
  created_at: string;
}
