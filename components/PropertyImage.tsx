"use client";

import { type ImageVisibility } from "@/types/property";

// =============================================================================
// PROPERTY IMAGE COMPONENT
// Shared component for cover photos, placeholders, and locked album tiles.
// =============================================================================

interface PropertyImageProps {
    /** Image URL (null/undefined shows placeholder) */
    src?: string | null;
    /** Alt text for accessibility */
    alt: string;
    /** Aspect ratio class (default: 16:9) */
    aspectRatio?: "16:9" | "4:3" | "1:1";
    /** Image visibility (affects locked tile display) */
    visibility?: ImageVisibility;
    /** Whether this is a locked tile that should show lock UI */
    isLocked?: boolean;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Shared image component with designed placeholder and locked tile support.
 * - Shows cover photo if URL provided
 * - Shows soft gradient placeholder with house icon if no URL
 * - Shows locked tile UI for non-public images
 */
export function PropertyImage({
    src,
    alt,
    aspectRatio = "16:9",
    visibility = "public",
    isLocked = false,
    className = "",
}: PropertyImageProps) {
    const aspectClass = {
        "16:9": "aspect-video",
        "4:3": "aspect-[4/3]",
        "1:1": "aspect-square",
    }[aspectRatio];

    // Locked tile UI (for non-public images)
    if (isLocked) {
        return (
            <div
                className={`${aspectClass} bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-lg flex flex-col items-center justify-center text-center p-4 ${className}`}
            >
                {/* Lock icon */}
                <svg
                    className="w-8 h-8 text-gray-400 dark:text-gray-500 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                </svg>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Photos shared in chat
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    The owner shares these when you&apos;re speaking.
                </p>
            </div>
        );
    }

    // No image - show designed placeholder
    if (!src) {
        return (
            <div
                className={`${aspectClass} bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-800 dark:via-gray-750 dark:to-gray-800 rounded-lg flex items-center justify-center ${className}`}
            >
                {/* House icon placeholder */}
                <svg
                    className="w-16 h-16 text-gray-300 dark:text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                </svg>
            </div>
        );
    }

    // Image provided - render it
    return (
        <div className={`${aspectClass} relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 ${className}`}>
            <img
                src={src}
                alt={alt}
                className="w-full h-full object-cover"
                loading="lazy"
            />
        </div>
    );
}

// =============================================================================
// EXPORTED PLACEHOLDER FOR REUSE
// =============================================================================

/**
 * Placeholder SVG as data URL for inline use where component isn't practical.
 */
export const PROPERTY_PLACEHOLDER_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23F3F4F6'/%3E%3Cstop offset='50%25' stop-color='%23F9FAFB'/%3E%3Cstop offset='100%25' stop-color='%23F3F4F6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='400' height='225'/%3E%3Cpath d='M200 80l40 35v50h-30v-35h-20v35h-30v-50z' fill='%23D1D5DB'/%3E%3Cpath d='M200 65l55 48h-10l-45-40-45 40h-10z' fill='%23D1D5DB'/%3E%3C/svg%3E";
