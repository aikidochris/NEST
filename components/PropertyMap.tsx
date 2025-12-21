"use client";

import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import Map, { Source, Layer, ViewStateChangeEvent, MapRef, Marker } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BBox } from "@/types/property";
import { AuthControls } from "@/components/AuthControls";
import { PropertyCardSheet } from "@/components/PropertyCardSheet";
import { AreaVibeBar, type VibeStats, type LiveFeedEvent } from "@/components/AreaVibeBar";
import { GlobalInboxOverlay } from "@/components/GlobalInboxOverlay";
import { AnchorSnippet, featureToAnchorData, type AnchorFeatureProperties } from "@/components/AnchorSnippet";
import { useAuth } from "@/app/AuthProvider";
import { inspectLog, resolveStatus } from "@/lib/inspect";
import { MapIntentProvider, type FlyToOptions, type OpenPropertyOptions } from "@/contexts/MapIntentContext";

// =============================================================================
// DESIGN KNOBS - Configurable constants
// =============================================================================
// Hearth Design System Colors
const EMBER = "#E08E5F";                // Intent states: for_sale, for_rent, open_to_talking
const PAPER = "#F9F7F4";                // Background/horizon color
const LIGHT_STONE = "#F2F2F2";          // Unclaimed properties (very light to recede)
const INK_GREY = "#8C8C8C";             // Settled/claimed with no active intent
const BUILDING_WARM = "#F1EFE9";        // 3D building extrusion (tone-on-tone editorial)

// Anchor visualization constants
const ANCHOR_RADIUS_METERS = 800;       // 800m catchment radius
const METERS_PER_PIXEL_AT_ZOOM_15 = 4.77; // For radius scaling

// =============================================================================
// MAP CONFIGURATION
// =============================================================================
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const ARCGIS_SATELLITE_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_VIEW = {
    longitude: -1.5,
    latitude: 55.05,
    zoom: 12,
};
const DEBOUNCE_MS = 200; // Debounce for Vibe Stats

// Tile URL must be absolute to prevent MapLibre parsing errors in some contexts
const getTileUrl = () => {
    if (typeof window === "undefined") return ""; // SSR safety
    return `${window.location.origin}/api/tiles/properties/{z}/{x}/{y}`;
};

// Empty GeoJSON for initial state
const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [],
};

/**
 * Computes bbox from map bounds.
 */
function computeBBox(bounds: maplibregl.LngLatBounds): BBox {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return {
        minLon: sw.lng,
        minLat: sw.lat,
        maxLon: ne.lng,
        maxLat: ne.lat,
    };
}

/**
 * Create a grid key for caching (rounds bbox to ~0.01 degree grid)
 */
function bboxToGridKey(bbox: BBox): string {
    const precision = 100; // ~1km grid
    return [
        Math.round(bbox.minLon * precision),
        Math.round(bbox.minLat * precision),
        Math.round(bbox.maxLon * precision),
        Math.round(bbox.maxLat * precision),
    ].join(",");
}

// Intent flags are now delivered via MVT tiles (is_open_to_talking, is_for_sale, is_for_rent, is_settled)

/**
 * Clean Lens: Hide commercial POIs (Retail, Petrol, Coffee).
 */
function hideCommercialPOIs(map: maplibregl.Map) {
    const commercialLayers = [
        "poi-retail",
        "poi-gas",
        "poi-cafe",
        "poi-restaurant",
        "poi-commercial",
        "poi-bank",
        "poi-hospital",
        "poi-school"
    ];
    commercialLayers.forEach((id) => {
        try {
            if (map.getLayer(id)) {
                map.setLayoutProperty(id, "visibility", "none");
            }
        } catch (e) {
            // Layer may not exist in this style
        }
    });
}

// =============================================================================
// LAYER QUERY HELPERS
// =============================================================================

/** Layer IDs that contain individual property points (non-cluster) */
const QUERYABLE_POINT_LAYERS = ["property-points"];

/**
 * Safely query rendered features from multiple layers.
 * Filters to layers that exist and returns empty array on any error.
 */
function safeQueryRenderedFeatures(
    map: maplibregl.Map,
    layerIds: string[]
): maplibregl.MapGeoJSONFeature[] {
    // Filter to only layers that exist
    const existing = layerIds.filter((id) => {
        try {
            return !!map.getLayer(id);
        } catch {
            return false;
        }
    });

    if (existing.length === 0) return [];

    try {
        return map.queryRenderedFeatures(undefined, { layers: existing });
    } catch {
        return [];
    }
}

export interface PropertyMapRef {
    refreshMapPins: () => Promise<void>;
}

