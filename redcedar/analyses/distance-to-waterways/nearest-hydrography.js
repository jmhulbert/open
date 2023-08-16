/**
 * Prerequisites for running this file include running:
 *
 * `$ node fetch-hydrography.js`
 * `$ node create-hydrography-db.js`
 * `$ node redcedar-poi.js`
 *
 * Using the hydrography spatial index, and the redcedar observation
 * POI, determine the distance to the closest hydrography feature. There
 * are 4 analyses that this runs, they are outlined in `analysisSpecs`
 * below. Each analysis specification has a brief name, and a Set of
 * period labels to filter hydrography features with. The possible
 * period labels include Unknown, Ephemeral, Intermittent, Perennial.
 * Each analysis considers a continually smaller subset of features that
 * carry these period label values, until the final analysis which only
 * looks at redcedar poi distances to Perennial hydrography features.
 *
 * For each analysis, two geojson feature collections are produced. `npoint`
 * is the shorthand for "nearest point", and this is the feature collection
 * that represents points on hydrography features that are closest to an `opoint`,
 * the shorthand for "original point" which is the original redcedar POI. Attributes
 * of the nearest poing are prefixed with "npoint". For example, the distance
 * between the POI and nearest point is stored as "npoint-dist". Attributes of the
 * original POI point are saved with the prefix "opoint". Attributes of the nearest
 * feature are prefixed with "nfeat".
 * 
 * The other geojson feature collection is named `nconn` for "nearest connection",
 * it contains line features that connect the redcedar POI with the nearest point
 * on a hydrography feature. Each feature carries 3 attributes, "opoint-id",
 * "nfeat-id" and "dist". The id attributes are in the shape
 * "{id-field-name}:{id-field-value}". This is useful in particular for the
 * "nfeat-id" field because the nearest feature could be a water body, or a
 * water course. Water body features will have a "{id-field-name}" of "WB_ID"
 * while water course features will be "WC_ID".
 *
 * The file names are in the shape:
 *
 * `redcedadr-poi-nearest-{analysis-name}-npoint.geojson`
 * `redcedadr-poi-nearest-{analysis-name}-nconn.geojson`
 *
 * This leads to the production of all of the following files:
 *
 * `redcedadr-poi-nearest-period-all-npoint.geojson`
 * `redcedadr-poi-nearest-period-all-nconn.geojson`
 * `redcedadr-poi-nearest-period-min-eph-npoint.geojson`
 * `redcedadr-poi-nearest-period-min-eph-nconn.geojson`
 * `redcedadr-poi-nearest-period-min-int-npoint.geojson`
 * `redcedadr-poi-nearest-period-min-int-nconn.geojson`
 * `redcedadr-poi-nearest-period-min-per-npoint.geojson`
 * `redcedadr-poi-nearest-period-min-per-nconn.geojson`
 */

import path from 'path'
import fs from 'node:fs'
import {point,lineString,multiLineString} from '@turf/helpers'
import pointInPolygon from '@turf/boolean-point-in-polygon'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import distance from '@turf/distance'
import pointToLineDistance from '@turf/point-to-line-distance'
import {pipe, through} from 'mississippi'
import {parse} from 'geojson-stream'
import {stringify} from 'JSONStream'
import {SpatialDB, dbSpec} from './spatial-db.js'
import {projSpec, redcedarPoiGeojsonPath, nearestSpec, pipePromise} from './common.js'
import Debug from 'debug'
import proj from 'proj4'


const db = SpatialDB(dbSpec)

const debug = Debug('nearest')
const knearest = 10
const {analysisParams, idSpec} = nearestSpec

async function Analysis ({ db, ids, projSpec, knearest=1 }) {
  const nearestOptions = { units: 'kilometers' }
  const kilometersToMeters = (km) => {
    return km * 1000
  }

  const lineIndex = await db.getLineIndex()
  const polygonIndex = await db.getPolygonIndex()

  let filterFeature = () => true
  const setParams = (params) => {
    filterFeature = params.filterFeature
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
    cknearest += knearest
    offset += knearest
    return await findIds({
      index,
      x,
      y,
      get,
      cknearest,
      offset,
      ids,
    })
  }

  async function inPolygon (poi) {
    let isInPolygon = false
    let polygon
    const [x, y] = poi.geometry.coordinates
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
        ...prefix('npoint', { dist: 0 }),
        ...prefix('opoint', poi.properties),
        ...prefix('nfeat', nfeat.properties),
      })
      const nconn = lineString(
        [poi.geometry.coordinates, poi.geometry.coordinates],
        {
          'opoint-id': idSpec.opointId(poi),
          'nfeat-id': idSpec.nfeatId(nfeat),
          dist: 0,
        })
      return next(null, { npoint, nconn })
    }
    const [x, y] = poi.geometry.coordinates
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
      const { feature } = await db.getLine(id)
      // nearestPointOnLine wants to be processed in projSpec.nearest
      const lineCoords = feature.geometry.type === 'LineString'
        ? lineString(
            feature.geometry.coordinates.map(p => {
              return proj(projSpec.analysis, projSpec.nearest, p)
            })
          )
        : multiLineString(
            feature.geometry.coordinates.map(p => {
              return p.map(sp => {
                return proj(projSpec.analysis, projSpec.nearest, sp)
              })
            })
          )

      // projSpec.nearest
      const pointCoords = point(proj(projSpec.analysis, projSpec.nearest, [x, y]))
      // projSpec.nearest
      const cnpoint = nearestPointOnLine(lineCoords, pointCoords, nearestOptions)
      cnpoint.properties.dist = kilometersToMeters(cnpoint.properties.dist)
      if (cnpoint.properties.dist < npoint.properties.dist) {
        // return to projSpec.analysis
        cnpoint.geometry.coordinates = proj(projSpec.nearest, projSpec.analysis, cnpoint.geometry.coordinates)
        npoint = { ...cnpoint }
        nfeat = { ...feature }
      }
    }
    const nconn = lineString(
      [poi.geometry.coordinates, npoint.geometry.coordinates],
      {
        'opoint-id': idSpec.opointId(poi),
        'nfeat-id': idSpec.nfeatId(nfeat),
        dist: npoint.properties.dist,
      })
    npoint = {
      ...npoint,
      properties: {
        ...prefix('npoint', npoint.properties),
        ...prefix('nfeat', nfeat.properties),
        ...prefix('opoint', poi.properties),
      }
    }
    return next(null, { npoint, nconn })
  })

  return {
    setParams,
    poiStream,
  }
}

const analysis = await Analysis({
  db,
  idSpec,
  projSpec,
  knearest,
})

for (const params of analysisParams) {
  debug('analysis:', params.analysisSpec.name)

  analysis.setParams(params.analysisSpec)

  await pipePromise(
    fs.createReadStream(redcedarPoiGeojsonPath),
    parse(),
    analysis.poiStream(),
    ResultWriter(params.resultSpecs)
  )
}

function ResultWriter (resultSpecs) {
  const results = resultSpecs.map((s) => {
    const stream = through.obj()
    return {
      ...s,
      stream,
      pipeline: pipe(stream, stringify(...s.stringifyArgs), fs.createWriteStream(s.fileName), (error) => {
        if (error) {
          console.log('ResultsWriter:', s.fileName)
          console.log(error)
        }
      })
    }
  })
  return through.obj((row, enc, next) => {
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

function prefix (pre, data) {
  const o = {}
  for (const key in data) {
    o[`${pre}-${key}`] = data[key]
  }
  return o
}
