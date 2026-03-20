"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

type Branding = {
    cloudName: string;
    logoUrl: string | null;
};

const DEFAULT_BRANDING: Branding = {
    cloudName: "Cloud Shakes",
    logoUrl: "/logo-512.png",
};

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export function BrandingProvider({ children }: { children: React.ReactNode }) {
    const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const res = await axios.get(`${API}/api/branding`, { withCredentials: false });
                const next: Branding = {
                    cloudName: (res.data?.cloudName || DEFAULT_BRANDING.cloudName).toString(),
                    logoUrl: res.data?.logoUrl ? res.data.logoUrl.toString() : DEFAULT_BRANDING.logoUrl,
                };
                if (mounted) setBranding(next);
            } catch {
                // keep defaults
            }
        };
        load();
        return () => {
            mounted = false;
        };
    }, []);

    const value = useMemo(() => branding, [branding]);

    return (
        <BrandingContext.Provider value={value}>
            {children}
        </BrandingContext.Provider>
    );
}

export const useBranding = () => useContext(BrandingContext);

