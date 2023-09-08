/**
 * Prerequisites for running this file include running:
 *
 * `$ node fetch-hydrography.js`
 * 
 * Create a [spatial-db](./spatial-db) instance that holds the NHD
 * water courses and water bodies features, giving the ability to fetch
 * individual features from the database, as well as search for k nearest
 * kneighbors to a particular [lon, lat] position.
 *
 * Water course features are added to the line feature spatial index.
 *
 * Water body features are saved as polygons to do intersection tests and indexed
 * under the polygon feature spatial index. Each polygon is also converted
 * into a line and indexed alongside other line features in the line feature
 * spatial index.
 *
 * All features that are included in the spatial index are also accessible by
 * the index value they hold in the spatial index, this is an affordance of 
 * [flatbush](https://github.com/mourner/flatbush) which provides spatial
 * indexing functionality.
 *
 * The entire database is written to the `hydrography-db` directory.
 */

import fs from 'node:fs'
import shapefile from '@rubenrodriguez/shapefile'
import bboxPolygon from '@turf/bbox-polygon'
import polygonToLine from '@turf/polygon-to-line'
import pointOnFeature from '@turf/point-on-feature'
import pointInPolygon from '@turf/boolean-point-in-polygon'
import Debug from 'debug'
import path from 'path'
import {through} from 'mississippi'
import {parse} from 'geojson-stream'
import {
  hydrographyDir,
  hasPeriodToConsider,
  redcedarPoiGeojsonPath,
  pipePromise,
} from './common.js'
import {SpatialDB, dbSpec} from './spatial-db.js'

const debug = Debug('create-hydrography-db')

const SHP_TYPE = {
  POLYGON: 'Polygon',
  LINE: 'LineString',
}

const shpSpecs = [
  {
    type: SHP_TYPE.LINE,
    path: path.join(
      process.cwd(),
      hydrographyDir,
      'Shape',
      'NHDFlowline_0.shp'),
    filterFeature: ({ feature }) => hasPeriodToConsider({ feature }),
  },
  {
    type: SHP_TYPE.LINE,
    path: path.join(
      process.cwd(),
      hydrographyDir,
      'Shape',
      'NHDFlowline_1.shp'),
    filterFeature: ({ feature }) => hasPeriodToConsider({ feature }),
  },
  {
    type: SHP_TYPE.LINE,
    path: path.join(
      process.cwd(),
      hydrographyDir,
      'Shape',
      'NHDFlowline_2.shp'),
    filterFeature: ({ feature }) => hasPeriodToConsider({ feature }),
  },
  {
    type: SHP_TYPE.POLYGON,
    path: path.join(
      process.cwd(),
      hydrographyDir,
      'Shape',
      'NHDWaterbody.shp'),
    filterFeature: ({ feature }) => hasPeriodToConsider({ feature }),
  },
]

const watershedSpecs = {
  path: path.join(
    process.cwd(),
    hydrographyDir,
    'Shape',
    'WBDHU10.shp'
    ),
}

const db = SpatialDB(dbSpec)

const WatershedIndex = async () => {
  const onResult = async ({ result }) => {
    const feature = result.value
    await db.watershedPut({ feature })
  }
  const reader = shpReader(watershedSpecs)
  await reader.open()
  await reader.read({ onResult })
  const watershedIndex = await db.watershedCreateIndex()
  return { watershedIndex }
}

// feature is a hydrography feature
// - get the nearest watershed
// - from that watershed see if any POI intersects it
// - if so, keep it around for the reaminder of the analysis
const hydrographyIntersectsPOIWatershed = async ({ watershedIndex, feature }) => {
  let toConsider = false
  const pnt = pointOnFeature(feature)
  const [x, y] = pnt.geometry.coordinates
  const ids = watershedIndex.neighbors(x, y, 10)
  let watershed
  for (const id of ids) {
    const checkWatershed = await db.watershedGet(id)
    if (pointInPolygon(pnt, checkWatershed.feature)) {
      watershed = checkWatershed
      break
    }
  }
  if (!watershed) {
    debug('no-watershed-found')
    return toConsider
  }
  // is there a poi in the watershed
  try {
    await pipePromise(
      fs.createReadStream(redcedarPoiGeojsonPath),
      parse(),
      through.obj(async (poi, enc, next) => {
        if (pointInPolygon(poi, watershed.feature)) {
          toConsider = true
          next(new Error('early-exit'))
        }
        else {
          next()
        }
      })
    ) 
  }
  catch (error) {
    // swallow error, we wanted to early exit
  }
  return toConsider
}

const onPolygon = ({ filterFeature, watershedIndex }) => async ({ result }) => {
  const feature = result.value
  if (!filterFeature({ feature })) return
  if (!await hydrographyIntersectsPOIWatershed({ feature, watershedIndex })) return
  const line = polygonToLine(feature)
  await db.putPolygon({ feature })
  await db.putLine({ feature: line })
}
const onLine = ({ filterFeature, watershedIndex }) => async ({ result }) => {
  const feature = result.value
  if (!filterFeature({ feature })) return
  if (!await hydrographyIntersectsPOIWatershed({ feature, watershedIndex })) return
  await db.putLine({ feature })
}

const shpReader = (shpSpec) => {
  let source

  async function open () {
    source = await shapefile.open(shpSpec.path)
    debug('source-open:type', shpSpec.type)
    debug('source-open:featureCount', source.featureCount)
    return source
  }

  async function read ({ onResult }) {
    if (!source) throw new Error('Must run \`open\` successfully first.')
    const result = await source.read()
    if (result.done) return
    await onResult({ result })
    return await read({ onResult })
  }

  return { open, read }
}

const { watershedIndex } = await WatershedIndex()

for (const shpSpec of shpSpecs) {
  const reader = shpReader(shpSpec)
  await reader.open()
  const onResult = shpSpec.type === SHP_TYPE.POLYGON
    ? onPolygon
    : onLine
  await reader.read({ onResult: onResult({ ...shpSpec, watershedIndex }) })
}
await db.createIndicies()
