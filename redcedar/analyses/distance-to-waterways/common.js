import path from 'node:path'
import {pipe} from 'mississippi'
import Debug from 'debug'
import {
  lineFCodeToPeriod,
  areaFCodeToPeriod,
  fcodeToPeriod,
} from './fcode-period-map.js'

import common from './common.json' assert { type: 'json' };

const debug = Debug('common')

export const hydrographyDir = 'hydrography'

export const FEATURE_TYPE = {
  LINE: 'line',
  POLYGON: 'polygon',
}

export const featureTypes = Object.keys(FEATURE_TYPE).map(key => FEATURE_TYPE[key])

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
  analysis: 'EPSG:4269',
  nearest: 'EPSG:4326',
  reporting: 'EPSG:4326',
}


export const RESULT_TYPES = {
  NCONN: 'nconn',
  NPOINT: 'npoint',
}

const featureTypeForFeature = (f) => {
  let featureType
  if (isNaN(f.properties?.['SHAPE_Area'])) featureType = FEATURE_TYPE.LINE
  else featureType = FEATURE_TYPE.POLYGON
  return featureType
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
    // this is the id based on the nearest feature
    nfeatId: (f) => {
      const featureType = featureTypeForFeature(f)
      return `${featureType}:${f.properties['permanent_']}`
    },
    nfeatIdParts: (f) => {
      const featureType = featureTypeForFeature(f)
      return [featureType, f.properties?.['permanent_']]
    },
    nfeatIdPartsFromString: (nfeatId) => {
      const [featureType, permanentId] = nfeatId.split(':')
      return [featureType, permanentId]
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

export const linePeriodForFeature = ({ feature }) => {
  const fcode = feature.properties?.fcode
  const period = lineFCodeToPeriod[fcode]
  return period
}

export const hasLinePeriodToConsider = ({ feature }) => {
  return typeof linePeriodForFeature({ feature }) === 'string'
}

export const areaPeriodForFeature = ({ feature }) => {
  const fcode = feature.properties?.fcode
  const period = areaFCodeToPeriod[fcode]
  return period
}

export const hasAreaPeriodToConsider = ({ feature }) => {
  return typeof areaPeriodForFeature({ feature }) === 'string'
}

export const periodForFeature = ({ feature }) => {
  const fcode = feature.properties?.fcode
  const period = fcodeToPeriod[fcode]
  return period
}

export const hasPeriodToConsider = ({ feature }) => {
  return typeof periodForFeature({ feature }) === 'string'
}

nearestSpec.analysisParams = nearestSpec.analysisSpecs.map((spec) => {
  const baseResultFileName = `${nearestSpec.baseFileName}-${spec.name}`
  return {
    analysisSpec: {
      ...spec,
      filterFeature: (feature) => {
        const period = periodForFeature({ feature })
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
        valueFn: async ({ nconn }) => nconn.properties.dist
      },
      {
        key: `${spec.name}-nfeat-id`,
        valueFn: async ({ nconn }) => nconn.properties['nfeat-id']
      },
      {
        key: `${spec.name}-nfeat-period`,
        valueFn: async ({ spatialDB, nconn }) => {
          const nfeatId = nconn.properties['nfeat-id']
          const { feature } = await spatialDB.getNFeatIdFeature({ nfeatId })
          const period = periodForFeature({ feature })
          return period
        },
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