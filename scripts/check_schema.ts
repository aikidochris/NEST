
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split("\n").forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
});

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    console.log("Fetching properties...");
    const { data, error } = await admin.from("properties").select("*").limit(1);
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Data:", data);
        if (data && data.length > 0) {
            console.log("Keys:", Object.keys(data[0]));
        }
    }
}
run();
