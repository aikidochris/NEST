"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Map, { Source, Layer, ViewStateChangeEvent, MapRef } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BBox } from "@/types/property";
import { AuthControls } from "@/components/AuthControls";
import { PropertyCardSheet } from "@/components/PropertyCardSheet";
import { AreaVibeBar, type VibeStats, type LiveFeedEvent } from "@/components/AreaVibeBar";
import { GlobalInboxOverlay } from "@/components/GlobalInboxOverlay";
import { useAuth } from "@/app/AuthProvider";
import { inspectLog, resolveStatus, type Status } from "@/lib/inspect";
import { getPinColor } from "@/lib/statusStyles";
import { MapIntentProvider, type FlyToOptions, type OpenPropertyOptions } from "@/contexts/MapIntentContext";

// =============================================================================
// DESIGN KNOBS - Configurable constants
// =============================================================================
const CLUSTER_COLOR = "#64748b";        // Muted Nest blue/slate
const CLUSTER_TEXT_COLOR = "#ffffff";   // White numeric label
const CLUSTER_RADIUS = 40;              // Cluster radius in pixels
const CLUSTER_MAX_ZOOM = 15;            // Clusters disappear at zoom > 15

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
const DEBOUNCE_MS = 300;
const INTENT_OVERLAY_DEBOUNCE_MS = 400;

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

/**
 * Intent overlay data for a single property.
 */
interface IntentOverlayData {
    property_id: string;
    is_claimed: boolean | null;
    soft_listing: boolean | null;
    settled: boolean | null;
    is_for_sale: boolean | null;
    is_for_rent: boolean | null;
}

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

