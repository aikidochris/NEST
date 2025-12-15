"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Map, { Source, Layer, ViewStateChangeEvent, MapRef } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BBox } from "@/types/property";
import { AuthControls } from "@/components/AuthControls";
import { PropertyCardSheet } from "@/components/PropertyCardSheet";
import { AreaVibeBar, type VibeStats, type LiveFeedEvent } from "@/components/AreaVibeBar";
import { useAuth } from "@/app/AuthProvider";
import { inspectLog, resolveStatus, type Status } from "@/lib/inspect";
import { getPinColor } from "@/lib/statusStyles";
import { MapIntentProvider } from "@/contexts/MapIntentContext";

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

// =============================================================================
// LAYER QUERY HELPERS
// =============================================================================

/** Layer IDs that contain individual property points (non-cluster) */
const QUERYABLE_POINT_LAYERS = ["property-points", "my-claims"];

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
    const [myClaimsData, setMyClaimsData] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
    const [clusterData, setClusterData] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
    const [vibeStats, setVibeStats] = useState<VibeStats | null>(null);
    const [vibeLoading, setVibeLoading] = useState(false);
    const [liveFeedEvents, setLiveFeedEvents] = useState<LiveFeedEvent[]>([]);
    const [liveFeedLoading, setLiveFeedLoading] = useState(false);
    const [vibeBarExpanded, setVibeBarExpanded] = useState(false);

    const { accessToken } = useAuth();

    // Abort controllers
    const claimsAbortRef = useRef<AbortController | null>(null);
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

    // Fetch my-claims GeoJSON overlay
    const fetchMyClaims = useCallback(
        async (bbox: BBox) => {
            if (!accessToken) {
                setMyClaimsData(EMPTY_GEOJSON);
                return;
            }

            if (claimsAbortRef.current) {
                claimsAbortRef.current.abort();
            }

            const controller = new AbortController();
            claimsAbortRef.current = controller;

            try {
                const bboxParam = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
                const response = await fetch(`/api/my-claims?bbox=${bboxParam}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    signal: controller.signal,
                });

                if (!response.ok) {
                    setMyClaimsData(EMPTY_GEOJSON);
                    return;
                }

                const geojson = await response.json();
                setMyClaimsData(geojson);
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") return;
                setMyClaimsData(EMPTY_GEOJSON);
            }
        },
        [accessToken]
    );

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
                fetchMyClaims(bbox);
                fetchClusterData(bbox, zoom);
                fetchVibeStats(bbox);
                currentBboxRef.current = bbox;
                // Fetch live feed if panel is expanded
                if (vibeBarExpanded) {
                    fetchLiveFeed(bbox);
                }
            }, DEBOUNCE_MS);
        },
        [fetchMyClaims, fetchClusterData, fetchVibeStats, vibeBarExpanded]
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
    }, []);

    // Initial fetch on map load + set up cursor handlers
    const handleLoad = useCallback(
        (evt: { target: maplibregl.Map }) => {
            const map = evt.target;
            const bounds = map.getBounds();

            if (bounds) {
                const bbox = computeBBox(bounds);
                fetchMyClaims(bbox);
                fetchClusterData(bbox, map.getZoom());
                fetchVibeStats(bbox);
            }

            // Pointer cursor on interactive layers
            const interactiveLayers = ["property-points", "my-claims", "clusters", "intent-overlay"];
            interactiveLayers.forEach((layer) => {
                map.on("mouseenter", layer, () => {
                    map.getCanvas().style.cursor = "pointer";
                });
                map.on("mouseleave", layer, () => {
                    map.getCanvas().style.cursor = "";
                });
            });

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
        },
        [fetchMyClaims, fetchClusterData, fetchVibeStats, captureVisiblePropertyIds]
    );

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
            const myClaimFeature = features.find((f) => f.layer?.id === "my-claims");
            const overlayFeature = features.find((f) => f.layer?.id === "intent-overlay");
            const baseFeature = features.find((f) => f.layer?.id === "property-points");
            const unclusteredFeature = features.find((f) => f.layer?.id === "unclustered-point");

            const feature = myClaimFeature || overlayFeature || baseFeature || unclusteredFeature;
            if (!feature) return;

            const propertyId = feature.properties?.property_id;
            if (propertyId) {
                // Build intent flags from feature properties (may be null if not available)
                const props = feature.properties ?? {};
                const source_layer = feature.layer?.id;

                // Check if we have overlay data for more accurate status
                const overlay = intentOverlayRef.current.get(propertyId);

                // Determine is_claimed: my-claims layer is always claimed, overlay takes priority
                const raw_is_claimed = props.is_claimed;
                let is_claimed: boolean | null;
                if (overlay) {
                    is_claimed = overlay.is_claimed;
                } else if (source_layer === "my-claims") {
                    // My-claims layer features are definitionally claimed by current user
                    is_claimed = true;
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
                setSelectedPropertyId(propertyId);
            }
        },
        []
    );

    // Close property sheet
    const handleCloseSheet = useCallback(() => {
        setSelectedPropertyId(null);
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

    // After claim success, refetch my-claims overlay and intent
    const handleClaimSuccess = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (map) {
            const bounds = map.getBounds();
            if (bounds) {
                fetchMyClaims(computeBBox(bounds));
            }
        }
        // Also refresh intent for the selected property
        if (selectedPropertyId) {
            refreshIntentForProperty(selectedPropertyId);
        }
    }, [fetchMyClaims, selectedPropertyId, refreshIntentForProperty]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            claimsAbortRef.current?.abort();
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

            const overlay = intentOverlayRef.current.get(pid);
            if (!overlay) continue; // No overlay data yet

            const geometry = f.geometry as GeoJSON.Point;
            if (geometry.type !== "Point") continue;

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
    }, [intentOverlayVersion]);

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
        // Select property to open the sheet
        setSelectedPropertyId(event.property_id);
    }, []);

    // Update sources when data changes
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const claimsSource = map.getSource("my-claims-source") as GeoJSONSource | undefined;
        if (claimsSource) claimsSource.setData(myClaimsData);

        const clusterSource = map.getSource("cluster-source") as GeoJSONSource | undefined;
        if (clusterSource) clusterSource.setData(clusterData);
    }, [myClaimsData, clusterData]);

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
        <MapIntentProvider onRefresh={refreshIntentForProperty}>
            <div className="relative w-full h-screen">
                <Map
                    ref={mapRef}
                    {...viewState}
                    onMove={(evt) => setViewState(evt.viewState)}
                    onMoveEnd={handleMoveEnd}
                    onLoad={handleLoad}
                    onClick={handleMapClick}
                    interactiveLayerIds={["property-points", "my-claims", "clusters", "unclustered-point", "intent-overlay"]}
                    style={{ width: "100%", height: "100%" }}
                    mapStyle={MAP_STYLE}
                >
                    {/* Vector tile source for all properties (visible at high zoom) */}
                    <Source
                        id="properties-vt"
                        type="vector"
                        tiles={[`${typeof window !== "undefined" ? window.location.origin : ""}/api/tiles/properties/{z}/{x}/{y}`]}
                        minzoom={0}
                        maxzoom={14}
                    >
                        <Layer
                            id="property-points"
                            type="circle"
                            source-layer="properties"
                            minzoom={CLUSTER_MAX_ZOOM}
                            paint={{
                                // Invisible base layer - intent overlay provides visible pins
                                // Kept for queryable hit-testing
                                "circle-color": "#000000",
                                "circle-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    12, 3,
                                    14, 4,
                                    16, 6
                                ],
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
                                        100, 28
                                    ],
                                    "circle-stroke-width": 2,
                                    "circle-stroke-color": "#fff",
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

                    {/* Intent overlay - status-based colors on top of base pins */}
                    <Source
                        id="intent-overlay-source"
                        type="geojson"
                        data={overlayGeoJSON}
                    >
                        <Layer
                            id="intent-overlay"
                            type="circle"
                            paint={{
                                "circle-color": ["get", "color"],
                                "circle-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    12, 3,
                                    14, 4,
                                    16, 6
                                ],
                                "circle-stroke-width": [
                                    "interpolate", ["linear"], ["zoom"],
                                    12, 1,
                                    16, 1.5
                                ],
                                "circle-stroke-color": "#fff",
                            }}
                        />
                    </Source>

                    {/* GeoJSON source for user's claimed properties (neutral base - intent overlay adds color) */}
                    <Source
                        id="my-claims-source"
                        type="geojson"
                        data={myClaimsData}
                    >
                        <Layer
                            id="my-claims"
                            type="circle"
                            paint={{
                                // Invisible base layer - intent overlay provides visible pins
                                // Kept for queryable hit-testing
                                "circle-color": "#000000",
                                "circle-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    8, 3,
                                    12, 6,
                                    16, 9
                                ],
                                "circle-opacity": 0,
                                "circle-stroke-opacity": 0,
                            }}
                        />
                    </Source>
                </Map>

                {/* Top-left controls */}
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                    <AuthControls />
                    <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-sm">
                        <span className="text-gray-700">
                            {myClaimsData.features.length > 0
                                ? `${myClaimsData.features.length} claimed`
                                : showClusters ? "Clustered view" : "Vector tiles"}
                        </span>
                    </div>
                </div>

                {/* Property card sheet */}
                {selectedPropertyId && (
                    <PropertyCardSheet
                        propertyId={selectedPropertyId}
                        onClose={handleCloseSheet}
                        onClaimSuccess={handleClaimSuccess}
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
            </div>
        </MapIntentProvider>
    );
}

