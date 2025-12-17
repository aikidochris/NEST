"use client";

import { useEffect, useCallback } from "react";

// =============================================================================
// PROPERTY IMAGE LIGHTBOX
// Simple fullscreen image viewer with dark backdrop.
// =============================================================================

interface PropertyImageLightboxProps {
    src: string;
    alt?: string;
    onClose: () => void;
}

/**
 * Simple lightbox for viewing property images.
 * Opens fullscreen with dark backdrop.
 * Close on click outside or Escape key.
 */
export function PropertyImageLightbox({
    src,
    alt = "Property photo",
    onClose,
}: PropertyImageLightboxProps) {
    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // Close on backdrop click
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90"
            onClick={handleBackdropClick}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 p-2 text-white/80 hover:text-white transition-colors"
                aria-label="Close"
            >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            {/* Image */}
            <img
                src={src}
                alt={alt}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />

            {/* Caption */}
            {alt && alt !== "Property photo" && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 rounded-lg">
                    <p className="text-white text-sm">{alt}</p>
                </div>
            )}
        </div>
    );
}
