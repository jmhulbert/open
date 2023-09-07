/**
 * Prerequisites for running this file include running:
 * 
 * `$ node fetch-hydrography.js`
 * `$ node create-hydrography-db.js`
 *
 * The output of this process will be a `summarized-hydrograph.json` file.
 *
 * This output will include feature counts for each periodicity value
 * to give a summary of the data being used in the remainder of the 
 * analysis.
 */

import { SpatialDB, dbSpec } from './spatial-db.js'
import {
  periodicityValues,
  hasLinePeriodToConsider,
  periodForFeature,
} from './common.js'
import fs from 'node:fs/promises'
import Debug from 'debug'

const debug = Debug('summarize-hydrography')

const db = SpatialDB(dbSpec)

const resultTypes = {
  waterCourses: {
    base: () => {
      return {
        count: 0,
        length: 0,
      }
    },
    filter: ({ feature }) => hasLinePeriodToConsider({ feature }),
    periodicityValue: ({ feature }) => {
      return periodForFeature({ feature })
    },
  },
  waterBodies: {
    base: () => {
      return {
        count: 0,
        length: 0,
        area: 0,
      }
    },
    filter: ({ feature }) => true,
    periodicityValue: ({ feature }) => {
      return periodForFeature({ feature })
    },
  },
}

const results = {}

for (const type in resultTypes) {
  results[type] = {}
  for (const periodicityValue of periodicityValues.values()) {
    results[type][periodicityValue] = resultTypes[type].base()
  }
}

for await (const [key, { feature }] of db.getIteratorLine()) {
  for (const type in resultTypes) {
    const resultType = resultTypes[type]
    if (!resultType.filter({ feature })) continue
    const periodicityValue = resultType.periodicityValue({ feature })
    if (!periodicityValues.has(periodicityValue)) continue
    const length = feature?.properties?.['lengthkm']
    if (isNaN(length)) continue
    results[type][periodicityValue].length += length
    results[type][periodicityValue].count += 1
  }
}

for await (const [key, { feature }] of db.getIteratorPolygon()) {
  const resultType = resultTypes.waterBodies
  const periodicityValue = resultType.periodicityValue({ feature })
  const area = feature?.properties?.['SHAPE_Area']
  const length = feature?.properties?.['SHAPE_Leng']
  if (isNaN(area) || isNaN(length)) continue
  if (!periodicityValues.has(periodicityValue)) continue
  results.waterBodies[periodicityValue].count += 1
  results.waterBodies[periodicityValue].length += length
  results.waterBodies[periodicityValue].area += area
}

await fs.writeFile('summarized-hydrography.json', JSON.stringify(results, null, 2))
