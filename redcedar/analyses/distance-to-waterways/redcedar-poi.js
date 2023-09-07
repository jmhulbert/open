/**
 * Prerequisites for running this file include running:
 *
 * `$ node fetch-hydrography.js`
 * 
 * Create the `redcedar-poi.geojson` file. The input of this is 
 * the `data-modified.csv` file of observations, which gets spatially
 * intersected with the WA DNR watersheds shapefile. If a point in the
 * observations file falls within one of the watersheds, it is preserved
 * and written to the `redcedar-poi.geojson` file for further processing.
 *
 * The inpute `data-modified.csv` lon, lat coordinates use the coordinate
 * system EPSG:4326, so they are reprojected into EPSG:3857 to align
 * with the other hydrography features.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import csv from 'csv-parser'
import path from 'node:path'
import {point, multiPolygon} from '@turf/helpers'
import pointInPolygon from '@turf/boolean-point-in-polygon'
import proj from 'proj4'
import shapefile from '@rubenrodriguez/shapefile'
import {hydrographyDir, dataDir, redcedarPoiGeojsonPath, projSpec} from './common.js'
import Debug from 'debug'

const debug = Debug('redcedar-poi')

main()

async function main () {
  const pathToPointsInput = path.join(dataDir, 'data-modified.csv')
  const pointInputProj = projSpec.reporting
  const pathToPolygon = path.join(process.cwd(), hydrographyDir, 'Shape', 'WBDHU8.shp')
  const polygonProj = projSpec.analysis
  const pointOutputProj = projSpec.analysis
  const {poi} = await execute({
    pathToPointsInput,
    pointInputProj,
    pathToPolygon,
    polygonProj,
    pointOutputProj,
  })

  const pathToPointsOutput = redcedarPoiGeojsonPath
  await fsp.writeFile(pathToPointsOutput, JSON.stringify(poi, null, 2))
}

async function execute ({
  pathToPointsInput,
  pointInputProj,
  pathToPolygon,
  polygonProj,
  pointOutputProj,
}) {

  const crs = { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::4269" } }

  // the final geojson of the POI
  const poiFc = {
    type: "FeatureCollection",
    crs,
    features: []
  }

  // the geojson of the intersecting polygon features
  const polygonsFc = {
    type: 'FeatureCollection',
    crs,
    features: [],
  }


  const polygons = await shapefile.open(pathToPolygon)

  async function read ({ onResult }) {
    const result = await polygons.read()
    if (result.done) return
    await onResult({ result })
    return await read({ onResult })
  }

  async function onPolygon ({ result }) {
    const feature = result.value
    polygonsFc.features.push(feature)
  }

  await read({ onResult: onPolygon })

  let count = 0

  return new Promise((resolve, reject) => {
    fs.createReadStream(pathToPointsInput)
      .pipe(csv())
      .on('data', (row) => {
        const pnt = [row.longitude, row.latitude].map(Number)
        // if coorindates are not a number, early exit
        if (pnt.filter(isNaN).length > 0) return
        const pntProjected = proj(pointInputProj, polygonProj, pnt)
        let isContained = false
        for (const poly of polygonsFc.features) {
          if (pointInPolygon(point(pntProjected), poly)) {
            isContained = true
            break
          }
        }
        // if point is not contained within the polygon, early exit
        if (!isContained) return
        count++
        poiFc.features.push(point(pntProjected, row))
      })
      .on('end', () => {
        resolve({ poi: poiFc })
      })
      .on('error', reject)
  })
}
