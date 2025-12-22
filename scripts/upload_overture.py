import json
import psycopg2
from psycopg2.extras import execute_values
import os

# Supabase Connection string provided by user
DB_URL = "postgresql://postgres:4XBqxZm0L23BtLKL@db.trqrbtqsrmzcfgmmvicy.supabase.co:5432/postgres"
GEOJSON_PATH = "newcastle_buildings.geojson"
BATCH_SIZE = 500

def upload():
    if not os.path.exists(GEOJSON_PATH):
        print(f"Error: {GEOJSON_PATH} not found.")
        return

    print(f"Opening {GEOJSON_PATH}...")
    with open(GEOJSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    features = data.get('features', [])
    total = len(features)
    print(f"Loaded {total} buildings from GeoJSON.")

    print("Connecting to Supabase...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # 1. Ensure table exists
    print("Ensuring overture_buildings table exists (fresh)...")
    cur.execute("""
        DROP TABLE IF EXISTS overture_buildings;
        CREATE TABLE overture_buildings (
            id TEXT PRIMARY KEY,
            name TEXT,
            height DOUBLE PRECISION,
            render_height DOUBLE PRECISION,
            geometry GEOMETRY(Geometry, 4326)
        );
        CREATE INDEX IF NOT EXISTS overture_buildings_geom_idx ON overture_buildings USING GIST (geometry);
    """)
    conn.commit()

    # 2. Process in batches
    print(f"Starting upload in batches of {BATCH_SIZE}...")
    
    for i in range(0, total, BATCH_SIZE):
        batch = features[i:i + BATCH_SIZE]
        values = []
        for feat in batch:
            props = feat.get('properties', {})
            # Extract geometry as JSON string for ST_GeomFromGeoJSON
            geom_json = json.dumps(feat.get('geometry'))
            
            values.append((
                props.get('id'),
                props.get('name'),
                props.get('height'),
                props.get('render_height'),
                geom_json
            ))
        
        # SQL with template for geometry conversion
        insert_query = """
            INSERT INTO overture_buildings (id, name, height, render_height, geometry)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                height = EXCLUDED.height,
                render_height = EXCLUDED.render_height,
                geometry = EXCLUDED.geometry
        """
        
        template = "(%s, %s, %s, %s, ST_GeomFromGeoJSON(%s))"
        
        try:
            execute_values(cur, insert_query, values, template=template)
            conn.commit()
            print(f"Progress: {min(i + BATCH_SIZE, total)} / {total} buildings uploaded.")
        except Exception as e:
            conn.rollback()
            print(f"Error in batch {i//BATCH_SIZE}: {e}")
            # Optional: continue or exit. Given it's a bulk upload, maybe exit to fix.
            break

    cur.close()
    conn.close()
    print("Overture upload complete.")

if __name__ == "__main__":
    upload()
