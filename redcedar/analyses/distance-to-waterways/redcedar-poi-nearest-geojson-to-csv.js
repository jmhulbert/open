import {createObjectCsvWriter} from 'csv-writer'
import fs from 'node:fs'
import {parse} from 'geojson-stream'
import {pipe, through} from 'mississippi'

const [inFilePath, outFilePath] = process.argv.slice(2)

function help () {
  console.log(`
    usage:

    node geojson-to-csv.js {inFilePath} {outFilePath}

    {inFilePath} - the geojson path to read in
    {outFilePath} - the csv path to write to
  `)
}

if (!inFilePath || !outFilePath) {
  help()
  process.exit()
}

const header = await getHeader(['npoint-lon', 'npoint-lat'])
const csv = createObjectCsvWriter({
  path: outFilePath,
  header: header.map(f => { return { id: f, title: f }}),
})
await writeCsv()

async function getHeader (startingSet) {
  let header = new Set([...startingSet])
  return new Promise((resolve, reject) => {
    pipe(
      fs.createReadStream(inFilePath),
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

async function writeCsv () {
  return new Promise((resolve, reject) => {
    pipe(
      fs.createReadStream(inFilePath),
      parse((feature, index) => {
        return {
          ...feature.properties,
          'npoint-lon': feature.geometry.coordinates[0],
          'npoint-lat': feature.geometry.coordinates[1],
        }
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
