const choo = require('choo')
const html = require('choo/html')
const MapUI = require('./src/components/map/index.js')
const TabularComponent = require('./src/components/tabular.js')
const SplitPane = require('./src/components/split-pane.js')

const curDir = window.location.pathname
const altCurDir = curDir.endsWith('/') ? curDir.slice(0, -1) : `${curDir}/`

const app = choo()

const main = (state, emit) => {
  return html`
    <div class="w-full h-screen">
      ${SplitPane({
        left: state.cache(TabularComponent, 'tabular').render(state.components.tabular),
        right: state.cache(MapUI, 'mapUi').render(state.components.mapUi),
        state,
        emit,
      })}
    </div>
  `
}

const store = (state, emitter) => {
  state.components = {
    tabular: {
      name: 'poi-table',
      url: 'redcedar-poi-nearest-by-period.csv',
      data: [],
      pageCount: 100,
      db: null
    },
    mapUi: {
      loading: true,
    },
    splitPane: {
      layout: window.innerWidth > 600 ? 'horizontal' : 'vertical',
      left: {
        open: true,
      },
      right: {
        open: true,
      },
    },
  }
  state.menu = {
    open: false,
    themeName: null,
    analysisName: null,
    legend: [],
  }
  state.setTheme = []
  state.setAnalysis = []
  state.map = undefined
  
  const onStyleLoad = []

  emitter.on('map:loaded', ({ map, setTheme, setAnalysis }) => {
    state.map = map
    map.on('style.load', () => {
      state.components.mapUi.loading = false
      for (const fn of onStyleLoad) {
        fn()
      }
      emitter.emit('render')
    })

    Object.keys(setTheme).forEach((themeName, index) => {
      const spec = setTheme[themeName]
      const onSelect = () => {
        setTheme[themeName].setMapStyle()
        state.menu.themeName = themeName
        state.menu.legend = spec.legend
        emitter.emit('render')
      }

      state.setTheme.push({ value: themeName, label: spec.label, onSelect })

      if (index === 0) onStyleLoad.push(onSelect)
    })

    Object.keys(setAnalysis).forEach((analysisName, index) => {
      const onSelect = () => {
        setAnalysis[analysisName]()
        state.menu.analysisName = analysisName
        emitter.emit('render')
      }

      state.setAnalysis.push({ value: analysisName, label: analysisName, onSelect })

      if (index === 0) onStyleLoad.push(onSelect)
    })

    map.on('click', 'poi-fill', (e) => {
      let id = e.features[0]?.properties?.id
      if (id === state.components.tabular.selected) {
        id = state.components.tabular.selected = null
        emitter.emit('render')
      }
      else if (state.components?.tabular?.db) {
        const asyncState = {
          selected: id,
          doNotScrollIntoView: false,
          data: [],
          loadMoreDirty: false,
          activePositions: []
        }
        ;(async () => {
          const { position=0 } = await state.components.tabular?.db?.getPosition({ id })
          const page = position / state.components.tabular.pageCount
          let firstPage = Math.floor(page)
          let lastPage = Math.ceil(page)
          if (firstPage === lastPage) lastPage += 1
          asyncState.activePositions[0] = firstPage * state.components.tabular.pageCount
          asyncState.activePositions[1] = lastPage * state.components.tabular.pageCount
          for await (const [key, {row}] of state.components.tabular.db.getRows(asyncState)) {
            asyncState.data.push(row)
          }
          state.components.tabular = {
            ...state.components.tabular,
            ...asyncState,
          }
          emitter.emit('render')
        })()
      }
      state.map.setPoiSelected({ id })
    })

    emitter.emit('render')
  })

  emitter.on('legend:toggle', () => {
    state.menu.open = !state.menu.open
    emitter.emit('render')
  })

  emitter.on('legend:set-theme', ({ themeName }) => {
    state.menu.themeName = themeName
    const item = state.setTheme.find(s => s.value === themeName)
    if (item) item.onSelect()
    emitter.emit('render')
  })

  emitter.on('legend:set-analysis', ({ analysisName }) => {
    state.menu.analysisName = analysisName
    const item = state.setAnalysis.find(s => s.value === analysisName)
    if (item) item.onSelect()
    emitter.emit('render')
  })
  
  emitter.on('tabular:data:loaded', ({ db, data }) => {
    state.components.tabular.data = data
    state.components.tabular.db = db
    state.components.tabular.rowCount = db.rowCount()
    emitter.emit('render')
  })

  emitter.on('tabular:data:selected', ({ id, latitude, longitude }) => {
    state.components.tabular.selected = id
    state.components.tabular.doNotScrollIntoView = state.components.splitPane.left.open === true
      ? true
      : false
    state.components.tabular.loadMoreDirty = false
    if (id && latitude && longitude) {
      state.map?.flyTo({ center: [longitude, latitude], zoom: 14 });
    }
    state.map?.setPoiSelected({ id })
    emitter.emit('render')
  })

  const tabularDataLoad = ({ name, activePositionsTransform }) => ({ db, activePositions }) => {
    const asyncState = {
      activePositions: activePositionsTransform({ activePositions }),
      data: [],
      loadMoreDirty: name,
    }
    ;(async () => {
      for await (const [key, {row}] of db.getRows(asyncState)) {
        asyncState.data.push(row)
      }
      state.components.tabular = {
        ...state.components.tabular,
        ...asyncState
      }
      emitter.emit('render')
    })()
  }

  const tabularDataLoadBelow = tabularDataLoad({
    name: 'below',
    activePositionsTransform: ({ activePositions }) => {
      let first = activePositions[0] + state.components.tabular.pageCount
      let last = activePositions[1] + state.components.tabular.pageCount
      if (last > state.components.tabular.rowCount) {
        first = state.components.tabular.rowCount - state.components.tabular.pageCount - 1
        last = state.components.tabular.rowCount
      }
      return [
        first,
        last,
      ]
    },
  })

  const tabularDataLoadAbove = tabularDataLoad({
    name: 'above',
    activePositionsTransform: ({ activePositions }) => {
      let first = activePositions[0] - state.components.tabular.pageCount
      let last = activePositions[1] - state.components.tabular.pageCount
      if (first < 0) {
        frist = 0
        last = state.components.tabular.pageCount - 1
      }
      return [
        first,
        last,
      ]
    },
  })

  emitter.on('tabular:data:load:above', tabularDataLoadAbove)
  emitter.on('tabular:data:load:below', tabularDataLoadBelow)

  emitter.on('split-pane:toggle:left', () => {
    state.components.splitPane.left.open = !state.components.splitPane.left.open
    if (!state.components.splitPane.left.open && !state.components.splitPane.right.open) {
      state.components.splitPane.left.open = true
      state.components.splitPane.right.open = true
    }
    emitter.emit('render')
  })

  emitter.on('split-pane:toggle:right', () => {
    state.components.splitPane.right.open = !state.components.splitPane.right.open
    if (!state.components.splitPane.left.open && !state.components.splitPane.right.open) {
      state.components.splitPane.left.open = true
      state.components.splitPane.right.open = true
    }
    emitter.emit('render')
  })

  emitter.on('split-pane:set-layout:horizontal', () => {
    if (state.components.splitPane.layout === 'horizontal') return
    state.components.splitPane.layout = 'horizontal'
    emitter.emit('render')
  })

  emitter.on('split-pane:set-layout:vertical', () => {
    if (state.components.splitPane.layout === 'vertical') return
    state.components.splitPane.layout = 'vertical'
    emitter.emit('render')
  })
}

app.use(store)

app.route(curDir, main)
app.route(altCurDir, main)

// start app
app.mount('#explore')
