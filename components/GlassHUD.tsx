"use client";

import React from "react";
import { getVibeAssetUrl } from "@/lib/vibeZones";

interface GlassHUDProps {
    viewMode: "paper" | "satellite";
    setViewMode: (mode: "paper" | "satellite") => void;
    is3D: boolean;
    setIs3D: (is3D: boolean) => void;
    onResetOrientation: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    isPitchActive: boolean;
    currentVibeZone: import("@/lib/vibeZones").VibeZone | null;
    isTrayExpanded: boolean;
    setIsTrayExpanded: (expanded: boolean) => void;
}

export function GlassHUD({
    viewMode,
    setViewMode,
    is3D,
    setIs3D,
    onResetOrientation,
    onZoomIn,
    onZoomOut,
    isPitchActive,
    currentVibeZone,
    isTrayExpanded,
    setIsTrayExpanded
}: GlassHUDProps) {

    const [isPulsing, setIsPulsing] = React.useState(false);
    const [isImageLoaded, setIsImageLoaded] = React.useState(false);
    const [imageLoadError, setImageLoadError] = React.useState(false);
    const [showSkeleton, setShowSkeleton] = React.useState(false);

    // Reset image load state when zone changes
    React.useEffect(() => {
        setIsImageLoaded(false);
        setImageLoadError(false);
        setShowSkeleton(false);
    }, [currentVibeZone?.id]);

    // Luminous Skeleton fallback after 2 seconds
    React.useEffect(() => {
        if (isTrayExpanded && !isImageLoaded && !imageLoadError) {
            const timer = setTimeout(() => {
                setShowSkeleton(true);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [isTrayExpanded, isImageLoaded, imageLoadError]);

    // Horizon Pulse Effect
    React.useEffect(() => {
        if (currentVibeZone?.id) {
            setIsPulsing(true);
            const timer = setTimeout(() => setIsPulsing(false), 500);
            return () => clearTimeout(timer);
        }
    }, [currentVibeZone?.id]);

    // Common button style
    const btnBase = "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 backdrop-blur-xl border shadow-lg pointer-events-auto";
    const btnActive = "border-[#E08E5F] bg-white shadow-[0_0_15px_rgba(224,142,95,0.4)]";
    const btnInactive = "border-white/20 bg-white/70 hover:bg-white/90";

    return (
        <>
            {/* ================================================================== */}
            {/* LEFT CONTROL CLUSTER: View Modes */}
            {/* ================================================================== */}
            <div className="absolute bottom-24 left-6 z-50 flex flex-col gap-3 pointer-events-none">
                {/* Paper View */}
                <button
                    onClick={() => setViewMode("paper")}
                    className={`${btnBase} ${viewMode === 'paper' ? btnActive : btnInactive}`}
                    aria-label="Paper View"
                >
                    <svg className={`w-5 h-5 transition-colors ${viewMode === 'paper' ? 'text-[#E08E5F]' : 'text-ink/60'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
                    </svg>
                </button>

                {/* Satellite View */}
                <button
                    onClick={() => setViewMode("satellite")}
                    className={`${btnBase} ${viewMode === 'satellite' ? btnActive : btnInactive}`}
                    aria-label="Satellite View"
                >
                    <svg className={`w-5 h-5 transition-colors ${viewMode === 'satellite' ? 'text-[#E08E5F]' : 'text-ink/60'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 12c0-4 4-8 8-8s8 4 8 8-4 8-8 8-8-4-8-8z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4c2 2 2 6 0 8s-2 6 0 8M4 12c4 2 8 2 16 0" />
                    </svg>
                </button>
            </div>

            {/* ================================================================== */}
            {/* RIGHT CONTROL CLUSTER: Navigation & 3D */}
            {/* ================================================================== */}
            <div className="absolute bottom-24 right-6 z-50 flex flex-col gap-3 pointer-events-none">
                {/* 3D Toggle */}
                <button
                    onClick={() => setIs3D(!is3D)}
                    className={`${btnBase} ${is3D ? "border-[#E08E5F] bg-white shadow-[0_0_15px_rgba(224,142,95,0.5)]" : btnInactive}`}
                    aria-label="Toggle 3D"
                >
                    <svg className={`w-5 h-5 transition-all duration-300 ${is3D ? "text-[#E08E5F] drop-shadow-[0_0_6px_rgba(224,142,95,0.6)]" : "text-ink/60"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                </button>

                {/* Zoom In */}
                <button
                    onClick={onZoomIn}
                    className={`${btnBase} ${btnInactive} text-ink/70 hover:text-ink`}
                    aria-label="Zoom In"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                </button>

                {/* Zoom Out */}
                <button
                    onClick={onZoomOut}
                    className={`${btnBase} ${btnInactive} text-ink/70 hover:text-ink`}
                    aria-label="Zoom Out"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 12H6" />
                    </svg>
                </button>

                {/* Compass */}
                <button
                    onClick={onResetOrientation}
                    className={`${btnBase} ${isPitchActive ? "border-[#E08E5F]/50 bg-white/90 shadow-[0_0_12px_rgba(224,142,95,0.3)]" : btnInactive}`}
                    aria-label="Reset Orientation"
                >
                    <svg className={`w-5 h-5 transition-colors ${isPitchActive ? 'text-[#E08E5F]' : 'text-ink/60'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                </button>
            </div>

            {/* ================================================================== */}
            {/* HORIZON ANCHOR - Default: Bottom-24, Centered */}
            {/* Wrapper handles positioning (Layout) */}
            {/* Inner div handles visual/scale (Animation) */}
            {/* ================================================================== */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex justify-center pointer-events-none">
                <div
                    className={`
                        pointer-events-auto cursor-pointer
                        transition-all duration-500 ease-[0.19,1,0.22,1] origin-bottom
                        ${isTrayExpanded
                            ? "w-[400px] rounded-3xl shadow-2xl"
                            : "min-w-[280px] rounded-full shadow-xl hover:shadow-2xl hover:scale-[1.02]"}
                        ${currentVibeZone ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}
                    `}
                    style={{
                        backgroundColor: currentVibeZone
                            ? `${currentVibeZone.themeColor}${isTrayExpanded ? 'F5' : 'CC'}`
                            : "rgba(255,255,255,0.9)",
                        backdropFilter: "blur(24px)",
                        border: `1px solid ${currentVibeZone ? `${currentVibeZone.themeColor}40` : 'rgba(255,255,255,0.3)'}`,
                        boxShadow: isPulsing
                            ? `0 0 40px ${currentVibeZone?.themeColor}80`
                            : isTrayExpanded
                                ? "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
                                : "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                        transform: isPulsing ? "scale(1.05)" : "scale(1)"
                    }}
                    onClick={() => !isTrayExpanded && setIsTrayExpanded(true)}
                >
                    {/* COLLAPSED STATE: Horizon Pill */}
                    {!isTrayExpanded && (
                        <div className="px-6 py-3 flex items-center justify-center gap-3">
                            {/* Location Pin */}
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center border border-white/40"
                                style={{ backgroundColor: `${currentVibeZone?.themeColor}80` }}
                            >
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>

                            {/* Cross-fading Text */}
                            <div className="flex flex-col items-center text-center">
                                <span
                                    key={currentVibeZone?.id || 'none'}
                                    className="text-white font-bold text-base tracking-wide animate-in fade-in slide-in-from-bottom-1 duration-500 whitespace-nowrap"
                                >
                                    {currentVibeZone?.name || "Exploring..."}
                                </span>
                                <span className="text-white/80 text-[10px] font-semibold tracking-[0.2em] uppercase whitespace-nowrap">
                                    {currentVibeZone?.punchline || ""}
                                </span>
                            </div>

                            {/* Expand Chevron */}
                            <svg className="w-5 h-5 text-white/70 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        </div>
                    )}

                    {/* EXPANDED STATE: Full Vibe Card */}
                    {isTrayExpanded && currentVibeZone && (
                        <div className="flex flex-col w-full overflow-hidden rounded-3xl animate-in fade-in zoom-in-95 duration-500">
                            {/* Console Audit */}
                            {(() => {
                                console.log("Hearth Asset Request:", {
                                    zone: currentVibeZone.id,
                                    fullUrl: getVibeAssetUrl(currentVibeZone.assetKey)
                                });
                                return null;
                            })()}
                            {/* Hero Image */}
                            <div className="relative w-full h-[180px] bg-black/20 overflow-hidden">
                                {currentVibeZone.assetKey && !imageLoadError ? (
                                    <div className="relative w-full h-full">
                                        <img
                                            src={getVibeAssetUrl(currentVibeZone.assetKey)}
                                            alt={currentVibeZone.name}
                                            loading="eager"
                                            onLoad={() => setIsImageLoaded(true)}
                                            onError={() => {
                                                console.error("Hero image failed to load:", getVibeAssetUrl(currentVibeZone.assetKey));
                                                setImageLoadError(true);
                                                setIsImageLoaded(true); // Stop the loading state
                                            }}
                                            className={`
                                                w-full h-full object-cover object-center transition-opacity duration-300
                                                ${isImageLoaded ? "opacity-100" : "opacity-0"}
                                            `}
                                            style={{
                                                WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
                                                maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)"
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className="absolute inset-0 flex items-center justify-center"
                                        style={{
                                            background: showSkeleton || imageLoadError
                                                ? `linear-gradient(135deg, ${currentVibeZone.themeColor}40 0%, ${currentVibeZone.themeColor}20 50%, ${currentVibeZone.themeColor}40 100%)`
                                                : 'rgba(255,255,255,0.05)',
                                            backdropFilter: 'blur(8px)'
                                        }}
                                    >
                                        {!showSkeleton && !imageLoadError && (
                                            <div className="flex flex-col items-center gap-2 animate-pulse">
                                                <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                                            </div>
                                        )}
                                        {(showSkeleton || imageLoadError) && (
                                            <div
                                                className="absolute inset-0 animate-pulse"
                                                style={{
                                                    background: `linear-gradient(180deg, ${currentVibeZone.themeColor}60 0%, ${currentVibeZone.themeColor}30 100%)`
                                                }}
                                            />
                                        )}
                                    </div>
                                )}

                                {/* Gradient Overlay - Softening the text area transition further */}
                                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

                                {/* VALUE BADGE - Top Right, Prominent */}
                                <div className="absolute top-4 right-4 z-20 px-4 py-2 rounded-xl bg-white/95 backdrop-blur-md shadow-2xl border border-white/30 animate-in fade-in zoom-in duration-700 delay-200">
                                    <span className="text-sm font-black tracking-wider text-[#E08E5F] uppercase">
                                        {currentVibeZone.priceBand}
                                    </span>
                                </div>

                                {/* Close Button */}
                                <button
                                    className="absolute top-4 left-4 z-20 p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-all backdrop-blur-md active:scale-90"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsTrayExpanded(false);
                                    }}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>

                                {/* Title Overlay */}
                                <div className="absolute bottom-4 left-5 right-5">
                                    <h3 className="text-white font-bold text-2xl tracking-tight drop-shadow-lg">
                                        {currentVibeZone.name}
                                    </h3>
                                    <p className="text-white/80 text-xs font-semibold tracking-[0.2em] uppercase mt-1">
                                        {currentVibeZone.punchline}
                                    </p>
                                </div>
                            </div>

                            {/* Content Body */}
                            <div className="p-5 pt-4">
                                {/* Vibe Tags */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {currentVibeZone.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase shadow-sm"
                                            style={{
                                                backgroundColor: `${currentVibeZone.themeColor}40`,
                                                color: 'rgba(255,255,255,0.95)',
                                                border: `1px solid ${currentVibeZone.themeColor}60`
                                            }}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                {/* Description */}
                                <p className="text-white/90 text-sm leading-relaxed font-medium">
                                    {currentVibeZone.description}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
