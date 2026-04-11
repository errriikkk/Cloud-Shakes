"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Github } from "lucide-react";

const GITHUB_REPO = "https://github.com/errriikkk/Cloud-Shakes";

export function BuiltWithBadge({ className }: { className?: string }) {
    return (
        <div className={cn("flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground", className)}>
            <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-border/60 bg-muted/30">
                <img
                    src="/logo-512.png"
                    alt="Cloud Shakes"
                    className="w-4 h-4 rounded object-cover"
                />
                <span>Built with Cloud Shakes</span>
            </span>
            <Link
                href={GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border/60 bg-background hover:bg-muted/40 transition-colors"
            >
                <Github className="w-3.5 h-3.5" />
                GitHub
            </Link>
        </div>
    );
}

