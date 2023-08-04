/**
 * Prerequisites for running this file include running:
 *
 * `$ node fetch-hydrography.js`
 * `$ node create-hydrography-db.js`
 * `$ node redcedar-poi.js`
 *
 * Using the hydrography spatial index, and the redcedar observation
 * POI, determine the distance to the closest hydrography feature. There
 *
 * Return a geojson feature collection of point features, whose
 * coordinates are the position on the hydrography feature closest
 * to the observation POI (`redcedar-poi-nearest-npoint-{filter}.geojson`).
 * A geojson feature collection of the line features that connect
 * the observation POI and the closest point on the stream is
 * saved out as `redcedar-poi-nearest-nconn-{filter}.geojson`.
 *
 * `redcedar-poi-nearest-k${n}.geojson` stores the original observation
 * POI attributes with the prefix `opoint`. The hydrography attributes are
 * prefixed with `nfeat`. The distance between the observation point
 * and the stream point is stored as `npoint-dist`.
 */

import path from 'path'
import fs from 'node:fs/promises'
import {point,lineString} from '@turf/helpers'
import pointInPolygon from '@turf/boolean-point-in-polygon'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import distance from '@turf/distance'
import pointToLineDistance from '@turf/point-to-line-distance'
import {pipe, through} from 'mississippi'
import {parse} from 'geojson-stream'
import {stringify} from 'JSONStream'
import {SpatialDB, dbSpec} from './spatial-db.js'
import {redcedarPoiGeojsonPath} from './common.js'
import Debug from 'debug'
import proj from 'proj4'


const db = SpatialDB(dbSpec)

const debug = Debug('nearest')
const knearest = 10
const baseFileName = 'redcedar-poi-nearest'

// different analysis to run through
const analysisSpecs = [
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
]

const proj = {
  source: 'EPSG:3857',
  nearest: 'EPSG:4326',
}

