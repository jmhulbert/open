import path from 'node:path'
import {pipe} from 'mississippi'

import common from './common.json' assert { type: 'json' };

export const hydrographyDir = 'hydrography'

export const periodicityValues = new Set([...["Unknown", "Ephemeral", "Intermittent", "Perennial"]])

export const dataDir = path.join(process.cwd(), '..', '..', 'data')

export const redcedarPoiGeojsonPath = path.join(process.cwd(), 'redcedar-poi.geojson')

export const analysisSpecs = common.analysisSpecs.map(spec => {
  return {
    ...spec,
    include: new Set([...spec.include]),
  }
})

export const projSpec = {
  analysis: 'EPSG:3857',
  nearest: 'EPSG:4326',
  reporting: 'EPSG:4326',
}


export const RESULT_TYPES = {
  NCONN: 'nconn',
  NPOINT: 'npoint',
}

export const nearestSpec = {
  baseFileName: 'redcedar-poi-nearest',
  analysisSpecs,
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
      throw new Error('Should not reach, feature should be either WB or WC.')
    },
    nfeatIdParts: (f) => {
      if (f.properties?.WB_ID) {
        return ['WB_ID', f.properties.WB_ID]
      }
      else if (f.properties?.WC_ID) {
        return ['WC_ID', f.properties.WC_ID]
      }
      throw new Error('Should not reach, feature should be either WB or WC.')
    },
    nfeatIdPartsFromString: (stringId) => {
      const [dataSet, itemId] = stringId.split(':')
      return [dataSet, Number(itemId)]
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
    analysisSpec: {
      ...spec,
      filterFeature: (feature) => {
        const period = feature.properties?.WC_PERIO_1 || feature.properties?.WB_PERIO_1
        return spec.include.has(period)
      },
    },
    resultSpecs: [
      {
        type: RESULT_TYPES.NPOINT,
        valueFn: (row) => row.npoint,
        fileName: `${baseResultFileName}-npoint.geojson`,
        stringifyArgs,
      },
      {
        type: RESULT_TYPES.NCONN,
        valueFn: (row) => row.nconn,
        fileName: `${baseResultFileName}-nconn.geojson`,
        stringifyArgs,
      }
    ],
    csvFields: [
      {
        key: `${spec.name}-dist`,
        valueFn: ({ nconn }) => nconn.properties.dist
      },
      {
        key: `${spec.name}-nfeat-id`,
        valueFn: ({ nconn }) => nconn.properties['nfeat-id']
      },
    ],
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