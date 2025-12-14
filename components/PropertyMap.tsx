"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Map, { Source, Layer, ViewStateChangeEvent, MapRef } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BBox } from "@/types/property";
import { AuthControls } from "@/components/AuthControls";
import { PropertyCardSheet } from "@/components/PropertyCardSheet";
import { useAuth } from "@/app/AuthProvider";

// Free OpenStreetMap tile style
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// North Tyneside center as default
const DEFAULT_VIEW = {
    longitude: -1.5,
    latitude: 55.05,
    zoom: 12,
};

// Debounce delay for my-claims fetch
const DEBOUNCE_MS = 300;

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

// Empty GeoJSON for initial state
const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [],
};

export default function PropertyMap() {
    const mapRef = useRef<MapRef>(null);
    const [viewState, setViewState] = useState(DEFAULT_VIEW);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
    const [myClaimsData, setMyClaimsData] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);

    const { accessToken } = useAuth();

    // Abort controller for my-claims requests
    const abortControllerRef = useRef<AbortController | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch my-claims GeoJSON overlay
    const fetchMyClaims = useCallback(
        async (bbox: BBox) => {
            if (!accessToken) {
                setMyClaimsData(EMPTY_GEOJSON);
                return;
            }

            // Cancel any in-flight request
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }

            const controller = new AbortController();
            abortControllerRef.current = controller;

            try {
                const bboxParam = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
                const response = await fetch(`/api/my-claims?bbox=${bboxParam}`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    signal: controller.signal,
                });

                if (!response.ok) {
                    // Silently handle errors (user may not have claims)
                    setMyClaimsData(EMPTY_GEOJSON);
                    return;
                }

                const geojson = await response.json();
                setMyClaimsData(geojson);
            } catch (err) {
                // Ignore abort errors
                if (err instanceof Error && err.name === "AbortError") {
                    return;
                }
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

            // Clear existing timer
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            // Debounce my-claims fetch
            debounceTimerRef.current = setTimeout(() => {
                fetchMyClaims(bbox);
            }, DEBOUNCE_MS);
        },
        [fetchMyClaims]
    );

    // Initial fetch on map load + set up cursor handlers
    const handleLoad = useCallback(
        (evt: { target: maplibregl.Map }) => {
            const map = evt.target;
            const bounds = map.getBounds();

            if (bounds) {
                fetchMyClaims(computeBBox(bounds));
            }

            // Pointer cursor on interactive layers
            const interactiveLayers = ["property-points", "my-claims"];
            interactiveLayers.forEach((layer) => {
                map.on("mouseenter", layer, () => {
                    map.getCanvas().style.cursor = "pointer";
                });
                map.on("mouseleave", layer, () => {
                    map.getCanvas().style.cursor = "";
                });
            });
        },
        [fetchMyClaims]
    );

    // Handle map click - select property
    const handleMapClick = useCallback((evt: MapLayerMouseEvent) => {
        const features = evt.features;
        if (!features || features.length === 0) return;

        // Prefer my-claims layer if present (clicked on user's own property)
        const myClaimFeature = features.find((f) => f.layer?.id === "my-claims");
        const baseFeature = features.find((f) => f.layer?.id === "property-points");

        const feature = myClaimFeature || baseFeature;
        if (!feature) return;

        const propertyId = feature.properties?.property_id;
        if (propertyId) {
            setSelectedPropertyId(propertyId);
        }
    }, []);

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
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    // Update my-claims source data when it changes
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const source = map.getSource("my-claims-source") as GeoJSONSource | undefined;
        if (source) {
            source.setData(myClaimsData);
        }
    }, [myClaimsData]);

    return (
        <div className="relative w-full h-screen">
            <Map
                ref={mapRef}
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                onMoveEnd={handleMoveEnd}
                onLoad={handleLoad}
                onClick={handleMapClick}
                interactiveLayerIds={["property-points", "my-claims"]}
                style={{ width: "100%", height: "100%" }}
                mapStyle={MAP_STYLE}
            >
                {/* Vector tile source for all properties */}
                <Source
                    id="properties-vt"
                    type="vector"
                    tiles={[`${typeof window !== "undefined" ? window.location.origin : ""}/api/tiles/properties/{z}/{x}/{y}`]}
                    minzoom={0}
                    maxzoom={14}
                >
                    {/* Base property points: blue=unclaimed, purple=claimed */}
                    <Layer
                        id="property-points"
                        type="circle"
                        source-layer="properties"
                        paint={{
                            "circle-color": [
                                "case",
                                ["get", "is_claimed"], "#8b5cf6", // purple for claimed
                                "#3b82f6" // blue for unclaimed
                            ],
                            "circle-radius": [
                                "interpolate",
                                ["linear"],
                                ["zoom"],
                                8, 2,
                                12, 5,
                                16, 8
                            ],
                            "circle-stroke-width": [
                                "interpolate",
                                ["linear"],
                                ["zoom"],
                                8, 0.5,
                                12, 1.5,
                                16, 2
                            ],
                            "circle-stroke-color": "#fff",
                        }}
                    />
                </Source>

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
                            "circle-color": "#22c55e", // green for mine
                            "circle-radius": [
                                "interpolate",
                                ["linear"],
                                ["zoom"],
                                8, 3,
                                12, 6,
                                16, 9
                            ],
                            "circle-stroke-width": [
                                "interpolate",
                                ["linear"],
                                ["zoom"],
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
                            : "Vector tiles active"}
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
