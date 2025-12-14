import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// -----------------------------------------------------------------------------
// Environment validation
// -----------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

// -----------------------------------------------------------------------------
// Supabase client factories (server-only)
// -----------------------------------------------------------------------------

/**
 * Creates a Supabase client using the service role key.
 * Use for admin operations that bypass RLS.
 * NEVER expose this client or its key to the browser.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    assertEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    assertEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Creates a Supabase client using the anon key.
 * Use for public reads that respect RLS policies.
 */
export function createAnonClient(): SupabaseClient {
  return createClient(
    assertEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    assertEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Creates a Supabase client with user auth from request headers.
 * Returns { supabase, user } or { supabase: null, user: null } if not authenticated.
 */
export async function createAuthClient(
  request: Request
): Promise<{ supabase: SupabaseClient | null; userId: string | null }> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { supabase: null, userId: null };
  }

  const token = authHeader.slice(7);

  const supabase = createClient(
    assertEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    assertEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );

  // Verify the token and get user
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { supabase: null, userId: null };
  }

  return { supabase, userId: user.id };
}

// -----------------------------------------------------------------------------
// Response helpers
// -----------------------------------------------------------------------------

/**
 * Returns a JSON success response.
 */
export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

/**
 * Returns a JSON error response.
 */
export function jsonErr(
  message: string,
  status = 500,
  code?: string
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { message, code } },
    { status }
  );
}