export default function PropertyMap() {
    const mapRef = useRef<MapRef>(null);
    const [viewState, setViewState] = useState(DEFAULT_VIEW);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
    const [clusterData, setClusterData] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
    const [vibeStats, setVibeStats] = useState<VibeStats | null>(null);
    const [vibeLoading, setVibeLoading] = useState(false);
    const [liveFeedEvents, setLiveFeedEvents] = useState<LiveFeedEvent[]>([]);
    const [liveFeedLoading, setLiveFeedLoading] = useState(false);
    const [vibeBarExpanded, setVibeBarExpanded] = useState(false);
    const [showMessageCentre, setShowMessageCentre] = useState(false);
    const [pendingOpenMode, setPendingOpenMode] = useState<"card" | "messages">("card");
    const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"paper" | "blueprint" | "satellite">("paper");
    const [is3D, setIs3D] = useState(true);  // 2D/3D performance toggle

    const { accessToken, user } = useAuth();
    const clusterAbortRef = useRef<AbortController | null>(null);
    const vibeAbortRef = useRef<AbortController | null>(null);
    const liveFeedAbortRef = useRef<AbortController | null>(null);
    const intentOverlayAbortRef = useRef<AbortController | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const intentOverlayDebounceRef = useRef<NodeJS.Timeout | null>(null);

    // Cache for vibe stats by grid key
    const vibeCacheRef = useRef<globalThis.Map<string, VibeStats>>(new globalThis.Map());

    // Store current bbox for live feed fetch
    const currentBboxRef = useRef<BBox | null>(null);

    // Intent overlay: visible property IDs and their intent flags
    const [visiblePropertyIds, setVisiblePropertyIds] = useState<string[]>([]);
    const intentOverlayRef = useRef<globalThis.Map<string, IntentOverlayData>>(new globalThis.Map());
    const [intentOverlayVersion, setIntentOverlayVersion] = useState(0);
    const [pulseRadius, setPulseRadius] = useState(0);

    // Fetch cluster data (GeoJSON for clustering at low zoom)
    const fetchClusterData = useCallback(async (bbox: BBox, zoom: number) => {
        // Only fetch for clustering at low zoom
        if (zoom > CLUSTER_MAX_ZOOM) {
            setClusterData(EMPTY_GEOJSON);
            return;
        }

        if (clusterAbortRef.current) {
            clusterAbortRef.current.abort();
        }

        const controller = new AbortController();
        clusterAbortRef.current = controller;

        try {
            const bboxParam = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
            const response = await fetch(`/api/properties?bbox=${bboxParam}&z=${Math.round(zoom)}`, {
                signal: controller.signal,
            });

            if (!response.ok) {
                setClusterData(EMPTY_GEOJSON);
                return;
            }

            const json = await response.json();
            if (!json.ok || !json.data) {
                setClusterData(EMPTY_GEOJSON);
                return;
            }

            // Convert to GeoJSON
            const features = json.data.map((p: { property_id: string; lon: number; lat: number; is_claimed: boolean }) => ({
                type: "Feature" as const,
                geometry: {
                    type: "Point" as const,
                    coordinates: [p.lon, p.lat],
                },
                properties: {
                    property_id: p.property_id,
                    is_claimed: p.is_claimed,
                },
            }));

            setClusterData({ type: "FeatureCollection", features });
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            setClusterData(EMPTY_GEOJSON);
        }
    }, []);

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
                fetchClusterData(bbox, zoom);
                fetchVibeStats(bbox);
                currentBboxRef.current = bbox;
                // Fetch live feed if panel is expanded
                if (vibeBarExpanded) {
                    fetchLiveFeed(bbox);
                }
            }, DEBOUNCE_MS);
        },
        [fetchClusterData, fetchVibeStats, vibeBarExpanded]
    );

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

    // Fetch intent overlay for visible property IDs
    const fetchIntentOverlay = useCallback(async (ids: string[]) => {
        if (ids.length === 0) return;

        if (intentOverlayAbortRef.current) {
            intentOverlayAbortRef.current.abort();
        }

        const controller = new AbortController();
        intentOverlayAbortRef.current = controller;

        try {
            const response = await fetch("/api/intent-overlay", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
                signal: controller.signal,
            });

            if (!response.ok) return;

            const json = await response.json();
            if (json.ok && json.data) {
                // Update overlay map
                const newOverlay = intentOverlayRef.current;
                for (const item of json.data as IntentOverlayData[]) {
                    newOverlay.set(item.property_id, item);
                }
                // Keep cache size reasonable (max 2000 entries)
                if (newOverlay.size > 2000) {
                    const keysToDelete = [...newOverlay.keys()].slice(0, newOverlay.size - 2000);
                    for (const key of keysToDelete) {
                        newOverlay.delete(key);
                    }
                }
                // Trigger re-render
                setIntentOverlayVersion((v) => v + 1);

                // Inspection logging
                inspectLog("INTENT_OVERLAY_FETCH", { count: ids.length });
            }
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            // Silently fail - overlay is optional enhancement
        }
    }, []);

    // Capture visible property IDs from rendered features (non-clustered only)
    const captureVisiblePropertyIds = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const ids = new Set<string>();

        // Query all property layers at once using safe query
        const features = safeQueryRenderedFeatures(map, QUERYABLE_POINT_LAYERS);
        for (const f of features) {
            const pid = f.properties?.property_id;
            if (typeof pid === "string" && pid.length > 0) {
                ids.add(pid);
            }
        }

        const idsArray = [...ids];

        // Only update if set actually changed
        setVisiblePropertyIds((prev) => {
            if (prev.length === idsArray.length && prev.every((id, i) => id === idsArray[i])) {
                return prev;
            }
            return idsArray;
        });

        // Force overlay recalculation by bumping version
        setIntentOverlayVersion((v) => v + 1);
    }, []);

    // Initial fetch on map load + set up cursor handlers
    const handleLoad = useCallback(
        (evt: { target: maplibregl.Map }) => {
            const map = evt.target;
            const bounds = map.getBounds();

            if (bounds) {
                const bbox = computeBBox(bounds);
                fetchClusterData(bbox, map.getZoom());
                fetchVibeStats(bbox);
            }

            // Pointer cursor on interactive layers
            const interactiveLayers = ["property-points", "clusters", "intent-overlay"];
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

                const layersToCheck = [...QUERYABLE_POINT_LAYERS, "clusters", "intent-overlay"];
                const layerStatus = layersToCheck.map(id => {
                    try {
                        return { id, exists: !!map.getLayer(id) };
                    } catch {
                        return { id, exists: false };
                    }
                });
                inspectLog("MAP_LAYERS_CHECK", { queried_layers: layerStatus });
            };

            // Capture visible IDs on map idle (after render complete)
            map.on("idle", () => {
                logLayersOnce();
                captureVisiblePropertyIds();
            });

            // Multiple delayed captures to ensure we catch tile loads at different timings
            setTimeout(() => captureVisiblePropertyIds(), 300);
            setTimeout(() => captureVisiblePropertyIds(), 800);
            setTimeout(() => captureVisiblePropertyIds(), 1500);
        },
        [fetchClusterData, fetchVibeStats, captureVisiblePropertyIds]
    );

    // Ensure pin layers persist and stay on top (simplified - only handles vector source)
    const ensurePinLayers = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map || !map.isStyleLoaded()) return;

        // Re-add 'properties-vt' source if missing
        if (!map.getSource("properties-vt")) {
            try {
                map.addSource("properties-vt", {
                    type: "vector",
                    tiles: [`${typeof window !== "undefined" ? window.location.origin : ""}/api/tiles/properties/{z}/{x}/{y}`],
                    minzoom: 0,
                    maxzoom: 14
                });
            } catch { /* already exists */ }
        }

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

        // Move pin layers to very top
        ["pin-pulse", "intent-overlay", "pin-glyphs"].forEach(id => {
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
        const add3DBuildings = () => {
            if (!is3D) return;  // Skip if 2D mode
            if (map.getLayer("building-3d")) return;
            if (!map.isStyleLoaded()) return;

            const existingBuilding = map.getStyle()?.layers?.find(l =>
                l.id.includes("building") && l.type === "fill"
            );

            if (existingBuilding && 'source' in existingBuilding) {
                try {
                    // Collect active property IDs for Hearth Glow
                    const activeIds: string[] = [];
                    intentOverlayRef.current.forEach((data, pid) => {
                        if (data.soft_listing || data.is_for_sale || data.is_for_rent) {
                            activeIds.push(pid);
                        }
                    });

                    map.addLayer({
                        id: "building-3d",
                        source: existingBuilding.source as string,
                        "source-layer": "source-layer" in existingBuilding ? (existingBuilding["source-layer"] as string) : "building",
                        type: "fill-extrusion",
                        minzoom: 14,
                        paint: {
                            // Hearth 3D Glow: Ember for active, Ghost White for others
                            "fill-extrusion-color": activeIds.length > 0 ? [
                                "case",
                                ["in", ["get", "property_id"], ["literal", activeIds]],
                                "#E08E5F",
                                "#FFFFFF"
                            ] : "#FFFFFF",
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

            // 3. Pins on very top
            ["property-points", "pin-pulse", "intent-overlay", "pin-glyphs"].forEach(id => {
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
            if (is3D) {
                add3DBuildings();
                // Reveal architectural depth with pitch
                if (map.getPitch() < 30) {
                    map.easeTo({ pitch: 45, duration: 800 });
                }
            } else {
                remove3DBuildings();
                // Return to perfect top-down view
                if (map.getPitch() > 0) {
                    map.easeTo({ pitch: 0, duration: 800 });
                }
            }

            // Stack layers correctly
            stackLayers();

            // Ensure pin layers exist
            ensurePinLayers();

            // Capture visible IDs immediately to trigger intent fetch
            setTimeout(() => captureVisiblePropertyIds(), 100);
        };

        // Handler for sourcedata event to capture visible IDs when tiles load
        const handleSourceData = (e: maplibregl.MapSourceDataEvent) => {
            if (e.sourceId === "properties-vt" && e.isSourceLoaded) {
                captureVisiblePropertyIds();
            }
        };

        // Listen for style.load to re-add our custom layers after style changes
        map.on("style.load", handleStyleUpdate);

        // Listen for sourcedata to capture visible IDs when tiles load
        map.on("sourcedata", handleSourceData);

        // Initial update if style is already loaded
        if (map.isStyleLoaded()) {
            handleStyleUpdate();
        } else {
            map.once("style.load", handleStyleUpdate);
        }

        return () => {
            map.off("style.load", handleStyleUpdate);
            map.off("sourcedata", handleSourceData);
        };
    }, [viewMode, is3D, ensurePinLayers, captureVisiblePropertyIds]);

    // Handle map click - cluster zoom or property select
    const handleMapClick = useCallback(
        async (evt: MapLayerMouseEvent) => {
            const features = evt.features;
            if (!features || features.length === 0) return;

            // Check for cluster click first
            const clusterFeature = features.find((f) => f.layer?.id === "clusters");
            if (clusterFeature && clusterFeature.properties?.cluster_id !== undefined) {
                const map = mapRef.current?.getMap();
                if (!map) return;

                const source = map.getSource("cluster-source") as GeoJSONSource;
                if (!source) return;

                try {
                    const clusterId = clusterFeature.properties.cluster_id;
                    const pointCount = clusterFeature.properties.point_count || 0;
                    const currentZoom = map.getZoom();
                    const zoom = await source.getClusterExpansionZoom(clusterId);
                    const geometry = clusterFeature.geometry as GeoJSON.Point;

                    // Inspection mode logging
                    inspectLog("CLUSTER_CLICK", {
                        cluster_id: clusterId,
                        point_count: pointCount,
                        current_zoom: currentZoom,
                        expansion_zoom: zoom,
                    });

                    map.easeTo({
                        center: geometry.coordinates as [number, number],
                        zoom: zoom,
                        duration: 500,
                    });
                } catch {
                    // Ignore cluster zoom errors
                }
                return; // Don't open sheet for cluster click
            }

            // Individual property click
            const overlayFeature = features.find((f) => f.layer?.id === "intent-overlay");
            const baseFeature = features.find((f) => f.layer?.id === "property-points");
            const unclusteredFeature = features.find((f) => f.layer?.id === "unclustered-point");

            const feature = overlayFeature || baseFeature || unclusteredFeature;
            if (!feature) return;

            const propertyId = feature.properties?.property_id;
            if (propertyId) {
                // Build intent flags from feature properties (may be null if not available)
                const props = feature.properties ?? {};
                const source_layer = feature.layer?.id;

                // Check if we have overlay data for more accurate status
                const overlay = intentOverlayRef.current.get(propertyId);

                // Determine is_claimed: overlay takes priority
                const raw_is_claimed = props.is_claimed;
                let is_claimed: boolean | null;
                if (overlay) {
                    is_claimed = overlay.is_claimed;
                } else if (typeof raw_is_claimed === "boolean") {
                    is_claimed = raw_is_claimed;
                } else {
                    // Unknown - leave as null for debug visibility
                    is_claimed = null;
                }

                // Use overlay data if available, otherwise fall back to feature properties
                const intent_flags = overlay ? {
                    soft_listing: overlay.soft_listing,
                    settled: overlay.settled,
                    is_for_sale: overlay.is_for_sale,
                    is_for_rent: overlay.is_for_rent,
                } : {
                    soft_listing: props.soft_listing ?? props.is_open_to_talking ?? null,
                    settled: props.settled ?? props.is_settled ?? null,
                    is_for_sale: props.is_for_sale ?? null,
                    is_for_rent: props.is_for_rent ?? null,
                };

                // Inspection mode logging for property click
                inspectLog("PROPERTY_OPEN", {
                    property_id: propertyId,
                    raw_is_claimed,
                    is_claimed,
                    display_label: props.display_label ?? null,
                    source_layer,
                    has_overlay: !!overlay,
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
        },
        []
    );

    // Close property sheet - clear all pending state
    const handleCloseSheet = useCallback(() => {
        setSelectedPropertyId(null);
        setPendingOpenMode("card");
        setPendingConversationId(null);
    }, []);

    // Refresh intent overlay for a specific property or all visible
    const refreshIntentForProperty = useCallback((propertyId?: string) => {
        if (propertyId) {
            // Fetch intent for specific property and update cache
            fetchIntentOverlay([propertyId]);
        } else {
            // Refresh all visible properties
            captureVisiblePropertyIds();
        }
        // Bump version to trigger overlay re-render
        setIntentOverlayVersion((v) => v + 1);
    }, [fetchIntentOverlay, captureVisiblePropertyIds]);

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
            intentOverlayAbortRef.current?.abort();
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            if (intentOverlayDebounceRef.current) {
                clearTimeout(intentOverlayDebounceRef.current);
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

    // Debounced effect to fetch intent overlay when visible IDs change
    useEffect(() => {
        if (visiblePropertyIds.length === 0) return;

        // Filter out IDs we already have in cache
        const uncachedIds = visiblePropertyIds.filter((id) => !intentOverlayRef.current.has(id));
        if (uncachedIds.length === 0) return;

        // Debounce the fetch
        if (intentOverlayDebounceRef.current) {
            clearTimeout(intentOverlayDebounceRef.current);
        }

        intentOverlayDebounceRef.current = setTimeout(() => {
            fetchIntentOverlay(uncachedIds);
        }, INTENT_OVERLAY_DEBOUNCE_MS);

        return () => {
            if (intentOverlayDebounceRef.current) {
                clearTimeout(intentOverlayDebounceRef.current);
            }
        };
    }, [visiblePropertyIds, fetchIntentOverlay]);

    // Compute overlay GeoJSON with status-based colors
    const overlayGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
        // Use intentOverlayVersion to trigger recalculation
        void intentOverlayVersion;

        const features: GeoJSON.Feature[] = [];
        const map = mapRef.current?.getMap();
        if (!map) return { type: "FeatureCollection", features };

        // Get all non-clustered features from property layers using safe query
        const renderedFeatures = safeQueryRenderedFeatures(map, QUERYABLE_POINT_LAYERS);
        for (const f of renderedFeatures) {
            const pid = f.properties?.property_id;
            if (typeof pid !== "string" || pid.length === 0) continue;

            const geometry = f.geometry as GeoJSON.Point;
            if (geometry.type !== "Point") continue;

            const overlay = intentOverlayRef.current.get(pid);

            // If no overlay data yet, show grey pin (unclaimed default)
            if (!overlay) {
                features.push({
                    type: "Feature",
                    geometry,
                    properties: {
                        property_id: pid,
                        color: "#9CA3AF",  // Muted grey fallback
                        status: "unclaimed",
                        pulse: false,
                        glyph: ""
                    },
                });
                continue;
            }

            const status = resolveStatus({
                is_claimed: overlay.is_claimed,
                intent_flags: {
                    soft_listing: overlay.soft_listing,
                    settled: overlay.settled,
                    is_for_sale: overlay.is_for_sale,
                    is_for_rent: overlay.is_for_rent,
                },
            });

            features.push({
                type: "Feature",
                geometry,
                properties: {
                    property_id: pid,
                    color: getPinColor(status),
                    status,
                    // All active states pulse (STRICT EMBER RULE)
                    pulse: status === "open_to_talking" || status === "for_sale" || status === "for_rent",
                    // Glyphs: + (open_to_talking), £ (for_sale), r (for_rent)
                    glyph: status === "open_to_talking" ? "+" : status === "for_sale" ? "£" : status === "for_rent" ? "r" : ""
                },
            });
        }

        // Dedupe by property_id (keep first occurrence)
        const seen = new Set<string>();
        const dedupedFeatures = features.filter((f) => {
            const pid = f.properties?.property_id;
            if (seen.has(pid)) return false;
            seen.add(pid);
            return true;
        });

        return { type: "FeatureCollection", features: dedupedFeatures };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [intentOverlayVersion, viewState, visiblePropertyIds]);

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

    // Update sources when data changes
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const clusterSource = map.getSource("cluster-source") as GeoJSONSource | undefined;
        if (clusterSource) clusterSource.setData(clusterData);
    }, [clusterData]);

    // Update intent overlay source when overlayGeoJSON changes (explicit setData for MapLibre repaint)
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const intentSource = map.getSource("intent-overlay-source") as GeoJSONSource | undefined;
        if (intentSource) {
            intentSource.setData(overlayGeoJSON);
            // Ensure overlay layer is on top
            if (map.getLayer("intent-overlay")) {
                map.moveLayer("intent-overlay");
            }
        }
    }, [overlayGeoJSON]);

    // Show clusters layer only at low zoom
    const showClusters = viewState.zoom <= CLUSTER_MAX_ZOOM;

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
                    interactiveLayerIds={["property-points", "clusters", "unclustered-point", "intent-overlay"]}
                    style={{ width: "100%", height: "100%" }}
                    mapStyle={MAP_STYLE}
                >
                    {/* Satellite layer with Glass filter - first child for proper z-ordering */}
                    {viewMode === "satellite" && (
                        <Source id="satellite-source" type="raster" tiles={[ARCGIS_SATELLITE_URL]} tileSize={256}>
                            <Layer
                                id="satellite-layer"
                                type="raster"
                                beforeId="water"
                                paint={{
                                    "raster-brightness-min": 0.1,
                                    "raster-contrast": 0.2,
                                    "raster-saturation": -0.6  // Glass filter: muted satellite
                                }}
                            />
                        </Source>
                    )}

                    {/* Vector tile source with invisible Sensor layer for property detection */}
                    <Source
                        id="properties-vt"
                        type="vector"
                        tiles={[`${typeof window !== "undefined" ? window.location.origin : ""}/api/tiles/properties/{z}/{x}/{y}`]}
                        minzoom={0}
                        maxzoom={14}
                    >
                        {/* Sensor layer - invisible but queryable for property ID detection */}
                        <Layer
                            id="property-points"
                            type="circle"
                            source-layer="properties"
                            minzoom={CLUSTER_MAX_ZOOM}
                            paint={{
                                "circle-color": "#000000",
                                "circle-radius": 6,
                                "circle-opacity": 0,
                                "circle-stroke-opacity": 0,
                            }}
                        />
                    </Source>

                    {/* GeoJSON source with clustering (visible at low zoom) */}
                    {showClusters && (
                        <Source
                            id="cluster-source"
                            type="geojson"
                            data={clusterData}
                            cluster={true}
                            clusterRadius={CLUSTER_RADIUS}
                            clusterMaxZoom={CLUSTER_MAX_ZOOM}
                        >
                            {/* Cluster circles */}
                            <Layer
                                id="clusters"
                                type="circle"
                                filter={["has", "point_count"]}
                                paint={{
                                    "circle-color": CLUSTER_COLOR,
                                    "circle-radius": [
                                        "step", ["get", "point_count"],
                                        16,
                                        10, 20,
                                        50, 24,
                                        100, 28,
                                        500, 32
                                    ],
                                    "circle-stroke-color": "#fff",
                                    "circle-stroke-width": 2,
                                    "circle-opacity": [
                                        "interpolate", ["linear"], ["zoom"],
                                        14.75, 1,
                                        15.25, 0
                                    ],
                                    "circle-stroke-opacity": [
                                        "interpolate", ["linear"], ["zoom"],
                                        14.75, 1,
                                        15.25, 0
                                    ],
                                }}
                            />

                            {/* Cluster count labels */}
                            <Layer
                                id="cluster-count"
                                type="symbol"
                                filter={["has", "point_count"]}
                                layout={{
                                    "text-field": "{point_count_abbreviated}",
                                    "text-font": ["Open Sans Bold"],
                                    "text-size": 12,
                                }}
                                paint={{
                                    "text-color": CLUSTER_TEXT_COLOR,
                                    "text-opacity": [
                                        "interpolate", ["linear"], ["zoom"],
                                        14.75, 1,
                                        15.25, 0
                                    ],
                                }}
                            />

                            {/* Unclustered points (individual at low zoom) */}
                            <Layer
                                id="unclustered-point"
                                type="circle"
                                filter={["!", ["has", "point_count"]]}
                                paint={{
                                    // Invisible base layer - intent overlay provides visible pins
                                    // Kept for queryable hit-testing
                                    "circle-color": "#000000",
                                    "circle-radius": 4,
                                    "circle-opacity": 0,
                                    "circle-stroke-opacity": 0,
                                }}
                            />
                        </Source>
                    )}

                    {/* Intent overlay - THE authoritative pin layer with grey fallback */}
                    <Source
                        id="intent-overlay-source"
                        type="geojson"
                        data={overlayGeoJSON}
                    >
                        <Layer
                            id="intent-overlay"
                            type="circle"
                            paint={{
                                "circle-color": ["coalesce", ["get", "color"], "#9CA3AF"],
                                "circle-radius": 4.5,
                                "circle-stroke-width": 0.5,
                                "circle-stroke-color": "#1B1B1B",
                            }}
                        />

                        {/* Living Pin Pulse Layer */}
                        <Layer
                            id="pin-pulse"
                            type="circle"
                            filter={["==", ["get", "pulse"], true]}
                            paint={{
                                "circle-color": "#E08E5F",
                                "circle-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    12, ["*", 10, pulseRadius],
                                    16, ["*", 25, pulseRadius]
                                ],
                                "circle-opacity": ["*", 0.4, ["-", 1, pulseRadius]],
                            }}
                        />

                        {/* Living Pin Glyphs */}
                        <Layer
                            id="pin-glyphs"
                            type="symbol"
                            filter={["!=", ["get", "glyph"], ""]}
                            layout={{
                                "text-field": ["get", "glyph"],
                                "text-font": ["Open Sans Bold"],
                                "text-size": [
                                    "interpolate", ["linear"], ["zoom"],
                                    14, 8,
                                    16, 10
                                ],
                                "text-allow-overlap": true,
                                "text-ignore-placement": true,
                            }}
                            paint={{
                                "text-color": "#fff",
                            }}
                        />
                    </Source>


                </Map>

                {/* Top Filter Bar */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center bg-[#F9F7F4]/90 backdrop-blur-md rounded-full px-1.5 py-1.5 shadow-lg border border-gray-200/50 z-10">
                    <div className="flex items-center gap-1">
                        <button className="px-4 py-1.5 rounded-full text-sm font-medium transition-all bg-ember text-white shadow-sm">
                            All
                        </button>
                        <button className="px-4 py-1.5 rounded-full text-sm font-medium transition-all text-gray-600 hover:bg-gray-100">
                            Open to Chat
                        </button>
                        <button className="px-4 py-1.5 rounded-full text-sm font-medium transition-all text-gray-600 hover:bg-gray-100">
                            For Sale
                        </button>
                        <div className="w-px h-4 bg-gray-200 mx-1" />
                        <button className="px-4 py-1.5 rounded-full text-sm font-medium transition-all text-gray-600 hover:bg-gray-100">
                            Unclaimed
                        </button>
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

                {/* Instrument Bar - Unified View Controls */}
                <div className="absolute bottom-10 right-4 flex flex-col gap-1.5 z-10 bg-[#F9F7F4] border border-[#1B1B1B]/10 rounded-lg shadow-sm p-1.5">
                    {/* Row 1: View Mode */}
                    <div className="flex rounded-md overflow-hidden">
                        {(["paper", "blueprint", "satellite"] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${viewMode === mode
                                    ? "bg-[#1B1B1B] text-white"
                                    : "text-[#1B1B1B] hover:bg-gray-100"
                                    } ${mode !== "satellite" ? "border-r border-[#1B1B1B]/10" : ""}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    {/* Row 2: Depth Toggle */}
                    <button
                        onClick={() => setIs3D(!is3D)}
                        className={`w-full px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${is3D
                            ? "bg-[#1B1B1B] text-white"
                            : "text-[#1B1B1B] hover:bg-gray-100 border border-[#1B1B1B]/10"
                            }`}
                    >
                        {is3D ? "3D Depth On" : "3D Depth Off"}
                    </button>
                </div>

                {/* Property card sheet */}
                {selectedPropertyId && (
                    <PropertyCardSheet
                        propertyId={selectedPropertyId}
                        onClose={handleCloseSheet}
                        onClaimSuccess={handleClaimSuccess}
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
}

