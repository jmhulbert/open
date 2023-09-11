/**
 * The `nconn`, nearest connection, lines are used in the map that reports
 * results, and for it to be used in a maplibre web map it needs its
 * coordinates to be EPSG:4326. We will project from EPSG:3857, which
 * is what our analysis was done in, into EPSG:4326 for reporting.
 */

import fs from 'node:fs'
import ProjectGeojson from 'project-geojson'
import {nearestSpec, RESULT_TYPES, projSpec, pipePromise} from './common.js'

const {analysisParams} = nearestSpec
const resultSpecs = analysisParams.reduce((acc, curr) => {
  return acc.concat(curr.resultSpecs)
}, [])

const nconnParams = resultSpecs.filter(s => s.type === RESULT_TYPES.NCONN)

for (const params of nconnParams) {
  await pipePromise(
    fs.createReadStream(params.fileName),
    ProjectGeojson(projSpec.analysis, projSpec.reporting),
    fs.createWriteStream(params.fileName.replace('nconn', 'nconn-epsg-4326'))
  )
}
