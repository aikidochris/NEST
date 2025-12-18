"use client";

import Link from "next/link";
import { useAuth } from "@/app/AuthProvider";

/**
 * Simple auth controls for top-left of screen.
 * Shows sign in link if not authenticated, user email + sign out if authenticated.
 */
export function AuthControls() {
    const { user, loading, signOut } = useAuth();

    if (loading) {
        return (
            <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-sm text-gray-500">
                Loading...
            </div>
        );
    }

    if (!user) {
        return (
            <Link
                href="/auth/login"
                className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-sm text-ember hover:opacity-80 transition-opacity"
            >
                Sign in
            </Link>
        );
    }

    return (
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md text-sm flex items-center gap-2">
            <span className="text-ink truncate max-w-[150px]">{user.email}</span>
            <button
                onClick={signOut}
                className="text-gray-500 hover:text-ink transition-colors"
            >
                Sign out
            </button>
        </div>
    );
}
