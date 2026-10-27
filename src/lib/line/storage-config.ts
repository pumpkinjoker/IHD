export function lineStorageModes(env: NodeJS.ProcessEnv = process.env) {
  return {
    database: env.LINE_DATABASE_MODE?.trim() || (env.LINE_STORAGE_MODE === "local" ? "local" : "supabase"),
    media: env.LINE_MEDIA_MODE?.trim() || (env.LINE_STORAGE_MODE === "local" ? "local" : "drive")
  };
}
