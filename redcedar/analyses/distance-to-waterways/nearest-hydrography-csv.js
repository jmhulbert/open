/**
 * Prerequisites for running this file include running:
 *
 * `$ node fetch-hydrography.js`
 * `$ node create-hydrography-db.js`
 * `$ node redcedar-poi.js`
 * `$ node nearest-hydrography.js`
 *
 * Using the `nearestSpec` that was used to run the `nearest-hydrography`
 * analysis, combine outsputs into a single CSV for final reporting.
 *
 * Each POI will carry the additional attributes:
 *
 * - `dist-{analysis-spec-name}`
 * - `nfeat-id-{analysis-spec-name}`
 *
 * For example, the distance to only Perennial hydrography features
 * will be saved as `dist-per`. And the nearest feature id will be
 * saved as `nfeat-id-per`.
 */

import fs from 'node:fs'
import {parse} from 'geojson-stream'
import {createObjectCsvWriter} from 'csv-writer'
import {redcedarPoiGeojsonPath, nearestSpec, pipePromise} from './common.js'
import {ResultsDB, dbSpec} from './results-db.js'
import Debug from 'debug'
import {through} from 'mississippi' 

const {baseFileName} = nearestSpec

const csvFilePath = `${baseFileName}-by-period.csv`

const db = ResultsDB(dbSpec)

const debug = Debug('nearest-csv')

// store results for random acccess
for (const params of nearestSpec.analysisParams) {
  const {resultSpecs, analysisSpec} = params
  const {name: analysisName} = analysisSpec
  const {fileName} = resultSpecs.find(s => s.type === 'nconn')
  await pipePromise(
    fs.createReadStream(fileName),
    parse(),
    through.obj(async (nconn, enc, next) => {
      await db.putNearest({ nconn, analysisName })
      next()
    })
  )
}

// accumulate and store all csv rows
await pipePromise(
  fs.createReadStream(redcedarPoiGeojsonPath),
  parse(),
  through.obj(async (poi, enc, next) => {
    const row = poi.properties
    for await (const [key, { nconn }] of db.iteratorNearest({ poi })) {
      const analysisName = key[2]
      const {csvFields} = nearestSpec.analysisParams.find(p => p.analysisSpec.name === analysisName)
      for (const csvField of csvFields) {
        row[csvField.key] = csvField.valueFn({ nconn })
      }
    }
    await db.putCsv({ row })
    next()
  })
)

// iterate rows for a heading
let csvHeader = new Set
for await (const [key, {row}] of db.iteratorCsv()) {
  const fieldNames = Object.keys(row)
  csvHeader = new Set([...csvHeader, ...fieldNames])
}

const csv = createObjectCsvWriter({
  path: csvFilePath,
  header: [...csvHeader].map(f => { return { id: f, title: f }}),
})
for await (const [key, {row}] of db.iteratorCsv()) {
  await csv.writeRecords([row])
}
