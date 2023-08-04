/**
 * Convert a Point feature geojson file into a CSV.
 */

import {createObjectCsvWriter} from 'csv-writer'
import fs from 'node:fs'
import {parse} from 'geojson-stream'
import {pipe, through} from 'mississippi'

const defaultFeatureToCsvRow = (feature) => {
  return {
    ...feature.properties,
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
  }
}

export const geojson2csv = async ({
  geojsonFilePath,
  csvFilePath,
  featureToCsvRow=defaultFeatureToCsvRow,
  additionalFields=[]
}) => {
  const header = await getHeader({ geojsonFilePath, additionalFields })

  const csv = createObjectCsvWriter({
    path: csvFilePath,
    header: header.map(f => { return { id: f, title: f }}),
  })

  await writeCsv({ geojsonFilePath, featureToCsvRow, csv })
}

async function getHeader ({ geojsonFilePath, additionalFields }) {
  let header = new Set([...additionalFields])
  return new Promise((resolve, reject) => {
    pipe(
      fs.createReadStream(geojsonFilePath),
      parse((feature, index) => {
        return Object.keys(feature.properties)
      }),
      through.obj((fieldNames, enc, next) => {
        header = new Set([...header, ...fieldNames])
        next()
      }),
      function finish (error) {
        if (error) return reject(error)
        resolve([...header])
      })
  }) 
}

async function writeCsv ({ geojsonFilePath, featureToCsvRow, csv }) {
  return new Promise((resolve, reject) => {
    pipe(
      fs.createReadStream(geojsonFilePath),
      parse((feature, index) => {
        return featureToCsvRow(feature, index)
      }),
      through.obj(async (row, enc, next) => {
        csv.writeRecords([row]).then(next).catch(next)
      }),
      function finish (error) {
        if (error) return reject(error)
        resolve()
      }
    )
  })
}
