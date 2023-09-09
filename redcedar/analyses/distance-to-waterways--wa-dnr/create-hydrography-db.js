/**
 * Prerequisites for running this file include running:
 *
 * `$ node fetch-hydrography.js`
 * 
 * Create a [spatial-db](./spatial-db) instance that holds the WA DNR
 * water courses and water bodies features, giving the ability to fetch
 * individual features from the database, as well as search for k nearest
 * kneighbors to a particular [lon, lat] position.
 *
 * Water course features are added to the line feature spatial index.
 *
 * Water body features with a period label (WB_PERIOD_LABEL_NM) value
 * of "Dry land" are removed, since we are looking for relationships to
 * wet areas. They are saved as polygons to do intersection tests and indexed
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

import shapefile from '@rubenrodriguez/shapefile'
import bboxPolygon from '@turf/bbox-polygon'
import polygonToLine from '@turf/polygon-to-line'
import Debug from 'debug'
import path from 'path'
import {hydrographyDir} from './common.js'
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
      'DNR_Hydrography_-_Watercourses_-_Forest_Practices_Regulation.shp'),
    filterFeature: (feature) => true,
  },
  {
    type: SHP_TYPE.POLYGON,
    path: path.join(
      process.cwd(),
      hydrographyDir,
      'DNR_Hydrography_-_Water_Bodies_-_Forest_Practices_Regulation.shp'),
    filterFeature: ({ feature }) => {
      // any feature with a period label of 'Dry land' does not need to be
      // included in the index
      return feature.properties.WB_PERIO_1 !== 'Dry land'
    }
  },
]

const db = SpatialDB(dbSpec)

const onPolygon = ({ filterFeature }) => async ({ result }) => {
  const feature = result.value
  if (!filterFeature({ feature })) return
  const line = polygonToLine(feature)
  await db.putPolygon({ feature })
  await db.putLine({ feature: line })
}
const onLine = ({ filterFeature }) => async ({ result }) => {
  const feature = result.value
  if (!filterFeature({ feature })) return
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

for (const shpSpec of shpSpecs) {
  const reader = shpReader(shpSpec)
  await reader.open()
  const onResult = shpSpec.type === SHP_TYPE.POLYGON
    ? onPolygon
    : onLine
  await reader.read({ onResult: onResult({ ...shpSpec }) })
}
await db.createIndicies()
