LOAD spatial;
LOAD httpfs;
SET s3_region='us-west-2';
COPY (
  SELECT id, names.primary as name, height, 
         COALESCE(height, 6.5) as render_height,
         geometry as geometry
  FROM read_parquet('s3://overturemaps-us-west-2/release/2025-12-17.0/theme=buildings/type=building/*', filename=true, hive_partitioning=1)
  WHERE bbox.xmin BETWEEN -1.78 AND -1.52
    AND bbox.ymin BETWEEN 54.95 AND 55.09
) TO 'newcastle_buildings.geojson' WITH (FORMAT GDAL, DRIVER 'GeoJSON');
