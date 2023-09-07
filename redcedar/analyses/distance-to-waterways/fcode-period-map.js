// Domain values mapped to hydrography categories
// https://www.usgs.gov/ngp-standards-and-specifications/national-hydrography-dataset-nhd-data-dictionary-feature-domains

export const lineFCodeToPeriod = {
  46000: 'Unknown',
  46003: 'Intermittent',
  46006: 'Perennial',
  46007: 'Ephemeral',
  56600: 'Perennial',
}

export const areaFCodeToPeriod = {
  // water bodies
  39000: 'Unknown',
  39001: 'Intermittent',
  39004: 'Perennial',
  39005: 'Intermittent',
  39006: 'Intermittent',
  39009: 'Perennial',
  39010: 'Perennial',
  39011: 'Perennial',
  43600: 'Unknown',
  43601: 'Unknown',
  43603: 'Unknown',
  43604: 'Unknown',
  43605: 'Unknown',
  43606: 'Unknown',
  43607: 'Unknown',
  43608: 'Unknown',
  43609: 'Unknown',
  43610: 'Unknown',
  43611: 'Unknown',
  43612: 'Unknown',
  43613: 'Unknown',
  43614: 'Intermittent',
  43617: 'Unknown',
  43618: 'Unknown',
  43619: 'Unknown',
  43621: 'Perennial',
  43624: 'Unknown',
  43625: 'Unknown',
  46600: 'Unknown',
  46601: 'Intermittent',
  46602: 'Perennial',
  49300: 'Perennial',
}
export const fcodeToPeriod = {
  ...lineFCodeToPeriod,
  ...areaFCodeToPeriod,
}
