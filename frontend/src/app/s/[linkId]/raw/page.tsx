"use client";

import { use, useEffect } from "react";
import axios from "axios";

export default function EmbedPage({ params }: { params: Promise<{ linkId: string }> }) {
    const { linkId } = use(params);

    useEffect(() => {
        // Redirect to the raw API endpoint
        window.location.href = `/api/links/${linkId}/raw`;
    }, [linkId]);

    return null;
}
