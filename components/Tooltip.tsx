"use client";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    side?: "top" | "bottom" | "left" | "right";
    delay?: number; // ms
    maxWidth?: number; // px
}

export function Tooltip({
    content,
    children,
    side = "top",
    delay = 250,
    maxWidth = 240
}: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const checkMobile = () => {
            // Basic touch check + screen width fallback
            const isTouch = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
            setIsMobile(isTouch);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const calculatePosition = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const gap = 8;

        // Simple positioning logic (viewport aware could be added, but keeping simple for now)
        let top = 0;
        let left = 0;

        switch (side) {
            case "top":
                top = rect.top - gap;
                left = rect.left + rect.width / 2;
                break;
            case "bottom":
                top = rect.bottom + gap;
                left = rect.left + rect.width / 2;
                break;
            case "left":
                top = rect.top + rect.height / 2;
                left = rect.left - gap;
                break;
            case "right":
                top = rect.top + rect.height / 2;
                left = rect.right + gap;
                break;
        }

        setCoords({ top, left });
    };

    const handleMouseEnter = () => {
        if (isMobile) return;
        calculatePosition();
        timerRef.current = setTimeout(() => {
            setIsVisible(true);
        }, delay);
    };

    const handleMouseLeave = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setIsVisible(false);
    };

    // Transform classes for centering based on side
    const transformClasses = {
        top: "-translate-x-1/2 -translate-y-full",
        bottom: "-translate-x-1/2",
        left: "-translate-x-full -translate-y-1/2",
        right: "-translate-y-1/2"
    };

    return (
        <div
            ref={triggerRef}
            className="relative flex items-center justify-center"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {isVisible && createPortal(
                <div
                    className={`fixed z-[9999] px-3 py-2 bg-white/95 text-gray-700 text-xs font-medium rounded shadow-sm border border-black/5 pointer-events-none transition-opacity duration-150 animate-in fade-in zoom-in-95 ${transformClasses[side]}`}
                    style={{
                        top: coords.top,
                        left: coords.left,
                        width: 'max-content',
                        maxWidth: `${maxWidth}px`
                    }}
                >
                    {content}
                </div>,
                document.body
            )}
        </div>
    );
}
