all:
	node fetch-hydrography.js
	node redcedar-poi.js
	DEBUG=* node create-hydrography-db.js
	DEBUG=* node nearest-hydrography.js
	node nearest-hydrography-csv.js
	node summarize-hydrography.js
	node nconn-to-epsg-4326.js
	make redcedar-poi-nearest-by-period.ta

redcedar-poi-nearest-by-period.ta:
	npx tabular-archive redcedar-poi-nearest-by-period.csv -c redcedar-poi-nearest-by-period-tabular-archive-config.mjs -o redcedar-poi-nearest-by-period.ta
