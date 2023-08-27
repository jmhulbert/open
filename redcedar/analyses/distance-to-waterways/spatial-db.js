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
import {hydrographyDir, nearestSpec} from './common.js'
import Debug from 'debug'

const debug = Debug('spatial-db')

const { analysisParams } = nearestSpec
console.log(analysisParams)

export const dbSpec = {
  path: `${hydrographyDir}-db`,
  options: {
    keyEncoding: bytewise,
    valueEncoding: 'json',
  },
  featureKey: ({ featureType, id }) => ['feature', featureType, id],
  spatialIndexKey: ({ analysisName, featureType }) => ['spatial-index', analysisName, type],
  // spatial index features are inserted linearly, so we keep track of
  // the actual featureKey id value at this location
  featureSpatialIndexKey: ({ analysisName, featureType, spatialIndex }) => ['feature-spatial-index', analysisName, featureType, spatialIndex],
  analysisParams,
}

export const SpatialDB = (dbSpec) => {
  const db = new Level(dbSpec.path, dbSpec.options)

  const featureTypes = ['line', 'polygon']

  // the overall count. individual counts will be mapped to this
  // global count, referred to as the feture id in `lineFeatureKey`
  // and `polygonFeatureKey`
  const putCount = -1
  const counts = {}
  for (const { analysisSpec } of dbpSpec.analysisParams) {
    counts[analysisSpec.name] = {}
    for (const featureType of featureTypes) {
      counts[analysisSpec.name][featureType] = -1
    }
  }

  const put = ({ featureType }) => async ({ feature }) => {
    putCount += 1
    for (const { analysisSpec } of dbpSpec.analysisParams) {
      const { name, filterFeature } = analysisSpec
      if (!filterFeature({ feature })) continue
      counts[name][featureType] += 1
      await db.put(dbSpec.featureSpatialIndexKey({
        analysisName: name,
        featureType,
        spatialIndex: counts[name][featureType]
      }), { id: putCount })
    }
    return await db.put(dbSpec.featureKey({ featureType, id: putCount}), { feature })
  }

  db.putLine = put({
    featureType: 'line',
  })
  db.putPolygon = put({
    featureType: 'polygon',
  })

  db.getAnalysisFeature = async ({ analysisName, featureType, spatialIndex }) => {
    const { id } = await db.get(dbSpec.featureSpatialIndexKey({ analysisName, featureType, spatialIndex }))
    return await db.get(dbSpec.featureKey({ featureType, id }))
  }

  const getSpatialIndex = async ({ analysisName, featureType }) => {
    const bufJson = await db.get(dbSpec.spatialIndexKey({ analysisName, featureType }))
    const buf = Buffer.from(bufJson)
    const indexData = new Int8Array(buf)
    const index = Flatbush.from(indexData.buffer)
    return index
  }

  db.getSpatialIndicies = ({ analysisName }) => {
    const lineIndex = await getSpatialIndex({ analysisName, featureType: 'line' })
    const polygonIndex = await getSpatialIndex({ analysisName, featureType: 'polygon' })
    return {
      lineIndex,
      polygonIndex,
    }
  }

  const getFeatureIterator = ({ featureType }) => () => {
    return db.iterator({
      gt: dbSpec.featureKey({ featureType, id: null }),
      lt: dbSpec.featureKey({ featureType, id: undefined }),
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
      count = key[2]
    }
    return count
  }

  db.createIndicies = async () => {
    for (const { analysisSpec } of dbpSpec.analysisParams) {
      const analysisName = analysisSpec.name
      for (const featureType of featureTypes) {
        const count = await getCount({ analysisName, featureType })
        const index = new Flatbush(count + 1)
        const iterator = getFeatureSpatialIndexIterator({ analysisName, featureType })
        for await (const [key , { id }] of iterator) {
          const spatialIndex = key[3]
          const { feature } = await db.get(dbSpec.featureKey({ featureType, id }))
          const fbbox = bbox(feature)
          const i = index.add(fbbox[0], fbbox[1], fbbox[2], fbbox[3])
          equal(i === spatialIndex)
        }
        index.finish()
        await db.put(dbSpec.spatialIndexKey({ analysisName, featureType }), Buffer.from(index.data).toJSON())
      }
    }
  }

  return db
}


