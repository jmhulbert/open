import { encoderTypes } from 'tabular-archive'

const analyses = [
  'period-all',
  'period-eph',
  'period-int',
  'period-min-eph',
  'period-min-int',
  'period-per',
  'period-unk',
]

const analysesHeaders = analyses.map(name => {
  return [
    {
      field: `${name}-dist`,
      encoder: encoderTypes.float,
    },
    {
      field: `${name}-nfeat-period`,
      encoder: encoderTypes.category,
    },
  ]
}).reduce((acc, curr) => acc.concat(curr), [])

export const header = [
  {
    field: '',
    encoder: encoderTypes.int32,
  },
  {
    field: 'id',
    encoder: encoderTypes.int32,
  },
  {
    field: 'created_at',
    encoder: encoderTypes.date,
  },
  {
    field: 'updated_at',
    encoder: encoderTypes.date,
  },
  {
    field: 'latitude',
    encoder: encoderTypes.geo,
  },
  {
    field: 'longitude',
    encoder: encoderTypes.geo,
  },
  {
    field: 'reclassified.tree.canopy.symptoms',
    encoder: encoderTypes.category,
  },
].concat(analysesHeaders)

export const idForRow = ({ row }) => {
  return parseInt(row.id)
}

export const idEncoder = encoderTypes.int32
