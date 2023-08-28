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
 *
 * For each `common.nearestSpect.analysisParams[{  name, filterFeature }]`
 * we create indicies of hydrography features so that we can efficiently query
 * a spatial index that only holds features related to that analysis query
 * as defined by its `filterFeature` funciton.
 */

import {equal} from 'node:assert'
import Flatbush from 'flatbush'
import {Level} from 'level'
import bytewise from 'bytewise'
import bbox from '@turf/bbox'
import {hydrographyDir, nearestSpec} from './common.js'
import Debug from 'debug'

const debug = Debug('spatial-db')

const { analysisParams, idSpec } = nearestSpec
const { nfeatIdParts } = idSpec

export const dbSpec = {
  path: `${hydrographyDir}-db`,
  options: {
    keyEncoding: bytewise,
    valueEncoding: 'json',
  },
  // get an individual feature of `featureType` and `id`, which is
  // the global incrementing integer that the feature was inserted at.
  featureKey: ({ featureType, putCount }) => ['feature', featureType, putCount],
  // store the global featureKey putcount under the feature-id, which is the id
  // that is used on the tabular tables to link back to the original features in the
  // input datasets that are being stored
  featureIdIndex: ({ feature }) => {
    // ['feature-id', WB_ID || WC_ID : string,  id : int]
    return ['feature-id'].concat(nfeatIdParts(feature))
  },
  // the Flatbush index data array for each analysisName and featureType
  spatialIndexKey: ({ analysisName, featureType }) => ['spatial-index', analysisName, featureType],
  // spatial index features are inserted linearly for each analysisName and
  // featureType. the value at for this key will be a { id } which is the `featureKey`
  // id value to be used with the `featureType` to get the underlying `{ feature }`.
  featureSpatialIndexKey: ({ analysisName, featureType, spatialIndex }) => ['feature-spatial-index', analysisName, featureType, spatialIndex],
  // we use the analysisParams to get `filterFeature` and `name` (analysisName)
  // values so that we can filter and create our indicies.
  analysisParams,
}

export const SpatialDB = (dbSpec) => {
  const db = new Level(dbSpec.path, dbSpec.options)

  const featureTypes = ['line', 'polygon']

  // the overall count. individual counts will be mapped to this
  // global count, referred to as the feture id in `lineFeatureKey`
  // and `polygonFeatureKey`
  let putCount = -1
  const counts = {}
  for (const { analysisSpec } of dbSpec.analysisParams) {
    counts[analysisSpec.name] = {}
    for (const featureType of featureTypes) {
      counts[analysisSpec.name][featureType] = -1
    }
  }

  const put = ({ featureType }) => async ({ feature }) => {
    putCount += 1
    for (const params of dbSpec.analysisParams) {
      const { name, filterFeature } = params.analysisSpec
      if (!filterFeature(feature)) continue
      counts[name][featureType] += 1
      const key = dbSpec.featureSpatialIndexKey({
        analysisName: name,
        featureType,
        spatialIndex: counts[name][featureType]
      })
      await db.put(key, { putCount })
    }
    {
      const key = dbSpec.featureIdIndex({ feature })
      debug(key)
      await db.put(key, { putCount })
    }
    {
      const key = dbSpec.featureKey({ featureType, putCount })
      debug(key)
      await db.put(key, { feature })
    }
    return
  }

  db.putLine = put({
    featureType: 'line',
  })
  db.putPolygon = put({
    featureType: 'polygon',
  })

  db.getAnalysisFeature = async ({ analysisName, featureType, spatialIndex }) => {
    const { putCount } = await db.get(dbSpec.featureSpatialIndexKey({ analysisName, featureType, spatialIndex }))
    return await db.get(dbSpec.featureKey({ featureType, putCount }))
  }

  const getSpatialIndex = async ({ analysisName, featureType }) => {
    const bufJson = await db.get(dbSpec.spatialIndexKey({ analysisName, featureType }))
    const buf = Buffer.from(bufJson)
    const indexData = new Int8Array(buf)
    const index = Flatbush.from(indexData.buffer)
    return index
  }

  db.getSpatialIndicies = async ({ analysisName }) => {
    const lineIndex = await getSpatialIndex({ analysisName, featureType: 'line' })
    const polygonIndex = await getSpatialIndex({ analysisName, featureType: 'polygon' })
    return {
      lineIndex,
      polygonIndex,
    }
  }

  const getFeatureIterator = ({ featureType }) => () => {
    return db.iterator({
      gt: dbSpec.featureKey({ featureType, putCount: null }),
      lt: dbSpec.featureKey({ featureType, putCount: undefined }),
    })
  }

  db.getIteratorLine = getFeatureIterator({ featureType: 'line' })
  db.getIteratorPolygon = getFeatureIterator({ featureType: 'polygon' })

  const getFeatureSpatialIndexIterator = ({ analysisName, featureType }) => {
    return db.iterator({
      gt: dbSpec.featureSpatialIndexKey({ analysisName, featureType, spatialIndex: null }),
      lt: dbSpec.featureSpatialIndexKey({ analysisName, featureType, spatialIndex: undefined }),
    })
  }

  const getCount = async ({ analysisName, featureType }) => {
    const keys = db.keys({
      gt: dbSpec.featureSpatialIndexKey({ analysisName, featureType, spatialIndex: null }),
      lt: dbSpec.featureSpatialIndexKey({ analysisName, featureType, spatialIndex: undefined }),
      reverse: true,
      limit: 1,
    })
    for await (const key of keys) {
      return key[3]
    }
    return -1
  }

  db.createIndicies = async () => {
    for (const { analysisSpec } of dbSpec.analysisParams) {
      const analysisName = analysisSpec.name
      for (const featureType of featureTypes) {
        const count = await getCount({ analysisName, featureType })
        debug('indicies:', analysisName, featureType, count)
        const index = new Flatbush(count + 1)
        const iterator = getFeatureSpatialIndexIterator({ analysisName, featureType })
        for await (const [key , { putCount }] of iterator) {
          const spatialIndex = key[3]
          const { feature } = await db.get(dbSpec.featureKey({ featureType, putCount }))
          const fbbox = bbox(feature)
          const i = index.add(fbbox[0], fbbox[1], fbbox[2], fbbox[3])
          equal(i, spatialIndex)
        }
        index.finish()
        await db.put(dbSpec.spatialIndexKey({ analysisName, featureType }), Buffer.from(index.data).toJSON())
      }
    }
  }

  return db
}


