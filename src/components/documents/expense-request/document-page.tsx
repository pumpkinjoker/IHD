import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DocumentPageProps = {
  className?: string;
  children: ReactNode;
};

export function DocumentPage({ children, className }: DocumentPageProps) {
  return (
    <article className={cn("expense-request-page", className)}>
      {children}
    </article>
  );
}
