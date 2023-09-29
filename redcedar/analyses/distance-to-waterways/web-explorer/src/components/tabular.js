const html = require('choo/html')
const Component = require('choo/component')
const classnames = require('classnames')
const Loading = require('./loading.js')
const {decodeFetch: TADecoder} = require('tabular-archive')

class TabularComponent extends Component {
  constructor (id, state, emit) {
    super(id)
    this.local = {...state.components[id]}
    this.emit = emit
    this.local.selected = null
    this.local.activePositions = {
      startRowNumber: undefined,
      endRowNumber: undefined,
    }
    this.local.loading = true
    this.headerRow = []
    this.rowCount = undefined

    const analysisFields = [
      'period-all',
      'period-min-eph',
      'period-min-int',
      'period-unk',
      'period-int',
      'period-eph',
      'period-per',
    ].map((analysisName) => {
        return [
          `${analysisName}-dist`,
          `${analysisName}-nfeat-id`,
          `${analysisName}-nfeat-period`,
        ]
      })
      .reduce((acc, curr) => {
        return acc.concat(curr)
      }, [])

    const showFields = new Set([
      'id',
      'reclassified.tree.canopy.symptoms',
      ...analysisFields,
    ])

    this.filterFields = ({ field }) => {
      return showFields.has(field)
    }

    this.transformValues = ({ key, value }) => {
      if (key.indexOf('-dist') !== -1) value = parseFloat(value).toFixed(2)
      return {
        key,
        value,
      }
    }
  }

  loadAbove () {
    this.emit('tabular:rows:load:above', {
      taDecoder: this.taDecoder,
      rowCount: this.rowCount,
      activePositions: this.local.activePositions,
    })
  }

  loadBelow () {
    this.emit('tabular:rows:load:below', {
      taDecoder: this.taDecoder,
      rowCount: this.rowCount,
      activePositions: this.local.activePositions,
    })
  }

  load (element) {
    TADecoder({ archiveFilePath: this.local.archiveFilePath })
      .then(async (decoder) => {
        this.taDecoder = decoder
        this.local.rowCount = decoder.rowCount
        this.headerRow = decoder.headerRow

        this.emit('tabular:header:loaded', {
          rowCount: this.local.rowCount,
          taDecoder: this.taDecoder,
        })
      })
  }

  createElement () {
    return html`
      <div class="relative w-full h-full">
        ${Loading({ loading: this.local.loading })}
        <table class="${classnames({
          'hidden': this.local.data.length === 0,
        })}">
          <thead class="">
            <tr class="">
            ${this.headerRow.filter(this.filterFields).map(({ field }) => {
              return html`<th class="sticky top-0 bg-white border-black border-solid border-x-2 border-b-2 px-3 whitespace-nowrap w-[150px] h-[30px] overflow-scroll">${field}</th>`
            })}
            </tr>
          </thead>
          <tbody class="">
            <tr class="${classnames({
              'p-3': true,
              'hidden': typeof this.local.activePositions.startRowNumber === 'number'
                ? this.local.activePositions.startRowNumber === 0
                : true,
            })}"
              data-is-navigation=true >
                <td>
                  <button
                    onclick=${() => this.loadAbove()}
                    disabled=${this.local.activePositions[0] === 0}
                    class="p-3 bg-black text-white">previous page</button>
                </td>
            </tr>
            ${this.local.data.map((row, index) => {
              const id = row.id || -1
              const selected = this.local.selected === id
              return html`
                <tr onclick=${() => this.setSelected({ row })}
                  data-is-row=true
                  class="${classnames({
                    selected,
                    'cursor-pointer': true,
                    'hover:bg-slate-300': true,
                    'bg-white': !selected,
                    'text-black': !selected,
                    'bg-black': selected,
                    'text-white': selected,
                    'hover:bg-black': selected,
                  })}">
                ${this.headerRow.filter(this.filterFields).map(({ field }) => {
                  return html`<td
                    class="border-black border-solid border px-3 whitespace-nowrap w-[150px] h-[30px] overflow-scroll"
                  >
                    ${row[field]}
                  </td>`
                })}
                </tr>
              `
            })}
            <tr class="${classnames({
              'hidden': this.local.activePositions[1] >= this.local.rowCount,
            })}"
              data-is-navigation=true >
              <td>
                <button
                  onclick=${() => this.loadBelow()}
                  disabled=${this.local.activePositions[1] >= this.local.rowCount}
                  class="p-3 bg-black text-white">next page</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `
  }

  newActivePositions ({ activePositions }) {
    return this.local.activePositions?.startRowNumber !== activePositions?.startRowNumber ||
        this.local.activePositions?.endRowNumber !== activePositions?.endRowNumber
  }

  update ({
    url,
    data,
    selected,
    activePositions,
    loadMoreDirty,
    loading,
    doNotScrollIntoView=false,
  }) {
    let update = false
    if (this.local.loadMoreDirty !== loadMoreDirty) {
      this.local.loadMoreDirty = loadMoreDirty
      update = true   
    }
    if (this.newActivePositions({ activePositions })) {
      this.local.activePositions = activePositions
      this.local.data = data
      update = true
    }
    if (this.local.selected !== selected) {
      this.local.selected = selected
      this.local.doNotScrollIntoView = doNotScrollIntoView
      update = true
    }
    if (Array.isArray(data) && this.local.data.length !== data.length) {
      this.local.data = data
      update = true
    }
    if (this.local.url !== url) {
      this.local.url = url
      laodData({ url })
      update = true
    }
    if (this.local.loading !== loading) {
      this.local.loading = loading
      update = true
    }
    return update
  }

  setSelected ({ row }) {
    let { id } = row
    if (this.local.selected === id) id = null
    this.emit('tabular:row:selected', { ...row, id })
  }

  afterupdate (element) {
    if (this.local.loadMoreDirty) {
      let continuity
      if (this.local.loadMoreDirty === 'above') {
        continuity = this.element.querySelector('tbody tr:nth-last-child(1)')
      }
      else if (this.local.loadMoreDirty === 'below') {
        continuity = this.element.querySelector('tbody tr:nth-child(1)')
      }
      this.local.loadMoreDirty = false
      if (continuity) continuity.scrollIntoView()
    }
    const selected = element.querySelector('.selected')
    if (!selected) return
    if (this.local.doNotScrollIntoView === true) {
      this.local.doNotScrollIntoView = false
      return
    }
    const scrollOptions = {
      block: 'nearest',
      inline: 'nearest',
    }
    selected.scrollIntoView(scrollOptions)
    const headingHeight = 30
    const th = element.querySelector('thead tr:first-child th:first-child')
    const thBbox = th.getBoundingClientRect()
    const selectedBbox = selected.getBoundingClientRect()
    if (thBbox.y + thBbox.height > selectedBbox.y && selected.previousSibling?.scrollIntoView) {
      selected.previousSibling.scrollIntoView(scrollOptions)
    }
  }
}

module.exports = TabularComponent