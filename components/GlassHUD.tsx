"use client";

import React, { useState } from "react";

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

    return (
        <div className="absolute bottom-24 right-8 z-40 flex flex-col items-end gap-2 pointer-events-none">
            {/* VIBE SENTINEL TRAY */}
            <div
                className={`
                    relative z-40 transition-all duration-700 ease-[0.19,1,0.22,1] origin-bottom-right pointer-events-auto
                    ${currentVibeZone ? "translate-x-0 opacity-100 scale-100" : "translate-x-8 opacity-0 scale-95 pointer-events-none"}
                    ${isTrayExpanded ? "w-[340px] rounded-3xl p-0 overflow-hidden shadow-2xl mb-2" : "w-auto rounded-full px-4 py-2 border border-white/20 shadow-lg cursor-pointer mb-8 mr-12"}
                `}
                style={{
                    backgroundColor: currentVibeZone ? `${currentVibeZone.themeColor}${isTrayExpanded ? 'F2' : '90'}` : "rgba(255,255,255,0.1)",
                    backdropFilter: "blur(24px)",
                    transition: "background-color 0.5s ease-out, transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), width 0.5s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.5s ease-out",
                }}
                onClick={() => setIsTrayExpanded(!isTrayExpanded)}
            >
                {/* COLLAPSED STATE CONTENT (Visible when NOT expanded) */}
                {!isTrayExpanded && (
                    <div className="flex items-center gap-3 w-full">
                        <div className="flex flex-col items-end text-right min-w-[180px]">
                            <span className="text-white font-bold text-sm tracking-wide leading-none transition-all duration-500">
                                {currentVibeZone?.name || "Neighborhood"}
                            </span>
                            <span className="text-white/90 text-[10px] font-medium tracking-wider uppercase transition-all duration-500 delay-75">
                                {currentVibeZone?.punchline || "Exploring..."}
                            </span>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/30 backdrop-blur-md">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                    </div>
                )}

                {/* EXPANDED STATE CONTENT */}
                {isTrayExpanded && currentVibeZone && (
                    <div className="flex flex-col w-full h-full animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out">
                        {/* Hero Image Gallery */}
                        <div className="relative w-full h-[180px] bg-black/40">
                            {currentVibeZone.imageUrl ? (
                                <img src={currentVibeZone.imageUrl} alt={currentVibeZone.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-white/30 text-[10px] uppercase tracking-widest">
                                    Awaiting Imagery
                                </div>
                            )}

                            {/* Bottom edge fade info text area */}
                            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                            {/* Floating Title */}
                            <div className="absolute bottom-4 left-6 right-12 text-white">
                                <h3 className="font-bold text-2xl tracking-tight leading-tight">{currentVibeZone.name}</h3>
                                <p className="text-white/80 text-[11px] font-medium tracking-widest uppercase mt-0.5">{currentVibeZone.punchline}</p>
                            </div>

                            {/* Value Badge - High Contrast Price Band */}
                            <div className="absolute top-4 right-14 px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur-md shadow-xl border border-white/20 animate-in fade-in zoom-in duration-500 delay-300">
                                <span className="text-[10px] font-black tracking-[0.15em] text-ember uppercase whitespace-nowrap">
                                    {currentVibeZone.priceBand}
                                </span>
                            </div>

                            {/* Close Micro-interaction */}
                            <button
                                className="absolute top-4 right-4 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-all backdrop-blur-md group active:scale-90"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsTrayExpanded(false);
                                }}
                            >
                                <svg className="w-4 h-4 transition-transform group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Contextual Badges & Description */}
                        <div className="p-6 pt-5">
                            {/* Vibe Pills */}
                            <div className="flex flex-wrap gap-1.5 mb-5 uppercase">
                                {currentVibeZone.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wider text-black/80 shadow-sm"
                                        style={{ backgroundColor: `${currentVibeZone.themeColor}CC` }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            {/* Narrative Prose */}
                            <div className="text-[13px] leading-relaxed text-white/90 font-medium space-y-4">
                                <p className="drop-shadow-sm">{currentVibeZone.description}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* The Glass Pill - Enforced 48px width */}
            <div className="w-12 relative z-50 pointer-events-auto bg-[#F9F7F4]/80 backdrop-blur-[24px] border border-[#1B1B1B]/10 rounded-full shadow-lg py-2 flex flex-col gap-1 items-center">

                {/* GRAPHIC SWITCHER: Paper (Architectural Grid) */}
                <button
                    onClick={() => setViewMode("paper")}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-90 pointer-events-auto
                        ${viewMode === 'paper' ? 'border-[1.5px] border-[#E08E5F] bg-white shadow-[0_0_10px_rgba(224,142,95,0.3)]' : 'bg-transparent'}
                    `}
                    aria-label="Switch to Paper View"
                >
                    <svg className={`w-5 h-5 ${viewMode === 'paper' ? 'text-[#E08E5F]' : 'text-ink/60'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
                    </svg>
                </button>

                {/* GRAPHIC SWITCHER: Satellite (Topographical / Organic) */}
                <button
                    onClick={() => setViewMode("satellite")}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-90 pointer-events-auto
                        ${viewMode === 'satellite' ? 'border-[1.5px] border-[#E08E5F] bg-white shadow-[0_0_10px_rgba(224,142,95,0.3)]' : 'bg-transparent'}
                    `}
                    aria-label="Switch to Satellite View"
                >
                    <svg className={`w-5 h-5 ${viewMode === 'satellite' ? 'text-[#E08E5F]' : 'text-ink/60'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 12c0-4 4-8 8-8s8 4 8 8-4 8-8 8-8-4-8-8z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4c2 2 2 6 0 8s-2 6 0 8M4 12c4 2 8 2 16 0" />
                    </svg>
                </button>

                {/* Divider */}
                <div className="w-4 h-px bg-ink/10 my-1" />

                {/* 2. 3D Toggle - Ember Glow when active */}
                <button
                    onClick={() => setIs3D(!is3D)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 pointer-events-auto
                        ${is3D ? 'border-[1.5px] border-[#E08E5F] bg-white shadow-[0_0_12px_rgba(224,142,95,0.5)]' : 'bg-transparent hover:scale-110'}
                    `}
                    aria-label="Toggle 3D"
                >
                    <svg
                        className={`w-5 h-5 transition-all duration-300 ${is3D ? "text-[#E08E5F] drop-shadow-[0_0_8px_rgba(249,115,22,0.6)]" : "text-ink/60 group-hover:text-ink/70"}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                </button>

                {/* Divider */}
                <div className="w-4 h-px bg-ink/10" />

                {/* 3. Zoom Controls */}
                <div className="flex flex-col gap-0.5 my-1">
                    <button
                        onClick={onZoomIn}
                        className="p-1.5 rounded-full hover:bg-ink/5 transition-colors text-ink/70 hover:text-ink pointer-events-auto"
                        aria-label="Zoom In"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </button>
                    <button
                        onClick={onZoomOut}
                        className="p-1.5 rounded-full hover:bg-ink/5 transition-colors text-ink/70 hover:text-ink pointer-events-auto"
                        aria-label="Zoom Out"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 12H6" />
                        </svg>
                    </button>
                </div>

                {/* Divider */}
                <div className="w-4 h-px bg-ink/10" />

                {/* 4. Compass / Orientation */}
                <button
                    onClick={onResetOrientation}
                    className="p-2 rounded-full hover:bg-ink/5 transition-colors mt-1 pointer-events-auto"
                    aria-label="Reset Bearing"
                >
                    <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                </button>
            </div>
        </div >
    );
}
