"use client";

import { useState, Suspense } from "react";
import { useTranslation } from "@/lib/i18n";
import { FileBrowser } from "@/components/FileBrowser";
import { Search, HardDrive } from "lucide-react";

function DashboardContent() {
    const { t } = useTranslation();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                        <HardDrive className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground tracking-tight">
                            {t("files.title")}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t("files.subtitle")}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative w-full md:w-56">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <input
                            type="text"
                            placeholder={t("files.searchInFolder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-muted/50 border border-border/60 rounded-xl py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/40 transition-all"
                        />
                    </div>
                </div>
            </div>

            <FileBrowser refreshTrigger={refreshTrigger} searchQuery={searchQuery} />
        </div>
    );
}

export default function DashboardPage() {
    const { t } = useTranslation();
    return (
        <Suspense fallback={<div className="py-20 text-center text-muted-foreground text-sm font-medium">{t("common.loading")}</div>}>
            <DashboardContent />
        </Suspense>
    );
}
