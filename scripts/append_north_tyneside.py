import duckdb
import psycopg2
from psycopg2.extras import execute_values
import json

# Connection string
DB_URL = "postgresql://postgres:4XBqxZm0L23BtLKL@db.trqrbtqsrmzcfgmmvicy.supabase.co:5432/postgres"

def run():
    print("Initializing DuckDB...")
    con = duckdb.connect()
    # Install extensions silently
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("SET s3_region='us-west-2';")

    print("Querying Overture Maps (North Tyneside: NE25-NE30)...")
    # Coordinates: -1.58 (West), 54.96 (South), -1.40 (East), 55.08 (North)
    query = """
    SELECT id, names.primary as name, height, 
           COALESCE(height, 6.5) as render_height,
           ST_AsGeoJSON(geometry) as geom_json
    FROM read_parquet('s3://overturemaps-us-west-2/release/2025-12-17.0/theme=buildings/type=building/*', filename=true, hive_partitioning=1)
    WHERE bbox.xmin BETWEEN -1.58 AND -1.40
      AND bbox.ymin BETWEEN 54.96 AND 55.08
    """
    
    print("Fetching results from DuckDB (this may take a moment)...")
    results = con.execute(query).fetchall()
    total = len(results)
    print(f"Fetched {total} buildings from Overture.")

    if total == 0:
        print("No buildings found. Check coordinates or connection.")
        return

    print("Connecting to Supabase...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Ensure table exists (idempotent, NO DROP)
    print("Ensuring table schema...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS overture_buildings (
            id TEXT PRIMARY KEY,
            name TEXT,
            height DOUBLE PRECISION,
            render_height DOUBLE PRECISION,
            geometry GEOMETRY(Geometry, 4326)
        );
        CREATE INDEX IF NOT EXISTS overture_buildings_geom_idx ON overture_buildings USING GIST (geometry);
    """)
    conn.commit()

    BATCH_SIZE = 1000
    print(f"Appending data in batches of {BATCH_SIZE}...")

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
    # ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326) converts the GeoJSON string to PostGIS Geometry
    template = "(%s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))"

    for i in range(0, total, BATCH_SIZE):
        batch = results[i:i + BATCH_SIZE]
        
        try:
            execute_values(cur, insert_query, batch, template=template)
            conn.commit()
            
            # Simple progress bar
            if (i + BATCH_SIZE) % 5000 < BATCH_SIZE:
                print(f"Progress: {min(i + BATCH_SIZE, total)} / {total}")
                
        except Exception as e:
            conn.rollback()
            print(f"Error in batch {i}: {e}")
            break

    cur.close()
    conn.close()
    print("North Tyneside append complete.")

if __name__ == "__main__":
    run()
