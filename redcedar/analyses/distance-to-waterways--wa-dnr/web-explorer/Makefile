all: pmtiles-all

geojson-all: geojson geojson/Watershed_Administrative_Units_-_Forest_Practices_Regulation.geojson geojson-water-bodies geojson-water-courses

geojson:
	mkdir -p geojson

geojson/Watershed_Administrative_Units_-_Forest_Practices_Regulation.geojson: geojson
	curl -o geojson/Watershed_Administrative_Units_-_Forest_Practices_Regulation.geojson https://opendata.arcgis.com/api/v3/datasets/d8d2aeaa4cb24cca92b708b7ba086279_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1

geojson/DNR_Hydrography_-_Water_Bodies_-_Forest_Practices_Regulation.geojson: geojson
	curl -o geojson/DNR_Hydrography_-_Water_Bodies_-_Forest_Practices_Regulation.geojson https://opendata.arcgis.com/api/v3/datasets/28a0f93c33454297b4a9d3faf3da552a_1/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1

geojson/DNR_Hydrography_-_Watercourses_-_Forest_Practices_Regulation.geojson: geojson
	curl -o geojson/DNR_Hydrography_-_Watercourses_-_Forest_Practices_Regulation.geojson https://opendata.arcgis.com/api/v3/datasets/816586b10c6c4954883b236f9fff208f_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1

mbtiles-all: geojson-all mbtiles/water-sheds.mbtiles mbtiles/water-bodies.mbtiles mbtiles/water-courses.mbtiles

mbtiles:
	mkdir -p "mbtiles"

mbtiles/water-sheds.mbtiles: mbtiles
	tippecanoe -zg -o mbtiles/water-sheds.mbtiles -l water-sheds -n "WA DNR water sheds" --drop-densest-as-needed geojson/Watershed_Administrative_Units_-_Forest_Practices_Regulation.geojson

mbtiles/water-bodies.mbtiles: mbtiles
	tippecanoe -zg -o mbtiles/water-bodies.mbtiles -l water-bodies -n "WA DNR water bodies" --drop-densest-as-needed geojson/DNR_Hydrography_-_Water_Bodies_-_Forest_Practices_Regulation.geojson

mbtiles/water-courses.mbtiles: mbtiles
	tippecanoe -zg -o mbtiles/water-courses.mbtiles -l water-courses -n "WA DNR water courses" --drop-densest-as-needed geojson/DNR_Hydrography_-_Watercourses_-_Forest_Practices_Regulation.geojson

pmtiles-all: mbtiles-all pmtiles-dir pmtiles/water-sheds.pmtiles pmtiles/water-courses.pmtiles pmtiles/water-bodies.pmtiles

pmtiles: 
	mkdir -p "pmtiles"

pmtiles/water-sheds.pmtiles: pmtiles pmtiles-dir pmtiles-dir mbtiles/water-sheds.mbtiles
	pmtiles convert mbtiles/water-sheds.mbtiles pmtiles/water-sheds.pmtiles

pmtiles/water-courses.pmtiles: pmtiles pmtiles-dir pmtiles-dir mbtiles/water-courses.mbtiles
	pmtiles convert mbtiles/water-courses.mbtiles pmtiles/water-courses.pmtiles

pmtiles/water-bodies.pmtiles: pmtiles pmtiles-dir pmtiles-dir mbtiles/water-bodies.mbtiles
	pmtiles convert mbtiles/water-bodies.mbtiles pmtiles/water-bodies.pmtiles

pmtiles-serve:
		pmtiles serve . --cors=* --port=8081

pmtiles-revsere-proxy:
	caddy reverse-proxy --from localhost:8080 --to :8081
