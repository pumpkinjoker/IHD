import Link from "next/link";
import { FileText } from "lucide-react";

type DocumentTypeCardProps = {
  href: string;
  title: string;
  subtitle: string;
};

export function DocumentTypeCard({ href, title, subtitle }: DocumentTypeCardProps) {
  return (
    <Link
      className="group block rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <FileText aria-hidden="true" className="size-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </Link>
  );
}
