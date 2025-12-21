
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// 1. Load env vars
const envPath = path.resolve(process.cwd(), ".env.local");
let envContent = "";
try {
    envContent = fs.readFileSync(envPath, "utf-8");
} catch (e) {
    console.error("Could not read .env.local");
    process.exit(1);
}

const env: Record<string, string> = {};
envContent.split("\n").forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, "");
        env[key] = value;
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceKey || !anonKey) {
    console.error("Missing credentials in .env.local");
    process.exit(1);
}

// Admin client
const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function run() {
    console.log("Setting up test environment...");
    const ts = Date.now();
    const ownerEmail = `owner_${ts}@test.com`;
    const viewerEmail = `viewer_${ts}@test.com`;
    const password = "password123";

    // Create Owner
    const { data: d1, error: err1 } = await admin.auth.admin.createUser({
        email: ownerEmail,
        password: password,
        email_confirm: true
    });
    if (err1) throw err1;
    const owner = d1.user;
    console.log("1. Owner created:", owner.id);

    // Create Viewer
    const { data: d2, error: err2 } = await admin.auth.admin.createUser({
        email: viewerEmail,
        password: password,
        email_confirm: true
    });
    if (err2) throw err2;
    const viewer = d2.user;
    console.log("2. Viewer created:", viewer.id);

    // Create Property
    // Need minimal fields: lat, lon are not null.
    const { data: prop, error: err3 } = await admin.from("properties").insert({
        lat: 51.5074,
        lon: -0.1278,
        display_label: `Debug Property ${ts}`,
        postcode: "SW1A 1AA"
    }).select().single();
    if (err3) throw err3;
    console.log("3. Property created:", prop.id);

    // Owner Claims Property
    const { error: err4 } = await admin.from("property_claims").insert({
        property_id: prop.id,
        user_id: owner.id,
        status: "claimed"
    });
    if (err4) throw err4;
    console.log("4. Property claimed by owner");

    // --- TEST SCENARIOS ---

    // Init Viewer Client
    const viewerClient = createClient(supabaseUrl, anonKey);
    const { error: signInError } = await viewerClient.auth.signInWithPassword({ email: viewerEmail, password });
    if (signInError) throw signInError;
    console.log("Viewer logged in");

    console.log("\n[TEST 1] Viewer lists conversations (should be empty, but check for RLS error)");
    const { data: listData, error: listError } = await viewerClient
        .from("conversation_participants")
        .select(`
            conversation_id,
            role,
            conversations!inner (
                id,
                property_id,
                owner_user_id,
                created_by_user_id,
                updated_at
            )
        `)
        .eq("user_id", viewer.id);

    if (listError) {
        console.error("-> List Failed (EXPECTED FAILURE):");
        console.dir(listError, { depth: null });
        console.log("Code:", listError.code);
        console.log("Details:", listError.details);
        console.log("Hint:", listError.hint);
        console.log("Message:", listError.message);
    } else {
        console.log("-> List Success (Length: " + listData?.length + ")");
    }

    console.log("\n[TEST 2] Viewer creates conversation (EXPECTED FAILURE?)");
    // Attempt to insert conversation
    const { data: newConv, error: createError } = await viewerClient
        .from("conversations")
        .insert({
            property_id: prop.id,
            owner_user_id: owner.id,
            created_by_user_id: viewer.id,
        })
        .select()
        .single();

    if (createError) {
        console.error("-> Create Conversation Failed:");
        console.dir(createError, { depth: null });
        console.log("Code:", createError.code);
        console.log("Details:", createError.details);
        console.log("Message:", createError.message);
    } else {
        console.log("-> Conversation Created:", newConv.id);

        // If successful, try adding participants
        console.log("\n[TEST 3] Viewer adds participants");
        const { error: partError } = await viewerClient
            .from("conversation_participants")
            .insert([
                { conversation_id: newConv.id, user_id: owner.id, role: "owner" },
                { conversation_id: newConv.id, user_id: viewer.id, role: "viewer" }
            ]);

        if (partError) {
            console.error("-> Add Participants Failed:");
            console.dir(partError, { depth: null });
            console.log("Code:", partError.code);
            console.log("Message:", partError.message);
        } else {
            console.log("-> Participants Added");
        }
    }
}

run().catch(e => {
    console.error("FATAL ERROR:");
    console.error(e);
});
