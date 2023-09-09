const maplibregl = require('maplibre-gl')
const pmtiles = require('pmtiles')
const chroma = require('chroma-js')
const {fcodeToPeriod, nconnParams} = require('../../../common.js')

let protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const rgbParts = (s) => s.split('(')[1].split(')')[0].split(',').map(n => parseFloat(n))

const themeColors = {
  monotone: '#ffffff',
  monotoneHydrography: '#ffffff',
  transparent: '#ffffff00',
  monotonePoi: '#000000',
  nconn: '#000000',
  watershed: "rgb(230, 230, 230)",
  highlightColor: '#000000',
  monotonePoiHighlightColor: "#ffffff",
}
themeColors.watershedStroke = chroma(rgbParts(themeColors.watershed)).darken(0.5).hex()

const waterShedLegend = {
  items: [{
    color: themeColors.watershed,
    text: 'Watershed',
  }]
}

const theme = {
  highlightPoi: {
    mapStyle: [],
    legend: [],
    key: 'highlightPoi',
    label: 'Tree Symptoms'
  },
  highlightHydrography: {
    mapStyle: [],
    legend: [],
    key: 'highlightHydrography',
    label: 'Hydrography'
  },
}

const symptoms = [
  {
    symptom: 'Healthy',
    color: 'rgb(172, 252, 172)',
  },
  {
    symptom: 'Thinning Canopy',
    color: 'rgb(251, 252, 172)',
  },
  {
    symptom: 'Dead Top',
    color: 'rgb(172, 176, 252)',
  },
  {
    symptom: 'Tree is Dead',
    color: 'rgb(252, 172, 172)',
  },
  {
    symptom: 'Other',
    color: 'rgb(211,211,211)',
  },
]

theme.highlightPoi.legend.push({
  title: 'Tree symptom',
  items: symptoms.map((s) => {
    const c = rgbParts(s.color)
    return {
      color: chroma(c).hex(),
      text: s.symptom,
    }
  })
})

symptoms.forEach((s) => {
  s.outline = chroma(s.color).darken().hex()
})

const matchSympton = [
  'match',
  ['get', 'reclassified.tree.canopy.symptoms'],
]

const symptomCircleColor = symptoms.map((s) => {
    const [r,g,b] = rgbParts(s.color)
    return [s.symptom, ['rgb', r, g, b]]
  }).reduce((acc, curr) => {
    return acc.concat(curr)
  }, matchSympton)
  .concat([themeColors.transparent])

const symptomCircleColorMonotone = symptoms.map((s) => {
    return [s.symptom, themeColors.monotonePoi]
  }).reduce((acc, curr) => {
    return acc.concat(curr)
  }, matchSympton)
  .concat([themeColors.transparent])

const symptomCircleStrokeColor = symptoms.map((s) => {
    return [s.symptom, s.outline]
  }).reduce((acc, curr) => {
    return acc.concat(curr)
  }, matchSympton)
  .concat([themeColors.transparent])

const symptomCircleStrokeColorMonotone = symptoms.map((s) => {
    return [s.symptom, themeColors.monotonePoi]
  }).reduce((acc, curr) => {
    return acc.concat(curr)
  }, matchSympton)
  .concat([themeColors.transparent])

theme.highlightPoi.mapStyle.push({
  key: 'poi-fill',
  name: 'circle-color',
  value: symptomCircleColor,
})
theme.highlightPoi.mapStyle.push({
  key: 'poi-fill',
  name: 'circle-stroke-color',
  value: symptomCircleStrokeColor,
})
theme.highlightPoi.mapStyle.push({
  key: 'poi-selected',
  name: 'circle-color',
  value: symptomCircleColor,
})
theme.highlightPoi.mapStyle.push({
  key: 'poi-selected',
  name: 'circle-stroke-color',
  value: themeColors.highlightColor,
})

theme.highlightHydrography.mapStyle.push({
  key: 'poi-fill',
  name: 'circle-color',
  value: symptomCircleColorMonotone,
})
theme.highlightHydrography.mapStyle.push({
  key: 'poi-fill',
  name: 'circle-stroke-color',
  value: symptomCircleStrokeColorMonotone,
})
theme.highlightHydrography.mapStyle.push({
  key: 'poi-selected',
  name: 'circle-color',
  value: symptomCircleColorMonotone,
})
theme.highlightHydrography.mapStyle.push({
  key: 'poi-selected',
  name: 'circle-stroke-color',
  value: themeColors.monotonePoiHighlightColor,
})

