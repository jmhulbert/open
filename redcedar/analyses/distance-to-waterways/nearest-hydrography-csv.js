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


/*

read all geojson into `nearests-results-db` leveldb

  key = ['nearest', fid, analysisName]
  value = { nconn }

cat poi.geojson |
  parse |
  merge props
    get features by fid for all analysisName
      pluck 'dist' -> 'dist-{analysis-name}'
      pluck 'nfeat-id' -> 'nfeat-id-{analysis-name}'
    merge props into a single row |
  write to csv db
    key = ['csv', fid]
    value = { row }


iter ['csv'] | getHeader
iter ['csv'] | writeRows

 */

import fs from 'node:fs'
import {parse} from 'geojson-stream'
import {createObjectCsvWriter} from 'csv-writer'
import {redcedarPoiGeojsonPath, nearestSpec, pipePromise} from './common.js'
import Debug from 'debug'
import {Level} from 'level'
import bytewise from 'bytewise'
import {through} from 'mississippi' 

const {idSpec, baseFileName} = nearestSpec

const csvFilePath = `${baseFileName}-by-period.csv`

const dbSpec = {
  path: 'hydrography-results-db',
  options: {
    keyEncoding: bytewise,
    valueEncoding: 'json',
  },
  poiKeyFromNconnKey: idSpec.opointIdToPoiId,
  poiKey: idSpec.poiId,
  csvKey: (row) => row.id,
}

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
      row[`dist-${analysisName}`] = nconn.properties.dist
      row[`nfeat-id-${analysisName}`] = nconn.properties['nfeat-id']
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

function ResultsDB (dbSpec) {
  const db = new Level(dbSpec.path, dbSpec.options)

  const nearestKey = ({ id, analysisName }) => {
    return ['nearest', id, analysisName]
  }

  const csvKey = ({ id }) => {
    return ['csv', id]
  }

  db.putNearest = async ({ nconn, analysisName }) => {
    const id = dbSpec.poiKeyFromNconnKey(nconn)
    return await db.put(nearestKey({ id, analysisName }), { nconn })
  }

  db.iteratorNearest = ({ poi }) => {
    const id = dbSpec.poiKey(poi)
    return db.iterator({
      gt: nearestKey({ id, analysisName: null }),
      lt: nearestKey({ id, analysisName: undefined }),
    })
  }

  db.putCsv = async ({ row }) => {
    return await db.put(csvKey(row), { row })
  }

  db.iteratorCsv = () => {
    return db.iterator({
      gt: csvKey({ id: null }),
      lt: csvKey({ id: undefined }),
    })
  }

   return db
}
