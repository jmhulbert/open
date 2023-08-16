const html = require('choo/html')
const Component = require('choo/component')
const classnames = require('classnames')
const Map = require('./map.js')
const Loading = require('../loading.js')

class MapComponent extends Component {
  constructor (id, state, emit) {
    super(id)
    this.local = state.components[id] = {}
    this.emit = emit
    this.state = state
  }

  load (element) {
    // TODO replace first load with a spinner to show we are loading data
    Map({ container: element })
      .then(({ map, setTheme, setAnalysis }) => {
        this.emit('map:loaded', { map, setTheme, setAnalysis })
      })
  }

  update () {
    return false
  }

  createElement () {
    return html`
      <div id="map-component" class="w-full h-full"></div>
    `
  }
}

function SetThemeDropDown (state, emit) {
  if (state.setTheme.length === 0) return html``
  return html`
    <select name="set-theme" onchange=${onchange}>
      ${state.setTheme.map(({ value, label, onSelect}) => {
        return html`
          <option value="${value}" selected="${ value === state.menu.themeName }">${label}</option>
        `
      })}
    </select>
  `

  function onchange (event) {
    emit('legend:set-theme', { themeName: event.target.value })
  }
}

function SetAnalysisDropDwon (state, emit) {
  if (state.setAnalysis.length === 0) return html``
  return html`
    <select name="set-theme" onchange=${onchange}>
      ${state.setAnalysis.map(({ value, label, onSelect}) => {
        return html`
          <option value="${value}" selected="${ value === state.menu.analysisName }">${label}</option>
        `
      })}
    </select>
  `

  function onchange (event) {
    emit('legend:set-analysis', { analysisName: event.target.value })
  }
}

function MapMenu (state, emit) {
  return html`
    <aside class="absolute top-1.5 right-1.5 bg-white max-h-[calc(100%-(6px*2))] flex flex-col border border-solid border-black">
      <header class="flex justify-end grow-0">
        <button onclick=${toggleLegend}
          class="${classnames({
            'p-3': true,
            'bg-black': !state.menu.open,
            'text-white': !state.menu.open,
          })}">
          ${ state.menu.open ? 'close' : 'menu' }
        </button>
      </header>
      <section class="${ classnames({
          'block': state.menu.open,
          'hidden': !state.menu.open,
        }) } flex flex-col overflow-scroll grow px-3 pb-3">
        <div class="">
          <header>
            <h1 class="font-bold">Map display options</h1>
          </header>
          <div class="">
            <header><h1 class="">nconn for analysis:</h1></header>
            <div class="mt-1.5">
              ${SetAnalysisDropDwon(state, emit)}
            </div>
          </div>
          <div class="mt-3">
            <header>
              <h1 class="">Map style</h1>
            </header>
            <div class="mt-1.5">
              ${SetThemeDropDown(state, emit)}
            </div>
          </div>
        </div>
        <div class="mt-3">
          <header>
            <h1 class="font-bold">Legend</h1>
          </header>
          ${state.menu.legend.map((spec, index) => {
            const title = spec.title
              ? html`<header><h1 class="">${spec.title}</h1></header>`
              : html``
            return html`
              <aside class="">
                ${title}
                <section class="${classnames({'mt-3': index !== 0})}">
                  ${spec.items.map((item) => {
                    return html`
                      <div class="flex items-center">
                        <div class="w-[30px] h-[30px] mr-1.5" style="background-color: ${item.color};"></div>
                        <div>
                          <p>${item.text}</p>
                        </div>
                      </div>
                    `
                  })}
                </section>
              </aside>
            `
          })}
        </div>
      </section>
    </aside>
  `

  function toggleLegend () {
    emit('legend:toggle')
  }
}

class MapUI extends Component {
  constructor (id, state, emit) {
    super(id)
    this.local = {...state.components[id]}
    this.emit = emit
    this.state = state
  }

  update ({ loading }) {
    if (this.local.loading !== loading) {
      this.local.loading = loading
    }
    return true
  }

  createElement () {
    return html`
      <div class="w-full h-full relative">
        <div class="w-full h-full">
          ${Loading({ loading: this.local.loading })}
          ${this.state.cache(MapComponent, 'map').render()}
        </div>
        ${MapMenu(this.state, this.emit)}
      </div>
    `
  }
}

module.exports = MapUI