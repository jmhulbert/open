geojson:
	mkdir -p geojson

geojson/WBDHU8.geojson: geojson
	npx shp2json ../hydrography/Shape/WBDHU8.shp | npx project-geojson -s EPSG:4269 -t EPSG:4326 -o geojson/WBDHU8.geojson

geojson/NHDFlowline_0.geojson: geojson
	npx shp2json ../hydrography/Shape/NHDFlowline_0.shp | npx project-geojson -s EPSG:4269 -t EPSG:4326 -o geojson/NHDFlowline_0.geojson

geojson/NHDFlowline_1.geojson: geojson
	npx shp2json ../hydrography/Shape/NHDFlowline_1.shp | npx project-geojson -s EPSG:4269 -t EPSG:4326 -o geojson/NHDFlowline_1.geojson

geojson/NHDFlowline_2.geojson: geojson
	npx shp2json ../hydrography/Shape/NHDFlowline_2.shp | npx project-geojson -s EPSG:4269 -t EPSG:4326 -o geojson/NHDFlowline_2.geojson

geojson/NHDArea.geojson: geojson
	npx shp2json ../hydrography/Shape/NHDArea.shp | npx project-geojson -s EPSG:4269 -t EPSG:4326 -o geojson/NHDArea.geojson	

mbtiles:
	mkdir -p "mbtiles"

mbtiles/nhd-water-sheds.mbtiles: mbtiles geojson/WBDHU8.geojson
	tippecanoe -zg -o mbtiles/nhd-water-sheds.mbtiles -l water-sheds -n "NDH water sheds" --drop-densest-as-needed geojson/WBDHU8.geojson

mbtiles/nhd-water-bodies.mbtiles: mbtiles geojson/NHDArea.geojson
	tippecanoe -zg -o mbtiles/nhd-water-bodies.mbtiles -l water-bodies -n "NHD water bodies" --drop-densest-as-needed geojson/NHDArea.geojson

mbtiles/nhd-water-courses.mbtiles: mbtiles geojson/NHDFlowline_0.geojson geojson/NHDFlowline_1.geojson geojson/NHDFlowline_2.geojson
	tippecanoe -zg -o mbtiles/nhd-water-courses.mbtiles -l water-courses -n "NHD water courses" --coalesce-densest-as-needed --extend-zooms-if-still-dropping geojson/NHDFlowline_0.geojson geojson/NHDFlowline_1.geojson geojson/NHDFlowline_2.geojson

pmtiles-dir: 
	mkdir -p "pmtiles"

pmtiles/nhd-water-sheds.pmtiles: pmtiles-dir mbtiles/nhd-water-sheds.mbtiles
	pmtiles convert mbtiles/nhd-water-sheds.mbtiles pmtiles/nhd-water-sheds.pmtiles

pmtiles/nhd-water-courses.pmtiles: pmtiles-dir pmtiles-dir mbtiles/nhd-water-courses.mbtiles
	pmtiles convert mbtiles/nhd-water-courses.mbtiles pmtiles/nhd-water-courses.pmtiles

pmtiles/nhd-water-bodies.pmtiles: pmtiles-dir pmtiles-dir mbtiles/nhd-water-bodies.mbtiles
	pmtiles convert mbtiles/nhd-water-bodies.mbtiles pmtiles/nhd-water-bodies.pmtiles

pmtiles-serve:
		pmtiles serve pmtiles --cors=* --port=8081

pmtiles-revsere-proxy:
	caddy reverse-proxy --from localhost:8080 --to :8081
