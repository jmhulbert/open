/**
 * The `nconn`, nearest connection, lines are used in the map that reports
 * results, and for it to be used in a maplibre web map it needs its
 * coordinates to be EPSG:4326. We will project from EPSG:3857, which
 * is what our analysis was done in, into EPSG:4326 for reporting.
 */

import fs from 'node:fs'
import ProjectGeojson from 'project-geojson'
import {nconnParams, projSpec, pipePromise} from './common.js'

for (const params of nconnParams) {
  await pipePromise(
    fs.createReadStream(params.fileName),
    ProjectGeojson(projSpec.analysis, projSpec.reporting),
    fs.createWriteStream(params.reportingFileName)
  )
}
