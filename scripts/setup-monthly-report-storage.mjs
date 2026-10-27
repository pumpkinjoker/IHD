const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase server configuration missing");
const bucket = "ihd-monthly-reports";
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const existing = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers });
if ([400,404].includes(existing.status)) {
  const created = await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers, body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 8 * 1024 * 1024, allowed_mime_types: ["application/json", "image/jpeg", "image/png", "image/webp"] }) });
  if (!created.ok) throw new Error(`Report bucket setup failed (${created.status})`);
} else if (!existing.ok || (await existing.json()).public) throw new Error("Report bucket must be private");
console.log(JSON.stringify({ bucket, public: false, ready: true }));
