import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { jsonErr } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Columns to select from property_public_view (includes claimed_by_user_id for is_mine) */
const VIEW_COLUMNS = [
    "property_id",
    "lat",
    "lon",
    "postcode",
    "street",
    "house_number",
    "display_label",
    "is_claimed",
    "is_open_to_talking",
    "is_for_sale",
    "is_for_rent",
    "is_settled",
    "summary_text",
    "claimed_by_user_id",
].join(",");

/**
 * Returns adaptive limit based on zoom level.
 */
function getAdaptiveLimit(zoom: number): number {
    if (zoom <= 11) return 800;
    if (zoom <= 13) return 2000;
    return 8000;
}

/**
 * Downsamples properties at low zoom by rounding coords to 3dp (~110m grid).
 */
function downsampleByGrid<T extends { lat: number; lon: number }>(
    properties: T[],
    zoom: number
): T[] {
    if (zoom > 11) return properties;

    const factor = 1000;
    const seen = new Set<string>();
    const result: T[] = [];

    for (const prop of properties) {
        const gridKey = `${Math.round(prop.lat * factor)},${Math.round(prop.lon * factor)}`;
        if (!seen.has(gridKey)) {
            seen.add(gridKey);
            result.push(prop);
        }
    }

    return result;
}

interface RawProperty {
    property_id: string;
    lat: number;
    lon: number;
    postcode: string | null;
    street: string | null;
    house_number: string | null;
    display_label: string | null;
    is_claimed: boolean;
    is_open_to_talking: boolean;
    is_for_sale: boolean;
    is_for_rent: boolean;
    is_settled: boolean;
    summary_text: string | null;
    claimed_by_user_id: string | null;
}

/**
 * Maps raw property to public property with is_mine field.
 */
function mapProperty(p: RawProperty, userId: string | null) {
    return {
        property_id: p.property_id,
        lat: p.lat,
        lon: p.lon,
        postcode: p.postcode,
        street: p.street,
        house_number: p.house_number,
        display_label: p.display_label,
        is_claimed: p.is_claimed,
        is_open_to_talking: p.is_open_to_talking,
        is_for_sale: p.is_for_sale,
        is_for_rent: p.is_for_rent,
        is_settled: p.is_settled,
        summary_text: p.summary_text,
        is_mine: userId !== null && p.claimed_by_user_id === userId,
    };
}

/**
 * GET /api/properties?id=<property_id>
 * GET /api/properties?bbox=minLon,minLat,maxLon,maxLat&z=12
 *
 * Fetches a single property by ID, or properties within a bounding box.
 * Adds is_mine based on authenticated user.
 */
export async function GET(request: NextRequest): Promise<Response> {
    try {
        const { searchParams } = new URL(request.url);

        // Try to get user from cookies (server-side auth)
        let userId: string | null = null;
        try {
            const cookieStore = await cookies();
            const accessToken = cookieStore.get("sb-access-token")?.value;
            const refreshToken = cookieStore.get("sb-refresh-token")?.value;

            if (accessToken) {
                const authClient = createClient(supabaseUrl, supabaseAnonKey, {
                    auth: { autoRefreshToken: false, persistSession: false },
                    global: { headers: { Authorization: `Bearer ${accessToken}` } },
                });

                const { data: { user } } = await authClient.auth.getUser();
                userId = user?.id ?? null;
            } else if (refreshToken) {
                // Try with refresh token
                const authClient = createClient(supabaseUrl, supabaseAnonKey);
                const { data: { session } } = await authClient.auth.setSession({
                    access_token: "",
                    refresh_token: refreshToken,
                });
                userId = session?.user?.id ?? null;
            }
        } catch {
            // Auth failed, continue as anonymous
            userId = null;
        }

        // Query client
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Check for single property fetch by ID
        const propertyId = searchParams.get("id");
        if (propertyId) {
            const { data, error } = await supabase
                .from("property_public_view")
                .select(VIEW_COLUMNS)
                .eq("property_id", propertyId)
                .single();

            if (error) {
                console.error("[/api/properties] Supabase error:", error);
                return jsonErr(error.message, 500, "SUPABASE_ERROR");
            }

            if (!data) {
                return jsonErr("Property not found", 404, "NOT_FOUND");
            }

            const rawProperty = data as unknown as RawProperty;
            const propertyWithMine = mapProperty(rawProperty, userId);

            return NextResponse.json(
                { ok: true, data: propertyWithMine },
                {
                    status: 200,
                    headers: {
                        "Cache-Control": userId ? "private, max-age=10" : "public, max-age=10",
                    },
                }
            );
        }

        // Require bbox for list queries
        const bboxParam = searchParams.get("bbox");
        if (!bboxParam) {
            return jsonErr("Missing required parameter: bbox or id", 400, "MISSING_PARAM");
        }

        const bboxParts = bboxParam.split(",").map(Number);
        if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
            return jsonErr(
                "Invalid bbox format. Expected: minLon,minLat,maxLon,maxLat",
                400,
                "INVALID_BBOX"
            );
        }

        const [minLon, minLat, maxLon, maxLat] = bboxParts;

        if (minLon > maxLon || minLat > maxLat) {
            return jsonErr(
                "Invalid bbox: min values must be less than max values",
                400,
                "INVALID_BBOX_RANGE"
            );
        }

        // Parse zoom
        const zoomParam = searchParams.get("z");
        const zoom = zoomParam ? Math.round(parseFloat(zoomParam)) : 14;
        const limit = getAdaptiveLimit(zoom);

        // Query properties
        const { data, error } = await supabase
            .from("property_public_view")
            .select(VIEW_COLUMNS)
            .gte("lon", minLon)
            .lte("lon", maxLon)
            .gte("lat", minLat)
            .lte("lat", maxLat)
            .limit(limit);

        if (error) {
            console.error("[/api/properties] Supabase error:", error);
            return jsonErr(error.message, 500, "SUPABASE_ERROR");
        }

        // Map to include is_mine and remove claimed_by_user_id from response
        const rawProperties = (data || []) as unknown as RawProperty[];
        const propertiesWithMine = rawProperties.map((p) => mapProperty(p, userId));

        // Downsample at low zoom
        const downsampled = downsampleByGrid(propertiesWithMine, zoom);

        return NextResponse.json(
            { ok: true, data: downsampled },
            {
                status: 200,
                headers: {
                    "Cache-Control": userId ? "private, max-age=10" : "public, max-age=10",
                },
            }
        );
    } catch (err) {
        console.error("[/api/properties] Unexpected error:", err);
        return jsonErr("Internal server error", 500, "INTERNAL_ERROR");
    }
}
