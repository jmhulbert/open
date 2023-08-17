# web-explorer

This directory publishes an HTML document, javascript bundle, and stylesheet that can be used as an iframe to give users an interactive interface to explore the distance-to-waterways analysis.

The interface is built using [choo](https://www.choo.io) & [tailwind](https://tailwindcss.com). There is a [tabular view](./src/components/tabular.js) of data that is shows paginated results of the analysis backed by [level](https://leveljs.org), and a [map view](./src/components/map/index.js) provided by [maplibre-gl-js](https://maplibre.org). Map hydrography data is processed as descrbited in the [Makefile](./Makefile), converting geojson to mbtiles via [tippecanoe](https://github.com/mapbox/tippecanoe), and finally to [pmtiles](https://protomaps.com/docs/pmtiles/) which were uploaded to s3. Data related to this specific analysis is loaded via geojson.

### development

Development is done via node.js.

1. `npm install` to get dependencies.
2. `npm run dev` or `npm start` will give a local development server.


### deploy

`npm run build` will create production builds to be used when deployed to Github Pages.
