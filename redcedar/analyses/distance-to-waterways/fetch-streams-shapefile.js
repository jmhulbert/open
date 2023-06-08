/**
 * Download the WA DNR streams to the directory `wa-dnr-streams`
 */

import axios from 'axios'
import {Extract} from 'unzipper'

const url = 'https://opendata.arcgis.com/api/v3/datasets/816586b10c6c4954883b236f9fff208f_0/downloads/data?format=shp&spatialRefId=3857&where=1%3D1'
const streamsPath = 'wa-dnr-streams'

main({ url })

async function main ({ url }) {
  const response = await axios({
    method: 'get',
    url,
    responseType: 'stream',
  })
  response.data.pipe(Extract({ path: streamsPath }))
}
