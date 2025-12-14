"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        // Supabase will automatically handle the token exchange from URL hash
        supabase.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_IN") {
                router.push("/");
            }
        });
    }, [router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50">
            <div className="text-center">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-600">Signing you in...</p>
            </div>
        </div>
    );
}
