"use client";

import { useState, Suspense } from "react";
import { useTranslation } from "@/lib/i18n";
import { FileBrowser } from "@/components/FileBrowser";
import { Search } from "lucide-react";

function DashboardContent() {
    const { t } = useTranslation();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    
    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold text-foreground tracking-tightest">
                        {t("files.title")}
                    </h1>
                    <p className="text-muted-foreground mt-2 text-sm font-medium">
                        {t("files.subtitle")}
                    </p>
                </div>

                <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="relative w-full lg:w-64">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                        <input
                            type="text"
                            placeholder={t("files.searchInFolder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full lg:w-64 bg-muted/50 border border-border/60 rounded-2xl py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/40 focus:bg-background transition-all"
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
        <Suspense fallback={<div className="py-20 text-center text-[#9b9b9b] text-sm font-medium">{t("common.loading")}</div>}>
            <DashboardContent />
        </Suspense>
    );
}
