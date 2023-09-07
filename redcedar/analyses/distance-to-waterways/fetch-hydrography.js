/**
 * Download the NHD water {courses,bodies}
 * to the directory defined hydrographyDir
 */

import axios from 'axios'
import {Extract} from 'unzipper'
import {pipeline} from 'node:stream/promises'
import {hydrographyDir} from './common.js'

const path = hydrographyDir

const toFetch = [{
  name: 'hydrography',
  url: 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Hydrography/NHD/State/Shape/NHD_H_Washington_State_Shape.zip',
}]

for (const {url} of toFetch) {
  const response = await axios({
    method: 'get',
    url,
    responseType: 'stream',
  })
  await pipeline(
    response.data,
    Extract({ path }))
}
