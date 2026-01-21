import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EMPTY = new Uint8Array(0);

// Throttled error logging: max 5 errors per minute
let errorCount = 0;
let errorWindowStart = Date.now();
const MAX_ERRORS_PER_MINUTE = 5;

function logErrorThrottled(message: string, context: Record<string, unknown>): void {
    const now = Date.now();
    // Reset window every minute
    if (now - errorWindowStart > 60000) {
        errorCount = 0;
        errorWindowStart = now;
    }
    // Only log if under threshold
    if (errorCount < MAX_ERRORS_PER_MINUTE) {
        errorCount++;
        console.error(message, context);
    }
}

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ z: string; x: string; y: string }> }
): Promise<Response> {
    const { z, x, y } = await context.params;

    const zi = Number(z);
    const xi = Number(x);
    const yi = Number(y);

    if (!Number.isInteger(zi) || !Number.isInteger(xi) || !Number.isInteger(yi)) {
        return new Response(EMPTY, { status: 200 });
    }

    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase.rpc("get_properties_mvt", { z: zi, x: xi, y: yi });

        if (error) {
            logErrorThrottled("[/api/tiles] RPC error", { z: zi, x: xi, y: yi, error });
            return new Response(EMPTY, {
                status: 200,
                headers: {
                    "Content-Type": "application/vnd.mapbox-vector-tile",
                    "Cache-Control": "public, max-age=10",
                },
            });
        }

        if (!data) {
            return new Response(EMPTY, { status: 200 });
        }

        // Supabase returns bytea as a hex string starting with \x.
        // We must convert this to binary (Buffer) for MapLibre to parse it.
        let bytes: Buffer | string | any = data;
        if (typeof data === "string") {
            if (data.startsWith("\\x")) {
                bytes = Buffer.from(data.substring(2), "hex");
            } else if (/^[0-9a-fA-F]+$/.test(data)) {
                bytes = Buffer.from(data, "hex");
            } else {
                // Fallback for base64 or raw string
                const maybeBase64 = Buffer.from(data, "base64");
                // Check if it's likely binary (non-printable chars) or if base64 decoding worked meaningfully
                bytes = maybeBase64;
            }
        }

        if (!bytes || bytes.length === 0) {
            return new Response(null, { status: 204 });
        }

        return new Response(bytes, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.mapbox-vector-tile",
                "Cache-Control": "public, max-age=3600",
            },
        });
    } catch (err) {
        logErrorThrottled("[/api/tiles] unexpected error", { z: zi, x: xi, y: yi, err });
        return new Response(EMPTY, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.mapbox-vector-tile",
                "Cache-Control": "public, max-age=10",
            },
        });
    }
}
