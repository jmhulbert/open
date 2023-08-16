const html = require('choo/html')
const Component = require('choo/component')
const classnames = require('classnames')
const {parse} = require('papaparse')
const {Level} = require('level')
const bytewise = require('bytewise')
const Loading = require('./loading.js')

async function Db ({ name }) {
  function constructor () {
    return new Level(name, {
      keyEncoding: bytewise,
      valueEncoding: 'json',
    })
  }
  const db = constructor()
  await db.close()
  await Level.destroy(name)
  await db.open()

  let positionIncrement = -1

  const idFn = ({ row }) => {
    return row.find(s => s.key === 'id')?.value
  }

  const keyIdFn = ({ id }) => {
    return ['row', 'id', id]
  }

  const keyPositionFn = ({ position }) => {
    return ['row', 'position', position]
  }

  db.putRow = async ({ row }) => {
    positionIncrement += 1
    const pos = { position: positionIncrement }
    const id = idFn({ row })
    await db.put(keyIdFn({ id }), pos)
    await db.put(keyPositionFn(pos), { row })
    return pos
  }

  db.getPosition = async ({ id }) => {
    return await db.get(keyIdFn({ id }))
  }

  db.getRows = ({ activePositions }) => {
    return db.iterator({
      gt: keyPositionFn({ position: activePositions[0] - 1 }),
      lt: keyPositionFn({ position: activePositions[1] + 1 }),
    })
  }

  db.rowCount = () => positionIncrement

  return db
}

class TabularComponent extends Component {
  constructor (id, state, emit) {
    super(id)
    this.local = {...state.components[id]}
    this.emit = emit
    this.local.selected = null
    this.local.activePositions = [0, this.local.pageCount - 1]

    const showKeys = new Set([
      'id',
      'reclassified.tree.canopy.symptoms',
      'period-all-dist',
      'period-all-nfeat-id',
      'period-min-eph-dist',
      'period-min-eph-nfeat-id',
      'period-min-int-dist',
      'period-min-int-nfeat-id',
      'period-per-dist',
      'period-per-nfeat-id',
    ])

    this.filterKeys = ({ key }) => {
      return showKeys.has(key)
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
    this.emit('tabular:data:load:above', {
      db: this.db,
      activePositions: this.local.activePositions,
    })
  }

  loadBelow () {
    this.emit('tabular:data:load:below', {
      db: this.db,
      activePositions: this.local.activePositions,
    })
  }

  load(element) {
    this.loadData(this.local)
  }

  createElement () {
    const headerRow = this.local.data?.[0]?.filter(this.filterKeys) || []
    const numFields = headerRow.length
    const tableWidth = numFields * 150
    const tableWidthPx = `${tableWidth}px`
    return html`
      <div class="w-full h-full">
        ${Loading({ loading: this.local.data.length === 0 })}
        <table class="${classnames({
          'table-fixed': true,
          'hidden': this.local.data.length === 0,
        })}" style="width: ${tableWidthPx};">
          <thead class="">
            <tr class="">
            ${headerRow.map(({ key, value }) => {
              return html`<th class="sticky top-0 bg-white border-black border-solid border-2 px-3 whitespace-nowrap w-[150px] h-[30px] overflow-scroll">${key}</th>`
            })}
            </tr>
          </thead>
          <tbody>
            <tr class="${classnames({
              'p-3': true,
              'hidden': this.local.activePositions[0] === 0,
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
              const id = row.find(d => d.key === 'id')?.value || -1
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
                  ${row.filter(this.filterKeys).map(({key, value}) => {
                    return html`<td
                        class="inline-block border-black border-solid border px-3 whitespace-nowrap w-[150px] h-[30px] overflow-scroll"
                      >
                        ${value}
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
    return Array.isArray(activePositions) &&
      (
        this.local.activePositions[0] !== activePositions[0] ||
        this.local.activePositions[1] !== activePositions[1]
      )
  }

  update ({
    url,
    data,
    selected,
    activePositions,
    doNotScrollIntoView=false,
    loadMoreDirty=false,
  }) {
    this.local.loadMoreDirty = loadMoreDirty
    if (this.local.selected !== selected && this.newActivePositions({ activePositions })) {
      this.local.selected = selected
      this.local.doNotScrollIntoView = doNotScrollIntoView
      this.local.activePositions = activePositions
      this.local.data = data
      return true
    }
    if (this.local.selected !== selected) {
      this.local.selected = selected
      this.local.doNotScrollIntoView = doNotScrollIntoView
      return true
    }
    if (this.newActivePositions({ activePositions })) {
      this.local.activePositions = activePositions
      this.local.data = data
      return true
    }
    if (Array.isArray(data) && this.local.data.length !== data.length) {
      this.local.data = data
      return true
    }
    if (this.local.url !== url) {
      this.local.url = url
      laodData({ url })
      return true
    }
    return false
  }

  async loadData ({ url }) {
    this.db = await Db(this.local)
    window.db = this.db
    parse(url, {
      download: true,
      complete: async (results) => {
        const {data} = results
        const header = data[0]
        const rows = data.slice(1).map((row) => {
          return row.map((value, index) => {
            return{
              key: header[index],
              value,
            }
          }).map(this.transformValues)
        })
        for (const row of rows) {
          await this.db.putRow({ row })
        }
        this.local.rowCount = this.db.rowCount()
        this.emit('tabular:data:loaded', {
          data: rows.slice(0, this.local.pageCount),
          db: this.db,
        })
      }
    })
  }

  setSelected ({ row }) {
    const rowObj = row.reduce((acc, curr) => {
      acc[curr.key] = curr.value
      return acc
    }, {})
    let { id } = rowObj
    if (this.local.selected === id) id = null
    this.emit('tabular:data:selected', { ...rowObj, id })
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
      continuity.scrollIntoView()
    }
    const selected = element.querySelector('.selected')
    if (!selected) return
    if (this.local.doNotScrollIntoView === true) {
      this.local.doNotScrollIntoView = false
      return
    }
    selected.scrollIntoView(false)
  }
}

module.exports = TabularComponent