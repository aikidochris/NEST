import { NextRequest } from "next/server";
import {
    createAdminClient,
    createAuthClient,
    jsonOk,
    jsonErr,
} from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface ClaimBody {
    property_id: string;
}

/**
 * POST /api/claim
 * Claims a property for the authenticated user.
 * - Auth required (401 if not logged in)
 * - Validates property exists
 * - Inserts into property_claims with status='claimed'
 * - Upserts intent_flags with owner_id, soft_listing=false
 * - Returns 409 if already claimed by someone else
 */
export async function POST(request: NextRequest): Promise<Response> {
    try {
        // 1. Authenticate user
        const { userId } = await createAuthClient(request);

        if (!userId) {
            return jsonErr("Authentication required", 401, "UNAUTHORIZED");
        }

        // 2. Parse and validate body
        let body: ClaimBody;
        try {
            body = await request.json();
        } catch {
            return jsonErr("Invalid JSON body", 400, "INVALID_BODY");
        }

        const { property_id } = body;

        if (!property_id || typeof property_id !== "string") {
            return jsonErr("Missing or invalid property_id", 400, "INVALID_PROPERTY_ID");
        }

        // 3. Use admin client for write operations
        const admin = createAdminClient();

        // 4. Validate property exists (check the public view)
        const { data: property, error: propertyError } = await admin
            .from("property_public_view")
            .select("property_id")
            .eq("property_id", property_id)
            .single();

        if (propertyError || !property) {
            return jsonErr("Property not found", 404, "PROPERTY_NOT_FOUND");
        }

        // 5. Check if already claimed by someone else
        const { data: existingClaim } = await admin
            .from("property_claims")
            .select("user_id")
            .eq("property_id", property_id)
            .eq("status", "claimed")
            .single();

        if (existingClaim && existingClaim.user_id !== userId) {
            return jsonErr("Property already claimed by another user", 409, "ALREADY_CLAIMED");
        }

        // 6. If user already claimed this property, return success
        if (existingClaim && existingClaim.user_id === userId) {
            return jsonOk({ property_id });
        }

        // 7. Insert claim
        const { error: claimError } = await admin.from("property_claims").insert({
            property_id,
            user_id: userId,
            status: "claimed",
        });

        if (claimError) {
            console.error("[/api/claim] Claim insert error:", claimError);
            return jsonErr("Failed to create claim", 500, "CLAIM_INSERT_FAILED");
        }

        // 8. Upsert intent_flags with defaults
        const { error: intentError } = await admin.from("intent_flags").upsert(
            {
                property_id,
                owner_id: userId,
                soft_listing: false,
            },
            {
                onConflict: "property_id",
            }
        );

        if (intentError) {
            console.error("[/api/claim] Intent upsert error:", intentError);
            // Don't fail the whole operation, claim was successful
        }

        return jsonOk({ property_id });
    } catch (err) {
        console.error("[/api/claim] Unexpected error:", err);
        return jsonErr("Internal server error", 500, "INTERNAL_ERROR");
    }
}
