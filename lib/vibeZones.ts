export interface VibeZone {
    id: string;
    name: string;
    punchline: string;
    vibe: string;
    tags: string[];
    priceBand: string;
    description: string;
    centroid: [number, number]; // [lat, lon]
    imageUrl: string; // Legacy, to be deprecated
    assetKey: string; // Maps to Supabase storage filename
    themeColor: string;
}

/**
 * Resolves a Vibe Zone asset URL from our sovereign Supabase bucket.
 * @param key The assetKey for the zone (e.g., "Tynemouth Village")
 * @param type The asset type suffix (default: "hero")
 * @returns The public URL for the asset
 */
export function getVibeAssetUrl(key: string, type: 'hero' | 'thumb' = 'hero'): string {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
        console.error("[getVibeAssetUrl] NEXT_PUBLIC_SUPABASE_URL is not defined");
        return '';
    }
    const encodedKey = encodeURIComponent(key);
    const url = `${supabaseUrl}/storage/v1/object/public/Vibe%20Zones/${encodedKey}_${type}.jpg`;
    console.log(`[getVibeAssetUrl] Resolving: ${key} -> ${url}`);
    return url;
}

export const VIBE_ZONES: VibeZone[] = [
    {
        id: "tynemouth-village",
        name: "Tynemouth Village",
        centroid: [55.0169, -1.4257],
        punchline: "The Jewel of the Coast",
        vibe: "Cobbled streets, sea air, and the best people-watching in the North East.",
        tags: ["Beach", "Victorian", "Food & Drink", "Iconic"],
        priceBand: "£450k–£650k",
        description: "Picture-perfect streets with cafés, pubs, and weekend bustle. Strong community feel; everyone has a favourite coffee stop. A mix of families, professionals, and coastal die-hards.",
        imageUrl: "https://images.unsplash.com/photo-1543831818-6058286f9160?q=80&w=1200",
        assetKey: "Tynemouth Village",
        themeColor: "#E08E5F" // Warm terracotta for the village
    },
    {
        id: "tynemouth-priory-lower",
        name: "Tynemouth Priory / Lower",
        centroid: [55.0197, -1.4179],
        punchline: "The Quiet Coastline",
        vibe: "Sea views, windswept walks, and quieter residential streets.",
        tags: ["Beach", "Views", "Coastal Walks"],
        priceBand: "£260k–£400k",
        description: "Quieter than the village but closer to the sand. Popular with downsizers and sunrise chasers. Great access to the Priory, the Pier, and the beach paths.",
        imageUrl: "https://images.unsplash.com/photo-1629119619142-b0521e643981?q=80&w=1200",
        assetKey: "Tynemouth Priory Lower",
        themeColor: "#6B9AC4" // Coastal blue
    },
    {
        id: "cullercoats",
        name: "Cullercoats",
        centroid: [55.0342, -1.4390],
        punchline: "The Harbour Community",
        vibe: "Sea swims, harbour cafés, and that 'everyone knows everyone' feel.",
        tags: ["Beach", "Community", "Indie Food"],
        priceBand: "£220k–£320k",
        description: "Strong local identity with year-round activity. Creative, family-friendly, and occasionally salty (in the best way). The harbour is the heartbeat.",
        imageUrl: "https://images.unsplash.com/photo-1620986961436-120054ccf675?q=80&w=1200",
        assetKey: "Cullercoats",
        themeColor: "#D4A373" // Sand/Harbour stone
    },
    {
        id: "whitley-bay-central",
        name: "Whitley Bay (Central)",
        centroid: [55.0438, -1.4470],
        punchline: "The Coastal Revival",
        vibe: "Bold, bright, and buzzing. Spanish City energy meets suburban calm.",
        tags: ["Beach", "Regeneration", "Family"],
        priceBand: "£240k–£340k",
        description: "A real mix: young families, commuters, and long-timers. Strong walking culture — prom strolls are a daily ritual. Plenty of great schools and pocket parks nearby.",
        imageUrl: "https://images.unsplash.com/photo-1620986961448-6923c89cc527?q=80&w=1200",
        assetKey: "Whitley Bay (Central)",
        themeColor: "#F4A261" // Bright sunset/promenade
    },
    {
        id: "whitley-lodge-north",
        name: "Whitley Lodge / North",
        centroid: [55.0494, -1.4577],
        punchline: "Suburban Comfort",
        vibe: "Schools, shops, and steady routines. A very liveable patch of the coast.",
        tags: ["Schools", "Family", "Suburban Calm"],
        priceBand: "£240k–£330k",
        description: "Well-loved by families for its layout and green spaces. Good access to the coast without the crowds. Consistent, dependable housing stock.",
        imageUrl: "https://images.pexels.com/photos/280222/pexels-photo-280222.jpeg?w=1200",
        assetKey: "Preston Village  Marden  Whitley Lodge",
        themeColor: "#81B29A" // Suburban green
    },
    {
        id: "monkseaton",
        name: "Monkseaton",
        centroid: [55.0416, -1.4703],
        punchline: "The Village Suburb",
        vibe: "Metro convenience, local pubs, and leafy residential streets.",
        tags: ["Village Feel", "Metro", "Family"],
        priceBand: "£240k–£340k",
        description: "Strong identity around the Metro and village centre. Good schools draw people in. Quiet streets but a lively pub culture around the heart of the village.",
        imageUrl: "https://images.unsplash.com/photo-1574007557239-afead4096d13?q=80&w=1200",
        assetKey: "Monkseaton and West Monkseaton",
        themeColor: "#4F772D" // Leafy village green
    },
    {
        id: "west-monkseaton",
        name: "West Monkseaton",
        centroid: [55.0439, -1.4874],
        punchline: "The Green Fringe",
        vibe: "Peaceful, practical, and ideal for families wanting space.",
        tags: ["Green Space", "Family", "Quiet"],
        priceBand: "£260k–£380k",
        description: "Strong school catchment appeal. Wider streets, bigger gardens, quieter pace. Walkable to coast, Metro, and parks.",
        imageUrl: "https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?w=1200",
        assetKey: "Monkseaton and West Monkseaton",
        themeColor: "#90BE6D" // Lighter green
    },
    {
        id: "preston-village",
        name: "Preston Village",
        centroid: [55.0252, -1.4526],
        punchline: "The Quiet Achiever",
        vibe: "Stable, settled, and quietly sought-after.",
        tags: ["Schools", "Suburban Appeal", "Family"],
        priceBand: "£240k–£350k",
        description: "Reliable housing with long-term residents. Great access to Tynemouth and town centre. Often chosen for schools and quieter residential streets.",
        imageUrl: "https://images.pexels.com/photos/186077/pexels-photo-186077.jpeg?w=1200",
        assetKey: "Preston Village  Marden  Whitley Lodge",
        themeColor: "#577590" // Slate blue/grey
    },
    {
        id: "marden-estate",
        name: "Marden Estate",
        centroid: [55.0317, -1.4541],
        punchline: "The Neat Grid",
        vibe: "Straight streets, strong community feel, and good value for the coast.",
        tags: ["Family", "Schools", "Value"],
        priceBand: "£180k–£260k",
        description: "Very distinctive layout and local identity. A popular stepping-stone for young families. Seen as solid, friendly and predictable.",
        imageUrl: "https://images.pexels.com/photos/210617/pexels-photo-210617.jpeg?w=1200",
        assetKey: "Preston Village  Marden  Whitley Lodge",
        themeColor: "#43AA8B" // Structured green
    },
    {
        id: "new-york",
        name: "New York",
        centroid: [55.0339, -1.4794],
        punchline: "The Unexpected Corner",
        vibe: "Quirky, tight-knit, and often a pleasant surprise to newcomers.",
        tags: ["Character", "Value", "Community"],
        priceBand: "£150k–£230k",
        description: "Very strong local roots. Quick access to A19 and the coast. More affordable without feeling disconnected.",
        imageUrl: "https://images.pexels.com/photos/101808/pexels-photo-101808.jpeg?w=1200",
        assetKey: "New_York",
        themeColor: "#F9844A" // Energetic orange
    },
    {
        id: "shiremoor",
        name: "Shiremoor",
        centroid: [55.0368, -1.5054],
        punchline: "The Modern Connector",
        vibe: "Newer estates mixed with older stock, well-placed for commuters.",
        tags: ["New Builds", "Community", "Transport"],
        priceBand: "£170k–£260k",
        description: "Fast-growing with recent development. Popular with families and first-time buyers. Good access to A19, Silverlink, and Metro.",
        imageUrl: "https://images.pexels.com/photos/4513940/pexels-photo-4513940.jpeg?w=1200",
        assetKey: "Shiremoor  Backworth  West Allotment  Murton",
        themeColor: "#277DA1" // Transport blue
    },
    {
        id: "backworth",
        name: "Backworth",
        centroid: [55.0448, -1.5304],
        punchline: "Heritage Meets Modern",
        vibe: "A village core surrounded by clean, modern estates.",
        tags: ["Golf", "New Builds", "Calm"],
        priceBand: "£220k–£350k",
        description: "Backworth Hall adds character and green space. Newer housing stock attracts long-term movers. A quieter base with wide roads.",
        imageUrl: "https://images.pexels.com/photos/2102587/pexels-photo-2102587.jpeg?w=1200",
        assetKey: "Shiremoor  Backworth  West Allotment  Murton",
        themeColor: "#588157" // Heritage green
    },
    {
        id: "west-allotment",
        name: "West Allotment",
        centroid: [55.0282, -1.4991],
        punchline: "The Hidden Hamlet",
        vibe: "Tucked away, village-like, and close to the Rising Sun.",
        tags: ["Community", "Green Space", "Walkability"],
        priceBand: "£170k–£260k",
        description: "Small, tight-knit residential pockets. Walkable to Rising Sun Country Park. Good access to Silverlink and Metro.",
        imageUrl: "https://images.pexels.com/photos/259588/pexels-photo-259588.jpeg?w=1200",
        assetKey: "Shiremoor  Backworth  West Allotment  Murton",
        themeColor: "#A3B18A" // Muted organic green
    },
    {
        id: "murton-village",
        name: "Murton Village",
        centroid: [55.0545, -1.4848],
        punchline: "Rural Edges, Coastal Reach",
        vibe: "Old village charm with quick access to Whitley Bay.",
        tags: ["Greenery", "Character", "Quiet"],
        priceBand: "£180k–£280k",
        description: "A small rural feeling pocket tucked between estates. Popular with walkers and those wanting space. Old lane layouts feel very different.",
        imageUrl: "https://images.pexels.com/photos/53610/pexels-photo-53610.jpeg?w=1200",
        assetKey: "Shiremoor  Backworth  West Allotment  Murton",
        themeColor: "#606C38" // Deep rural green
    },
    {
        id: "north-shields-fish-quay",
        name: "North Shields – Fish Quay",
        centroid: [55.0094, -1.4418],
        punchline: "Industrial Chic",
        vibe: "Waterfront restaurants, old warehouses, and a strong creative streak.",
        tags: ["Food", "Waterfront", "Character"],
        priceBand: "£180k–£280k",
        description: "A real destination for eating out. Quiet on weekdays, lively on weekends. Popular with downsizers and professionals.",
        imageUrl: "https://images.unsplash.com/photo-1605342417711-2f3b97669d0d?q=80&w=1200",
        assetKey: "North Shields – Fish Quay",
        themeColor: "#264653" // Deep water/industrial
    },
    {
        id: "north-shields-town",
        name: "North Shields – Town",
        centroid: [55.0135, -1.4477],
        punchline: "The Working Harbour",
        vibe: "Steep streets, busy markets, and a lot of movement.",
        tags: ["Value", "Transport", "Character"],
        priceBand: "£120k–£200k",
        description: "Excellent Metro and bus links. Affordable and varied housing. Some of the best views if you know where to look.",
        imageUrl: "https://images.pexels.com/photos/273204/pexels-photo-273204.jpeg?w=1200",
        assetKey: "North Shields Town  Royal Quays",
        themeColor: "#E9C46A" // Vibrant urban yellow
    },
    {
        id: "royal-quays",
        name: "Royal Quays",
        centroid: [55.0025, -1.4666],
        punchline: "The Waterfront Pocket",
        vibe: "Marina walks, modern homes, and quick access to the river.",
        tags: ["Waterfront", "Modern Builds", "Transport"],
        priceBand: "£150k–£240k",
        description: "Cosy, modern developments around a marina. Great for commuters and coastal runners. Close to retail, cinema, and ferry links.",
        imageUrl: "https://images.pexels.com/photos/1634262/pexels-photo-1634262.jpeg?w=1200",
        assetKey: "North Shields Town  Royal Quays",
        themeColor: "#2A9D8F" // Marine teal
    }
];
