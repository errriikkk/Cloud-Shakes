"use client";

import { AuthProvider } from "@/context/AuthContext";
import { UploadProvider } from "@/context/UploadContext";
import { I18nProvider } from "@/lib/i18n";
import { BrandingProvider } from "@/lib/branding";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <I18nProvider>
            <BrandingProvider>
                <AuthProvider>
                    <UploadProvider>
                        {children}
                    </UploadProvider>
                </AuthProvider>
            </BrandingProvider>
        </I18nProvider>
    );
}
