"use client";

import { useCallback } from "react";
import { useAuth } from "@/app/AuthProvider";

interface UseClaimResult {
    claiming: boolean;
    error: string | null;
    claim: (propertyId: string) => Promise<boolean>;
    isAuthenticated: boolean;
}

import { useState } from "react";

/**
 * Hook for claiming a property via /api/claim.
 * Reads access token from AuthProvider context.
 */
export function useClaim(): UseClaimResult {
    const { accessToken } = useAuth();
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const claim = useCallback(
        async (propertyId: string): Promise<boolean> => {
            if (!accessToken) {
                setError("You must be signed in to claim");
                return false;
            }

            setClaiming(true);
            setError(null);

            try {
                const response = await fetch("/api/claim", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({ property_id: propertyId }),
                });

                const json = await response.json();

                if (!json.ok) {
                    setError(json.error?.message || "Claim failed");
                    return false;
                }

                return true;
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unknown error");
                return false;
            } finally {
                setClaiming(false);
            }
        },
        [accessToken]
    );

    return { claiming, error, claim, isAuthenticated: !!accessToken };
}
