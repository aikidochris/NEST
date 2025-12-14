"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { PropertyPublic, BBox, ApiResponse } from "@/types/property";

interface UsePropertiesOptions {
    bbox: BBox | null;
    zoom: number;
}

interface UsePropertiesResult {
    data: PropertyPublic[];
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

const DEBOUNCE_MS = 400;

/**
 * Fetches properties from /api/properties within the given bounding box.
 * - Debounces bbox/zoom changes (400ms)
 * - Sends zoom level for adaptive limits
 * - No Supabase client in browser
 * - Handles errors calmly without throwing
 */
export function useProperties({ bbox, zoom }: UsePropertiesOptions): UsePropertiesResult {
    const [data, setData] = useState<PropertyPublic[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track the latest values for refetch
    const optionsRef = useRef<UsePropertiesOptions>({ bbox, zoom });
    optionsRef.current = { bbox, zoom };

    // Abort controller for cancelling in-flight requests
    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchProperties = useCallback(async (currentBbox: BBox, currentZoom: number) => {
        // Cancel any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const bboxParam = `${currentBbox.minLon},${currentBbox.minLat},${currentBbox.maxLon},${currentBbox.maxLat}`;
            const response = await fetch(`/api/properties?bbox=${bboxParam}&z=${Math.round(currentZoom)}`, {
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                setError(`HTTP ${response.status}: ${errorText}`);
                setData([]);
                return;
            }

            const json: ApiResponse = await response.json();

            if (!json.ok) {
                setError(json.error.message);
                setData([]);
                return;
            }

            setData(json.data);
            setError(null);
        } catch (err) {
            // Ignore abort errors
            if (err instanceof Error && err.name === "AbortError") {
                return;
            }
            setError(err instanceof Error ? err.message : "Unknown error");
            setData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounced effect for bbox/zoom changes
    useEffect(() => {
        if (!bbox) {
            setData([]);
            setError(null);
            return;
        }

        const timeoutId = setTimeout(() => {
            fetchProperties(bbox, zoom);
        }, DEBOUNCE_MS);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [bbox, zoom, fetchProperties]);

    // Manual refetch using current values
    const refetch = useCallback(() => {
        const { bbox: currentBbox, zoom: currentZoom } = optionsRef.current;
        if (currentBbox) {
            fetchProperties(currentBbox, currentZoom);
        }
    }, [fetchProperties]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return { data, loading, error, refetch };
}

