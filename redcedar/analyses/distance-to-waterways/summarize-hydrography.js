/**
 * Prerequisites for running this file include running:
 * 
 * `$ node fetch-hydrography.js`
 * `$ node create-hydrography-db.js`
 *
 * The output of this process will be a `summarized-hydrograph.json` file.
 * 
 */

import { SpatialDB, dbSpec } from './spatial-db.js'
import { periodicityValues } from './common.js'
import fs from 'node:fs/promises'

const db = SpatialDB(dbSpec)

const resultTypes = {
  waterCourses: {
    base: () => {
      return {
        count: 0,
        length: 0,
      }
    },
    filter: ({ feature }) => {
      return typeof feature?.properties?.WC_ID === 'number'
    },
    periodicityValue: ({ feature }) => {
      return feature?.properties?.['WC_PERIO_1']
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
    filter: ({ feature }) => {
      return typeof feature?.properties?.WB_ID === 'number'
    },
    periodicityValue: ({ feature }) => {
      return feature?.properties?.['WB_PERIO_1']
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
    const length = feature?.properties?.SHAPELEN
    if (isNaN(length)) continue
    results[type][periodicityValue].length += length
    results[type][periodicityValue].count += 1
  }
}

for await (const [key, { feature }] of db.getIteratorPolygon()) {
  const periodicityValue = feature.properties['WB_PERIO_1']
  const area = feature?.properties?.SHAPEAREA
  if (isNaN(area)) continue
  if (!periodicityValues.has(periodicityValue)) continue
  results.waterBodies[periodicityValue].area += area
}

console.log(results)

await fs.writeFile('summarized-hydrography.json', JSON.stringify(results, null, 2))