const periodicity = [
  {
    key: 'Ephemeral',
    hex: '#f4f41f', // yellow
  },
  {
    key: 'Intermittent',
    hex: '#3bd499', // green,
  },
  {
    key: 'Perennial',
    hex: '#2e73e1', //blue
  },
  {
    key: 'Unknown',
    hex: '#ed6847', // orange
  },
  {
    key: 'Dry land',
    hex: chroma(rgbParts(themeColors.watershed)).hex(),
  }
]

theme.highlightHydrography.legend.push({
  title: 'Hydrography periodicity',
  items: periodicity.map(s => {
    return {
      color: s.hex,
      text: s.key,
    }
  })
})

const periodicityColors = periodicity.reduce((acc, curr) => {
  return {
    ...acc,
    [curr.key]: curr.hex,
  }
}, {})

const caseEqual = (prop) => (value) => {
  return ['==', ['get', prop], value]
}
const caseEqualHydrography = caseEqual('fcode')

const periodicityColorsHydrographyHighlight = Object.keys(fcodeToPeriod).map(fcode => {
    const period = fcodeToPeriod[fcode]
    const colorSpec = periodicity.find(s => s.key === period)
    return [caseEqualHydrography(Number(fcode)), colorSpec.hex]
  })
  .reduce((acc, curr) => {
    return acc.concat(curr)
  }, ['case'])
  .concat([themeColors.monotone])
  
const periodicityColorsWaterBodyHighlight = periodicityColorsHydrographyHighlight
const periodicityColorsWaterCoursesHighlight = periodicityColorsHydrographyHighlight

const periodicityColorsHydrographyMonotone = Object.keys(fcodeToPeriod).map(fcode => {
    return [caseEqualHydrography(Number(fcode)), themeColors.monotone]
  })
  .reduce((acc, curr) => {
    return acc.concat(curr)
  }, ['case'])
  .concat([themeColors.monotone])

const periodicityColorsWaterBodyMonotone = periodicityColorsHydrographyMonotone
const periodicityColorsWaterCoursesMonotone = periodicityColorsHydrographyMonotone

theme.highlightHydrography.mapStyle.push({
  key: 'water-bodies-fill',
  name: 'fill-color',
  value: periodicityColorsWaterBodyHighlight,
})

theme.highlightHydrography.mapStyle.push({
  key: 'water-courses-stroke',
  name: 'line-color',
  value: periodicityColorsWaterCoursesHighlight,
})

theme.highlightPoi.mapStyle.push({
  key: 'water-bodies-fill',
  name: 'fill-color',
  value: periodicityColorsWaterBodyMonotone,
})

theme.highlightPoi.mapStyle.push({
  key: 'water-courses-stroke',
  name: 'line-color',
  value: periodicityColorsWaterCoursesMonotone,
})

// theme.highlightPoi.legend.push(waterShedLegend)
// theme.highlightHydrography.legend.push(waterShedLegend)

let host
if (process.env.NODE_ENV === 'development') {
  host = '.'
}
else if (process.env.NODE_ENV === 'production') {
  host = 'https://rubonics-pmtiles.s3.amazonaws.com/nhd-wa'
}

const geojsonSource = (spec) => {
  return {
    type: 'geojson',
    ...spec,
  }
}
const nconnLayerId = ({ key }) => {
  return `${key}-stroke`
}
const nconnLayers = ({ key }) => {
  return [
    {
      id: nconnLayerId({ key }),
      type: 'line',
      source: key,
      paint: {
        'line-color': themeColors.transparent,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 0,
          11, 0,
          12, 1
        ],
      },
    },
  ]
}

const analysisSpecs = nconnParams.map((params) => {
  return {
    key: params.analysisSpecName,
    source: geojsonSource({ data: params.reportingFileName }),
  }
})

const nconnSourceSpecs = analysisSpecs.map(spec => {
  spec.layers = nconnLayers(spec)
  return spec
})

