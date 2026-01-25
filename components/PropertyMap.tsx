"use client";

import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import Map, { Source, Layer, ViewStateChangeEvent, MapRef } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BBox } from "@/types/property";
import { AuthControls } from "@/components/AuthControls";
import { PropertyCardSheet } from "./PropertyCardSheet";
import { GlassHUD } from "./GlassHUD";
import { VIBE_ZONES, type VibeZone } from "@/lib/vibeZones";
import { GlobalInboxOverlay } from "./GlobalInboxOverlay";
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
    if (typeof window === "undefined") return "/api/tiles/properties/{z}/{x}/{y}";
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

// Helper to calculate Haversine distance
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

// =============================================================================
// PROPERTY MAP COMPONENT
// =============================================================================

/** Layer IDs that contain individual property points (non-cluster) */
const QUERYABLE_POINT_LAYERS = ["property-points"];

export interface PropertyMapRef {
    refreshMapPins: () => Promise<void>;
    openMessageCentre: () => void;
    handleSearch: (query: string, result?: any) => Promise<void>;
}

const PropertyMap = forwardRef<PropertyMapRef, {}>((props, ref) => {
    const mapRef = useRef<MapRef>(null);
    const [viewState, setViewState] = useState(DEFAULT_VIEW);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
    const [vibeStats, setVibeStats] = useState<any | null>(null);
    const [vibeLoading, setVibeLoading] = useState(false);
    const [liveFeedEvents, setLiveFeedEvents] = useState<any[]>([]);
    const [liveFeedLoading, setLiveFeedLoading] = useState(false);
    const [showMessageCentre, setShowMessageCentre] = useState(false);
    const [activeStatusFilters, setActiveStatusFilters] = useState<string[]>(['for_sale', 'for_rent', 'open_to_talking', 'settled', 'unclaimed']);
    const [isFilterMounted, setIsFilterMounted] = useState(false);
    const [isFilterMobileExpanded, setIsFilterMobileExpanded] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Initial mobile check
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const [pendingOpenMode, setPendingOpenMode] = useState<"card" | "messages">("card");
    const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"paper" | "satellite">("paper");
    const [is3D, setIs3D] = useState(false);
    const [isPitchActive, setIsPitchActive] = useState(false);
    const [isTrayExpanded, setIsTrayExpanded] = useState(false);
    const [tileVersion, setTileVersion] = useState(0); // Cache-busting version for MVT tiles

    const { accessToken, user } = useAuth();
    const clusterAbortRef = useRef<AbortController | null>(null);
    const vibeAbortRef = useRef<AbortController | null>(null);
    const liveFeedAbortRef = useRef<AbortController | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Manual pitch override: tracks if user has manually tilted the map
    const manualPitchOverrideRef = useRef(false);

    // Cache for vibe stats by grid key
    const vibeCacheRef = useRef<globalThis.Map<string, any>>(new globalThis.Map());

    // Store current bbox for live feed fetch
    const currentBboxRef = useRef<BBox | null>(null);

    // Pulse animation radius for Living Pins
    const [pulseRadius, setPulseRadius] = useState(0);

    // VIBE SENTINEL: Track the active neighborhood zone
    const [currentVibeZone, setCurrentVibeZone] = useState<VibeZone | null>(null);

    // Neighborhood Anchors state
    const [anchorData, setAnchorData] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
    const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
    const [lockedAnchorIds, setLockedAnchorIds] = useState<string[]>([]);
    const [selectedAnchor, setSelectedAnchor] = useState<GeoJSON.Feature<GeoJSON.Point, AnchorFeatureProperties> | null>(null);

    // Postcode Boundary state
    const [postcodeBoundary, setPostcodeBoundary] = useState<GeoJSON.FeatureCollection | null>(null);
    const [boundaryOpacity, setBoundaryOpacity] = useState(1);
    const boundaryFadeTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Search Alpha: Precision Pin marker ref
    const currentMarker = useRef<maplibregl.Marker | null>(null);

    // Tiered Anchor Filter
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
            const baseFilter = activeStatusFilters.length === 0
                ? ['==', ['get', 'property_id'], 'NONE']
                : ['in', ['get', 'status'], ['literal', activeStatusFilters]];

            ['hearth-pins', 'hearth-glyphs', 'property-points'].forEach(layerId => {
                if (map.getLayer(layerId)) {
                    map.setFilter(layerId, baseFilter as any);
                }
            });

            const intentFilter = ['all', baseFilter, ['==', ['get', 'has_active_intent'], true]];
            ['building-glow', 'hearth-pulse'].forEach(layerId => {
                if (map.getLayer(layerId)) {
                    map.setFilter(layerId, intentFilter as any);
                }
            });
        };

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

    useImperativeHandle(ref, () => ({
        refreshMapPins: async () => {
            mapRef.current?.getMap().triggerRepaint();
        },
        openMessageCentre: () => {
            setShowMessageCentre(true);
        },
        handleSearch: async (query: string, result?: any) => {
            console.log('Search Triggered for:', query);
            if (!query) {
                setPostcodeBoundary(null);
                return;
            }

            // 0. Structured result or Postcode-like extraction
            const sanitisedQuery = (result?.name || query).trim();

            // Sovereign Local Router: Clean the query
            const cleanQuery = sanitisedQuery.toUpperCase().replace(/\s+/g, ' ').trim();

            // Detect if it's a full postcode (e.g., 'NE30 4LZ') or just an outcode (e.g., 'NE30')
            const fullPostcodeMatch = cleanQuery.match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)\s+([0-9][A-Z]{2})$/i);
            const outcodeMatch = cleanQuery.match(/^[A-Z]{1,2}[0-9][A-Z0-9]?$/i);

            const isFullPostcode = !!fullPostcodeMatch;
            const isOutcode = !!outcodeMatch;

            if (isFullPostcode || isOutcode) {
                // =============================================================================
                // SEARCH ALPHA: Precision Pin Configuration (Day 1 Rollout)
                // Polygons deactivated for stability - using centroid marker instead
                // =============================================================================

                /* DEACTIVATED: Polygon boundary rendering (too unstable for Day 1)
                const mode = isFullPostcode ? 'units' : 'districts';
                const filename = isFullPostcode ? cleanQuery : cleanQuery;

                const processGeometry = (fullResponseObj: any, sourceName: string, nominatimBbox?: string[]) => {
                    try {
                        let geometryTarget = null;
                        if (fullResponseObj.type === 'FeatureCollection' && fullResponseObj.features?.[0]?.geometry) {
                            geometryTarget = fullResponseObj.features[0].geometry;
                        } else if (fullResponseObj.type === 'Feature' && fullResponseObj.geometry) {
                            geometryTarget = fullResponseObj.geometry;
                        } else {
                            geometryTarget = fullResponseObj.geojson || fullResponseObj.geometry || fullResponseObj;
                        }
                        if (!geometryTarget || !geometryTarget.coordinates) throw new Error("No geometry found in response");

                        const unpack = (coords: any): [number, number][] => {
                            if (Array.isArray(coords) && typeof coords[0] === 'number') {
                                let [lon, lat] = coords;
                                if (Math.abs(lat) < 2 && Math.abs(lon) > 40) [lon, lat] = [lat, lon];
                                return [[lon, lat]];
                            }
                            return coords.reduce((acc: [number, number][], c: any) => acc.concat(unpack(c)), []);
                        };

                        let finalPoints = unpack(geometryTarget.coordinates);
                        if (finalPoints.length > 0) {
                            finalPoints.push([...finalPoints[0]]);
                        }

                        console.log(`LOCAL ROUTER SUCCESS: Loaded ${cleanQuery} from ${mode} folder (${finalPoints.length} points)`);

                        const collection: any = {
                            type: 'FeatureCollection',
                            features: [{
                                type: 'Feature',
                                geometry: { type: 'Polygon', coordinates: [finalPoints] },
                                properties: { source: sourceName }
                            }]
                        };

                        const map = mapRef.current?.getMap();
                        if (map) {
                            const uniqueId = 'postcode-' + Date.now();
                            console.log('Layer Injected with ID:', uniqueId);

                            // Nuclear Cleanup
                            try {
                                const style = map.getStyle();
                                if (style && style.layers) {
                                    style.layers.forEach(layer => {
                                        if (layer.id.startsWith('postcode-')) map.removeLayer(layer.id);
                                    });
                                }
                                const currentSources = map.getStyle().sources;
                                Object.keys(currentSources).forEach(s => {
                                    if (s.startsWith('postcode-')) map.removeSource(s);
                                });
                            } catch (e) { }

                            // DEACTIVATED: addSource and addLayer for polygon boundaries
                            // map.addSource(uniqueId, { type: 'geojson', data: collection });
                            // map.addLayer({ id: uniqueId + '-fill', type: 'fill', source: uniqueId, paint: { 'fill-color': '#E08E5F', 'fill-opacity': 0.15 } }, 'discovery-heatmap');
                            // map.addLayer({ id: uniqueId + '-outline', type: 'line', source: uniqueId, paint: { 'line-color': '#1B1B1B', 'line-width': 2, 'line-opacity': 1.0 } }, 'discovery-heatmap');

                            const lons = finalPoints.map(c => c[0]);
                            const lats = finalPoints.map(c => c[1]);
                            map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 100, duration: 2000 });
                        }

                        setPostcodeBoundary(collection);
                        setBoundaryOpacity(1);
                    } catch (err) {
                        console.error('[Boundary] Unpacker failed:', err);
                    }
                };

                fetch(`/${mode}/${filename}.geojson`)
                    .then(res => {
                        if (!res.ok) throw new Error(`Local Miss: ${filename} not found in /${mode}/`);
                        return res.json();
                    })
                    .then(data => processGeometry(data, `${mode}/${filename}`))
                    .catch(e => {
                        console.warn(`[Boundary] ${e.message}`);
                    });
                END DEACTIVATED */

                // SEARCH ALPHA: The Precision Pin - fetch centroid from postcodes.io
                const lookupPostcode = isFullPostcode ? cleanQuery.replace(' ', '') : cleanQuery;
                const apiEndpoint = isFullPostcode
                    ? `https://api.postcodes.io/postcodes/${lookupPostcode}`
                    : `https://api.postcodes.io/outcodes/${lookupPostcode}`;

                fetch(apiEndpoint)
                    .then(res => res.json())
                    .then(data => {
                        if (data.result) {
                            const { longitude: lon, latitude: lat } = data.result;
                            const map = mapRef.current?.getMap();

                            if (map) {
                                // Remove existing marker if it exists
                                if (currentMarker.current) currentMarker.current.remove();

                                // Add a fresh Hearth Ember pin
                                currentMarker.current = new maplibregl.Marker({ color: '#E08E5F' })
                                    .setLngLat([lon, lat])
                                    .addTo(map);

                                // The 'Discovery Fly-To': zoom 13 for district, zoom 17 for unit
                                const targetZoom = isFullPostcode ? 17 : 13;
                                map.flyTo({
                                    center: [lon, lat],
                                    zoom: targetZoom,
                                    duration: 2000,
                                    essential: true
                                });

                                // Audit log
                                console.log(`SEARCH ROLLOUT: Marker dropped at ${cleanQuery}`);
                            }
                        } else {
                            console.warn(`[Search Alpha] No result from postcodes.io for: ${cleanQuery}`);
                        }
                    })
                    .catch(err => console.error('[Search Alpha] postcodes.io fetch failed:', err));
            }


            if (result && result.center) {
                const [lon, lat] = result.center;
                let targetZoom = 15;
                if (result.type === 'postcode' || result.type === 'street' || result.type === 'address') targetZoom = 16;
                else if (result.type === 'district' || result.type === 'place' || result.type === 'city' || result.type === 'town') targetZoom = 13.5;

                mapRef.current?.getMap().easeTo({
                    center: [lon, lat],
                    zoom: targetZoom,
                    duration: 2500,
                    essential: true
                });
                return;
            }

            // --- LEGACY / FALLBACK SEARCH LOGIC ---
            // (Keeping this for direct enters without selection, although dropdown is now preferred)

            // 0. Clear previous boundary
            setPostcodeBoundary(null);

            const lowerQuery = query.toLowerCase().trim();

            // 1. Postcode detection (UK Postcode Regex)
            const POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i;
            const SECTOR_REGEX = /^([A-Z]{1,2}[0-9][A-Z0-9]?) ?([0-9])/i;
            const DISTRICT_REGEX = /^([A-Z]{1,2}[0-9][A-Z0-9]?)$/i;

            if (POSTCODE_REGEX.test(lowerQuery) || SECTOR_REGEX.test(lowerQuery) || DISTRICT_REGEX.test(lowerQuery)) {
                inspectLog("SEARCH_POSTCODE_DETECTED", { query });

                // (Boundary fetch removed due to ArcGIS service instability)

                // Query our properties by postcode
                try {
                    const response = await fetch(`/api/properties?postcode=${encodeURIComponent(query)}`);
                    const data = await response.json();

                    if (data.ok && data.data && data.data.length > 0) {
                        const properties = data.data;
                        // If exact match found, fly and select
                        if (properties.length === 1) {
                            const p = properties[0];
                            handleOpenProperty({ propertyId: p.property_id, lat: p.lat, lon: p.lon, zoom: 18 });
                            inspectLog("SEARCH_EXACT_MATCH", { postcode: p.postcode });
                            return;
                        } else {
                            // Multiple properties in postcode, fly to centroid
                            const avgLat = properties.reduce((acc: number, p: any) => acc + p.lat, 0) / properties.length;
                            const avgLon = properties.reduce((acc: number, p: any) => acc + p.lon, 0) / properties.length;
                            mapRef.current?.getMap().easeTo({
                                center: [avgLon, avgLat],
                                zoom: 17,
                                duration: 2500
                            });
                            inspectLog("SEARCH_POSTCODE_AREA_MATCH", { count: properties.length });
                            return;
                        }
                    }
                } catch (err) {
                    console.error("[Search] Local property query failed:", err);
                }
            }

            // 2. Local Neighborhood Match
            const localMatch = VIBE_ZONES.find(z =>
                z.name.toLowerCase().includes(lowerQuery) ||
                z.punchline.toLowerCase().includes(lowerQuery)
            );

            if (localMatch) {
                inspectLog("SEARCH_LOCAL_MATCH", { query, neighborhood: localMatch.name });
                mapRef.current?.getMap().easeTo({
                    center: [localMatch.centroid[1], localMatch.centroid[0]],
                    zoom: 15,
                    duration: 2000
                });
                return;
            }

            // 3. Global Geocoding Fallback (Photon)
            try {
                inspectLog("SEARCH_GEOCODE_ATTEMPT", { query });
                const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`);
                const data = await response.json();
                if (data.features && data.features.length > 0) {
                    const [lon, lat] = data.features[0].geometry.coordinates;
                    inspectLog("SEARCH_GEOCODE_SUCCESS", { query, lat, lon });
                    mapRef.current?.getMap().easeTo({
                        center: [lon, lat],
                        zoom: 17,
                        duration: 2500
                    });
                } else {
                    inspectLog("SEARCH_NO_RESULTS", { query });
                }
            } catch (err) {
                console.error("[Search] Geocoding failed:", err);
                inspectLog("SEARCH_ERROR", { query, error: String(err) });
            }
        }
    }));

    // Fetch vibe stats for area
    const fetchVibeStats = useCallback(async (bbox: BBox) => {
        const gridKey = bboxToGridKey(bbox);
        const cached = vibeCacheRef.current.get(gridKey);
        if (cached) {
            setVibeStats(cached);
            return;
        }

        if (vibeAbortRef.current) vibeAbortRef.current.abort();
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

    useEffect(() => {
        fetchAnchorData();
    }, [fetchAnchorData]);

    const handleAnchorClick = useCallback((anchorId: string) => {
        const feature = anchorData.features.find(f => f.properties?.id === anchorId) as GeoJSON.Feature<GeoJSON.Point, AnchorFeatureProperties> | undefined;
        setLockedAnchorIds(prev =>
            prev.includes(anchorId) ? prev.filter(id => id !== anchorId) : [...prev, anchorId]
        );
        if (feature && !lockedAnchorIds.includes(anchorId)) {
            setSelectedAnchor(feature);
        } else {
            setSelectedAnchor(null);
        }
    }, [anchorData.features, lockedAnchorIds]);

    const handleMoveEnd = useCallback(
        (evt: ViewStateChangeEvent) => {
            const bounds = evt.target.getBounds();
            if (!bounds) return;

            const bbox = computeBBox(bounds);
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

            debounceTimerRef.current = setTimeout(() => {
                fetchVibeStats(bbox);
                currentBboxRef.current = bbox;
                if (isTrayExpanded) fetchLiveFeed(bbox);

                // VibeSentinel Performance Lockdown: Only check zone on move end
                const { latitude, longitude } = evt.viewState;
                let nearestZone: VibeZone | null = null;
                let minDistance = Infinity;
                VIBE_ZONES.forEach((zone) => {
                    const [zLat, zLon] = zone.centroid;
                    const dist = getDistanceFromLatLonInKm(latitude, longitude, zLat, zLon);
                    if (dist < minDistance) { minDistance = dist; nearestZone = zone; }
                });
                if (minDistance > 2.5) nearestZone = null;
                setCurrentVibeZone(prev => {
                    if (prev?.id === nearestZone?.id) return prev;
                    console.log(`[VibeSentinel] Updated: ${nearestZone?.name || 'None'}`);
                    return nearestZone;
                });
            }, DEBOUNCE_MS);
        },
        [fetchVibeStats, isTrayExpanded]
    );

    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        const handlePitchStart = () => { manualPitchOverrideRef.current = true; };
        map.on("pitchstart", handlePitchStart);
        return () => { map.off("pitchstart", handlePitchStart); };
    }, []);

    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        const updatePitchState = () => {
            const pitch = map.getPitch();
            setIsPitchActive(pitch > 5);
        };
        map.on("pitch", updatePitchState);
        map.on("move", updatePitchState);
        updatePitchState();
        return () => {
            map.off("pitch", updatePitchState);
            map.off("move", updatePitchState);
        };
    }, []);

    const fetchLiveFeed = useCallback(async (bbox: BBox) => {
        if (liveFeedAbortRef.current) liveFeedAbortRef.current.abort();
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
            if (json.ok && json.events) setLiveFeedEvents(json.events);
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            setLiveFeedEvents([]);
        } finally {
            setLiveFeedLoading(false);
        }
    }, []);

    const handleLoad = useCallback(
        (evt: { target: maplibregl.Map }) => {
            const map = evt.target;
            const bounds = map.getBounds();
            if (bounds) {
                const bbox = computeBBox(bounds);
                fetchVibeStats(bbox);
            }

            // Force a refresh of map tiles on load
            setTileVersion(v => v + 1);

            try {
                (map as unknown as { setFog: (options: object) => void }).setFog({
                    color: PAPER,
                    range: [1, 12],
                    "horizon-blend": 0.1
                });
            } catch (e) {
                console.debug("Fog not supported:", e);
            }

            const hearthIcons: Record<string, string> = {
                "hearth-school": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>`)}`,
                "hearth-rail": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`)}`,
                "hearth-park": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M17 12h2L12 2 5 12h2l-3 8h7v2h2v-2h7l-3-8zm-5-6.5l4.3 5.5H13v3h-2v-3H7.7L12 5.5z"/></svg>`)}`,
                "hearth-coastal": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M21 17c-1.1 0-2-.9-2-2 0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2v2c1.1 0 2-.9 2-2 0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2v-2zm0-4c-1.1 0-2-.9-2-2 0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2s-2-.9-2-2c0 1.1-.9 2-2 2v2c1.1 0 2-.9 2-2 0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2v-2z"/></svg>`)}`,
                "hearth-village": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M15 11V5l-3-3-3 3v2H3v14h18V11h-6zm-8 8H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm6 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg>`)}`,
                "hearth-health": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`)}`,
                "hearth-shop": `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z"/></svg>`)}`
            };

            Object.entries(hearthIcons).forEach(([id, dataUri]) => {
                const img = new Image(24, 24);
                img.onload = () => { if (!map.hasImage(id)) map.addImage(id, img, { sdf: true }); };
                img.src = dataUri;
            });

            try {
                (map as unknown as { setSky: (options: object) => void }).setSky({
                    "sky-color": PAPER,
                    "sky-horizon-blend": 0.5,
                    "horizon-color": PAPER,
                    "horizon-fog-blend": 0.8,
                    "fog-color": PAPER,
                    "fog-ground-blend": 0.5
                });
            } catch (e) { console.debug("Sky not supported:", e); }

            ["property-points", "hearth-pins"].forEach((layer) => {
                map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
                map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
            });

            hideCommercialPOIs(map);
        },
        [fetchVibeStats]
    );

    // =============================================================================
    // STYLE ENFORCEMENT & 3D LOGIC
    // =============================================================================

    // Ref to track current 3D state for use in style.load callbacks (avoids stale closures)
    const is3DRef = useRef(is3D);
    useEffect(() => { is3DRef.current = is3D; }, [is3D]);

    // Mode-aware 3D building layer
    const add3DBuildings = useCallback((map: maplibregl.Map, forceIs3D?: boolean) => {
        const shouldAdd = forceIs3D ?? is3DRef.current;
        if (!shouldAdd || map.getLayer("building-3d") || !map.isStyleLoaded()) return;

        const layers = map.getStyle()?.layers || [];
        const existingBuilding = layers.find(l => l.id.includes("building") && l.type === "fill");
        if (existingBuilding && 'source' in existingBuilding) {
            try {
                // Get current viewMode from the React state
                const currentViewMode = viewMode;
                const isGhost = currentViewMode === "satellite";
                console.log(`[3D] Adding buildings in ${isGhost ? 'GHOST' : 'WARM'} mode`);
                map.addLayer({
                    id: "building-3d",
                    source: existingBuilding.source as string,
                    "source-layer": "source-layer" in existingBuilding ? (existingBuilding["source-layer"] as string) : "building",
                    type: "fill-extrusion",
                    minzoom: 14,
                    paint: {
                        "fill-extrusion-color": isGhost ? "#E0E0E0" : BUILDING_WARM,
                        "fill-extrusion-height": 6.5,
                        "fill-extrusion-base": 0,
                        "fill-extrusion-opacity": isGhost ? 0.4 : 0.6
                    }
                });
            } catch (e) { console.warn("Could not add 3D buildings:", e); }
        }
    }, [viewMode]);

    const remove3DBuildings = useCallback((map: maplibregl.Map) => {
        if (map.getLayer("building-3d")) {
            try { map.removeLayer("building-3d"); } catch { }
        }
    }, []);

    const cleanSatelliteLens = useCallback((map: maplibregl.Map) => {
        if (viewMode !== "satellite" || !map.isStyleLoaded()) return;
        const HEARTH_LAYERS = ["satellite-layer", "building-3d", "discovery-heatmap", "building-glow", "hearth-pins", "hearth-pulse", "hearth-glyphs", "property-points", "anchor-radii", "anchor-icons", "anchor-labels"];
        const layers = map.getStyle().layers || [];
        layers.forEach(l => {
            if (HEARTH_LAYERS.includes(l.id)) return;
            try { map.setLayoutProperty(l.id, "visibility", "none"); } catch { }
        });
    }, [viewMode]);

    const stackLayers = useCallback((map: maplibregl.Map) => {
        if (map.getLayer("satellite-layer")) {
            try {
                const layers = map.getStyle().layers || [];
                const firstLayerId = layers[0]?.id;
                if (firstLayerId && firstLayerId !== "satellite-layer") map.moveLayer("satellite-layer", firstLayerId);
            } catch { }
        }
        ["postcode-boundary-fill", "postcode-boundary-outline", "discovery-heatmap", "building-glow", "property-points", "anchor-radii", "anchor-labels", "anchor-icons", "hearth-pins", "hearth-pulse", "hearth-glyphs"].forEach(id => {
            if (map.getLayer(id)) map.moveLayer(id);
        });
    }, []);

    const ensurePinLayers = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map || !map.isStyleLoaded()) return;
        hideCommercialPOIs(map);
        stackLayers(map);
    }, [stackLayers]);

    const handleStyleUpdate = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map || !map.isStyleLoaded()) return;

        hideCommercialPOIs(map);
        if (is3DRef.current) {
            remove3DBuildings(map);
            add3DBuildings(map, is3DRef.current);
        } else {
            remove3DBuildings(map);
        }
        cleanSatelliteLens(map);
        stackLayers(map);

        // Restore interaction
        map.getCanvas().style.pointerEvents = 'auto';
    }, [add3DBuildings, remove3DBuildings, cleanSatelliteLens, stackLayers]);

    // Effect to handle viewMode Swap & style.load logic
    // CRITICAL: Uses is3DRef to access fresh 3D state in the callback
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        // Force a style reset on viewMode change to fix 'Swap Stall'
        console.log(`[PropertyMap] ViewMode changed to: ${viewMode}, resetting style...`);
        map.setStyle(MAP_STYLE);

        const onStyleLoad = () => {
            console.log(`[PropertyMap] Style loaded. is3D=${is3DRef.current}, viewMode=${viewMode}`);
            // Apply all Hearth furniture
            hideCommercialPOIs(map);
            cleanSatelliteLens(map);
            stackLayers(map);

            // Re-add 3D if it was active (using ref for fresh value)
            if (is3DRef.current) {
                console.log("[PropertyMap] Re-adding 3D buildings after style load...");
                remove3DBuildings(map);
                add3DBuildings(map, true);
            }
            map.getCanvas().style.pointerEvents = 'auto';
        };

        map.once("style.load", onStyleLoad);

        // Fallback polling for the transition period (does NOT touch 3D)
        const pollingInterval = setInterval(() => {
            if (!map.isStyleLoaded()) return;
            hideCommercialPOIs(map);
            cleanSatelliteLens(map);
            stackLayers(map);
            // Also re-check 3D in polling in case style.load was missed
            if (is3DRef.current && !map.getLayer("building-3d")) {
                add3DBuildings(map, true);
            }
        }, 500);
        const stopPollingTimer = setTimeout(() => clearInterval(pollingInterval), 2000);

        return () => {
            clearInterval(pollingInterval);
            clearTimeout(stopPollingTimer);
        };
    }, [viewMode, cleanSatelliteLens, stackLayers, add3DBuildings, remove3DBuildings]);

    // Handle 3D state changes independently - NO style reset, just layer manipulation
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map || !map.isStyleLoaded()) return;

        console.log(`[3D Effect] is3D changed to: ${is3D}`);
        if (is3D) {
            // Remove and re-add to pick up correct viewMode styling
            remove3DBuildings(map);
            add3DBuildings(map, true);

            // Mobile-specific auto-tilt for discoverability
            if (isMobile) {
                map.easeTo({
                    pitch: 62,
                    duration: 1200,
                    essential: true
                });
            }
        } else {
            remove3DBuildings(map);
            // Return to birds-eye view on mobile
            if (isMobile) {
                map.easeTo({
                    pitch: 0,
                    duration: 1000,
                    essential: true
                });
            }
        }
    }, [is3D, viewMode, add3DBuildings, remove3DBuildings]);

    const handleMapClick = useCallback(async (evt: MapLayerMouseEvent) => {
        try {
            const features = evt.features;
            console.log('[MapClick] Features at click:', features?.map(f => f.layer?.id));

            if (!features || features.length === 0) return;
            if (features[0].source?.includes('cluster') || features[0].properties?.cluster) {
                console.log('[MapClick] Cluster clicked');
                return;
            }

            const anchorFeature = features.find((f) => f.layer?.id === "anchor-icons");
            if (anchorFeature && anchorFeature.properties?.id) {
                console.log('[MapClick] Anchor clicked:', anchorFeature.properties.id);
                handleAnchorClick(anchorFeature.properties.id);
                return;
            }

            const feature = features.find((f) => f.layer?.id === "hearth-pins" || f.layer?.id === "property-points");
            if (feature) {
                const propertyId = feature.properties?.property_id;
                const status = feature.properties?.status;
                console.log('[MapClick] Property feature found:', { propertyId, status });

                if (propertyId) {
                    setPendingOpenMode("card");
                    setPendingConversationId(null);
                    setSelectedPropertyId(propertyId);
                } else {
                    console.log('[MapClick] No property_id in feature properties:', feature.properties);
                }
            } else {
                console.log('[MapClick] No property feature found');
            }
        } catch (e) { console.error('[MapClick] Error:', e); }
    }, [handleAnchorClick]);

    const handleCloseSheet = useCallback(() => {
        setSelectedPropertyId(null);
        setPendingOpenMode("card");
        setPendingConversationId(null);
    }, []);


    const refreshIntentForProperty = useCallback(() => {
        // Increment tile version to bust cache and force re-fetch
        setTileVersion(v => v + 1);
        console.log("[PropertyMap] Tile cache invalidated, forcing refresh...");
    }, []);

    const handleClaimSuccess = useCallback(() => {
        if (selectedPropertyId) refreshIntentForProperty();
    }, [selectedPropertyId, refreshIntentForProperty]);

    const handleFlyToProperty = useCallback((options: FlyToOptions) => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        map.flyTo({ center: [options.lon, options.lat], zoom: options.zoom ?? 17, essential: true, duration: 1500 });
        inspectLog("NEIGHBOUR_FLYTO", { property_id: options.propertyId, lat: options.lat, lon: options.lon });
    }, []);

    const handleOpenProperty = useCallback((options: OpenPropertyOptions) => {
        const { propertyId, openMode = "card", conversationId = null, lat, lon, zoom } = options;
        if (lat !== undefined && lon !== undefined) handleFlyToProperty({ propertyId, lat, lon, zoom });
        setPendingOpenMode(openMode);
        setPendingConversationId(conversationId ?? null);
        setSelectedPropertyId(propertyId);
    }, [handleFlyToProperty]);

    useEffect(() => {
        const startTime = Date.now();
        let animationFrame: number;
        const animate = () => {
            const elapsed = (Date.now() - startTime) % 4000;
            const pulse = Math.exp(-Math.pow((elapsed / 4000) - 0.5, 2) / 0.05);
            setPulseRadius(pulse);
            animationFrame = requestAnimationFrame(animate);
        };
        animate();
        return () => cancelAnimationFrame(animationFrame);
    }, []);

    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;
        try {
            const isSatellite = viewMode === "satellite";
            (map as any).setFog({ color: isSatellite ? "#FFFFFF" : PAPER, range: isSatellite ? [0.5, 15] : [0.2, 10], "horizon-blend": 0.1 });
        } catch { }
    }, [viewMode]);

    useEffect(() => { if (selectedPropertyId) setIsTrayExpanded(false); }, [selectedPropertyId]);

    return (
        <MapIntentProvider onRefresh={refreshIntentForProperty} onFlyTo={handleFlyToProperty} onOpenProperty={handleOpenProperty}>
            {/* USE 100dvh TO PREVENT BOTTOM OVERFLOW ON MOBILE/TABLET */}
            <div className="relative w-full h-[100dvh] overflow-hidden">
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <Map
                        ref={mapRef}
                        {...viewState}
                        onMove={evt => setViewState(evt.viewState)}
                        onMoveEnd={handleMoveEnd}
                        onLoad={handleLoad}
                        onClick={handleMapClick}
                        style={{
                            width: "100%",
                            height: "100%",
                            transition: "filter 0.5s cubic-bezier(0.19, 1, 0.22, 1)",
                            filter: isTrayExpanded ? "blur(12px) brightness(0.6)" : (isMobile && !!selectedPropertyId) ? "blur(12px) brightness(0.8)" : "none",
                            pointerEvents: "auto"
                        }}
                        mapStyle={MAP_STYLE}
                        // @ts-ignore - antialias is a valid MapLibre constructor option but might be missing in react-map-gl types
                        antialias={true}
                        attributionControl={false}
                        reuseMaps
                        interactiveLayerIds={["hearth-pins", "anchor-icons", "property-points"]}
                    >
                        {viewMode === "satellite" && (
                            <Source id="satellite-source" type="raster" tiles={[ARCGIS_SATELLITE_URL]} tileSize={256}>
                                <Layer id="satellite-layer" type="raster" paint={{ "raster-brightness-min": 0.05, "raster-contrast": 0.1, "raster-saturation": 0 }} />
                            </Source>
                        )}
                        <Source id="luminary-mvt" type="vector" tiles={[`${getTileUrl()}?v=${tileVersion}`]} key={`mvt-${tileVersion}`} minzoom={11} maxzoom={14}>
                            <Layer
                                id="discovery-heatmap"
                                type="heatmap"
                                source-layer="properties"
                                maxzoom={16}
                                filter={['>', ['get', 'heat_weight'], 0]}
                                paint={{
                                    "heatmap-weight": ["get", "heat_weight"],
                                    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 11, 2],
                                    "heatmap-color": [
                                        "interpolate", ["linear"], ["heatmap-density"],
                                        0, "rgba(0,0,0,0)",
                                        0.2, "rgba(255, 87, 51, 0.1)",
                                        0.6, "rgba(255, 87, 51, 0.4)",
                                        1, "rgba(255, 215, 0, 0.7)"
                                    ],
                                    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 8, 14, 30],
                                    "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 11, 1, 15, 0]
                                }}
                            />
                            <Layer id="building-glow" type="circle" source-layer="properties" minzoom={11} filter={activeStatusFilters.length === 0 ? ['==', ['get', 'property_id'], 'NONE'] : ['all', ['in', ['get', 'status'], ['literal', activeStatusFilters]], ['==', ['get', 'has_active_intent'], true]]} paint={{ "circle-color": EMBER, "circle-opacity": 0, "circle-stroke-width": 4, "circle-stroke-color": EMBER, "circle-stroke-opacity": 0.4, "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 15, 17, 35, 19, 60], "circle-blur": 0.8 }} />
                            <Layer id="hearth-pins" type="circle" source-layer="properties" minzoom={11} maxzoom={24} filter={activeStatusFilters.length === 0 ? ['==', ['get', 'property_id'], 'NONE'] : ['in', ['get', 'status'], ['literal', activeStatusFilters]]} layout={{ "circle-sort-key": ["match", ["get", "status"], "for_sale", 100, "open_to_talking", 90, "for_rent", 80, "settled", 50, 0] }} paint={{ "circle-color": ["match", ["get", "status"], "for_sale", EMBER, "for_rent", EMBER, "open_to_talking", EMBER, "settled", INK_GREY, "unclaimed", "#9CA3AF", "#9CA3AF"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 0, 14, ["match", ["get", "status"], "unclaimed", 4, "settled", 6, 10]], "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 14, ["match", ["get", "status"], "unclaimed", 0.3, "settled", 0.6, 1]], "circle-stroke-width": 0 }} />
                            <Layer id="hearth-pulse" type="circle" source-layer="properties" minzoom={11} filter={activeStatusFilters.length === 0 ? ['==', ['get', 'property_id'], 'NONE'] : ['all', ['in', ['get', 'status'], ['literal', activeStatusFilters]], ['==', ['get', 'has_active_intent'], true]]} paint={{ "circle-color": EMBER, "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, ["*", 12, pulseRadius], 16, ["*", 28, pulseRadius]], "circle-opacity": ["*", 0.35, ["-", 1, pulseRadius]] }} />
                            <Layer id="hearth-glyphs" type="symbol" source-layer="properties" minzoom={13} filter={activeStatusFilters.length === 0 ? ['==', ['get', 'property_id'], 'NONE'] : ['in', ['get', 'status'], ['literal', activeStatusFilters]]} layout={{ "text-field": ["match", ["get", "status"], "for_sale", "£", "for_rent", "r", "open_to_talking", "+", ""], "text-font": ["Open Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 14, 9, 16, 11], "text-allow-overlap": true, "text-ignore-placement": true }} paint={{ "text-color": "#ffffff" }} />
                            <Layer id="property-points" type="circle" source-layer="properties" minzoom={11} paint={{ "circle-color": "#000000", "circle-radius": isMobile ? 24 : 12, "circle-opacity": 0, "circle-stroke-opacity": 0 }} />
                        </Source>
                        {anchorData.features.length > 0 && (
                            <Source id="anchor-source" type="geojson" data={anchorData}>
                                <Layer id="anchor-radii" type="circle" filter={anchorTierFilter === 'all' ? true : ["==", ["get", "tier"], anchorTierFilter]} paint={{ "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 10, 12.5, 15, 400, 20, 12800], "circle-pitch-alignment": "map", "circle-color": EMBER, "circle-opacity": ["case", ["in", ["get", "id"], ["literal", lockedAnchorIds]], 0.1, ["==", ["get", "id"], activeAnchorId || ""], 0.1, 0], "circle-stroke-width": ["case", ["in", ["get", "id"], ["literal", lockedAnchorIds]], 2, ["==", ["get", "id"], activeAnchorId || ""], 2, 0], "circle-stroke-color": EMBER, "circle-stroke-opacity": 0.3 }} />
                                <Layer id="anchor-icons" type="symbol" minzoom={11} filter={anchorTierFilter === 'all' ? true : ["==", ["get", "tier"], anchorTierFilter]} layout={{ "icon-image": ["case", ["==", ["get", "subtype"], "primary"], "hearth-school", ["==", ["get", "subtype"], "secondary"], "hearth-school", ["==", ["get", "subtype"], "metro"], "hearth-rail", ["==", ["get", "subtype"], "ferry"], "hearth-rail", ["==", ["get", "subtype"], "bus"], "hearth-rail", ["==", ["get", "subtype"], "park"], "hearth-park", ["==", ["get", "subtype"], "coastal"], "hearth-coastal", ["==", ["get", "subtype"], "village_center"], "hearth-village", ["==", ["get", "subtype"], "gp"], "hearth-health", ["==", ["get", "subtype"], "hospital"], "hearth-health", ["==", ["get", "subtype"], "dentist"], "hearth-health", ["==", ["get", "subtype"], "supermarket"], "hearth-shop", ["==", ["get", "subtype"], "convenience"], "hearth-shop", "hearth-park"], "icon-size": 1, "icon-allow-overlap": true, "icon-ignore-placement": true }} paint={{ "icon-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 12, 1], "icon-color": ["case", ["in", ["get", "id"], ["literal", lockedAnchorIds]], EMBER, ["==", ["get", "id"], activeAnchorId || ""], EMBER, INK_GREY], "icon-halo-color": "#ffffff", "icon-halo-width": 1 }} />
                                <Layer id="anchor-labels" type="symbol" minzoom={14} filter={anchorTierFilter === 'all' ? true : ["==", ["get", "tier"], anchorTierFilter]} layout={{ "text-field": ["get", "name"], "text-size": 10, "text-offset": [0, 1.2], "text-anchor": "top", "text-max-width": 8 }} paint={{ "text-color": ["case", ["in", ["get", "id"], ["literal", lockedAnchorIds]], EMBER, ["==", ["get", "id"], activeAnchorId || ""], EMBER, INK_GREY], "text-halo-color": "#ffffff", "text-halo-width": 1 }} />
                            </Source>
                        )}
                        {postcodeBoundary && (
                            /* Boundary managed via Nuclear Sync in processGeometry to bypass state lag */
                            null
                        )}
                    </Map>
                    {isTrayExpanded && (
                        <div className="absolute inset-0 z-40 cursor-pointer pointer-events-auto bg-black/5" onClick={(e) => { e.stopPropagation(); setIsTrayExpanded(false); }} aria-label="Dismiss Vibe Tray" />
                    )}
                </div>

                {/* Floating Map Filter Bar */}
                <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 transition-all duration-700 ease-out transform pointer-events-none ${isFilterMounted && (!isMobile || !selectedPropertyId) ? 'translate-y-0 opacity-100' : '-translate-y-12 opacity-0'}`}>
                    <div className="flex flex-col items-center gap-2">
                        <div className={`flex items-center bg-[#F9F7F2]/95 backdrop-blur-[24px] border border-[#1B1B1B]/10 rounded-full p-1.5 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.15)] pointer-events-auto transition-all duration-500 ease-in-out ${isMobile ? (isFilterMobileExpanded ? 'max-w-[92vw]' : 'w-[120px]') : 'w-auto md:w-max md:px-4'}`}>
                            {isMobile && (
                                <button
                                    onClick={() => setIsFilterMobileExpanded(!isFilterMobileExpanded)}
                                    className={`flex items-center gap-2 px-3 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors flex-shrink-0 ${isFilterMobileExpanded ? 'text-ember bg-ember/5' : 'text-gray-500 hover:bg-gray-100/50'}`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                    </svg>
                                    <span className={isFilterMobileExpanded ? "hidden sm:inline" : "inline"}>Filter</span>
                                </button>
                            )}

                            <div className={`${!isMobile || isFilterMobileExpanded ? 'flex' : 'hidden'} items-center gap-2 md:gap-3 px-1 ${isMobile ? 'overflow-x-auto no-scrollbar' : ''}`}>
                                <button onClick={() => toggleStatusFilter('for_sale')} className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 transform active:scale-95 ${activeStatusFilters.includes('for_sale') ? 'bg-[#E08E5F] text-white shadow-lg shadow-orange-900/10' : 'bg-white/40 text-gray-400 hover:bg-white/70'}`}>For Sale</button>
                                <button onClick={() => toggleStatusFilter('for_rent')} className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 transform active:scale-95 ${activeStatusFilters.includes('for_rent') ? 'bg-[#8C8C8C] text-white shadow-md' : 'bg-white/40 text-gray-400 hover:bg-white/70'}`}>For Rent</button>
                                <button onClick={() => toggleStatusFilter('open_to_talking')} className={`flex-shrink-0 relative px-4 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-500 transform active:scale-95 overflow-hidden ${activeStatusFilters.includes('open_to_talking') ? 'bg-white text-[#E08E5F] shadow-lg shadow-orange-900/10 ring-1 ring-[#E08E5F]/20' : 'bg-white/40 text-gray-400 hover:bg-white/70'}`}>
                                    {activeStatusFilters.includes('open_to_talking') && <span className="absolute inset-0 bg-[#E08E5F]/5 animate-pulse" />}
                                    <span className="relative z-10">Open to Talking</span>
                                </button>
                                <div className="flex-shrink-0 w-px h-4 bg-gray-200/60 mx-1" />
                                <button onClick={() => toggleStatusFilter('settled')} className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 transform active:scale-95 ${activeStatusFilters.includes('settled') ? 'bg-[#4A4A4A] text-white shadow-md' : 'bg-white/40 text-gray-400 hover:bg-white/70'}`}>Settled</button>
                                <button onClick={() => toggleStatusFilter('unclaimed')} className={`flex-shrink-0 px-4 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 transform active:scale-95 ${activeStatusFilters.includes('unclaimed') ? 'bg-[#D4D0C8] text-gray-700 shadow-md' : 'bg-white/40 text-gray-400 hover:bg-white/70'}`}>Unclaimed</button>
                                <div className="flex-shrink-0 w-px h-4 bg-gray-200/60 mx-1" />
                                <button onClick={selectAllFilters} className="flex-shrink-0 px-3 py-2.5 rounded-full text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-100/50 transition-colors">All</button>
                                <button onClick={clearStatusFilters} className="flex-shrink-0 px-4 py-2.5 rounded-full text-[9px] font-bold uppercase tracking-widest text-[#E08E5F] hover:bg-[#E08E5F]/10 transition-colors">Clear</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`absolute inset-0 pointer-events-none z-30 transition-all duration-500 transform ${isMobile && !!selectedPropertyId ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'}`}>
                    <GlassHUD
                        viewMode={viewMode}
                        setViewMode={(mode) => {
                            setViewMode(mode);
                            if (mode === "satellite") setIs3D(false);
                        }}
                        is3D={is3D}
                        setIs3D={setIs3D}
                        onResetOrientation={() => {
                            const map = mapRef.current?.getMap();
                            if (map) map.easeTo({ bearing: 0, pitch: 0, duration: 1000 });
                        }}
                        onZoomIn={() => mapRef.current?.getMap().zoomIn()}
                        onZoomOut={() => mapRef.current?.getMap().zoomOut()}
                        isPitchActive={isPitchActive}
                        currentVibeZone={currentVibeZone}
                        isTrayExpanded={isTrayExpanded}
                        setIsTrayExpanded={setIsTrayExpanded}
                        isMobile={isMobile}
                        zoom={viewState.zoom}
                    />
                </div>

                {selectedPropertyId && (
                    <PropertyCardSheet
                        propertyId={selectedPropertyId}
                        onClose={handleCloseSheet}
                        onClaimSuccess={handleClaimSuccess}
                        onRefreshPins={async () => refreshIntentForProperty()}
                        initialOpenMode={pendingOpenMode}
                        initialConversationId={pendingConversationId}
                        onSelectNeighbour={(neighbourId, lat, lon) => {
                            handleOpenProperty({ propertyId: neighbourId, lat, lon, openMode: "card" });
                        }}
                        mapRef={mapRef}
                        isMobile={isMobile}
                    />
                )}

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

PropertyMap.displayName = "PropertyMap";

export default PropertyMap;
