/**
 * Types aligned with property_public_view contract.
 * Do NOT add fields that don't exist in the view.
 */

export interface PropertyPublic {
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
    /** Computed server-side: true if authenticated user owns this property */
    is_mine: boolean;
}

export interface BBox {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
}

export interface PropertiesApiResponse {
    ok: true;
    data: PropertyPublic[];
}

export interface ApiErrorResponse {
    ok: false;
    error: {
        message: string;
        code?: string;
    };
}

export type ApiResponse = PropertiesApiResponse | ApiErrorResponse;