const sourceSpecs = [
  {
    key: 'waterSheds',
    source: {
      type: 'pmtiles',
      url: `${host}/water-sheds.pmtiles`,
    },
    layers: [
      {
        id:"water-shed-fill",
        type:"fill",
        source: "waterSheds",
        "source-layer":"water-sheds",
        paint:{
          "fill-color": themeColors.watershed,
        }
      },
      {
        id:"water-shed-stroke",
        type:"line",
        source:"waterSheds",
        "source-layer":"water-sheds",
        paint:{
          "line-color": themeColors.watershedStroke,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            // Zoom 0, line-width 8
            0, 1,
            // Zoom 22, line-width 1
            15, 0.5
          ]
        }
      },
    ]
  },
  {
    key: 'waterBodies',
    source: {
      type: 'pmtiles',
      url: `${host}/water-bodies.pmtiles`,
    },
    layers: [
      {
        id:"water-bodies-fill",
        type:"fill",
        source: "waterBodies",
        "source-layer":"water-bodies",
        paint:{
          "fill-color": periodicityColorsWaterBodyMonotone,
        }
      },
    ],
  },
  {
    key: 'waterCourses',
    source: {
      type: 'pmtiles',
      url: `${host}/water-courses.pmtiles`,
    },
    layers: [
      {
        id:"water-courses-stroke",
        type:"line",
        source:"waterCourses",
        "source-layer":"water-courses",
        paint:{
          "line-color": periodicityColorsWaterCoursesMonotone,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            // Zoom 0, line-width 8
            0, 0,
            11, 0,
            12, 1
          ]
        }
      },
    ],
  }
].concat(nconnSourceSpecs)
  .concat([{
    key: 'poi',
    source: {
      type: 'geojson',
      data: 'redcedar-poi-epsg-4326.geojson',
    },
    layers: [
      {
        id: 'poi-fill',
        type: 'circle',
        source: 'poi',
        paint: {
          'circle-radius': {
            base: 1,
            stops: [
              [12, 2],
              [15, 4],
            ],
          },
          'circle-color': symptomCircleColor,
          'circle-stroke-color': symptomCircleStrokeColor,
          'circle-stroke-width': 1,
        },
      },
      {
        id: 'poi-selected',
        type: 'circle',
        source: 'poi',
        paint: {
          'circle-radius': {
            base: 2,
            stops: [
              [12, 3],
              [15, 5],
            ],
          },
          'circle-color': symptomCircleColor,
          'circle-stroke-color': themeColors.highlightColor,
          'circle-stroke-width': 2,
        },
        filter: ['==', ['get', 'id'], null]
      },
    ],
  }])

for (const spec of sourceSpecs) {
  if (spec.source.type === 'pmtiles') {
    const p = new pmtiles.PMTiles(spec.source.url)
    spec.source.type = 'vector'
    spec.source.url = `pmtiles://${spec.source.url}`
    protocol.add(p)
    spec.source.p = p
  }
}


const { sources, layers } = sourceSpecs.reduce((acc, curr) => {
  acc.sources[curr.key] = curr.source
  acc.layers = acc.layers.concat(curr.layers)

  return acc
}, { sources: {}, layers: [] })


module.exports = async function ({ container }) {
  let map
  try {
    const h = await sources.waterSheds.p.getHeader()
    map = new maplibregl.Map({
      container,
      style: {
          version: 8,
          sources,
          layers,
        },
        zoom: h.maxZoom-2,
        center: [h.centerLon, h.centerLat],
    });
  } catch (error) {
    console.log(error)
  }

  const setTheme = {}
  const setAnalysis = {}

  for (const themeName in theme) {
    setTheme[themeName] = {
      ...theme[themeName],
      setMapStyle: () => {
        for (const {key, name, value} of  theme[themeName].mapStyle) {
          map.setPaintProperty(key, name, value)
        }
      },
    }
  }

  for (const spec of analysisSpecs) {
    setAnalysis[spec.key] = () => {
      for (const spec of analysisSpecs) {
        map.setPaintProperty(nconnLayerId(spec), 'line-color', themeColors.transparent)
      }
      map.setPaintProperty(nconnLayerId(spec), 'line-color', themeColors.nconn)
    }
  }

  map.setPoiSelected = ({ id }) => {
    map.setFilter('poi-selected', ['==', ['get', 'id'], id])
  }

  return { map, setTheme, setAnalysis }
}
