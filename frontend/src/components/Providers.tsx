"use client";

import { AuthProvider } from "@/context/AuthContext";
import { UploadProvider } from "@/context/UploadContext";
import { I18nProvider } from "@/lib/i18n";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <I18nProvider>
            <AuthProvider>
                <UploadProvider>
                    {children}
                </UploadProvider>
            </AuthProvider>
        </I18nProvider>
    );
}
