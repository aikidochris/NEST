"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-side Supabase client.
 * Use for auth operations only - NO direct database queries.
 * All data fetching goes through /api routes.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
