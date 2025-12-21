"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import type { PropertyMapRef } from "@/components/PropertyMap";
import { Header } from "@/components/Header";

// Dynamic import to avoid SSR issues with maplibre-gl
const PropertyMap = dynamic(() => import("@/components/PropertyMap"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center w-full h-screen bg-zinc-100">
            <span className="text-zinc-500">Loading map...</span>
        </div>
    ),
});

export default function HomeClient() {
    const mapRef = useRef<PropertyMapRef>(null);

    return (
        <main className="w-full h-screen overflow-hidden flex flex-col pt-16">
            <Header onOpenMessages={() => mapRef.current?.openMessageCentre()} />
            <div className="flex-1 relative">
                <PropertyMap ref={mapRef} />
            </div>
        </main>
    );
}
