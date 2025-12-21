"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/AuthProvider";

interface HeaderProps {
    onOpenMessages?: () => void;
    hasUnreadMessages?: boolean;
}

export function Header({ onOpenMessages, hasUnreadMessages = false }: HeaderProps) {
    const { user, signOut } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");

    return (
        <header className="fixed top-0 left-0 right-0 z-[100] h-16 bg-[#F9F7F4]/80 backdrop-blur-[24px] border-b border-[#1B1B1B]/10 flex items-center justify-between px-6 transition-all duration-300">
            {/* Left: The Living Logo */}
            <div className="flex items-center gap-2">
                <Link href="/" className="group flex items-center focus:outline-none">
                    <span className="font-serif text-2xl tracking-tight text-ink flex items-baseline">
                        hearth
                        <span className="relative inline-flex items-center justify-center ml-[1px] w-[4px]">
                            <span className="text-[#E08E5F]">.</span>
                            <div className="absolute top-[80%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-[#E08E5F] rounded-full animate-logo-pulse pointer-events-none" />
                        </span>
                    </span>
                </Link>
            </div>

            {/* Center: Unified Search */}
            <div className="flex-1 max-w-[480px] px-4 flex justify-center">
                <div className="relative w-full group">
                    <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-ink/30 group-focus-within:text-ink/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search neighborhoods..."
                        className="w-full h-10 pl-10 pr-12 bg-white/40 border border-ink/10 rounded-full text-sm font-sans placeholder:font-serif placeholder:italic placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember/40 transition-all"
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                        <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 border border-ink/20 rounded-[4px] font-sans text-[10px] font-medium text-ink/40 bg-white/30">
                            <span className="text-xs mr-0.5">⌘</span>K
                        </kbd>
                    </div>
                </div>
            </div>

            {/* Right: Utility HUD */}
            <div className="flex items-center gap-4">
                {/* Inbox Icon */}
                <button
                    onClick={onOpenMessages}
                    className="relative p-2 rounded-full hover:bg-ink/5 transition-colors group"
                    aria-label="Messages"
                >
                    <svg className="w-5 h-5 text-ink/70 group-hover:text-ink transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {hasUnreadMessages && (
                        <span className="absolute top-2 right-2 w-2 h-2 bg-ember rounded-full ring-2 ring-white shadow-sm" />
                    )}
                </button>

                {/* Profile / Menu */}
                {user ? (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={signOut}
                            className="text-xs font-medium text-ink/50 hover:text-ink transition-colors hidden sm:block"
                        >
                            Sign out
                        </button>
                        <button className="w-8 h-8 rounded-full bg-ink/5 border border-ink/10 flex items-center justify-center text-xs font-serif text-ink hover:border-ember/30 transition-all overflow-hidden group">
                            {user.email?.[0].toUpperCase()}
                        </button>
                    </div>
                ) : (
                    <Link
                        href="/auth/login"
                        className="text-sm font-medium text-ember hover:opacity-80 transition-opacity"
                    >
                        Sign in
                    </Link>
                )}
            </div>
        </header>
    );
}
