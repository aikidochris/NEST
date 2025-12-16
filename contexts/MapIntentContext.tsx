"use client";

import { createContext, useContext, useCallback, ReactNode } from "react";

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
}

const MapIntentContext = createContext<MapIntentContextValue | null>(null);

interface MapIntentProviderProps {
    children: ReactNode;
    onRefresh: (propertyId?: string) => void;
    onFlyTo?: (options: FlyToOptions) => void;
}

/**
 * Provider component - wrap PropertyMap with this.
 */
export function MapIntentProvider({ children, onRefresh, onFlyTo }: MapIntentProviderProps) {
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

    return (
        <MapIntentContext.Provider value={{ refreshIntentOverlay, flyToProperty }}>
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
        };
    }
    return context;
}

export type { FlyToOptions };
