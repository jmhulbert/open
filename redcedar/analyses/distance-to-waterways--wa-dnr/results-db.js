import {nearestSpec} from './common.js'
import {Level} from 'level'
import bytewise from 'bytewise'

import Debug from 'debug'

const debug = Debug('results-db')

const {idSpec} = nearestSpec

export const dbSpec = {
  path: 'hydrography-results-db',
  options: {
    keyEncoding: bytewise,
    valueEncoding: 'json',
  },
  poiKeyFromNconnKey: idSpec.opointIdToPoiId,
  poiKey: idSpec.poiId,
  csvKey: (row) => row.id,
}

export const ResultsDB = (dbSpec) => {
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
