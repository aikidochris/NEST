"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Map, { Source, Layer, ViewStateChangeEvent, MapRef } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BBox } from "@/types/property";
import { AuthControls } from "@/components/AuthControls";
import { PropertyCardSheet } from "@/components/PropertyCardSheet";
import { useAuth } from "@/app/AuthProvider";

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

export default function PropertyMap() {
    const mapRef = useRef<MapRef>(null);
    const [viewState, setViewState] = useState(DEFAULT_VIEW);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
    const [myClaimsData, setMyClaimsData] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
    const [clusterData, setClusterData] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);

    const { accessToken } = useAuth();

    // Abort controllers
    const claimsAbortRef = useRef<AbortController | null>(null);
    const clusterAbortRef = useRef<AbortController | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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
            }, DEBOUNCE_MS);
        },
        [fetchMyClaims, fetchClusterData]
    );

    // Initial fetch on map load + set up cursor handlers
    const handleLoad = useCallback(
        (evt: { target: maplibregl.Map }) => {
            const map = evt.target;
            const bounds = map.getBounds();

            if (bounds) {
                const bbox = computeBBox(bounds);
                fetchMyClaims(bbox);
                fetchClusterData(bbox, map.getZoom());
            }

            // Pointer cursor on interactive layers
            const interactiveLayers = ["property-points", "my-claims", "clusters"];
            interactiveLayers.forEach((layer) => {
                map.on("mouseenter", layer, () => {
                    map.getCanvas().style.cursor = "pointer";
                });
                map.on("mouseleave", layer, () => {
                    map.getCanvas().style.cursor = "";
                });
            });
        },
        [fetchMyClaims, fetchClusterData]
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
                    const zoom = await source.getClusterExpansionZoom(clusterId);
                    const geometry = clusterFeature.geometry as GeoJSON.Point;

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
            const baseFeature = features.find((f) => f.layer?.id === "property-points");
            const unclusteredFeature = features.find((f) => f.layer?.id === "unclustered-point");

            const feature = myClaimFeature || baseFeature || unclusteredFeature;
            if (!feature) return;

            const propertyId = feature.properties?.property_id;
            if (propertyId) {
                setSelectedPropertyId(propertyId);
            }
        },
        []
    );

    // Close property sheet
    const handleCloseSheet = useCallback(() => {
        setSelectedPropertyId(null);
    }, []);

    // After claim success, refetch my-claims overlay
    const handleClaimSuccess = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (map) {
            const bounds = map.getBounds();
            if (bounds) {
                fetchMyClaims(computeBBox(bounds));
            }
        }
    }, [fetchMyClaims]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            claimsAbortRef.current?.abort();
            clusterAbortRef.current?.abort();
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
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

    // Show clusters layer only at low zoom
    const showClusters = viewState.zoom <= CLUSTER_MAX_ZOOM;

    return (
        <div className="relative w-full h-screen">
            <Map
                ref={mapRef}
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                onMoveEnd={handleMoveEnd}
                onLoad={handleLoad}
                onClick={handleMapClick}
                interactiveLayerIds={["property-points", "my-claims", "clusters", "unclustered-point"]}
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
                            "circle-color": [
                                "case",
                                ["get", "is_claimed"], "#8b5cf6",
                                "#3b82f6"
                            ],
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
                            "circle-opacity": [
                                "interpolate", ["linear"], ["zoom"],
                                14.75, 0,
                                15.25, 1
                            ],
                            "circle-stroke-opacity": [
                                "interpolate", ["linear"], ["zoom"],
                                14.75, 0,
                                15.25, 1
                            ],
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
                                "circle-color": [
                                    "case",
                                    ["get", "is_claimed"], "#8b5cf6",
                                    "#3b82f6"
                                ],
                                "circle-radius": 4,
                                "circle-stroke-width": 1,
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
                    </Source>
                )}

                {/* GeoJSON source for user's claimed properties (green overlay) */}
                <Source
                    id="my-claims-source"
                    type="geojson"
                    data={myClaimsData}
                >
                    <Layer
                        id="my-claims"
                        type="circle"
                        paint={{
                            "circle-color": "#22c55e",
                            "circle-radius": [
                                "interpolate", ["linear"], ["zoom"],
                                8, 3,
                                12, 6,
                                16, 9
                            ],
                            "circle-stroke-width": [
                                "interpolate", ["linear"], ["zoom"],
                                8, 0.5,
                                12, 2,
                                16, 2.5
                            ],
                            "circle-stroke-color": "#fff",
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
        </div>
    );
}