const ids = {
  // this is the id based on the input redcedar-poi.geojson file
  opointId: (f) => `id:${f.properties?.id}`,
  // this is the id based on the nearest feature, weather thats
  // a water body (WB_ID) or a water course (WC)
  nfeatId: (f) => {
    if (f.properties?.WB_ID) return `WB_ID:${f.properties.WB_ID}`
    if (f.properties?.WC_ID) return `WC_ID:${f.properties.WC_ID}`
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

const analysisParams = analysisSpecs.map((spec) => {
  const baseResultFileName = `${baseFileName}-${spec.name}`
  return {
    resultSpecs: [
      {
        valueFn: (row) => row.npoint,
        fileName: `${baseResultFileName}-npoint.geojson`,
        stringifyArgs,
      },
      {
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

async function Analysis ({ db, ids, proj, knearest=1 }) {
  const nearestOptions = { units: 'kilometers' }
  const kilometersToMeters = (km) => {
    return km * 1000
  }

  const lineIndex = await db.getLineIndex()
  const polygonIndex = await db.getPolygonIndex()

  let filterFeature = () => true
  const setFilterFeature = (fn) => {
    filterFeature = fn
  }

  async function findIds ({ index, x, y, get, cknearest, offset=0, ids=[] }) {
    const _ids = index.neighbors(x, y, cknearest).slice(offset)
    for (const id of _ids) {
      const { feature } = await get(id)
      if (!filterFeature(feature)) continue
      ids.push(id)
      if (ids.length >= knearest) break
    }

    if (ids.length >= knearest) return { ids }
    return await findIds({ index, x, y, get, cknearest+knearest, offset+knearest, ids })
  }

  async function inPolygon (poi) {
    let isInPolygon = false
    let polygon
    const [x, y] = poi.geoemtry.coordinates
    const { ids } = await findIds({
      index: polygonIndex,
      x,
      y,
      get: db.getPolygon,
      cknearest: knearest,
      offset: 0,
    })
    for (const id of ids) {
      const { feature } = await db.getPolygon(id)
      if (pointInPolygon(poi, feature)) {
        isInPolygon = true
        polygon = feature
        break
      }
    }

    return {
      isInPolygon,
      polygon,
    }
  }

  const poiStream = () => through.obj(async (poi, enc, next) => {
    const {isInPolygon, polygon} = await inPolygon(poi)
    if (isInPolygon) {
      const nfeat = polygon
      const npoint = point(poi.geometry.coordinates, {
        ...prefix('npoint', { dist: 0 })
        ...prefix('opoint', poi.properties),
        ...prefix('nfeat', nfeat.properties),
      })
      const nconn = lineString(
        [poi.geometry.coordinates, poi.geometry.coordinates],
        {
          'opoint-id': ids.opointId(poi),
          'nfeat-id': ids.nfeatId(nfeat),
          dist: 0,
        })
      return next(null, { npoint, nconn })
    }
    const [x, y] = poi.geoemtry.coordinates
    const { ids } = await findIds({
      index: lineIndex,
      x,
      y,
      get: db.getLine,
      cknearest: knearest,
      offset: 0,
    })
    let npoint = { properties: { dist: Infinity } }
    let nfeat
    for (const id of ids) {
      const { feature } = await db.getLineIndex(id)
      // nearestPointOnLine wants to be processed in proj.nearest
      const lineCoords = lineString(
        feature.geometry.coordinates.map(p => {
          return proj(proj.source, proj.nearest, p)
        })
      )
      // proj.nearest
      const pointCoords = point(proj(proj.source, proj.nearest, [x, y]))
      // proj.nearest
      const cnpoint = nearestPointOnLine(lineCoords, pointCoords, nearestOptions)
      cnpoint.properties.dist = kilometersToMeters(cnpoint.properties.dist)
      if (cnpoint.properties.dist < npoint.properties.dist) {
        // return to proj.source
        cnpoint.geometry.coordinates = proj(proj.nearest, proj.source, cnpoint.geometry.coordinates)
        npoint = { ...cnpoint }
        nfeat = { ...feature }
      }
    }
    npoint = {
      ...npoint,
      properties: {
        ...prefix('npoint', npoint.properties),
        ...prefix('nfeat', nfeat.properties),
        ...prefix('opoint', poi.properties),
      }
    }
    const nconn = lineString(
      [poi.geometry.coordinates, npoint.geometry.coordinates],
      {
        'opoint-id': ids.opointId(poi),
        'nfeat-id': ids.nfeatId(nfeat),
        dist: npoint.properties.dist,
      })
    return next(null, { npoint, nconn })
  })

  return {
    setFilterFeature,
    poiStream,
  }
}

const analysis = Analysis({
  db,
  ids,
  proj,
  knearest,
})

for (const params of analysisParams) {
  analysis.setFilterFeature(params.filterFeature)

  await pipePromise(
    fs.createReadStream(redcedarPoiGeojsonPath),
    parse(),
    analysis.poiStream(),
    ResultWriter(params.resultSpecs)
  )
}

function pipePromise (...args) {
  return new Promise((resolve, reject) => {
    const done = (error) => {
      if (error) reject(error)
      else resolve()
    }
    pipe.apply(null, args.concat([done]))
  })
}

function ResultWriter (resultSpecs) {
  let count = 0
  const results = resultSpecs.map((s) => {
    const stream = through.obj()
    return {
      ...s,
      stream,
      pipeline: pipe(stream, stringify(...s.stringifyArgs), fs.createWriteStream(s.fileName), (error) => {
        if (error) console.log(error)
      })
    }
  })
  return through.obj((row, enc, next) => {
    count += 1
    console.log({count})
    for (const {valueFn, stream} of results) {
      const value = valueFn(row)
      if (!value) continue
      stream.push(value)
    }
    next()
  }, () => {
    for (const {stream} of results) {
      stream.push(null)
    }
  })
}
