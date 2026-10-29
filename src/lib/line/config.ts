import { GoogleDrive } from "@/lib/google/drive";
import { LineClient } from "./client";
import { SupabaseLineStore } from "./store";
import { createLineReceiver } from "./receiver";
import { LocalLineStore } from "./local-database";
import { LocalEvidenceArchive } from "./local-archive";
import { lineStorageModes } from "./storage-config";
import { SupabaseEvidenceArchive } from "./supabase-archive";
import { summaryReply } from "./summary";
import { summaryLinkReply } from "./summary-link";

/** Keys only, never values; safe for setup diagnostics. No build-time connection. */
export function missingLineConfiguration(env: NodeJS.ProcessEnv) {
  const modes = lineStorageModes(env);
  const keys = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN",
    ...(modes.database === "supabase" || modes.media === "supabase" ? ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] : []),
    ...(modes.media === "drive" ? ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_DRIVE_ROOT_FOLDER_ID"] : [])];
  const invalid = [
    ...(!["local", "supabase"].includes(modes.database) ? ["LINE_DATABASE_MODE"] : []),
    ...(!["local", "drive", "supabase"].includes(modes.media) ? ["LINE_MEDIA_MODE"] : [])
  ];
  return [...invalid, ...keys.filter((key) => !env[key]?.trim())];
}

export function configuredLineStore(env: NodeJS.ProcessEnv = process.env) {
  const mode = lineStorageModes(env).database;
  if (mode === "local") return new LocalLineStore();
  if (mode !== "supabase" || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Database is not configured");
  return new SupabaseLineStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export function configuredEvidenceArchive(env: NodeJS.ProcessEnv = process.env) {
  const mode = lineStorageModes(env).media;
  if (mode === "local") return new LocalEvidenceArchive();
  if (mode === "supabase" && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return new SupabaseEvidenceArchive(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  throw new Error("Evidence archive is not configured");
}

export function configuredLineReceiver(env: NodeJS.ProcessEnv = process.env) {
  if (env.LINE_INTAKE_ENABLED !== "true" || missingLineConfiguration(env).length) return undefined;
  const modes = lineStorageModes(env);
  if ((modes.database === "local" || modes.media === "local") && (env.VERCEL || process.env.VERCEL)) return undefined;
  const archive = modes.media !== "drive" ? configuredEvidenceArchive(env) : new GoogleDrive({ clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!,
    refreshToken: env.GOOGLE_REFRESH_TOKEN!, rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID! });
  const store = configuredLineStore(env);
  return createLineReceiver({
    ...((env.LINE_SUMMARY_ENABLED ?? env.LINE_TEST_SUMMARY_ENABLED) === "true" && store instanceof SupabaseLineStore ? {
      summary: (employee, month, offset, hasDraft) => summaryReply(store, employee, month, offset, hasDraft),
      summaryLink: (employee, month, hasDraft) => summaryLinkReply(store, env, employee, month, hasDraft)
    } : {}),
    store,
    line: new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN!), archive,
    employees: (employeeId) => store.findEmployee(employeeId)
  });
}
