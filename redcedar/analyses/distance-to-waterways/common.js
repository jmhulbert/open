import path from 'node:path'
import {pipe} from 'mississippi'

export const hydrographyDir = 'hydrography'

export const dataDir = path.join(process.cwd(), '..', '..', 'data')

export const redcedarPoiGeojsonPath = path.join(process.cwd(), 'redcedar-poi.geojson')

export const nearestSpec = {
  baseFileName: 'redcedar-poi-nearest',
  analysisSpecs: [
    {
      name: 'period-all',
      include: new Set(['Unknown', 'Ephemeral', 'Intermittent', 'Perennial']),
    },
    {
      name: 'period-min-eph',
      include: new Set(['Ephemeral', 'Intermittent', 'Perennial']),
    },
    {
      name: 'period-min-int',
      include: new Set(['Intermittent', 'Perennial']),
    },
    {
      name: 'period-per',
      include: new Set(['Perennial']),
    },
  ],
  idSpec: {
    poiId: (poi) => poi.properties?.id,
    // this is the id based on the input redcedar-poi.geojson file
    // used in the `nconn` output of the analysis
    opointId: (f) => `id:${f.properties?.id}`,
    // the reverse of the above
    opointIdToPoiId: (nconn) => {
      const id = nconn.properties['opoint-id']
      return id.slice(3)
    },
    // this is the id based on the nearest feature, weather thats
    // a water body (WB_ID) or a water course (WC)
    nfeatId: (f) => {
      if (f.properties?.WB_ID) return `WB_ID:${f.properties.WB_ID}`
      if (f.properties?.WC_ID) return `WC_ID:${f.properties.WC_ID}`
    },
  }
}

const stringifyArgs = [
  `{
    "crs": {
      "type": "name",
      "properties": {
        "name": "urn:ogc:def:crs:EPSG::3857"
      }
    },
    "type": "FeatureCollection",
    "features": [
  `,
  '\n,\n',
  ']}'
]

nearestSpec.analysisParams = nearestSpec.analysisSpecs.map((spec) => {
  const baseResultFileName = `${nearestSpec.baseFileName}-${spec.name}`
  return {
    analysisSpec: spec,
    resultSpecs: [
      {
        type: 'npoint',
        valueFn: (row) => row.npoint,
        fileName: `${baseResultFileName}-npoint.geojson`,
        stringifyArgs,
      },
      {
        type: 'nconn',
        valueFn: (row) => row.nconn,
        fileName: `${baseResultFileName}-nconn.geojson`,
        stringifyArgs,
      }
    ],
    filterFeature: (feature) => {
      const period = feature.properties?.WC_PERIO_1 || feature.properties?.WB_PERIO_1
      return spec.include.has(period)
    }
  }
})

export const pipePromise = (...args) => {
  return new Promise((resolve, reject) => {
    const done = (error) => {
      if (error) reject(error)
      else resolve()
    }
    pipe.apply(null, args.concat([done]))
  })
}