import path from 'node:path'

export const hydrographyDir = 'hydrography'

export const dataDir = path.join(process.cwd(), '..', '..', 'data')

const redcedarPoiGeojsonPath = path.join(process.cwd(), 'redcedar-poi.geojson')