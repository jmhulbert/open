/**
 * Insert polygon and line features into a database. They get different 
 * indicies from which to search for nearest neighbors, since we will
 * be doing different kinds of analysis with each.
 * 
 * [leveldb](https://github.com/google/leveldb) for spatial feature storage,
 * using [flatbush](https://github.com/mourner/flatbush).to provide
 * the spatial indexing, and [bytewise](https://www.npmjs.com/package/bytewise)
 * to enable incrementally adding features to the leveldb, and then
 * upon completion, iterate through features in the order they were inserted
 * in order to create the flatbush index, since flatbush.
 */

import {equal} from 'node:assert'
import Flatbush from 'flatbush'
import {Level} from 'level'
import bytewise from 'bytewise'
import bbox from '@turf/bbox'
import {hydrographyDir} from './common.js'
import Debug from 'debug'

const debug = Debug('spatial-db')

export const dbSpec = {
  path: `${hydrographyDir}-db`,
  options: {
    keyEncoding: bytewise,
    valueEncoding: 'json',
  },
  lineFeatureKey: (id) => ['lf', 'feature', id],
  polygonFeatureKey: (id) => ['pf', 'feature', id],
  lineIndexKey: () => ['lf', 'index'],
  polygonIndexKey: () => ['pf', 'index'],
  featureIndexPosition: (key) => key[2],
}

export const SpatialDB = (dbSpec) => {
  const db = new Level(dbSpec.path, dbSpec.options)

  let countLine = -1
  let countPolygon = -1

  let indexLine
  let indexPolygon

  const put = ({ keyFn, count }) => async ({ feature }) => {
    count += 1
    return await db.put(keyFn(count), { feature })
  }

  db.putLine = put({
    keyFn: dbSpec.lineFeatureKey,
    count: countLine,
  })
  db.putPolygon = put({
    keyFn: dbSpec.polygonFeatureKey,
    count: countPolygon,
  })

  const get = ({ keyFn }) => async (id) => {
    return await db.get(keyFn(id))
  }

  db.getLine = get({ keyFn: dbSpec.lineFeatureKey })
  db.getPolygon = get({ keyFn: dbSpec.polygonFeatureKey })

  const getIndex = ({ keyFn, index }) => async () => {
    const bufJson = await db.get(keyFn())
    const buf = Buffer.from(bufJson)
    const indexData = new Int8Array(buf)
    index = Flatbush.from(indexData.buffer)
    return index
  }

  db.getLineIndex = getIndex({
    keyFn: dbSpec.lineIndexKey,
    index: indexLine,
  })
  db.getPolygonIndex = getIndex({
    keyFn: dbSpec.polygonIndexKey,
    index: indexPolygon,
  })

  const getIterator = ({ keyFn }) => () => {
    return db.iterator({
      gt: keyFn(null),
      lt: keyFn(undefined),
    })
  }

  db.getIteratorLine = getIterator({ keyFn: dbSpec.lineFeatureKey })
  db.getIteratorPolygon = getIterator({ keyFn: dbSpec.polygonFeatureKey })

  const getCount = ({ keyFn, count }) => async () => {
    const keys = db.keys({
      gt: keyFn(null),
      lt: keyFn(undefined),
      reverse: true,
      limit: 1,
    })
    for await (const key of keys) {
      count = key[2]
    }
    return count
  }

  db.getCountLine = getCount({
    keyFn: dbSpec.lineFeatureKey,
    count: countLine,
  })
  db.getCountPolygon = getCount({
    keyFn: dbSpec.polygonFeatureKey,
    count: countPolygon,
  })

  const createIndex = ({ count, getCount, getIterator, index, indexKeyFn }) => async () => {
    if (count === -1) {
      count = await getCount()
    }
    // count is 0 indexed, so we plus 1 for the number of features
    index = new Flatbush(count + 1)
    for await (const [key, { feature }] of getIterator()) {
      const fbbox = bbox(feature)
      const i = index.add(fbbox[0], fbbox[1], fbbox[2], fbbox[3])
      // we should be getting these out in the same order that we put them
      // in, so we should be getting equal indicies from the spatial index
      // and our direct access into the object
      equal(dbSpec.featureIndexPosition(key), i)
    }
    index.finish()
    await db.put(indexKeyFn(), Buffer.from(index.data).toJSON())
    return index
  }

  db.createIndexLine = createIndex({
    count: countLine,
    getCount: db.getCountLine,
    getIterator: db.getIteratorLine,
    index: indexLine,
    indexKeyFn: dbSpec.lineIndexKey,
  })
  db.createIndexPolygon = createIndex({
    count: countPolygon,
    getCount: db.getCountPolygon,
    getIterator: db.getIteratorPolygon,
    index: indexPolygon,
    indexKeyFn: dbSpec.polygonIndexKey,
  })

  return db
}


