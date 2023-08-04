import path from 'node:path'
import {geojson2csv} from './geojson-to-csv.js'

const geojsonFilePath = path.join(process.cwd(), 'redcedar-poi-nearest-k1.geojson')
const csvFilePath = path.join(process.cwd(), 'redcedar-poi-nearest-k1.csv')

const additionalFieldSpec = [{
    key: 'npoint-lon',
    value: function (feature) {
      return feature.geometry.coordinates[0]
    }
  },
  {
    key: 'npoint-lat',
    value: function (feature) {
      return feature.geometry.coordinates[1]
    }
  }
]

const additionalFields = additionalFieldSpec.map(s => s.key)
const featureToCsvRow = (feature) => {
  return {
    ...feature.properties,
    ...(additionalFieldSpec.map((field) => {
      return { [field.key]: field.value(feature) }
    }).reduce((acc, curr) => {
      return {
        ...acc,
        ...curr,
      }
    }, {}))
  }
}

await geojson2csv({
  geojsonFilePath,
  csvFilePath,
  featureToCsvRow,
  additionalFields,
})