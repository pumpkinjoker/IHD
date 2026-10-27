import { notFound } from "next/navigation";
import { SavedLineEntries } from "@/components/line/saved-entries";
import { lineStorageModes } from "@/lib/line/storage-config";

export default function LineRecordsPage() {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL || !["local", "supabase"].includes(lineStorageModes().media)) notFound();
  return <SavedLineEntries cloudDatabase={lineStorageModes().database === "supabase"} />;
}
