// Run with node --env-file=.env.local scripts/setup-supabase-test-storage.mjs
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase server configuration missing");
const bucket = "ihd-evidence-test";
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const response = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers });
if (response.status === 404 || response.status === 400) {
  const created = await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers, body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 8 * 1024 * 1024, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] }) });
  if (!created.ok) throw new Error(`Bucket creation failed (${created.status})`);
} else {
  if (!response.ok) throw new Error(`Bucket lookup failed (${response.status})`);
  const existing = await response.json();
  if (existing.public) throw new Error("Test bucket must be private");
}
console.log(JSON.stringify({ bucket, public: false, ready: true }));