const PropertyMap = forwardRef<PropertyMapRef, {}>((props, ref) => {
    const mapRef = useRef<MapRef>(null);
    const [viewState, setViewState] = useState(DEFAULT_VIEW);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
    const [clusterData, setClusterData] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
    const [propertyGeoJSON, setPropertyGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
    const [vibeStats, setVibeStats] = useState<VibeStats | null>(null);
    const [vibeLoading, setVibeLoading] = useState(false);
    const [liveFeedEvents, setLiveFeedEvents] = useState<LiveFeedEvent[]>([]);
    const [liveFeedLoading, setLiveFeedLoading] = useState(false);
    const [vibeBarExpanded, setVibeBarExpanded] = useState(false);
    const [showMessageCentre, setShowMessageCentre] = useState(false);
    const [activeStatusFilters, setActiveStatusFilters] = useState<string[]>(['for_sale', 'for_rent', 'open_to_talking', 'settled', 'unclaimed']);
    const [isFilterMounted, setIsFilterMounted] = useState(false);
    const [isFilterMobileExpanded, setIsFilterMobileExpanded] = useState(false);
    const [pendingOpenMode, setPendingOpenMode] = useState<"card" | "messages">("card");
    const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"paper" | "blueprint" | "satellite">("paper");
    const [is3D, setIs3D] = useState(true);  // 2D/3D performance toggle

    const { accessToken, user } = useAuth();
    const clusterAbortRef = useRef<AbortController | null>(null);
    const vibeAbortRef = useRef<AbortController | null>(null);
    const liveFeedAbortRef = useRef<AbortController | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Manual pitch override: tracks if user has manually tilted the map
    const manualPitchOverrideRef = useRef(false);
    const hasAutoPitchedRef = useRef(false);

    // Cache for vibe stats by grid key
    const vibeCacheRef = useRef<globalThis.Map<string, VibeStats>>(new globalThis.Map());

    // Store current bbox for live feed fetch
    const currentBboxRef = useRef<BBox | null>(null);

    // Pulse animation radius for Living Pins
    const [pulseRadius, setPulseRadius] = useState(0);

    // Neighborhood Anchors state
    const [anchorData, setAnchorData] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
    const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
    const [lockedAnchorIds, setLockedAnchorIds] = useState<string[]>([]);  // Array for toggle logic
    const [selectedAnchor, setSelectedAnchor] = useState<GeoJSON.Feature<GeoJSON.Point, AnchorFeatureProperties> | null>(null);

    // Tiered Anchor Filter: Foundational, Practical, Spirit
    const [anchorTierFilter, setAnchorTierFilter] = useState<'all' | 'foundational' | 'practical' | 'spirit'>('all');

    // Entrance animation for filter bar
    useEffect(() => {
        const timer = setTimeout(() => setIsFilterMounted(true), 100);
        return () => clearTimeout(timer);
    }, []);

    // Surgical Map Filter Integration
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const applyFilters = () => {
            // 1. BASE FILTER: Handle explicit 'Clear' state (Empty Map)
            const baseFilter = activeStatusFilters.length === 0
                ? ['==', ['get', 'property_id'], 'NONE']
                : ['in', ['get', 'status'], ['literal', activeStatusFilters]];

            // 2. STANDARD LAYERS: All Pins, Glyphs, Interaction Points
            ['hearth-pins', 'hearth-glyphs', 'property-points'].forEach(layerId => {
                if (map.getLayer(layerId)) {
                    map.setFilter(layerId, baseFilter as any);
                }
            });

            // 3. INTENT LAYERS: Glow & Pulse (Must ONLY show for active intent)
            const intentFilter = ['all', baseFilter, ['==', ['get', 'has_active_intent'], true]];
            ['building-glow', 'hearth-pulse'].forEach(layerId => {
                if (map.getLayer(layerId)) {
                    map.setFilter(layerId, intentFilter as any);
                }
            });
        };

        // Apply immediately or wait for load if needed
        if (map.isStyleLoaded()) {
            applyFilters();
        } else {
            map.once('style.load', applyFilters);
        }
    }, [activeStatusFilters]);

    const toggleStatusFilter = (filter: string) => {
        setActiveStatusFilters(prev =>
            prev.includes(filter)
                ? prev.filter(f => f !== filter)
                : [...prev, filter]
        );
    };

    const clearStatusFilters = () => setActiveStatusFilters([]);
    const selectAllFilters = () => setActiveStatusFilters(['for_sale', 'for_rent', 'open_to_talking', 'settled', 'unclaimed']);

    // Expose Refresh Bridge to parents (e.g. HomeClient)
    useImperativeHandle(ref, () => ({
        refreshMapPins: async () => {
            // MVT tiles update automatically via cache control; trigger repaint to be sure
            mapRef.current?.getMap().triggerRepaint();
        }
    }));

    // Data fetching removed - relying purely on Vector Tiles (MVT) for the Luminous Engine
    // This dramatically simplifies state management and relies on the browser's tile cache.



    // Fetch vibe stats for area
    const fetchVibeStats = useCallback(async (bbox: BBox) => {
        const gridKey = bboxToGridKey(bbox);

        // Check cache first
        const cached = vibeCacheRef.current.get(gridKey);
        if (cached) {
            setVibeStats(cached);
            return;
        }

        if (vibeAbortRef.current) {
            vibeAbortRef.current.abort();
        }

        const controller = new AbortController();
        vibeAbortRef.current = controller;
        setVibeLoading(true);

        try {
            const bboxParam = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
            const response = await fetch(`/api/area-vibe?bbox=${bboxParam}`, {
                signal: controller.signal,
            });

            if (!response.ok) {
                setVibeStats(null);
                return;
            }

            const json = await response.json();
            if (json.ok && json.data) {
                vibeCacheRef.current.set(gridKey, json.data);
                // Keep cache size reasonable
                if (vibeCacheRef.current.size > 50) {
                    const firstKey = vibeCacheRef.current.keys().next().value;
                    if (firstKey) vibeCacheRef.current.delete(firstKey);
                }
                setVibeStats(json.data);
            }
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            setVibeStats(null);
        } finally {
            setVibeLoading(false);
        }
    }, []);

    // Fetch neighborhood anchors
    const fetchAnchorData = useCallback(async () => {
        try {
            const response = await fetch("/api/anchors");
            if (!response.ok) {
                setAnchorData(EMPTY_GEOJSON);
                return;
            }

            const json = await response.json();
            if (json.ok && json.geojson) {
                setAnchorData(json.geojson);
            }
        } catch {
            setAnchorData(EMPTY_GEOJSON);
        }
    }, []);

    // Load anchors on mount
    useEffect(() => {
        fetchAnchorData();
    }, [fetchAnchorData]);

    // Handle anchor click - toggle lock/unlock for Morning Orbit radii
    const handleAnchorClick = useCallback((anchorId: string) => {
        const feature = anchorData.features.find(f => f.properties?.id === anchorId) as GeoJSON.Feature<GeoJSON.Point, AnchorFeatureProperties> | undefined;

        // Toggle lock: click to pin, click again to remove
        setLockedAnchorIds(prev =>
            prev.includes(anchorId)
                ? prev.filter(id => id !== anchorId)
                : [...prev, anchorId]
        );

        // Update selected anchor for snippet display
        if (feature && !lockedAnchorIds.includes(anchorId)) {
            setSelectedAnchor(feature);
        } else {
            setSelectedAnchor(null);
        }
    }, [anchorData.features, lockedAnchorIds]);

    // Debounced fetch on map move
    const handleMoveEnd = useCallback(
        (evt: ViewStateChangeEvent) => {
            const bounds = evt.target.getBounds();
            if (!bounds) return;

            const bbox = computeBBox(bounds);
            const zoom = evt.viewState.zoom;

            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            debounceTimerRef.current = setTimeout(() => {
                fetchVibeStats(bbox);
                currentBboxRef.current = bbox;
                // Fetch live feed if panel is expanded
                if (vibeBarExpanded) {
                    fetchLiveFeed(bbox);
                }
            }, DEBOUNCE_MS);
        },
        [fetchVibeStats, vibeBarExpanded]
    );

    // Smart Auto-Pitch: One-time trigger when zooming past threshold
    // Respects manual user input (right-click tilt) by using override refs
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        // Detect manual pitch changes (user right-click tilting)
        const handlePitchStart = () => {
            manualPitchOverrideRef.current = true;
        };

        map.on("pitchstart", handlePitchStart);

        return () => {
            map.off("pitchstart", handlePitchStart);
        };
    }, []);

    // Auto-pitch on zoom: only trigger once, respect manual override
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map || !is3D || viewMode === "satellite") return;

        const zoom = viewState.zoom;

        // Blueprint mode: always 45° pitch
        if (viewMode === "blueprint") {
            if (map.getPitch() < 40) {
                map.easeTo({ pitch: 45, duration: 600 });
            }
            return;
        }

        // Paper mode: auto-pitch once when zooming past 16.5 (unless manually overridden)
        if (!manualPitchOverrideRef.current && !hasAutoPitchedRef.current && zoom > 16.5) {
            hasAutoPitchedRef.current = true;
            map.easeTo({ pitch: 45, duration: 600 });
        }
    }, [viewState.zoom, is3D, viewMode]);

    // Fetch live feed events
    const fetchLiveFeed = useCallback(async (bbox: BBox) => {
        if (liveFeedAbortRef.current) {
            liveFeedAbortRef.current.abort();
        }

        const controller = new AbortController();
        liveFeedAbortRef.current = controller;
        setLiveFeedLoading(true);

        try {
            const bboxParam = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
            const response = await fetch(`/api/live-feed?bbox=${bboxParam}&limit=30`, {
                signal: controller.signal,
            });

            if (!response.ok) {
                setLiveFeedEvents([]);
                return;
            }

            const json = await response.json();
            if (json.ok && json.events) {
                setLiveFeedEvents(json.events);
            }
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            setLiveFeedEvents([]);
        } finally {
            setLiveFeedLoading(false);
        }
    }, []);

    // Initial fetch on map load + set up cursor handlers + cinematic atmosphere
    const handleLoad = useCallback(
        (evt: { target: maplibregl.Map }) => {
            const map = evt.target;
            const bounds = map.getBounds();

            if (bounds) {
                const bbox = computeBBox(bounds);
                fetchVibeStats(bbox);
            }

            // Cinematic Orientation: Atmospheric Fog
            // Soft horizon fade into Paper background
            try {
                // TypeScript types incomplete for fog API (MapLibre 3.x+ feature)
                (map as unknown as { setFog: (options: object) => void }).setFog({
                    color: PAPER,
                    range: [1, 12],
                    "horizon-blend": 0.1
                });
            } catch (e) {
                console.debug("Fog not supported:", e);
            }

            // Image Bank: Custom Hearth Anchor Icons
            // Load minimalist SVG icons into map sprite for anchor visualization
            const hearthIcons: Record<string, string> = {
                "hearth-school": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>`)}`,
                "hearth-rail": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`)}`,
                "hearth-park": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M17 12h2L12 2 5 12h2l-3 8h7v2h2v-2h7l-3-8zm-5-6.5l4.3 5.5H13v3h-2v-3H7.7L12 5.5z"/></svg>`)}`,
                "hearth-coastal": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M21 17c-1.1 0-2-.9-2-2 0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2v2c1.1 0 2-.9 2-2 0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2v-2zm0-4c-1.1 0-2-.9-2-2 0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2v2c1.1 0 2-.9 2-2 0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2v-2z"/></svg>`)}`,
                "hearth-village": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M15 11V5l-3-3-3 3v2H3v14h18V11h-6zm-8 8H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm6 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg>`)}`,
                "hearth-health": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`)}`,
                "hearth-shop": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z"/></svg>`)}`
            };

            // Use Image() constructor for reliable data URI loading (fixes InvalidStateError)
            Object.entries(hearthIcons).forEach(([id, dataUri]) => {
                const img = new Image(24, 24);
                img.onload = () => {
                    if (!map.hasImage(id)) {
                        try {
                            map.addImage(id, img, { sdf: true });
                        } catch (e) {
                            console.warn(`Failed to add image: ${id}`, e);
                        }
                    }
                };
                img.onerror = (e) => console.warn(`Failed to load icon: ${id}`, e);
                img.src = dataUri;
            });

            // Cinematic Orientation: Hearth Sky
            // Warm-neutral horizon for 3D tilt views using MapLibre's setSky API
            try {
                // TypeScript types incomplete for sky API (MapLibre experimental feature)
                (map as unknown as { setSky: (options: object) => void }).setSky({
                    "sky-color": PAPER,
                    "sky-horizon-blend": 0.5,
                    "horizon-color": PAPER,
                    "horizon-fog-blend": 0.8,
                    "fog-color": PAPER,
                    "fog-ground-blend": 0.5
                });
            } catch (e) {
                console.debug("Sky not supported:", e);
            }

            // Pointer cursor on interactive layers
            const interactiveLayers = ["property-points", "hearth-pins"];
            interactiveLayers.forEach((layer) => {
                map.on("mouseenter", layer, () => {
                    map.getCanvas().style.cursor = "pointer";
                });
                map.on("mouseleave", layer, () => {
                    map.getCanvas().style.cursor = "";
                });
            });

            // Clean Lens logic: Hide commercial POIs
            hideCommercialPOIs(map);

            // Log layer availability once on first idle
            let hasLoggedLayers = false;
            const logLayersOnce = () => {
                if (hasLoggedLayers) return;
                hasLoggedLayers = true;

                const layersToCheck = [...QUERYABLE_POINT_LAYERS, "hearth-pins", "hearth-glyphs"];
                const layerStatus = layersToCheck.map(id => {
                    try {
                        return { id, exists: !!map.getLayer(id) };
                    } catch {
                        return { id, exists: false };
                    }
                });
                inspectLog("MAP_LAYERS_CHECK", { queried_layers: layerStatus });
            };

            // Log layers on first idle
            map.on("idle", () => {
                logLayersOnce();
            });
        },
        [fetchVibeStats]
    );

    // Ensure pin layers persist and stay on top (simplified - only handles vector source)
    const ensurePinLayers = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map || !map.isStyleLoaded()) return;

        // Hide commercial POIs
        hideCommercialPOIs(map);

        // Explicit layer ordering
        if (map.getLayer("satellite-layer")) {
            try {
                const firstLayerId = map.getStyle().layers?.[0]?.id;
                if (firstLayerId && firstLayerId !== "satellite-layer") {
                    map.moveLayer("satellite-layer", firstLayerId);
                }
            } catch { /* ignore */ }
        }

        if (map.getLayer("building-3d")) {
            try {
                map.moveLayer("building-3d");
            } catch { /* ignore */ }
        }

        // Move pin layers to very top (ensure JSX layers aren't buried)
        ["hearth-pins", "hearth-pulse", "hearth-glyphs"].forEach(id => {
            if (map.getLayer(id)) {
                try { map.moveLayer(id); } catch { /* ignore */ }
            }
        });

    }, []);

    // Effect to handle mode switching, 3D toggle, and layer persistence
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        // Add 3D building extrusion layer (6.5m height, static opacity)
        // Note: Building basemap data doesn't contain property_id, so we use consistent styling
        // The Hearth pin layers provide the active status indication on top
        const add3DBuildings = () => {
            if (!is3D) return;  // Skip if 2D mode
            if (map.getLayer("building-3d")) return;
            if (!map.isStyleLoaded()) return;

            const existingBuilding = map.getStyle()?.layers?.find(l =>
                l.id.includes("building") && l.type === "fill"
            );

            if (existingBuilding && 'source' in existingBuilding) {
                try {
                    map.addLayer({
                        id: "building-3d",
                        source: existingBuilding.source as string,
                        "source-layer": "source-layer" in existingBuilding ? (existingBuilding["source-layer"] as string) : "building",
                        type: "fill-extrusion",
                        minzoom: 14,
                        paint: {
                            // Cinematic 3D: Warm tone-on-tone editorial look
                            "fill-extrusion-color": BUILDING_WARM,
                            "fill-extrusion-height": 6.5,
                            "fill-extrusion-base": 0,
                            "fill-extrusion-opacity": 0.6
                        }
                    });
                } catch (e) {
                    console.warn("Could not add 3D buildings:", e);
                }
            }
        };

        // Remove 3D buildings
        const remove3DBuildings = () => {
            if (map.getLayer("building-3d")) {
                try { map.removeLayer("building-3d"); } catch { /* ignore */ }
            }
        };

        // Stack layers: Satellite (bottom) -> Buildings (if 3D) -> Pins (top)
        const stackLayers = () => {
            // 1. Satellite at absolute bottom
            if (map.getLayer("satellite-layer")) {
                try {
                    const firstLayerId = map.getStyle().layers?.[0]?.id;
                    if (firstLayerId && firstLayerId !== "satellite-layer") {
                        map.moveLayer("satellite-layer", firstLayerId);
                    }
                } catch { /* ignore */ }
            }

            // 2. 3D buildings above satellite
            if (map.getLayer("building-3d")) {
                try { map.moveLayer("building-3d"); } catch { /* ignore */ }
            }

            // 3. Hearth pin layers on very top (in order: pins, pulse, glyphs)
            ["hearth-pins", "hearth-pulse", "hearth-glyphs", "property-points"].forEach(id => {
                if (map.getLayer(id)) {
                    try { map.moveLayer(id); } catch { /* ignore */ }
                }
            });
        };

        // Style update handler - runs on style.load
        const handleStyleUpdate = () => {
            if (!map.isStyleLoaded()) return;

            // Hide commercial POIs
            hideCommercialPOIs(map);

            // Handle 3D mode - buildings available in ALL modes when is3D is true
            // Pitch is now controlled by the smooth pitch coupling useEffect and 2D toggle
            if (is3D) {
                add3DBuildings();
            } else {
                remove3DBuildings();
            }

            // Stack layers correctly
            stackLayers();

            // Ensure pin layers exist
            ensurePinLayers();
        };

        // Listen for style.load to re-add our custom layers after style changes
        map.on("style.load", handleStyleUpdate);

        // Initial update if style is already loaded
        if (map.isStyleLoaded()) {
            handleStyleUpdate();
        } else {
            map.once("style.load", handleStyleUpdate);
        }

        return () => {
            map.off("style.load", handleStyleUpdate);
        };
    }, [viewMode, is3D, ensurePinLayers]);

    // Handle map click - cluster zoom or property select
    const handleMapClick = useCallback(
        async (evt: MapLayerMouseEvent) => {
            try {
                const features = evt.features;
                if (!features || features.length === 0) return;

                // DEFINITIVE CLUSTER GUARD: Prevent MapLibre decoder from reading cluster metadata
                const firstFeature = features[0];
                if (firstFeature.source?.includes('cluster') || firstFeature.properties?.cluster) return;

                // Check for anchor icon click first
                const anchorFeature = features.find((f) => f.layer?.id === "anchor-icons");
                if (anchorFeature) {
                    const anchorId = anchorFeature.properties?.id;
                    if (anchorId) {
                        handleAnchorClick(anchorId);
                        return;
                    }
                }

                // Cluster click logic REMOVED - using Heatmap/Zoom transition
                // Individual property click - use feature properties directly from tiles
                const hearthFeature = features.find((f) => f.layer?.id === "hearth-pins");
                const baseFeature = features.find((f) => f.layer?.id === "property-points");
                // Clusters and unclustered points removed for Heatmap

                const feature = hearthFeature || baseFeature;
                if (!feature) return;

                const propertyId = feature.properties?.property_id;
                // Crash Prevention: Ignore features without valid status
                if (!feature.properties?.status) return;
                if (propertyId) {
                    // Build intent flags from feature properties (tiles now include all flags)
                    const props = feature.properties ?? {};
                    const source_layer = feature.layer?.id;

                    // Read directly from tile properties
                    const is_claimed = typeof props.is_claimed === "boolean" ? props.is_claimed : null;
                    const intent_flags = {
                        soft_listing: props.is_open_to_talking ?? null,
                        settled: props.is_settled ?? null,
                        is_for_sale: props.is_for_sale ?? null,
                        is_for_rent: props.is_for_rent ?? null,
                    };

                    // Inspection mode logging for property click
                    inspectLog("PROPERTY_OPEN", {
                        property_id: propertyId,
                        is_claimed,
                        display_label: props.display_label ?? null,
                        source_layer,
                        intent_flags,
                        resolved_status: resolveStatus({
                            is_claimed,
                            intent_flags: {
                                soft_listing: intent_flags.soft_listing === true,
                                settled: intent_flags.settled === true,
                                is_for_sale: intent_flags.is_for_sale === true,
                                is_for_rent: intent_flags.is_for_rent === true,
                            },
                        }),
                    });
                    // Clear pending conversation state for direct map clicks
                    setPendingOpenMode("card");
                    setPendingConversationId(null);
                    setSelectedPropertyId(propertyId);
                }
            } catch (e) {
                // Crash Prevention: Silently ignore decoder errors from malformed features
                console.debug('handleMapClick error:', e);
            }
        },
        []
    );

    // Close property sheet - clear all pending state
    const handleCloseSheet = useCallback(() => {
        setSelectedPropertyId(null);
        setPendingOpenMode("card");
        setPendingConversationId(null);
    }, []);

    // Refresh intent: tiles are now the source of truth, so we just need to force a repaint
    const refreshIntentForProperty = useCallback((_propertyId?: string) => {
        // With MVT tiles as single source of truth, intent updates come from tile refresh
        // Force map repaint by triggering a state change
        const map = mapRef.current?.getMap();
        if (map) {
            // Trigger repaint on the vector source
            map.triggerRepaint();
        }
    }, []);

    // After claim success, refresh intent
    const handleClaimSuccess = useCallback(() => {
        // Refresh intent for the selected property
        if (selectedPropertyId) {
            refreshIntentForProperty(selectedPropertyId);
        }
    }, [selectedPropertyId, refreshIntentForProperty]);

    // Fly to a property's coordinates
    const handleFlyToProperty = useCallback((options: FlyToOptions) => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const zoom = options.zoom ?? 17; // Default to street-level zoom

        // Fly to the property
        map.flyTo({
            center: [options.lon, options.lat],
            zoom,
            essential: true,
            duration: 1500,
        });

        // Inspection log
        inspectLog("NEIGHBOUR_FLYTO", {
            property_id: options.propertyId,
            lat: options.lat,
            lon: options.lon,
        });
    }, []);

    /**
     * Unified property navigation handler.
     * Implements the openProperty API contract from MapIntentContext.
     */
    const handleOpenProperty = useCallback((options: OpenPropertyOptions) => {
        const { propertyId, openMode = "card", conversationId = null, lat, lon, zoom } = options;

        // Step 1: Fly to property if coordinates provided
        if (lat !== undefined && lon !== undefined) {
            handleFlyToProperty({ propertyId, lat, lon, zoom });
        }

        // Step 2: Set pending state for PropertyCardSheet
        setPendingOpenMode(openMode);
        setPendingConversationId(conversationId ?? null);

        // Step 3: Open the property card (which will use pending state)
        setSelectedPropertyId(propertyId);
    }, [handleFlyToProperty]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clusterAbortRef.current?.abort();
            vibeAbortRef.current?.abort();
            liveFeedAbortRef.current?.abort();
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    // Living Pin Pulse Animation (4s cycle)
    useEffect(() => {
        let startTime = Date.now();
        let animationFrame: number;

        const animate = () => {
            const now = Date.now();
            const elapsed = (now - startTime) % 4000;
            const t = elapsed / 4000; // 0 to 1

            // Gaussian-ish pulse: 0 -> 1 -> 0
            const pulse = Math.exp(-Math.pow(t - 0.5, 2) / 0.05);
            setPulseRadius(pulse);

            animationFrame = requestAnimationFrame(animate);
        };

        animate();
        return () => cancelAnimationFrame(animationFrame);
    }, []);

    // Update fog color based on view mode
    // 'Architectural' Fog: center crisp, edges fade into Paper haze
    // Paper Mode: Color #F9F7F4, Range [0.2, 10] - warm haze
    // Satellite Mode: Color #FFFFFF, Range [0.5, 15] - atmospheric depth
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        try {
            const isSatellite = viewMode === "satellite";
            const fogColor = isSatellite ? "#FFFFFF" : PAPER;
            const fogRange: [number, number] = isSatellite ? [0.5, 15] : [0.2, 10];

            (map as unknown as { setFog: (options: object) => void }).setFog({
                color: fogColor,
                range: fogRange,
                "horizon-blend": 0.1
            });
        } catch {
            // Fog not supported
        }
    }, [viewMode]);


    // Toggle vibe bar expand and fetch live feed
    const handleToggleVibeBar = useCallback(() => {
        setVibeBarExpanded(prev => {
            const willExpand = !prev;
            if (willExpand && currentBboxRef.current) {
                fetchLiveFeed(currentBboxRef.current);
            }
            return willExpand;
        });
    }, [fetchLiveFeed]);

    // Handle live feed event click - fly to property
    const handleEventClick = useCallback(async (event: LiveFeedEvent) => {
        // Close panel first
        setVibeBarExpanded(false);
        // Clear pending conversation state for live feed clicks
        setPendingOpenMode("card");
        setPendingConversationId(null);
        // Select property to open the sheet
        setSelectedPropertyId(event.property_id);
    }, []);





    // Vibe bar visibility: hidden when any card/sheet is open
    const showVibeBar = !selectedPropertyId;

    // Close vibe bar when property sheet opens
    useEffect(() => {
        if (selectedPropertyId) {
            setVibeBarExpanded(false);
        }
    }, [selectedPropertyId]);

    return (
        <MapIntentProvider onRefresh={refreshIntentForProperty} onFlyTo={handleFlyToProperty} onOpenProperty={handleOpenProperty}>
            <div className="relative w-full h-screen">
                <Map
                    ref={mapRef}
                    {...viewState}
                    onMove={(evt) => setViewState(evt.viewState)}
                    onMoveEnd={handleMoveEnd}
                    onLoad={handleLoad}
                    onClick={handleMapClick}
                    onMouseMove={(e) => {
                        const map = mapRef.current?.getMap();
                        if (!map) return;

                        // Null-Safe MVT is now live - tiles are sanitized with COALESCE for all nullable fields
                        const targetLayers = ['hearth-pins', 'property-points', 'anchor-icons'];
                        const interactableLayers = targetLayers.filter(id => map.getLayer(id));

                        if (interactableLayers.length === 0) return;

                        try {
                            const features = map.queryRenderedFeatures(e.point, {
                                layers: interactableLayers
                            });

                            if (!features || features.length === 0) {
                                map.getCanvas().style.cursor = '';
                                return;
                            }

                            // Change cursor to pointer if we hit something
                            map.getCanvas().style.cursor = 'pointer';

                            // Skip cluster features (DEPRECATED: Clusters removed)
                            const topFeature = features[0];
                            if (topFeature.properties?.cluster) return;

                            // HOVER GUARD: Data integrity check for Luminous Engine
                            // Anchors effectively bypassed as they use 'anchor-source'
                            if (topFeature.source === 'luminary-mvt' && !topFeature.properties?.status) {
                                return;
                            }
                        } catch (err) {
                            // Fallback: Prevent PBF decoder exceptions from crashing the React runtime
                            map.getCanvas().style.cursor = '';
                        }
                    }}
                    interactiveLayerIds={
                        // Ghost Hover Guard: Disable anchor interaction below Z12
                        viewState.zoom < 12
                            ? ["property-points", "hearth-pins"]
                            : ["property-points", "hearth-pins", "anchor-icons"]
                    }
                    style={{ width: "100%", height: "100%" }}
                    mapStyle={MAP_STYLE}
                >
                    {/* Satellite layer - High-Fi reality-focused imagery */}
                    {viewMode === "satellite" && (
                        <Source id="satellite-source" type="raster" tiles={[ARCGIS_SATELLITE_URL]} tileSize={256}>
                            <Layer
                                id="satellite-layer"
                                type="raster"
                                beforeId="water"
                                paint={{
                                    "raster-brightness-min": 0.05,
                                    "raster-contrast": 0.1,
                                    "raster-saturation": 0  // Hi-Fi 2025: natural greens and blues pop
                                }}
                            />
                        </Source>
                    )}



                    {/* 
                        LUMINOUS ENGINE MVT SOURCE 
                        Uses sanitized vector tiles for Heatmap and Smart Pins 
                    */}
                    <Source id="luminary-mvt" type="vector" tiles={[getTileUrl()]}>
                        {/* 
                            LUMINOUS DISCOVERY LAYER (Heatmap)
                            Visible Zoom: 0-12
                            Intensity: Driven by 'discovery_weight' (Moat Logic)
                        */}
                        <Layer
                            id="discovery-heatmap"
                            type="heatmap"
                            source-layer="properties"
                            maxzoom={12}
                            paint={{
                                // Weight: 0.1 (unclaimed) to 1.0 (for_sale)
                                "heatmap-weight": ["get", "discovery_weight"],
                                // Intensity: Ramps up as we zoom in
                                "heatmap-intensity": [
                                    "interpolate", ["linear"], ["zoom"],
                                    0, 0.5,
                                    11, 3
                                ],
                                // Dual-Tone Color Ramp: Transparent -> Ink-Grey -> Ember
                                "heatmap-color": [
                                    "interpolate", ["linear"], ["heatmap-density"],
                                    0, "rgba(255,255,255,0)",
                                    0.2, "rgba(140,140,140,0.5)", // Ink-Grey mist
                                    0.5, "rgba(140,140,140,0.8)", // Semi-opaque Ink
                                    1, "rgba(224,142,95,0.95)"    // Hot Ember
                                ],
                                // Radius: Expands with zoom to maintain coverage
                                "heatmap-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    0, 4,
                                    11, 30
                                ],
                                // Fade Out: Seamless transition to pins at zoom 12
                                "heatmap-opacity": [
                                    "interpolate", ["linear"], ["zoom"],
                                    10, 1,
                                    12, 0
                                ]
                            }}
                        />

                        {/* Hearth Halo - Building Glow Layer */}
                        <Layer
                            id="building-glow"
                            type="circle"
                            source-layer="properties"
                            minzoom={11}
                            filter={
                                activeStatusFilters.length === 0
                                    ? ['==', ['get', 'property_id'], 'NONE']
                                    : ['all',
                                        ['in', ['get', 'status'], ['literal', activeStatusFilters]],
                                        ['==', ['get', 'has_active_intent'], true]
                                    ]
                            }
                            paint={{
                                "circle-color": EMBER,
                                "circle-opacity": 0, // DONUT EFFECT: Transparent center to protect icon legibility
                                "circle-stroke-width": 4,
                                "circle-stroke-color": EMBER,
                                "circle-stroke-opacity": 0.4,
                                "circle-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    15, 15,
                                    17, 35,
                                    19, 60
                                ],
                                "circle-blur": 0.8 // Soften the outer ring
                            }}
                        />

                        {/* 
                            SMART PRIORITY PINS 
                            Visible Zoom: 11+
                            Logic: Adaptive sizing + Semantic Stacking
                        */}
                        <Layer
                            id="hearth-pins"
                            type="circle"
                            source-layer="properties"
                            minzoom={11}
                            filter={
                                activeStatusFilters.length === 0
                                    ? ['==', ['get', 'property_id'], 'NONE']
                                    : ['in', ['get', 'status'], ['literal', activeStatusFilters]]
                            }
                            layout={{
                                // SEMANTIC STACKING: Vital pins float to top
                                "circle-sort-key": [
                                    "match", ["get", "status"],
                                    "for_sale", 100,
                                    "open_to_talking", 90,
                                    "for_rent", 80,
                                    "settled", 50,
                                    0  // unclaimed at bottom
                                ]
                            }}
                            paint={{
                                // 5-State Semantic Colors
                                "circle-color": [
                                    "match",
                                    ["get", "status"],
                                    "for_sale", EMBER,
                                    "for_rent", EMBER,
                                    "open_to_talking", EMBER,
                                    "settled", INK_GREY,
                                    "unclaimed", "#9CA3AF",
                                    "#9CA3AF" // fallback
                                ],
                                // ADAPTIVE SIZING: Unclaimed shrink to dots at mid-zoom
                                "circle-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    11, 0, // Pin-Drop: Start invisible
                                    12, ["match", ["get", "status"],
                                        "unclaimed", 2, // Tiny dot for unclaimed
                                        4               // 4px for Intent
                                    ],
                                    15, ["match", ["get", "status"],
                                        "unclaimed", 4,
                                        8
                                    ]
                                ],
                                "circle-opacity": [
                                    "interpolate", ["linear"], ["zoom"],
                                    11, 0,
                                    12, ["match", ["get", "status"],
                                        "unclaimed", 0.3,
                                        1
                                    ]
                                ],
                                "circle-stroke-width": 0,
                            }}
                        />

                        {/* Living Pin Pulse Layer */}
                        <Layer
                            id="hearth-pulse"
                            type="circle"
                            source-layer="properties"
                            minzoom={11}
                            filter={
                                activeStatusFilters.length === 0
                                    ? ['==', ['get', 'property_id'], 'NONE']
                                    : ['all',
                                        ['in', ['get', 'status'], ['literal', activeStatusFilters]],
                                        ['==', ['get', 'has_active_intent'], true]
                                    ]
                            }
                            paint={{
                                "circle-color": EMBER,
                                "circle-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    12, ["*", 12, pulseRadius],
                                    16, ["*", 28, pulseRadius]
                                ],
                                "circle-opacity": ["*", 0.35, ["-", 1, pulseRadius]],
                            }}
                        />

                        {/* Hearth Glyphs */}
                        <Layer
                            id="hearth-glyphs"
                            type="symbol"
                            source-layer="properties"
                            minzoom={13}
                            filter={
                                activeStatusFilters.length === 0
                                    ? ['==', ['get', 'property_id'], 'NONE']
                                    : ['in', ['get', 'status'], ['literal', activeStatusFilters]]
                            }
                            layout={{
                                "text-field": [
                                    "match",
                                    ["get", "status"],
                                    "for_sale", "£",
                                    "for_rent", "r",
                                    "open_to_talking", "+",
                                    ""
                                ],
                                "text-font": ["Open Sans Bold"],
                                "text-size": [
                                    "interpolate", ["linear"], ["zoom"],
                                    14, 9,
                                    16, 11
                                ],
                                "text-allow-overlap": true,
                                "text-ignore-placement": true,
                            }}
                            paint={{
                                "text-color": "#ffffff",
                            }}
                        />

                        {/* Hidden sensor layer for click detection */}
                        <Layer
                            id="property-points"
                            type="circle"
                            source-layer="properties"
                            minzoom={11}
                            filter={
                                activeStatusFilters.length === 0
                                    ? ['==', ['get', 'property_id'], 'NONE']
                                    : ['in', ['get', 'status'], ['literal', activeStatusFilters]]
                            }
                            paint={{
                                "circle-color": "#000000",
                                "circle-radius": 8,
                                "circle-opacity": 0,
                                "circle-stroke-opacity": 0,
                            }}
                        />
                    </Source>

                    {/* Neighborhood Anchors - Accurate 800m radii layer */}
                    {anchorData.features.length > 0 && (
                        <Source id="anchor-source" type="geojson" data={anchorData}>
                            {/* Anchor Radii - 800m (10-minute walk) catchment circles */}
                            {/* Uses exponential interpolation calibrated for UK latitude (55°N) */}
                            <Layer
                                id="anchor-radii"
                                type="circle"
                                filter={
                                    anchorTierFilter === 'all'
                                        ? true
                                        : ["==", ["get", "tier"], anchorTierFilter]
                                }
                                paint={{
                                    // High-precision 800m radius for UK latitude (55°N)
                                    // Formula: 800m × (2^zoom) / (156543 × cos(55°))
                                    "circle-radius": [
                                        "interpolate", ["exponential", 2], ["zoom"],
                                        10, 12.5,
                                        15, 400,
                                        20, 12800
                                    ],
                                    // Lie flat on ground in 3D view
                                    "circle-pitch-alignment": "map",
                                    // Morning Orbit: Ember fill at 10% opacity for active/locked
                                    "circle-color": EMBER,
                                    "circle-opacity": [
                                        "case",
                                        ["in", ["get", "id"], ["literal", lockedAnchorIds]],
                                        0.1,
                                        ["==", ["get", "id"], activeAnchorId || ""],
                                        0.1,
                                        0
                                    ],
                                    // Visual Trust: clear 10-minute walk boundary
                                    "circle-stroke-width": [
                                        "case",
                                        ["in", ["get", "id"], ["literal", lockedAnchorIds]],
                                        2,
                                        ["==", ["get", "id"], activeAnchorId || ""],
                                        2,
                                        0
                                    ],
                                    "circle-stroke-color": EMBER,
                                    "circle-stroke-opacity": 0.3
                                }}
                            />

                            {/* Anchor Icons - Premium Symbol Layer with custom SVG icons */}
                            {/* Uses INK_GREY base with white halo for editorial appearance */}
                            <Layer
                                id="anchor-icons"
                                type="symbol"
                                minzoom={11}
                                filter={
                                    anchorTierFilter === 'all'
                                        ? true
                                        : ["==", ["get", "tier"], anchorTierFilter]
                                }
                                layout={{
                                    // Map subtype to hearth- prefixed icons loaded in handleLoad
                                    "icon-image": [
                                        "case",
                                        // Schools (Foundational)
                                        ["==", ["get", "subtype"], "primary"], "hearth-school",
                                        ["==", ["get", "subtype"], "secondary"], "hearth-school",
                                        // Transport (Practical)
                                        ["==", ["get", "subtype"], "metro"], "hearth-rail",
                                        ["==", ["get", "subtype"], "ferry"], "hearth-rail",
                                        ["==", ["get", "subtype"], "bus"], "hearth-rail",
                                        // Green Spaces (Spirit)
                                        ["==", ["get", "subtype"], "park"], "hearth-park",
                                        ["==", ["get", "subtype"], "coastal"], "hearth-coastal",
                                        ["==", ["get", "subtype"], "village_center"], "hearth-village",
                                        // Health (Practical)
                                        ["==", ["get", "subtype"], "gp"], "hearth-health",
                                        ["==", ["get", "subtype"], "hospital"], "hearth-health",
                                        ["==", ["get", "subtype"], "dentist"], "hearth-health",
                                        // Shops (Practical)
                                        ["==", ["get", "subtype"], "supermarket"], "hearth-shop",
                                        ["==", ["get", "subtype"], "convenience"], "hearth-shop",
                                        "hearth-park"  // Default fallback
                                    ],
                                    "icon-size": 1,
                                    "icon-allow-overlap": true,
                                    "icon-ignore-placement": true
                                }}
                                paint={{
                                    // VISUAL TRANSITION: Smooth fade-in (11.5 -> 12)
                                    "icon-opacity": [
                                        "interpolate", ["linear"], ["zoom"],
                                        11.5, 0,
                                        12, 1
                                    ],
                                    // GPU expression: EMBER if active/locked, INK_GREY otherwise (SDF coloring)
                                    "icon-color": [
                                        "case",
                                        ["in", ["get", "id"], ["literal", lockedAnchorIds]],
                                        EMBER,
                                        ["==", ["get", "id"], activeAnchorId || ""],
                                        EMBER,
                                        INK_GREY
                                    ],
                                    "icon-halo-color": "#ffffff",
                                    "icon-halo-width": 1
                                }}
                            />

                            {/* Anchor Labels */}
                            <Layer
                                id="anchor-labels"
                                type="symbol"
                                minzoom={14}
                                filter={
                                    anchorTierFilter === 'all'
                                        ? true
                                        : ["==", ["get", "tier"], anchorTierFilter]
                                }
                                layout={{
                                    "text-field": ["get", "name"],
                                    "text-size": 10,
                                    "text-offset": [0, 1.2],
                                    "text-anchor": "top",
                                    "text-max-width": 8
                                }}
                                paint={{
                                    "text-color": [
                                        "case",
                                        ["in", ["get", "id"], ["literal", Array.from(lockedAnchorIds)]],
                                        EMBER,
                                        ["==", ["get", "id"], activeAnchorId || ""],
                                        EMBER,
                                        INK_GREY
                                    ],
                                    "text-halo-color": "#ffffff",
                                    "text-halo-width": 1
                                }}
                            />
                        </Source>
                    )}


                </Map>

                {/* Floating Map Filter Bar - Clinical Discovery Experience */}
                <div
                    className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 transition-all duration-700 ease-out transform pointer-events-none 
                    ${isFilterMounted ? 'translate-y-0 opacity-100' : '-translate-y-8 opacity-0'}`}
                >
                    <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center bg-[#F9F7F2]/95 backdrop-blur-[24px] border border-[#1B1B1B]/10 rounded-full px-2 py-2 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] pointer-events-auto">
                            {/* Mobile Toggle Trigger */}
                            <button
                                onClick={() => setIsFilterMobileExpanded(!isFilterMobileExpanded)}
                                className="md:hidden flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-100/50"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                <span>Filter</span>
                            </button>

                            {/* Desktop/Expanded Filters */}
                            <div className={`${isFilterMobileExpanded ? 'flex flex-col' : 'hidden'} md:flex items-center gap-1.5 px-1`}>
                                {/* For Sale Toggle */}
                                <button
                                    onClick={() => toggleStatusFilter('for_sale')}
                                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 transform active:scale-95 ${activeStatusFilters.includes('for_sale')
                                        ? 'bg-[#E08E5F] text-white shadow-[0_0_15px_rgba(224,142,95,0.5)]'
                                        : 'bg-white/40 text-gray-400 hover:bg-white/70'
                                        }`}
                                >
                                    For Sale
                                </button>

                                {/* For Rent Toggle */}
                                <button
                                    onClick={() => toggleStatusFilter('for_rent')}
                                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 transform active:scale-95 ${activeStatusFilters.includes('for_rent')
                                        ? 'bg-[#8C8C8C] text-white shadow-[0_0_15px_rgba(140,140,140,0.5)]'
                                        : 'bg-white/40 text-gray-400 hover:bg-white/70'
                                        }`}
                                >
                                    For Rent
                                </button>

                                {/* Open to Talking (Spirit) Toggle */}
                                <button
                                    onClick={() => toggleStatusFilter('open_to_talking')}
                                    className={`relative px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-500 transform active:scale-95 overflow-hidden ${activeStatusFilters.includes('open_to_talking')
                                        ? 'bg-white text-[#E08E5F] shadow-[0_0_20px_rgba(224,142,95,0.4)] ring-1 ring-[#E08E5F]/20'
                                        : 'bg-white/40 text-gray-400 hover:bg-white/70'
                                        }`}
                                >
                                    {activeStatusFilters.includes('open_to_talking') && (
                                        <span className="absolute inset-0 bg-[#E08E5F]/5 animate-pulse" />
                                    )}
                                    <span className="relative z-10">Open to Talking</span>
                                    {activeStatusFilters.includes('open_to_talking') && (
                                        <div className="absolute inset-0 rounded-full ring-1 ring-[#E08E5F]/30 animate-pulse pointer-events-none" />
                                    )}
                                </button>

                                {/* Separator */}
                                <div className="w-px h-4 bg-gray-200/60 mx-1" />

                                {/* Settled Toggle */}
                                <button
                                    onClick={() => toggleStatusFilter('settled')}
                                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 transform active:scale-95 ${activeStatusFilters.includes('settled')
                                        ? 'bg-[#4A4A4A] text-white shadow-md'
                                        : 'bg-white/40 text-gray-400 hover:bg-white/70'
                                        }`}
                                >
                                    Settled
                                </button>

                                {/* Unclaimed Toggle */}
                                <button
                                    onClick={() => toggleStatusFilter('unclaimed')}
                                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 transform active:scale-95 ${activeStatusFilters.includes('unclaimed')
                                        ? 'bg-[#D4D0C8] text-gray-700 shadow-md'
                                        : 'bg-white/40 text-gray-400 hover:bg-white/70'
                                        }`}
                                >
                                    Unclaimed
                                </button>

                                {/* Separator & Control Buttons */}
                                <div className="w-px h-4 bg-gray-200/60 mx-1" />

                                {/* All Button */}
                                <button
                                    onClick={selectAllFilters}
                                    className="px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-100/50 transition-colors"
                                >
                                    All
                                </button>

                                {/* Clear Button */}
                                <button
                                    onClick={clearStatusFilters}
                                    className="px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest text-[#E08E5F] hover:bg-[#E08E5F]/10 transition-colors"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top-left controls */}
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                    <AuthControls />
                    {/* Messages button - only for authenticated users */}
                    {user && (
                        <button
                            onClick={() => setShowMessageCentre(true)}
                            className="bg-white/90 backdrop-blur-sm rounded-lg p-2.5 shadow-md hover:bg-white transition-colors flex items-center gap-2"
                            aria-label="Messages"
                        >
                            <svg className="w-5 h-5 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700">Messages</span>
                        </button>
                    )}

                    {/* Satellite Toggle (Deprecated by Mode Selector) */}
                </div>

                {/* Instrument Bar - Unified View Controls with Hearth Design Bible polish */}
                <div className="absolute bottom-10 right-4 flex flex-col gap-1.5 z-10 bg-[#F9F7F4]/95 backdrop-blur-[24px] border border-[#1B1B1B]/10 rounded-lg shadow-sm p-1.5 font-['Inter',sans-serif]">
                    {/* Row 1: View Mode - Rationalized State Machine */}
                    <div className="flex rounded-md overflow-hidden">
                        {(["paper", "blueprint", "satellite"] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => {
                                    const map = mapRef.current?.getMap();
                                    setViewMode(mode);

                                    // Reset manual override when switching modes
                                    manualPitchOverrideRef.current = false;
                                    hasAutoPitchedRef.current = false;

                                    if (mode === "paper") {
                                        // Paper: flat top-down, clean lines
                                        if (map) map.easeTo({ pitch: 0, duration: 400 });
                                    } else if (mode === "blueprint") {
                                        // Blueprint: stark 3D, always 45° pitch
                                        setIs3D(true);
                                        if (map) map.easeTo({ pitch: 45, duration: 600 });
                                    } else if (mode === "satellite") {
                                        // Satellite: reality-focused, 3D OFF by default for clear photos
                                        setIs3D(false);
                                        if (map) map.easeTo({ pitch: 0, duration: 400 });
                                    }
                                }}
                                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${viewMode === mode
                                    ? "bg-[#1B1B1B] text-white"
                                    : "text-[#1B1B1B] hover:bg-gray-100"
                                    } ${mode !== "satellite" ? "border-r border-[#1B1B1B]/10" : ""}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    {/* Row 2: Depth Toggle - Camera Pitch Invariant */}
                    <button
                        onClick={() => {
                            const map = mapRef.current?.getMap();
                            if (is3D) {
                                // Switching to 2D: smooth ease to flat over 1000ms
                                setIs3D(false);
                                if (map) {
                                    map.easeTo({ pitch: 0, duration: 1000 });
                                }
                            } else {
                                // Switching to 3D: smooth ease to 45° pitch over 1000ms
                                setIs3D(true);
                                if (map) {
                                    map.easeTo({ pitch: 45, duration: 1000 });
                                }
                            }
                        }}
                        className={`w-full px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${is3D
                            ? "bg-[#1B1B1B] text-white"
                            : "text-[#1B1B1B] hover:bg-gray-100 border border-[#1B1B1B]/10"
                            }`}
                    >
                        {is3D ? "3D Depth On" : "3D Depth Off"}
                    </button>

                    {/* Row 3: Orientation Tier Filter - Filter anchors by tier */}
                    <div className="flex overflow-hidden rounded-md border border-[#1B1B1B]/10 mt-2">
                        {(['all', 'foundational', 'practical', 'spirit'] as const).map((tier, idx) => (
                            <button
                                key={tier}
                                onClick={() => setAnchorTierFilter(tier)}
                                className={`flex-1 px-2 py-1.5 text-[10px] font-medium capitalize transition-colors ${anchorTierFilter === tier
                                    ? "bg-[#1B1B1B] text-white"
                                    : "text-[#1B1B1B] hover:bg-gray-100"
                                    } ${idx < 3 ? "border-r border-[#1B1B1B]/10" : ""}`}
                            >
                                {tier === 'all' ? 'All' : tier.charAt(0).toUpperCase() + tier.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Property card sheet */}
                {selectedPropertyId && (
                    <PropertyCardSheet
                        propertyId={selectedPropertyId}
                        onClose={handleCloseSheet}
                        onClaimSuccess={handleClaimSuccess}
                        onRefreshPins={async () => {
                            // MVT refresh handled by tile cache
                            mapRef.current?.getMap().triggerRepaint();
                        }}
                        initialOpenMode={pendingOpenMode}
                        initialConversationId={pendingConversationId}
                        onSelectNeighbour={(neighbourId, lat, lon) => {
                            // Use unified openProperty for neighbour navigation
                            handleOpenProperty({ propertyId: neighbourId, lat, lon, openMode: "card" });
                        }}
                    />
                )}

                {/* Area Vibe Bar - hidden when cards are open */}
                {showVibeBar && (
                    <AreaVibeBar
                        stats={vibeStats}
                        events={liveFeedEvents}
                        loading={vibeLoading}
                        eventsLoading={liveFeedLoading}
                        expanded={vibeBarExpanded}
                        onToggleExpand={handleToggleVibeBar}
                        onEventClick={handleEventClick}
                    />
                )}

                {/* Global Inbox Overlay */}
                {showMessageCentre && (
                    <GlobalInboxOverlay
                        onClose={() => setShowMessageCentre(false)}
                        onOpenProperty={handleOpenProperty}
                    />
                )}
            </div>
        </MapIntentProvider>
    );
});

export default PropertyMap;

