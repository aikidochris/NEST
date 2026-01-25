"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/app/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";

interface SearchResult {
    id: string;
    name: string;
    description: string;
    center: [number, number];
    type: string; // postcode, district, place, etc.
}

interface HeaderProps {
    onOpenMessages?: () => void;
    hasUnreadMessages?: boolean;
    onSearch?: (query: string, result?: SearchResult) => void;
}

export function Header({ onOpenMessages, hasUnreadMessages = false, onSearch }: HeaderProps) {
    const { user, signOut } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isFocused, setIsFocused] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Global keyboard shortcut: COMMAND+K or CTRL+K
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, []);

    // Suggestions Keyboard Navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isFocused || suggestions.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === "Enter" && selectedIndex >= 0) {
            e.preventDefault();
            handleSelectSuggestion(suggestions[selectedIndex]);
        } else if (e.key === "Escape") {
            setIsFocused(false);
        }
    };

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
                searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Geocoding Suggester (UK-Biased Photon fallback for missing Mapbox token)
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (searchQuery.length < 3) {
                setSuggestions([]);
                setSelectedIndex(-1);
                return;
            }

            setIsLoading(true);
            try {
                // Biasing towards UK (bbox roughly UK: -8, 49, 2, 61)
                const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=5&lang=en&lat=55.0&lon=-1.5&bbox=-8.6,49.8,1.7,60.8`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.features) {
                    const results: SearchResult[] = data.features
                        .map((f: any, index: number) => {
                            const props = f.properties;
                            const name = props.name || props.street || "";
                            const description = [props.city, props.postcode, props.country].filter(Boolean).join(", ");

                            // Strictly: postcode, district, place
                            let type = "";
                            if (props.postcode) type = "postcode";
                            else if (props.osm_value === "suburb" || props.osm_value === "district" || props.osm_value === "city_district") type = "district";
                            else if (props.osm_value === "city" || props.osm_value === "town" || props.osm_value === "village") type = "place";

                            if (!type) return null;

                            return {
                                id: `${index}-${props.osm_id}`,
                                name,
                                description,
                                center: f.geometry.coordinates,
                                type
                            };
                        })
                        .filter((r: any): r is SearchResult => r !== null);
                    setSuggestions(results);
                    setSelectedIndex(-1);
                }
            } catch (err) {
                console.error("Geocoding fetch failed:", err);
            } finally {
                setIsLoading(false);
            }
        };

        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim() && onSearch) {
            onSearch(searchQuery.trim());
            setIsFocused(false);
            setSelectedIndex(-1);
        }
    };

    const handleSelectSuggestion = (result: SearchResult) => {
        setSearchQuery(result.name);
        setSuggestions([]);
        setSelectedIndex(-1);
        setIsFocused(false);
        if (onSearch) {
            onSearch(result.name, result);
        }
    };

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
            <div className="flex-1 max-w-[480px] px-4 flex justify-center relative">
                <form onSubmit={handleSearchSubmit} className="relative w-full group">
                    <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                        <svg className={`w-4 h-4 transition-colors ${isLoading ? 'text-ember animate-pulse' : 'text-ink/30 group-focus-within:text-ink/60'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onFocus={() => setIsFocused(true)}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search neighborhoods or postcodes..."
                        className="w-full h-10 pl-10 pr-12 bg-white/40 border border-ink/10 rounded-full text-sm font-sans placeholder:font-serif placeholder:italic placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-ember/20 focus:border-ember/40 transition-all text-ink selection:bg-ember/30"
                    />
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                        <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 border border-ink/20 rounded-[4px] font-sans text-[10px] font-medium text-ink/40 bg-white/30">
                            <span className="text-xs mr-0.5">⌘</span>K
                        </kbd>
                    </div>
                </form>

                {/* Suggestions Dropdown */}
                <AnimatePresence>
                    {isFocused && (searchQuery.length > 0 || suggestions.length > 0) && (
                        <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.98 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="absolute top-12 left-4 right-4 bg-[#F9F7F4]/95 backdrop-blur-xl border border-ink/10 rounded-2xl shadow-2xl shadow-ink/20 overflow-hidden"
                        >
                            {isLoading && suggestions.length === 0 ? (
                                <div className="p-8 text-center">
                                    <div className="inline-block w-6 h-6 border-2 border-ember border-t-transparent rounded-full animate-spin mb-2" />
                                    <p className="text-xs font-serif italic text-ink/40">Searching the UK...</p>
                                </div>
                            ) : suggestions.length > 0 ? (
                                <div className="py-2">
                                    {suggestions.map((result, index) => (
                                        <button
                                            key={result.id}
                                            onClick={() => handleSelectSuggestion(result)}
                                            onMouseEnter={() => setSelectedIndex(index)}
                                            className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-colors group ${selectedIndex === index ? 'bg-[rgba(224,142,95,0.15)] shadow-inner' : 'hover:bg-[rgba(224,142,95,0.08)]'}`}
                                        >
                                            <div className="mt-0.5 text-ember/40 group-hover:text-ember transition-colors">
                                                {result.type === 'postcode' ? (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeWidth={2} /></svg>
                                                ) : result.type === 'district' ? (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" strokeWidth={2} /></svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeWidth={2} /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeWidth={2} /></svg>
                                                )}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-ink group-hover:text-ember transition-colors">{result.name}</span>
                                                <span className="text-[11px] text-ink/40 group-hover:text-ink/60 transition-colors uppercase tracking-wider">{result.description}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : searchQuery.length >= 3 ? (
                                <div className="p-8 text-center">
                                    <p className="text-sm text-ink/40 font-serif italic">No neighborhoods found</p>
                                </div>
                            ) : null}
                        </motion.div>
                    )}
                </AnimatePresence>
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

