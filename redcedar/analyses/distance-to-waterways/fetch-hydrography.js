/**
 * Download the WA DNR water courses and water bodies
 * to the directory `wa-dnr-hydrography`
 */

import axios from 'axios'
import {Extract} from 'unzipper'
import {pipeline} from 'node:stream/promises'
import {hydrographyDir} from './common.js'

const path = hydrographyDir

const toFetch = [{
  name: 'water-courses',
  url: 'https://opendata.arcgis.com/api/v3/datasets/816586b10c6c4954883b236f9fff208f_0/downloads/data?format=shp&spatialRefId=3857&where=1%3D1',
}, {
  name: 'water-bodies',
  url: 'https://opendata.arcgis.com/api/v3/datasets/28a0f93c33454297b4a9d3faf3da552a_1/downloads/data?format=shp&spatialRefId=3857&where=1%3D1',
}, {
  name: 'watersheds',
  url: 'https://opendata.arcgis.com/api/v3/datasets/d8d2aeaa4cb24cca92b708b7ba086279_0/downloads/data?format=shp&spatialRefId=3857&where=1%3D1'
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
