"use client";

import { createContext, useContext, useCallback, ReactNode } from "react";
import { inspectLog } from "@/lib/inspect";

// =============================================================================
// MAP INTENT CONTEXT
// Allows child components to trigger intent overlay refresh and map navigation.
// =============================================================================

interface FlyToOptions {
    lat: number;
    lon: number;
    propertyId: string;
    zoom?: number;
}

/**
 * Options for the unified openProperty navigation API.
 */
export interface OpenPropertyOptions {
    /** Required: the property ID to open */
    propertyId: string;
    /** How to open: "card" (default) shows Tier 1, "messages" opens messaging panel */
    openMode?: "card" | "messages";
    /** If provided with openMode="messages", opens that specific conversation */
    conversationId?: string | null;
    /** Optional: latitude for fly-to */
    lat?: number;
    /** Optional: longitude for fly-to */
    lon?: number;
    /** Optional: zoom level for fly-to (default: 17) */
    zoom?: number;
}

interface MapIntentContextValue {
    /**
     * Refresh intent overlay for visible properties.
     * If propertyId is provided, prioritize fetching that property's intent.
     */
    refreshIntentOverlay: (propertyId?: string) => void;

    /**
     * Fly/zoom the map to a property's coordinates.
     */
    flyToProperty: (options: FlyToOptions) => void;

    /**
     * Unified property navigation API.
     * Handles fly-to (if coords provided), opens card, and optionally opens messaging.
     */
    openProperty: (options: OpenPropertyOptions) => void;
}

const MapIntentContext = createContext<MapIntentContextValue | null>(null);

interface MapIntentProviderProps {
    children: ReactNode;
    onRefresh: (propertyId?: string) => void;
    onFlyTo?: (options: FlyToOptions) => void;
    onOpenProperty?: (options: OpenPropertyOptions) => void;
}

/**
 * Provider component - wrap PropertyMap with this.
 */
export function MapIntentProvider({ children, onRefresh, onFlyTo, onOpenProperty }: MapIntentProviderProps) {
    const refreshIntentOverlay = useCallback(
        (propertyId?: string) => {
            onRefresh(propertyId);
        },
        [onRefresh]
    );

    const flyToProperty = useCallback(
        (options: FlyToOptions) => {
            onFlyTo?.(options);
        },
        [onFlyTo]
    );

    const openProperty = useCallback(
        (options: OpenPropertyOptions) => {
            // Log the navigation request
            inspectLog("OPEN_PROPERTY", {
                property_id: options.propertyId,
                open_mode: options.openMode ?? "card",
                has_conversation_id: !!options.conversationId,
                has_coordinates: options.lat !== undefined && options.lon !== undefined,
            });

            onOpenProperty?.(options);
        },
        [onOpenProperty]
    );

    return (
        <MapIntentContext.Provider value={{ refreshIntentOverlay, flyToProperty, openProperty }}>
            {children}
        </MapIntentContext.Provider>
    );
}

/**
 * Hook to access the map intent functions from child components.
 */
export function useMapIntent(): MapIntentContextValue {
    const context = useContext(MapIntentContext);
    if (!context) {
        // Return no-op if not within provider (graceful degradation)
        return {
            refreshIntentOverlay: () => {
                console.warn("[MapIntent] refreshIntentOverlay called outside provider");
            },
            flyToProperty: () => {
                console.warn("[MapIntent] flyToProperty called outside provider");
            },
            openProperty: () => {
                console.warn("[MapIntent] openProperty called outside provider");
            },
        };
    }
    return context;
}

export type { FlyToOptions };

