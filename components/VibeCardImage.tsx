"use client";

import React, { useState, useEffect } from "react";
import { getVibeAssetUrl } from "@/lib/vibeZones";

interface VibeCardImageProps {
    assetKey: string;
    altText: string;
}

export function VibeCardImage({ assetKey, altText }: VibeCardImageProps) {
    const [validUrls, setValidUrls] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        const types: ('hero' | 'support1' | 'support2')[] = ['hero', 'support1', 'support2'];
        const candidates = types.map(type => getVibeAssetUrl(assetKey, type));

        const validateImage = (url: string): Promise<string | null> => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = url;
                img.onload = () => resolve(url);
                img.onerror = () => resolve(null);
            });
        };

        Promise.all(candidates.map(validateImage))
            .then(results => {
                if (isMounted) {
                    // Filter out nulls
                    const available = results.filter((url): url is string => url !== null);
                    setValidUrls(available);
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [assetKey]);

    // Editorial Placeholder (Gray) - shown while loading or if no images found
    if (loading || validUrls.length === 0) {
        return (
            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                {/* Only show 'loading' or empty state if strictly necessary, but for valid zones we expect images. 
                     Keeping it clean/empty as a fallback to avoid UI flicker or ugly error states. */}
            </div>
        );
    }

    // Single Static Image
    if (validUrls.length === 1) {
        return (
            <img
                src={validUrls[0]}
                alt={altText}
                className="w-full h-full object-cover"
                loading="lazy"
            />
        );
    }

    // Carousel (2+ images)
    // Behavior: Manual horizontal scroll (snap), no dots, no arrows.
    return (
        <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
            {validUrls.map((url, index) => (
                <div key={url} className="w-full flex-shrink-0 snap-center h-full">
                    <img
                        src={url}
                        alt={`${altText} ${index + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                </div>
            ))}
        </div>
    );
}
