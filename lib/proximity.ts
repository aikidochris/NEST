/**
 * Shared logic for Proximity Guard calculations.
 */

export const WALK_SPEED_METERS_PER_MIN = 80;
export const MAX_WALK_THRESHOLD_METERS = 1200; // 15 minutes

export type AnchorCategory = "school" | "transport" | "amenity" | "spirit";

export interface ProximityAnchor {
    id: string;
    name: string;
    category: AnchorCategory;
    distance: number; // meters
    walkMins: number;
}

/**
 * Haversine formula to calculate distance between two coordinates in meters.
 */
export function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg: number) => deg * (Math.PI / 180);

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Map anchor_type to display category
 */
export function mapAnchorCategory(anchorType: string, subtype: string): AnchorCategory {
    switch (anchorType) {
        case "school":
            return "school";
        case "transport":
            return "transport";
        case "spirit_point":
        case "spirit":
            return "spirit";
        default:
            return "amenity";
    }
}

/**
 * Process raw features into categorized proximity anchors
 */
export function processProximityAnchors(
    features: any[],
    targetLat: number,
    targetLon: number
): ProximityAnchor[] {
    const anchorsWithDistance = features.map((f) => {
        const coords = (f.geometry as any).coordinates;
        const distance = haversineDistance(
            targetLat,
            targetLon,
            coords[1],
            coords[0]
        );
        const category = mapAnchorCategory(
            f.properties?.anchor_type || "",
            f.properties?.subtype || ""
        );
        return {
            id: f.properties?.id || "",
            name: f.properties?.name || "Unknown",
            category,
            distance,
            walkMins: Math.round(distance / WALK_SPEED_METERS_PER_MIN)
        };
    });

    // Filter to only within threshold
    const withinThreshold = anchorsWithDistance.filter(
        (a) => a.distance < MAX_WALK_THRESHOLD_METERS
    );

    // Get closest per category
    const closestByCategory = new Map<AnchorCategory, ProximityAnchor>();
    for (const anchor of withinThreshold) {
        const existing = closestByCategory.get(anchor.category);
        if (!existing || anchor.distance < existing.distance) {
            closestByCategory.set(anchor.category, anchor);
        }
    }

    return Array.from(closestByCategory.values());
}
