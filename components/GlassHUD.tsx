"use client";

import React, { useState } from "react";

interface GlassHUDProps {
    viewMode: "paper" | "blueprint" | "satellite";
    setViewMode: (mode: "paper" | "blueprint" | "satellite") => void;
    is3D: boolean;
    setIs3D: (is3D: boolean) => void;
    onResetOrientation: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
}

export function GlassHUD({
    viewMode,
    setViewMode,
    is3D,
    setIs3D,
    onResetOrientation,
    onZoomIn,
    onZoomOut
}: GlassHUDProps) {
    const [showStyleMenu, setShowStyleMenu] = useState(false);

    return (
        <div className="absolute bottom-24 right-8 z-50 flex flex-col items-end gap-2">
            {/* Floating Style Menu */}
            <div className={`
                flex flex-col gap-1 bg-[#F9F7F4]/90 backdrop-blur-[24px] border border-[#1B1B1B]/10 rounded-lg p-1.5 shadow-lg transition-all duration-300 origin-bottom-right mb-1 mr-1
                ${showStyleMenu ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}
            `}>
                {(["paper", "blueprint", "satellite"] as const).map((mode) => (
                    <button
                        key={mode}
                        onClick={() => {
                            setViewMode(mode);
                            setShowStyleMenu(false);
                        }}
                        className={`
                            px-3 py-1.5 text-xs font-serif capitalize rounded-md transition-colors text-right
                            ${viewMode === mode ? "bg-[#E08E5F] text-white shadow-sm" : "text-ink hover:bg-ink/5"}
                        `}
                    >
                        {mode}
                    </button>
                ))}
            </div>

            {/* The Glass Pill - Enforced 48px width */}
            <div className="w-12 bg-[#F9F7F4]/80 backdrop-blur-[24px] border border-[#1B1B1B]/10 rounded-full shadow-lg py-2 flex flex-col gap-1 items-center">

                {/* 1. Style Stack */}
                <button
                    onClick={() => setShowStyleMenu(!showStyleMenu)}
                    className={`p-2 rounded-full transition-colors ${showStyleMenu ? "bg-ink/10" : "hover:bg-ink/5"}`}
                    aria-label="Map Style"
                >
                    <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>

                {/* 2. 3D Toggle */}
                <button
                    onClick={() => setIs3D(!is3D)}
                    className={`p-2 rounded-full transition-all duration-300 relative group mb-2`}
                    aria-label="Toggle 3D"
                >
                    <div className={`absolute inset-0 rounded-full transition-opacity duration-500 ${is3D ? "bg-ember/10 opacity-100" : "opacity-0"}`} />
                    <svg
                        className={`w-5 h-5 transition-colors duration-300 ${is3D ? "text-ember drop-shadow-[0_0_8px_rgba(224,142,95,0.5)]" : "text-ink group-hover:text-ink/70"}`}
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
                        className="p-1.5 rounded-full hover:bg-ink/5 transition-colors text-ink/70 hover:text-ink"
                        aria-label="Zoom In"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </button>
                    <button
                        onClick={onZoomOut}
                        className="p-1.5 rounded-full hover:bg-ink/5 transition-colors text-ink/70 hover:text-ink"
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
                    className="p-2 rounded-full hover:bg-ink/5 transition-colors mt-1"
                    aria-label="Reset Bearing"
                >
                    <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
