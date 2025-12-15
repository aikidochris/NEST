"use client";

import { createContext, useContext, useCallback, ReactNode } from "react";

// =============================================================================
// MAP INTENT CONTEXT
// Allows child components to trigger intent overlay refresh on PropertyMap.
// =============================================================================

interface MapIntentContextValue {
    /**
     * Refresh intent overlay for visible properties.
     * If propertyId is provided, prioritize fetching that property's intent.
     */
    refreshIntentOverlay: (propertyId?: string) => void;
}

const MapIntentContext = createContext<MapIntentContextValue | null>(null);

interface MapIntentProviderProps {
    children: ReactNode;
    onRefresh: (propertyId?: string) => void;
}

/**
 * Provider component - wrap PropertyMap with this.
 */
export function MapIntentProvider({ children, onRefresh }: MapIntentProviderProps) {
    const refreshIntentOverlay = useCallback(
        (propertyId?: string) => {
            onRefresh(propertyId);
        },
        [onRefresh]
    );

    return (
        <MapIntentContext.Provider value={{ refreshIntentOverlay }}>
            {children}
        </MapIntentContext.Provider>
    );
}

/**
 * Hook to access the refresh function from child components.
 */
export function useMapIntent(): MapIntentContextValue {
    const context = useContext(MapIntentContext);
    if (!context) {
        // Return no-op if not within provider (graceful degradation)
        return {
            refreshIntentOverlay: () => {
                console.warn("[MapIntent] refreshIntentOverlay called outside provider");
            },
        };
    }
    return context;
}
