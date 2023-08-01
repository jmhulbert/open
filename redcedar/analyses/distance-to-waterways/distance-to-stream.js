/**
 * Prerequisites for running this file is running both:
 *
 * `$ node fetch-streams-shapefile.js`
 * `$ node streams-spatial-index.js`
 * `$ node redcedar-poi.js`
 *
 * See those files for their own inputs and outputs.
 *
 * Using the streams spatial index, and the obervation POI,
 * determine the distance to the closest stream feature.
 *
 * Return a geojson feature collection of point features, whose
 * coordinates are the position on the stream closest to the observation
 * POI (`redcedar-poi-nearest-k${n}.geojson`). A geojson feature
 * collection of the line features that connect the observation POI
 * and the closest point on the stream is saved out as 
 * `redcedar-poi-nearest-connections-k${n}.geojson`.
 *
 * `redcedar-poi-nearest-k${n}.geojson` stores the original observation
 * POI attributes with the prefix `opoint`. The stream attributes are
 * prefixed with `nline`. The distance between the observation point
 * and the stream point is stored as `npoint-dist`.
 */

import Flatbush from 'flatbush'
import {Level} from 'level'
import {point,lineString} from '@turf/helpers'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import distance from '@turf/distance'
import pointToLineDistance from '@turf/point-to-line-distance'
import Debug from 'debug'
import proj from 'proj4'

import path from 'path'
import fs from 'node:fs/promises'

// debug
import bbox from '@turf/bbox'
import bboxPolygon from '@turf/bbox-polygon'

import {fid} from './streams-spatial-index.js'

const debug = Debug('nearest')

main()

async function main () {
  const knearest = 10
  const pathToPoints = path.join(process.cwd(), 'redcedar-poi.geojson')
  const pathToDb = 'wa-dnr-streams-db'
  const pathToNearest = path.join(process.cwd(), `redcedar-poi-nearest-k${knearest}.geojson`)
  const pathToConnections = path.join(process.cwd(), `redcedar-poi-nearest-connections-k${knearest}.geojson`)
  return await analysis({ pathToPoints, pathToNearest, pathToConnections, pathToDb })
}

async function analysis ({ pathToPoints, pathToNearest, pathToConnections, pathToDb, knearest }) {
  const db = new Level(pathToDb, { valueEncoding: 'json' })
  const points = await readJson(pathToPoints)
  // use pointsFilter to limit the points that are included in the analysis
  const pointsFilter = (p) => p.properties.id === "89669701"
  const {nearest, connections} = await streamPointsNearestPointOnLines({
    db,
    points,
    knearest,
    // pointsFilter,
  })
  await writeJson(pathToNearest, nearest)
  await writeJson(pathToConnections, connections)
}

async function readJson (p) {
  return JSON.parse((await fs.readFile(p)).toString())
}

async function writeJson (p, d) {
  await fs.writeFile(p, JSON.stringify(d, null, 2))
}

function kilometersToMeters (km) {
  return km * 1000
}

async function streamPointsNearestPointOnLines ({
  db,
  points,
  knearest=1,
  pointsFilter=() => true,
}) {
  const nearestFC = {
    crs: points.crs,
    type: points.type,
    features: [],
  }
  const linesFC = {
    crs: points.crs,
    type: points.type,
    features: [],
  }

  const lineId = (f) => f.properties?.OBJECTID
  const pointId = (f) => f.properties?.id
  const sourceProj = 'EPSG:3857'
  const distProj = 'EPSG:4326'

  const bufJson = await db.get('index')
  const buf = Buffer.from(bufJson)
  const indexData = new Int8Array(buf)
  const index = Flatbush.from(indexData.buffer)

  const units = { units: 'kilometers' }

  for (let i = 0; i < points.features.length; i++) {
    const pnt = points.features[i]
    if (!pointsFilter(pnt)) continue
    const [x, y] = pnt.geometry.coordinates
    const ids = index.neighbors(x, y, knearest)
    let npoint = { properties: { dist: Infinity } }
    let nline = {}
    for (const id of ids) {
      const feature = await db.get(fid(id))
      const line = lineString(
        feature.geometry.coordinates.map((p) => {
          return proj(sourceProj, distProj, p)
        })
      )
      const cnpoint = nearestPointOnLine(line, point(proj(sourceProj, distProj, [x, y])), units)
      cnpoint.properties.dist = kilometersToMeters(cnpoint.properties.dist)
      cnpoint.geometry.coordinates = proj(distProj, sourceProj, cnpoint.geometry.coordinates)
      if (cnpoint.properties.dist < npoint.properties.dist) {
        npoint = Object.assign({}, cnpoint)
        nline = Object.assign({}, feature)
      }
    }
    const connectingLine = lineString(
      [pnt.geometry.coordinates, npoint.geometry.coordinates],
      {
        'source-point-id': pointId(pnt),
        'target-line-id': lineId(nline),
        'source-target-distance': npoint.properties.dist,
      })
    linesFC.features.push(connectingLine)
    const np = Object.assign({}, npoint, {
      properties: Object.assign({},
        prefix('npoint', npoint.properties),
        prefix('nline', nline.properties),
        prefix('opoint', pnt.properties))
    })
    nearestFC.features.push(np)
  }

  return {
    nearest: nearestFC,
    connections: linesFC,
  }

  function prefix (pre, data) {
    const o = {}
    for (const key in data) {
      o[`${pre}-${key}`] = data[key]
    }
    return o
  }
}
