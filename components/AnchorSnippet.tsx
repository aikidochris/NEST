"use client";

import { useEffect, useState } from "react";

interface AnchorData {
    id: string;
    name: string;
    subtype: string;
    metadata: {
        link?: string;
        ofsted?: string;
        connection?: string;
        feature?: string;
        [key: string]: unknown;
    };
    latitude: number;
    longitude: number;
}

interface AnchorSnippetProps {
    anchor: AnchorData;
    onClose: () => void;
    mapContainer?: HTMLElement | null;
}

/**
 * Minimalist overlay snippet for neighborhood anchors.
 * Appears near the anchor icon on click with name, subtype, and optional link.
 * Uses Morning Orbit animation for premium feel.
 */
export function AnchorSnippet({ anchor, onClose }: AnchorSnippetProps) {
    const [visible, setVisible] = useState(false);

    // Morning Orbit: fade in animation
    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 50);
        return () => clearTimeout(timer);
    }, []);

    // Get display subtitle based on subtype and metadata
    const getSubtitle = () => {
        if (anchor.subtype === "secondary" || anchor.subtype === "primary") {
            return anchor.metadata.ofsted
                ? `${anchor.subtype} · Ofsted: ${anchor.metadata.ofsted}`
                : anchor.subtype;
        }
        if (anchor.subtype === "metro" || anchor.subtype === "ferry") {
            return anchor.metadata.connection || anchor.subtype;
        }
        if (anchor.subtype === "park" || anchor.subtype === "coastal") {
            return anchor.metadata.feature || anchor.subtype;
        }
        return anchor.subtype;
    };

    // Get the link URL if available
    const getLink = () => {
        if (anchor.metadata.link) return anchor.metadata.link;
        // Generate useful links based on type
        if (anchor.subtype === "secondary" || anchor.subtype === "primary") {
            return `https://www.google.com/search?q=${encodeURIComponent(anchor.name + " ofsted")}`;
        }
        if (anchor.subtype === "metro") {
            return "https://www.nexus.org.uk/metro";
        }
        return null;
    };

    const link = getLink();

    return (
        <div
            className={`absolute z-50 pointer-events-auto transition-all duration-300 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                }`}
            style={{
                left: "50%",
                bottom: "calc(100% + 12px)",
                transform: "translateX(-50%)",
                minWidth: "180px",
                maxWidth: "260px"
            }}
        >
            <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200/50 p-3">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close"
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Content */}
                <div className="pr-4">
                    <h4 className="font-medium text-sm text-gray-900 leading-tight">
                        {anchor.name}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">
                        {getSubtitle()}
                    </p>
                </div>

                {/* Link button */}
                {link && (
                    <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-xs text-[#E08E5F] hover:text-[#c77a50] font-medium transition-colors"
                    >
                        Learn more →
                    </a>
                )}
            </div>

            {/* Speech bubble arrow */}
            <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-white/95 border-r border-b border-gray-200/50 rotate-45"
            />
        </div>
    );
}

// Type for anchor feature properties (from GeoJSON)
export interface AnchorFeatureProperties {
    id: string;
    name: string;
    anchor_type: string;
    subtype: string;
    postcode: string;
    metadata: string; // JSON string
}

// Convert feature to AnchorData
export function featureToAnchorData(
    feature: GeoJSON.Feature<GeoJSON.Point, AnchorFeatureProperties>
): AnchorData {
    return {
        id: feature.properties.id,
        name: feature.properties.name,
        subtype: feature.properties.subtype,
        metadata: JSON.parse(feature.properties.metadata || "{}"),
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0]
    };
}
