/**
 * Create the `redcedar-poi.geojson` file. The input of this is 
 * the `data-modified.csv` file of observations, which gets spatially
 * intersected with the WA DNR watersheds shapefile. If a point in the
 * observations file falls within one of the watersheds, it is preserved
 * and written to the `redcedar-poi.geojson` file for further processing
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import csv from 'csv-parser'
import path from 'node:path'
import {point, multiPolygon} from '@turf/helpers'
import contains from '@turf/boolean-contains'
import proj from 'proj4'
import shapefile from '@rubenrodriguez/shapefile'
import Debug from 'debug'

const debug = Debug('redcedar-poi')

main()

async function main () {
  const pathToPointsInput = path.join(process.cwd(), '..', '..', 'data', 'data-modified.csv')
  const pointInputProj = 'EPSG:4326'
  const pathToPolygon = path.join(process.cwd(), '..', '..', 'data', 'Watershed_Administrative_Units_-_Forest_Practices_Regulation', 'Watershed_Administrative_Units_-_Forest_Practices_Regulation.shp')
  const polygonProj = 'EPSG:3857'
  const pointOutputProj = 'EPSG:3857'
  const {poi} = await execute({
    pathToPointsInput,
    pointInputProj,
    pathToPolygon,
    polygonProj,
    pointOutputProj,
  })

  const pathToPointsOutput = path.join(process.cwd(), 'redcedar-poi.geojson')
  await fsp.writeFile(pathToPointsOutput, JSON.stringify(poi, null, 2))
}

async function execute ({
  pathToPointsInput,
  pointInputProj,
  pathToPolygon,
  polygonProj,
  pointOutputProj,
}) {

  const crs = { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::3857" } }

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
          if (contains(poly, point(pntProjected))) {
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
