"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const GITHUB_REPO = "https://github.com/errriikkk/Cloud-Shakes";

export function BuiltWithBadge({ className }: { className?: string }) {
    return (
        <div className={cn("flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground", className)}>
            <span className="px-2 py-1 rounded-full border border-border/60 bg-muted/30">
                Built with Cloud Shakes
            </span>
            <Link
                href={GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 rounded-full border border-border/60 bg-background hover:bg-muted/40 transition-colors"
            >
                GitHub
            </Link>
        </div>
    );
}

