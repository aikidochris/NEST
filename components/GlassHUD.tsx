"use client";

import React from "react";
import { getVibeAssetUrl } from "@/lib/vibeZones";
import { Tooltip } from "./Tooltip";
import { VibeCardImage } from "./VibeCardImage";

// =============================================================================
// ZONE C: UTILITY CLUSTER (Bottom-Right)
// FIXED positioning with viewport constraints to prevent overflow
// Stacking Order: Compass → Zoom → Sat/3D Toggle
// =============================================================================

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
    isMobile?: boolean;
    zoom?: number;
    selectedPropertyId: string | null;
    heatmapLens: 'pulse' | 'watching' | 'ready' | 'stories';
    setHeatmapLens: (lens: 'pulse' | 'watching' | 'ready' | 'stories') => void;
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
    setIsTrayExpanded,
    isMobile = false,
    zoom = 14,
    selectedPropertyId,
    heatmapLens,
    setHeatmapLens
}: GlassHUDProps) {

    // Zoom Band Logic for Auto-Collapse
    const lastBandRef = React.useRef<number>(1);

    React.useEffect(() => {
        let currentBand = 1;
        if (zoom < 13) currentBand = 0;
        else if (zoom >= 15) currentBand = 2;
        else currentBand = 1;

        if (currentBand !== lastBandRef.current) {
            setIsTrayExpanded(false);
            lastBandRef.current = currentBand;
        }
    }, [zoom, setIsTrayExpanded]);

    // Editorial button styling - calm, contrast/weight for active states
    const btnBase = "w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-95";
    const btnActive = "bg-[#1B1B1B] text-white";
    const btnInactive = "bg-white/80 text-[#6B6B6B] hover:bg-white hover:text-[#1B1B1B]";

    return (
        <>
            {/* ================================================================== */}
            {/* ZONE C: UTILITY CLUSTER (Bottom-Right) */}
            {/* FIXED positioning with max-height constraint */}
            {/* Responsive: reduced gaps on small viewports */}
            {/* ================================================================== */}
            <div
                className="fixed z-50"
                style={{
                    right: '20px',
                    bottom: isMobile ? '100px' : '80px',
                    maxHeight: 'calc(100vh - 140px)',
                    overflowY: 'auto',
                    pointerEvents: 'auto'
                }}
            >
                <div className="flex flex-col gap-1 p-1.5 bg-white/90 backdrop-blur-[12px] border border-[#E5E5E5] rounded-xl shadow-sm">

                    {/* Compass / Orientation Reset */}
                    <Tooltip content="Reset map orientation." side="left">
                        <button
                            onClick={onResetOrientation}
                            className={`${btnBase} ${isPitchActive ? btnActive : btnInactive}`}
                            aria-label="Reset Orientation"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </Tooltip>

                    {/* Divider */}
                    <div className="w-full h-px bg-[#E5E5E5] my-0.5" />

                    {/* Zoom In */}
                    <Tooltip content="Zoom in." side="left">
                        <button
                            onClick={onZoomIn}
                            className={`${btnBase} ${btnInactive}`}
                            aria-label="Zoom In"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                        </button>
                    </Tooltip>

                    {/* Zoom Out */}
                    <Tooltip content="Zoom out." side="left">
                        <button
                            onClick={onZoomOut}
                            className={`${btnBase} ${btnInactive}`}
                            aria-label="Zoom Out"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                            </svg>
                        </button>
                    </Tooltip>

                    {/* Divider */}
                    <div className="w-full h-px bg-[#E5E5E5] my-0.5" />

                    {/* Satellite Toggle */}
                    <Tooltip content={viewMode === 'satellite' ? "Switch to map view." : "Switch to satellite view."} side="left">
                        <button
                            onClick={() => setViewMode(viewMode === 'satellite' ? 'paper' : 'satellite')}
                            className={`${btnBase} ${viewMode === 'satellite' ? btnActive : btnInactive}`}
                            aria-label="Toggle Satellite"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12c0-4 4-8 8-8s8 4 8 8-4 8-8 8-8-4-8-8z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4c2 2 2 6 0 8s-2 6 0 8M4 12c4 2 8 2 16 0" />
                            </svg>
                        </button>
                    </Tooltip>

                    {/* 3D Toggle */}
                    <Tooltip content="Switch to 3D view." side="left">
                        <button
                            onClick={() => setIs3D(!is3D)}
                            className={`${btnBase} ${is3D ? btnActive : btnInactive}`}
                            aria-label="Toggle 3D"
                            title={is3D ? 'Disable 3D' : 'Enable 3D'}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* ================================================================== */}
            {/* ZONE B: AREA CONTEXT STRIP (Bottom-Left) */}
            {/* Surface 1: Area name (passive) | Surface 2: Lens selector (interactive) */}
            {/* ================================================================== */}
            <div
                className={`absolute z-50 flex flex-col gap-3 transition-all duration-300 ${isMobile && !!selectedPropertyId ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}
                style={{ left: '20px', bottom: '80px', pointerEvents: 'auto', maxWidth: '200px' }}
            >


                {/* Surface 2: Lens Selector (Interactive - color-coded) */}
                <div className="flex flex-col bg-white/90 backdrop-blur-[12px] border border-[#E5E5E5] rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 pt-3 pb-2 text-[9px] font-bold uppercase tracking-[0.15em] text-[#999] border-b border-[#E5E5E5] w-full">
                        Lens
                    </div>

                    {/* Pulse (Early interest) - heat_weight */}
                    <Tooltip content="A gentle pulse showing where people have been starting to look and interact lately." side="right">
                        <button
                            onClick={() => setHeatmapLens('pulse')}
                            className={`w-full px-4 py-2.5 text-left text-[13px] transition-all duration-200 flex items-center gap-2 ${heatmapLens === 'pulse'
                                ? 'bg-[#E08E5F] text-white font-semibold'
                                : 'text-[#4A4A4A] hover:bg-[#F5F5F5] active:bg-[#EBEBEB]'
                                }`}
                        >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${heatmapLens === 'pulse' ? 'bg-white' : 'bg-[#E08E5F]'}`} />
                            Early interest
                        </button>
                    </Tooltip>

                    {/* Watching (Being followed) - interest_weight */}
                    <Tooltip content="Homes and streets that are attracting attention right now." side="right">
                        <button
                            onClick={() => setHeatmapLens('watching')}
                            className={`w-full px-4 py-2.5 text-left text-[13px] transition-all duration-200 flex items-center gap-2 ${heatmapLens === 'watching'
                                ? 'bg-[#E08E5F] text-white font-semibold'
                                : 'text-[#4A4A4A] hover:bg-[#F5F5F5] active:bg-[#EBEBEB]'
                                }`}
                        >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${heatmapLens === 'watching' ? 'bg-white' : 'bg-[#E08E5F]'}`} />
                            Being followed
                        </button>
                    </Tooltip>

                    {/* Ready (Open to talking) - readiness_weight */}
                    <Tooltip content="Homes where owners are currently open to conversations, even if they’re not listed." side="right">
                        <button
                            onClick={() => setHeatmapLens('ready')}
                            className={`w-full px-4 py-2.5 text-left text-[13px] transition-all duration-200 flex items-center gap-2 ${heatmapLens === 'ready'
                                ? 'bg-[#E08E5F] text-white font-semibold'
                                : 'text-[#4A4A4A] hover:bg-[#F5F5F5] active:bg-[#EBEBEB]'
                                }`}
                        >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${heatmapLens === 'ready' ? 'bg-white' : 'bg-[#E08E5F]'}`} />
                            Open to talking
                        </button>
                    </Tooltip>

                    {/* Stories (Local stories) - activity_weight */}
                    <Tooltip content="Places where people have been sharing updates about their home or street." side="right">
                        <button
                            onClick={() => setHeatmapLens('stories')}
                            className={`w-full px-4 py-2.5 pb-3 text-left text-[13px] transition-all duration-200 flex items-center gap-2 ${heatmapLens === 'stories'
                                ? 'bg-[#E08E5F] text-white font-semibold'
                                : 'text-[#4A4A4A] hover:bg-[#F5F5F5] active:bg-[#EBEBEB]'
                                }`}
                        >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${heatmapLens === 'stories' ? 'bg-white' : 'bg-[#E08E5F]'}`} />
                            Local stories
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* Mobile: Compact cluster */}
            {isMobile && (
                <div
                    className="fixed z-50"
                    style={{
                        right: '12px',
                        bottom: '100px',
                        maxHeight: 'calc(100vh - 180px)',
                        overflowY: 'auto',
                        pointerEvents: 'auto'
                    }}
                >
                    <div className="flex flex-col gap-0.5 p-1 bg-white/90 backdrop-blur-[12px] border border-[#E5E5E5] rounded-lg shadow-sm">
                        <button
                            onClick={onResetOrientation}
                            className={`${btnBase} w-8 h-8 ${isPitchActive ? btnActive : btnInactive}`}
                            aria-label="Reset Orientation"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                        <button
                            onClick={onZoomIn}
                            className={`${btnBase} w-8 h-8 ${btnInactive}`}
                            aria-label="Zoom In"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                        </button>
                        <button
                            onClick={onZoomOut}
                            className={`${btnBase} w-8 h-8 ${btnInactive}`}
                            aria-label="Zoom Out"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* ================================================================== */}
            {/* CENTER-BOTTOM VIBE PILL - Hero interaction for area context */}
            {/* Clickable, themed, shows area name + descriptor + lens indicator */}
            {/* SHOWS: Area Content (<13) OR Neighbourhood Content (>=13) */}
            {/* ================================================================== */}
            {currentVibeZone && zoom >= 11 && (
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!isTrayExpanded) setIsTrayExpanded(true);
                    }}
                    className={`fixed z-50 left-1/2 -translate-x-1/2 shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden pointer-events-auto ${isTrayExpanded
                        ? 'w-[320px] max-h-[600px] rounded-3xl bg-white cursor-default'
                        : 'w-auto max-h-[60px] rounded-full cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                    style={{
                        bottom: isMobile ? '120px' : '100px',
                        backgroundColor: isTrayExpanded ? '#ffffff' : (zoom < 13 ? '#4A7C59' : (currentVibeZone.themeColor || '#4A7C59')),
                    }}
                >
                    {/* COLLAPSED STATE CONTENT */}
                    <div className={`flex items-center gap-3 px-5 py-3 transition-opacity duration-300 ${isTrayExpanded ? 'opacity-0 absolute pointer-events-none' : 'opacity-100 delay-100'}`}>
                        {/* Location pin icon */}
                        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>

                        {/* Area name + descriptor */}
                        <div className="flex flex-col items-start text-left whitespace-nowrap">
                            <span className="text-white font-semibold text-[14px] leading-tight">
                                {zoom < 13 ? "North Tyneside" : currentVibeZone.name}
                            </span>
                            <span className="text-white/70 text-[11px] font-medium">
                                {zoom < 13 ? "Coastal region" : currentVibeZone.punchline}
                            </span>
                        </div>

                        {/* Chevron */}
                        <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                    </div>

                    {/* EXPANDED STATE CONTENT */}
                    <div className={`flex flex-col w-full transition-all duration-500 ${isTrayExpanded ? 'opacity-100 translate-y-0 delay-150' : 'opacity-0 translate-y-4 absolute pointer-events-none'}`}>
                        {/* Image Header */}
                        <div className="relative h-40 w-full bg-gray-200 overflow-hidden">
                            <VibeCardImage
                                assetKey={zoom < 13 ? "Tynemouth Village" : currentVibeZone.assetKey}
                                altText={zoom < 13 ? "North Tyneside" : currentVibeZone.name}
                            />

                            {/* Header Text Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                            <div className="absolute bottom-3 left-4 right-4 text-white z-10">
                                {zoom < 13 ? (
                                    // AREA VIEW (Low Zoom)
                                    <>
                                        <h3 className="font-bold text-lg leading-tight drop-shadow-sm">North Tyneside</h3>
                                        <p className="text-xs font-medium text-white/90 drop-shadow-sm">Coastal, settled, quietly connected</p>
                                    </>
                                ) : (
                                    // NEIGHBOURHOOD / LOCAL VIEW (Mid/High Zoom)
                                    <>
                                        <h3 className="font-bold text-lg leading-tight drop-shadow-sm">{currentVibeZone.name}</h3>
                                        <p className="text-xs font-medium text-white/90 drop-shadow-sm">{currentVibeZone.punchline}</p>
                                    </>
                                )}
                            </div>

                            {/* Close Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsTrayExpanded(false);
                                }}
                                className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-sm flex items-center justify-center transition-colors text-white"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="p-4 flex flex-col gap-3">
                            {zoom < 13 ? (
                                // AREA VIEW CONTENT
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    An established stretch of coastline and neighbourhoods where people tend to stay put.
                                    Life here centres on schools, sea air, and familiar streets — calm, but never cut off.
                                </p>
                            ) : (
                                // NEIGHBOURHOOD / LOCAL VIEW CONTENT
                                <>
                                    {/* Tags */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {currentVibeZone.tags.slice(0, 3).map(tag => (
                                            <span key={tag} className="px-2 py-1 bg-gray-50 text-gray-500 rounded-md text-[10px] uppercase tracking-wider font-bold border border-gray-100">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>

                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        {currentVibeZone.description}
                                    </p>

                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Typical Price</span>
                                        <span className="text-sm font-bold text-gray-900">{currentVibeZone.priceBand}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
