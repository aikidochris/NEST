"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Map, { Source, Layer, ViewStateChangeEvent, MapRef } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BBox } from "@/types/property";
import { AuthControls } from "@/components/AuthControls";
import { PropertyCardSheet } from "@/components/PropertyCardSheet";
import { AreaVibeBar, type VibeStats, type LiveFeedEvent } from "@/components/AreaVibeBar";
import { GlobalInboxOverlay } from "@/components/GlobalInboxOverlay";
import { useAuth } from "@/app/AuthProvider";
import { inspectLog, resolveStatus } from "@/lib/inspect";
import { MapIntentProvider, type FlyToOptions, type OpenPropertyOptions } from "@/contexts/MapIntentContext";

// =============================================================================
// DESIGN KNOBS - Configurable constants
// =============================================================================
const CLUSTER_COLOR = "#64748b";        // Muted Nest blue/slate
const CLUSTER_TEXT_COLOR = "#ffffff";   // White numeric label
const CLUSTER_RADIUS = 40;              // Cluster radius in pixels
const CLUSTER_MAX_ZOOM = 15;            // Clusters disappear at zoom > 15

// Hearth Design System Colors
const EMBER = "#E08E5F";                // Active states: for_sale, for_rent, open_to_talking
const PAPER_GREY = "#9CA3AF";           // Unclaimed properties
const OWNER_GREY = "#6B7280";           // Claimed with no active intent (settled, owner_no_status)

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
const DEBOUNCE_MS = 0;                  // 0ms for initial load (instant clusters)
// Intent flags now come directly from MVT tiles - no overlay API needed

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
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Cache for vibe stats by grid key
    const vibeCacheRef = useRef<globalThis.Map<string, VibeStats>>(new globalThis.Map());

    // Store current bbox for live feed fetch
    const currentBboxRef = useRef<BBox | null>(null);

    // Pulse animation radius for Living Pins
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
            const interactiveLayers = ["property-points", "clusters", "hearth-pins"];
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

                const layersToCheck = [...QUERYABLE_POINT_LAYERS, "clusters", "hearth-pins", "hearth-glyphs"];
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
        [fetchClusterData, fetchVibeStats]
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
                            // Cinematic 3D: Warm white buildings with subtle ember tint
                            "fill-extrusion-color": "#FFFAF5",
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

            // Individual property click - use feature properties directly from tiles
            const hearthFeature = features.find((f) => f.layer?.id === "hearth-pins");
            const baseFeature = features.find((f) => f.layer?.id === "property-points");
            const unclusteredFeature = features.find((f) => f.layer?.id === "unclustered-point");

            const feature = hearthFeature || baseFeature || unclusteredFeature;
            if (!feature) return;

            const propertyId = feature.properties?.property_id;
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
                    interactiveLayerIds={["property-points", "clusters", "unclustered-point", "hearth-pins"]}
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


                    {/* Vector tile source with GPU-native Hearth pin layers */}
                    <Source
                        id="properties-vt"
                        type="vector"
                        tiles={[`${typeof window !== "undefined" ? window.location.origin : ""}/api/tiles/properties/{z}/{x}/{y}`]}
                        minzoom={0}
                        maxzoom={14}
                    >
                        {/* Base Pin Layer - GPU expression for instant status colors */}
                        <Layer
                            id="hearth-pins"
                            type="circle"
                            source-layer="properties"
                            minzoom={CLUSTER_MAX_ZOOM}
                            paint={{
                                // Hearth color expression: EMBER for active, GREY for others
                                // Priority: for_sale > for_rent > open_to_talking > settled > claimed > unclaimed
                                "circle-color": [
                                    "case",
                                    ["==", ["get", "is_for_sale"], true], EMBER,
                                    ["==", ["get", "is_for_rent"], true], EMBER,
                                    ["==", ["get", "is_open_to_talking"], true], EMBER,
                                    ["==", ["get", "is_settled"], true], OWNER_GREY,
                                    ["==", ["get", "is_claimed"], true], OWNER_GREY,
                                    PAPER_GREY  // default: unclaimed
                                ],
                                "circle-radius": 5,
                                "circle-stroke-width": 0.5,
                                "circle-stroke-color": "#1B1B1B",
                            }}
                        />

                        {/* Living Pin Pulse Layer - Ember glow for active properties */}
                        <Layer
                            id="hearth-pulse"
                            type="circle"
                            source-layer="properties"
                            minzoom={CLUSTER_MAX_ZOOM}
                            filter={[
                                "any",
                                ["==", ["get", "is_for_sale"], true],
                                ["==", ["get", "is_for_rent"], true],
                                ["==", ["get", "is_open_to_talking"], true]
                            ]}
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

                        {/* Hearth Glyphs - GPU-native status symbols */}
                        <Layer
                            id="hearth-glyphs"
                            type="symbol"
                            source-layer="properties"
                            minzoom={CLUSTER_MAX_ZOOM}
                            filter={[
                                "any",
                                ["==", ["get", "is_for_sale"], true],
                                ["==", ["get", "is_for_rent"], true],
                                ["==", ["get", "is_open_to_talking"], true]
                            ]}
                            layout={{
                                "text-field": [
                                    "case",
                                    ["==", ["get", "is_for_sale"], true], "£",
                                    ["==", ["get", "is_for_rent"], true], "r",
                                    ["==", ["get", "is_open_to_talking"], true], "+",
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

                        {/* Hidden sensor layer - for queryable property clicks */}
                        <Layer
                            id="property-points"
                            type="circle"
                            source-layer="properties"
                            minzoom={CLUSTER_MAX_ZOOM}
                            paint={{
                                "circle-color": "#000000",
                                "circle-radius": 8,
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

