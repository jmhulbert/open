all:
	node fetch-hydrography.js
	node redcedar-poi.js
	DEBUG=* node create-hydrography-db.js
	DEBUG=* node nearest-hydrography.js
	node nearest-hydrography-csv.js
	node summarize-hydrography.js
	node nconn-to-epsg-4326.js