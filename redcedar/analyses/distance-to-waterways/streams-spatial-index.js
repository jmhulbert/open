/**
 * Prerequisite is to download the WA DNR streams to the `wa-dnr-streams`
 * directory, using the command `node fetch-streams-shapefile.js`
 * 
 * Create a [leveldb](https://github.com/google/leveldb) instance that
 * holds the WA DNR water courses shapefile, giving the ability to fetch
 * individual features from the database.
 *
 * As features are added to the database, they are also added to a spatial
 * index using [flatbush](https://github.com/mourner/flatbush).
 *
 * The final index data is stored under the `index` key of the leveldb,
 * allowing other processes to query the spatial index, and then fetch
 * individual features from the database.
 *
 * The index is written to `wa-dnr-streams-db`
 */

import shapefile from '@rubenrodriguez/shapefile'
import Flatbush from 'flatbush'
import bbox from '@turf/bbox'
import bboxPolygon from '@turf/bbox-polygon'
import {Level} from 'level'
import Debug from 'debug'

import path from 'path'

const debug = Debug('shp-index')

main()

async function main () {
  const pathToShp = path.join(
    process.cwd(),
    'wa-dnr-streams',
    'DNR_Hydrography_-_Watercourses_-_Forest_Practices_Regulation.shp')
  const pathToDb = 'wa-dnr-streams-db'
  return await execute({ pathToShp, pathToDb })
}

async function execute ({ pathToShp, pathToDb }) {
  const shp = pathToShp
  const db = new Level(pathToDb, { valueEncoding: 'json' })
  await shpIndex({ shp, db })
}

function fid (i) {
  return `fid|${i}`
}

async function shpIndex ({ shp, db }) {
  const source = await shapefile.open(shp)
  debug(source.featureCount, 'features to index')
  const indexer = Indexer({
    featureCount: source.featureCount,
    db,
  })
  let count = 0
  await read({ onResult: indexer.onResult })
  const index = indexer.index()
  index.finish()
  await db.put('index', Buffer.from(index.data).toJSON())

  return {index}

  async function read ({ onResult }) {
    const result = await source.read()
    if (result.done) return
    await onResult({ result })
    return await read({ onResult })
  }

  function Indexer ({ featureCount, db }) {
    const index = new Flatbush(featureCount)

    async function onResult ({ result }) {
      count++
      const feature = result.value
      const fbbox = bbox(feature)
      const i = index.add(fbbox[0], fbbox[1], fbbox[2], fbbox[3])
      await db.put(fid(i), feature)
      if (count % 10000 === 0) {
        debug('indexed item', count)
      }
    }

    return {
      onResult,
      index: () => index,
    }
  }
}
