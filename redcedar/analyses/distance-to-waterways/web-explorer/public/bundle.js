(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
      layout: 'horizontal',
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
    state.components.tabular.doNotScrollIntoView = true
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

},{"./src/components/map/index.js":88,"./src/components/split-pane.js":90,"./src/components/tabular.js":91,"choo":34,"choo/html":33}],2:[function(require,module,exports){
'use strict'

const { fromCallback } = require('catering')
const ModuleError = require('module-error')
const { getCallback, getOptions } = require('./lib/common')

const kPromise = Symbol('promise')
const kStatus = Symbol('status')
const kOperations = Symbol('operations')
const kFinishClose = Symbol('finishClose')
const kCloseCallbacks = Symbol('closeCallbacks')

class AbstractChainedBatch {
  constructor (db) {
    if (typeof db !== 'object' || db === null) {
      const hint = db === null ? 'null' : typeof db
      throw new TypeError(`The first argument must be an abstract-level database, received ${hint}`)
    }

    this[kOperations] = []
    this[kCloseCallbacks] = []
    this[kStatus] = 'open'
    this[kFinishClose] = this[kFinishClose].bind(this)

    this.db = db
    this.db.attachResource(this)
    this.nextTick = db.nextTick
  }

  get length () {
    return this[kOperations].length
  }

  put (key, value, options) {
    if (this[kStatus] !== 'open') {
      throw new ModuleError('Batch is not open: cannot call put() after write() or close()', {
        code: 'LEVEL_BATCH_NOT_OPEN'
      })
    }

    const err = this.db._checkKey(key) || this.db._checkValue(value)
    if (err) throw err

    const db = options && options.sublevel != null ? options.sublevel : this.db
    const original = options
    const keyEncoding = db.keyEncoding(options && options.keyEncoding)
    const valueEncoding = db.valueEncoding(options && options.valueEncoding)
    const keyFormat = keyEncoding.format

    // Forward encoding options
    options = { ...options, keyEncoding: keyFormat, valueEncoding: valueEncoding.format }

    // Prevent double prefixing
    if (db !== this.db) {
      options.sublevel = null
    }

    const mappedKey = db.prefixKey(keyEncoding.encode(key), keyFormat)
    const mappedValue = valueEncoding.encode(value)

    this._put(mappedKey, mappedValue, options)
    this[kOperations].push({ ...original, type: 'put', key, value })

    return this
  }

  _put (key, value, options) {}

  del (key, options) {
    if (this[kStatus] !== 'open') {
      throw new ModuleError('Batch is not open: cannot call del() after write() or close()', {
        code: 'LEVEL_BATCH_NOT_OPEN'
      })
    }

    const err = this.db._checkKey(key)
    if (err) throw err

    const db = options && options.sublevel != null ? options.sublevel : this.db
    const original = options
    const keyEncoding = db.keyEncoding(options && options.keyEncoding)
    const keyFormat = keyEncoding.format

    // Forward encoding options
    options = { ...options, keyEncoding: keyFormat }

    // Prevent double prefixing
    if (db !== this.db) {
      options.sublevel = null
    }

    this._del(db.prefixKey(keyEncoding.encode(key), keyFormat), options)
    this[kOperations].push({ ...original, type: 'del', key })

    return this
  }

  _del (key, options) {}

  clear () {
    if (this[kStatus] !== 'open') {
      throw new ModuleError('Batch is not open: cannot call clear() after write() or close()', {
        code: 'LEVEL_BATCH_NOT_OPEN'
      })
    }

    this._clear()
    this[kOperations] = []

    return this
  }

  _clear () {}

  write (options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options)

    if (this[kStatus] !== 'open') {
      this.nextTick(callback, new ModuleError('Batch is not open: cannot call write() after write() or close()', {
        code: 'LEVEL_BATCH_NOT_OPEN'
      }))
    } else if (this.length === 0) {
      this.close(callback)
    } else {
      this[kStatus] = 'writing'
      this._write(options, (err) => {
        this[kStatus] = 'closing'
        this[kCloseCallbacks].push(() => callback(err))

        // Emit after setting 'closing' status, because event may trigger a
        // db close which in turn triggers (idempotently) closing this batch.
        if (!err) this.db.emit('batch', this[kOperations])

        this._close(this[kFinishClose])
      })
    }

    return callback[kPromise]
  }

  _write (options, callback) {}

  close (callback) {
    callback = fromCallback(callback, kPromise)

    if (this[kStatus] === 'closing') {
      this[kCloseCallbacks].push(callback)
    } else if (this[kStatus] === 'closed') {
      this.nextTick(callback)
    } else {
      this[kCloseCallbacks].push(callback)

      if (this[kStatus] !== 'writing') {
        this[kStatus] = 'closing'
        this._close(this[kFinishClose])
      }
    }

    return callback[kPromise]
  }

  _close (callback) {
    this.nextTick(callback)
  }

  [kFinishClose] () {
    this[kStatus] = 'closed'
    this.db.detachResource(this)

    const callbacks = this[kCloseCallbacks]
    this[kCloseCallbacks] = []

    for (const cb of callbacks) {
      cb()
    }
  }
}

exports.AbstractChainedBatch = AbstractChainedBatch

},{"./lib/common":8,"catering":29,"module-error":52}],3:[function(require,module,exports){
'use strict'

const { fromCallback } = require('catering')
const ModuleError = require('module-error')
const { getOptions, getCallback } = require('./lib/common')

const kPromise = Symbol('promise')
const kCallback = Symbol('callback')
const kWorking = Symbol('working')
const kHandleOne = Symbol('handleOne')
const kHandleMany = Symbol('handleMany')
const kAutoClose = Symbol('autoClose')
const kFinishWork = Symbol('finishWork')
const kReturnMany = Symbol('returnMany')
const kClosing = Symbol('closing')
const kHandleClose = Symbol('handleClose')
const kClosed = Symbol('closed')
const kCloseCallbacks = Symbol('closeCallbacks')
const kKeyEncoding = Symbol('keyEncoding')
const kValueEncoding = Symbol('valueEncoding')
const kAbortOnClose = Symbol('abortOnClose')
const kLegacy = Symbol('legacy')
const kKeys = Symbol('keys')
const kValues = Symbol('values')
const kLimit = Symbol('limit')
const kCount = Symbol('count')

const emptyOptions = Object.freeze({})
const noop = () => {}
let warnedEnd = false

// This class is an internal utility for common functionality between AbstractIterator,
// AbstractKeyIterator and AbstractValueIterator. It's not exported.
class CommonIterator {
  constructor (db, options, legacy) {
    if (typeof db !== 'object' || db === null) {
      const hint = db === null ? 'null' : typeof db
      throw new TypeError(`The first argument must be an abstract-level database, received ${hint}`)
    }

    if (typeof options !== 'object' || options === null) {
      throw new TypeError('The second argument must be an options object')
    }

    this[kClosed] = false
    this[kCloseCallbacks] = []
    this[kWorking] = false
    this[kClosing] = false
    this[kAutoClose] = false
    this[kCallback] = null
    this[kHandleOne] = this[kHandleOne].bind(this)
    this[kHandleMany] = this[kHandleMany].bind(this)
    this[kHandleClose] = this[kHandleClose].bind(this)
    this[kKeyEncoding] = options[kKeyEncoding]
    this[kValueEncoding] = options[kValueEncoding]
    this[kLegacy] = legacy
    this[kLimit] = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : Infinity
    this[kCount] = 0

    // Undocumented option to abort pending work on close(). Used by the
    // many-level module as a temporary solution to a blocked close().
    // TODO (next major): consider making this the default behavior. Native
    // implementations should have their own logic to safely close iterators.
    this[kAbortOnClose] = !!options.abortOnClose

    this.db = db
    this.db.attachResource(this)
    this.nextTick = db.nextTick
  }

  get count () {
    return this[kCount]
  }

  get limit () {
    return this[kLimit]
  }

  next (callback) {
    let promise

    if (callback === undefined) {
      promise = new Promise((resolve, reject) => {
        callback = (err, key, value) => {
          if (err) reject(err)
          else if (!this[kLegacy]) resolve(key)
          else if (key === undefined && value === undefined) resolve()
          else resolve([key, value])
        }
      })
    } else if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function')
    }

    if (this[kClosing]) {
      this.nextTick(callback, new ModuleError('Iterator is not open: cannot call next() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      }))
    } else if (this[kWorking]) {
      this.nextTick(callback, new ModuleError('Iterator is busy: cannot call next() until previous call has completed', {
        code: 'LEVEL_ITERATOR_BUSY'
      }))
    } else {
      this[kWorking] = true
      this[kCallback] = callback

      if (this[kCount] >= this[kLimit]) this.nextTick(this[kHandleOne], null)
      else this._next(this[kHandleOne])
    }

    return promise
  }

  _next (callback) {
    this.nextTick(callback)
  }

  nextv (size, options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, emptyOptions)

    if (!Number.isInteger(size)) {
      this.nextTick(callback, new TypeError("The first argument 'size' must be an integer"))
      return callback[kPromise]
    }

    if (this[kClosing]) {
      this.nextTick(callback, new ModuleError('Iterator is not open: cannot call nextv() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      }))
    } else if (this[kWorking]) {
      this.nextTick(callback, new ModuleError('Iterator is busy: cannot call nextv() until previous call has completed', {
        code: 'LEVEL_ITERATOR_BUSY'
      }))
    } else {
      if (size < 1) size = 1
      if (this[kLimit] < Infinity) size = Math.min(size, this[kLimit] - this[kCount])

      this[kWorking] = true
      this[kCallback] = callback

      if (size <= 0) this.nextTick(this[kHandleMany], null, [])
      else this._nextv(size, options, this[kHandleMany])
    }

    return callback[kPromise]
  }

  _nextv (size, options, callback) {
    const acc = []
    const onnext = (err, key, value) => {
      if (err) {
        return callback(err)
      } else if (this[kLegacy] ? key === undefined && value === undefined : key === undefined) {
        return callback(null, acc)
      }

      acc.push(this[kLegacy] ? [key, value] : key)

      if (acc.length === size) {
        callback(null, acc)
      } else {
        this._next(onnext)
      }
    }

    this._next(onnext)
  }

  all (options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, emptyOptions)

    if (this[kClosing]) {
      this.nextTick(callback, new ModuleError('Iterator is not open: cannot call all() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      }))
    } else if (this[kWorking]) {
      this.nextTick(callback, new ModuleError('Iterator is busy: cannot call all() until previous call has completed', {
        code: 'LEVEL_ITERATOR_BUSY'
      }))
    } else {
      this[kWorking] = true
      this[kCallback] = callback
      this[kAutoClose] = true

      if (this[kCount] >= this[kLimit]) this.nextTick(this[kHandleMany], null, [])
      else this._all(options, this[kHandleMany])
    }

    return callback[kPromise]
  }

  _all (options, callback) {
    // Must count here because we're directly calling _nextv()
    let count = this[kCount]
    const acc = []

    const nextv = () => {
      // Not configurable, because implementations should optimize _all().
      const size = this[kLimit] < Infinity ? Math.min(1e3, this[kLimit] - count) : 1e3

      if (size <= 0) {
        this.nextTick(callback, null, acc)
      } else {
        this._nextv(size, emptyOptions, onnextv)
      }
    }

    const onnextv = (err, items) => {
      if (err) {
        callback(err)
      } else if (items.length === 0) {
        callback(null, acc)
      } else {
        acc.push.apply(acc, items)
        count += items.length
        nextv()
      }
    }

    nextv()
  }

  [kFinishWork] () {
    const cb = this[kCallback]

    // Callback will be null if work was aborted on close
    if (this[kAbortOnClose] && cb === null) return noop

    this[kWorking] = false
    this[kCallback] = null

    if (this[kClosing]) this._close(this[kHandleClose])

    return cb
  }

  [kReturnMany] (cb, err, items) {
    if (this[kAutoClose]) {
      this.close(cb.bind(null, err, items))
    } else {
      cb(err, items)
    }
  }

  seek (target, options) {
    options = getOptions(options, emptyOptions)

    if (this[kClosing]) {
      // Don't throw here, to be kind to implementations that wrap
      // another db and don't necessarily control when the db is closed
    } else if (this[kWorking]) {
      throw new ModuleError('Iterator is busy: cannot call seek() until next() has completed', {
        code: 'LEVEL_ITERATOR_BUSY'
      })
    } else {
      const keyEncoding = this.db.keyEncoding(options.keyEncoding || this[kKeyEncoding])
      const keyFormat = keyEncoding.format

      if (options.keyEncoding !== keyFormat) {
        options = { ...options, keyEncoding: keyFormat }
      }

      const mapped = this.db.prefixKey(keyEncoding.encode(target), keyFormat)
      this._seek(mapped, options)
    }
  }

  _seek (target, options) {
    throw new ModuleError('Iterator does not support seek()', {
      code: 'LEVEL_NOT_SUPPORTED'
    })
  }

  close (callback) {
    callback = fromCallback(callback, kPromise)

    if (this[kClosed]) {
      this.nextTick(callback)
    } else if (this[kClosing]) {
      this[kCloseCallbacks].push(callback)
    } else {
      this[kClosing] = true
      this[kCloseCallbacks].push(callback)

      if (!this[kWorking]) {
        this._close(this[kHandleClose])
      } else if (this[kAbortOnClose]) {
        // Don't wait for work to finish. Subsequently ignore the result.
        const cb = this[kFinishWork]()

        cb(new ModuleError('Aborted on iterator close()', {
          code: 'LEVEL_ITERATOR_NOT_OPEN'
        }))
      }
    }

    return callback[kPromise]
  }

  _close (callback) {
    this.nextTick(callback)
  }

  [kHandleClose] () {
    this[kClosed] = true
    this.db.detachResource(this)

    const callbacks = this[kCloseCallbacks]
    this[kCloseCallbacks] = []

    for (const cb of callbacks) {
      cb()
    }
  }

  async * [Symbol.asyncIterator] () {
    try {
      let item

      while ((item = (await this.next())) !== undefined) {
        yield item
      }
    } finally {
      if (!this[kClosed]) await this.close()
    }
  }
}

// For backwards compatibility this class is not (yet) called AbstractEntryIterator.
class AbstractIterator extends CommonIterator {
  constructor (db, options) {
    super(db, options, true)
    this[kKeys] = options.keys !== false
    this[kValues] = options.values !== false
  }

  [kHandleOne] (err, key, value) {
    const cb = this[kFinishWork]()
    if (err) return cb(err)

    try {
      key = this[kKeys] && key !== undefined ? this[kKeyEncoding].decode(key) : undefined
      value = this[kValues] && value !== undefined ? this[kValueEncoding].decode(value) : undefined
    } catch (err) {
      return cb(new IteratorDecodeError('entry', err))
    }

    if (!(key === undefined && value === undefined)) {
      this[kCount]++
    }

    cb(null, key, value)
  }

  [kHandleMany] (err, entries) {
    const cb = this[kFinishWork]()
    if (err) return this[kReturnMany](cb, err)

    try {
      for (const entry of entries) {
        const key = entry[0]
        const value = entry[1]

        entry[0] = this[kKeys] && key !== undefined ? this[kKeyEncoding].decode(key) : undefined
        entry[1] = this[kValues] && value !== undefined ? this[kValueEncoding].decode(value) : undefined
      }
    } catch (err) {
      return this[kReturnMany](cb, new IteratorDecodeError('entries', err))
    }

    this[kCount] += entries.length
    this[kReturnMany](cb, null, entries)
  }

  end (callback) {
    if (!warnedEnd && typeof console !== 'undefined') {
      warnedEnd = true
      console.warn(new ModuleError(
        'The iterator.end() method was renamed to close() and end() is an alias that will be removed in a future version',
        { code: 'LEVEL_LEGACY' }
      ))
    }

    return this.close(callback)
  }
}

class AbstractKeyIterator extends CommonIterator {
  constructor (db, options) {
    super(db, options, false)
  }

  [kHandleOne] (err, key) {
    const cb = this[kFinishWork]()
    if (err) return cb(err)

    try {
      key = key !== undefined ? this[kKeyEncoding].decode(key) : undefined
    } catch (err) {
      return cb(new IteratorDecodeError('key', err))
    }

    if (key !== undefined) this[kCount]++
    cb(null, key)
  }

  [kHandleMany] (err, keys) {
    const cb = this[kFinishWork]()
    if (err) return this[kReturnMany](cb, err)

    try {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        keys[i] = key !== undefined ? this[kKeyEncoding].decode(key) : undefined
      }
    } catch (err) {
      return this[kReturnMany](cb, new IteratorDecodeError('keys', err))
    }

    this[kCount] += keys.length
    this[kReturnMany](cb, null, keys)
  }
}

class AbstractValueIterator extends CommonIterator {
  constructor (db, options) {
    super(db, options, false)
  }

  [kHandleOne] (err, value) {
    const cb = this[kFinishWork]()
    if (err) return cb(err)

    try {
      value = value !== undefined ? this[kValueEncoding].decode(value) : undefined
    } catch (err) {
      return cb(new IteratorDecodeError('value', err))
    }

    if (value !== undefined) this[kCount]++
    cb(null, value)
  }

  [kHandleMany] (err, values) {
    const cb = this[kFinishWork]()
    if (err) return this[kReturnMany](cb, err)

    try {
      for (let i = 0; i < values.length; i++) {
        const value = values[i]
        values[i] = value !== undefined ? this[kValueEncoding].decode(value) : undefined
      }
    } catch (err) {
      return this[kReturnMany](cb, new IteratorDecodeError('values', err))
    }

    this[kCount] += values.length
    this[kReturnMany](cb, null, values)
  }
}

// Internal utility, not typed or exported
class IteratorDecodeError extends ModuleError {
  constructor (subject, cause) {
    super(`Iterator could not decode ${subject}`, {
      code: 'LEVEL_DECODE_ERROR',
      cause
    })
  }
}

// To help migrating to abstract-level
for (const k of ['_ended property', '_nexting property', '_end method']) {
  Object.defineProperty(AbstractIterator.prototype, k.split(' ')[0], {
    get () { throw new ModuleError(`The ${k} has been removed`, { code: 'LEVEL_LEGACY' }) },
    set () { throw new ModuleError(`The ${k} has been removed`, { code: 'LEVEL_LEGACY' }) }
  })
}

// Exposed so that AbstractLevel can set these options
AbstractIterator.keyEncoding = kKeyEncoding
AbstractIterator.valueEncoding = kValueEncoding

exports.AbstractIterator = AbstractIterator
exports.AbstractKeyIterator = AbstractKeyIterator
exports.AbstractValueIterator = AbstractValueIterator

},{"./lib/common":8,"catering":29,"module-error":52}],4:[function(require,module,exports){
'use strict'

const { supports } = require('level-supports')
const { Transcoder } = require('level-transcoder')
const { EventEmitter } = require('events')
const { fromCallback } = require('catering')
const ModuleError = require('module-error')
const { AbstractIterator } = require('./abstract-iterator')
const { DefaultKeyIterator, DefaultValueIterator } = require('./lib/default-kv-iterator')
const { DeferredIterator, DeferredKeyIterator, DeferredValueIterator } = require('./lib/deferred-iterator')
const { DefaultChainedBatch } = require('./lib/default-chained-batch')
const { getCallback, getOptions } = require('./lib/common')
const rangeOptions = require('./lib/range-options')

const kPromise = Symbol('promise')
const kLanded = Symbol('landed')
const kResources = Symbol('resources')
const kCloseResources = Symbol('closeResources')
const kOperations = Symbol('operations')
const kUndefer = Symbol('undefer')
const kDeferOpen = Symbol('deferOpen')
const kOptions = Symbol('options')
const kStatus = Symbol('status')
const kDefaultOptions = Symbol('defaultOptions')
const kTranscoder = Symbol('transcoder')
const kKeyEncoding = Symbol('keyEncoding')
const kValueEncoding = Symbol('valueEncoding')
const noop = () => {}

class AbstractLevel extends EventEmitter {
  constructor (manifest, options) {
    super()

    if (typeof manifest !== 'object' || manifest === null) {
      throw new TypeError("The first argument 'manifest' must be an object")
    }

    options = getOptions(options)
    const { keyEncoding, valueEncoding, passive, ...forward } = options

    this[kResources] = new Set()
    this[kOperations] = []
    this[kDeferOpen] = true
    this[kOptions] = forward
    this[kStatus] = 'opening'

    this.supports = supports(manifest, {
      status: true,
      promises: true,
      clear: true,
      getMany: true,
      deferredOpen: true,

      // TODO (next major): add seek
      snapshots: manifest.snapshots !== false,
      permanence: manifest.permanence !== false,

      // TODO: remove from level-supports because it's always supported
      keyIterator: true,
      valueIterator: true,
      iteratorNextv: true,
      iteratorAll: true,

      encodings: manifest.encodings || {},
      events: Object.assign({}, manifest.events, {
        opening: true,
        open: true,
        closing: true,
        closed: true,
        put: true,
        del: true,
        batch: true,
        clear: true
      })
    })

    this[kTranscoder] = new Transcoder(formats(this))
    this[kKeyEncoding] = this[kTranscoder].encoding(keyEncoding || 'utf8')
    this[kValueEncoding] = this[kTranscoder].encoding(valueEncoding || 'utf8')

    // Add custom and transcoder encodings to manifest
    for (const encoding of this[kTranscoder].encodings()) {
      if (!this.supports.encodings[encoding.commonName]) {
        this.supports.encodings[encoding.commonName] = true
      }
    }

    this[kDefaultOptions] = {
      empty: Object.freeze({}),
      entry: Object.freeze({
        keyEncoding: this[kKeyEncoding].commonName,
        valueEncoding: this[kValueEncoding].commonName
      }),
      key: Object.freeze({
        keyEncoding: this[kKeyEncoding].commonName
      })
    }

    // Let subclass finish its constructor
    this.nextTick(() => {
      if (this[kDeferOpen]) {
        this.open({ passive: false }, noop)
      }
    })
  }

  get status () {
    return this[kStatus]
  }

  keyEncoding (encoding) {
    return this[kTranscoder].encoding(encoding != null ? encoding : this[kKeyEncoding])
  }

  valueEncoding (encoding) {
    return this[kTranscoder].encoding(encoding != null ? encoding : this[kValueEncoding])
  }

  open (options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)

    options = { ...this[kOptions], ...getOptions(options) }

    options.createIfMissing = options.createIfMissing !== false
    options.errorIfExists = !!options.errorIfExists

    const maybeOpened = (err) => {
      if (this[kStatus] === 'closing' || this[kStatus] === 'opening') {
        // Wait until pending state changes are done
        this.once(kLanded, err ? () => maybeOpened(err) : maybeOpened)
      } else if (this[kStatus] !== 'open') {
        callback(new ModuleError('Database is not open', {
          code: 'LEVEL_DATABASE_NOT_OPEN',
          cause: err
        }))
      } else {
        callback()
      }
    }

    if (options.passive) {
      if (this[kStatus] === 'opening') {
        this.once(kLanded, maybeOpened)
      } else {
        this.nextTick(maybeOpened)
      }
    } else if (this[kStatus] === 'closed' || this[kDeferOpen]) {
      this[kDeferOpen] = false
      this[kStatus] = 'opening'
      this.emit('opening')

      this._open(options, (err) => {
        if (err) {
          this[kStatus] = 'closed'

          // Resources must be safe to close in any db state
          this[kCloseResources](() => {
            this.emit(kLanded)
            maybeOpened(err)
          })

          this[kUndefer]()
          return
        }

        this[kStatus] = 'open'
        this[kUndefer]()
        this.emit(kLanded)

        // Only emit public event if pending state changes are done
        if (this[kStatus] === 'open') this.emit('open')

        // TODO (next major): remove this alias
        if (this[kStatus] === 'open') this.emit('ready')

        maybeOpened()
      })
    } else if (this[kStatus] === 'open') {
      this.nextTick(maybeOpened)
    } else {
      this.once(kLanded, () => this.open(options, callback))
    }

    return callback[kPromise]
  }

  _open (options, callback) {
    this.nextTick(callback)
  }

  close (callback) {
    callback = fromCallback(callback, kPromise)

    const maybeClosed = (err) => {
      if (this[kStatus] === 'opening' || this[kStatus] === 'closing') {
        // Wait until pending state changes are done
        this.once(kLanded, err ? maybeClosed(err) : maybeClosed)
      } else if (this[kStatus] !== 'closed') {
        callback(new ModuleError('Database is not closed', {
          code: 'LEVEL_DATABASE_NOT_CLOSED',
          cause: err
        }))
      } else {
        callback()
      }
    }

    if (this[kStatus] === 'open') {
      this[kStatus] = 'closing'
      this.emit('closing')

      const cancel = (err) => {
        this[kStatus] = 'open'
        this[kUndefer]()
        this.emit(kLanded)
        maybeClosed(err)
      }

      this[kCloseResources](() => {
        this._close((err) => {
          if (err) return cancel(err)

          this[kStatus] = 'closed'
          this[kUndefer]()
          this.emit(kLanded)

          // Only emit public event if pending state changes are done
          if (this[kStatus] === 'closed') this.emit('closed')

          maybeClosed()
        })
      })
    } else if (this[kStatus] === 'closed') {
      this.nextTick(maybeClosed)
    } else {
      this.once(kLanded, () => this.close(callback))
    }

    return callback[kPromise]
  }

  [kCloseResources] (callback) {
    if (this[kResources].size === 0) {
      return this.nextTick(callback)
    }

    let pending = this[kResources].size
    let sync = true

    const next = () => {
      if (--pending === 0) {
        // We don't have tests for generic resources, so dezalgo
        if (sync) this.nextTick(callback)
        else callback()
      }
    }

    // In parallel so that all resources know they are closed
    for (const resource of this[kResources]) {
      resource.close(next)
    }

    sync = false
    this[kResources].clear()
  }

  _close (callback) {
    this.nextTick(callback)
  }

  get (key, options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].entry)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.get(key, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    const err = this._checkKey(key)

    if (err) {
      this.nextTick(callback, err)
      return callback[kPromise]
    }

    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format

    // Forward encoding options to the underlying store
    if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      // Avoid spread operator because of https://bugs.chromium.org/p/chromium/issues/detail?id=1204540
      options = Object.assign({}, options, { keyEncoding: keyFormat, valueEncoding: valueFormat })
    }

    this._get(this.prefixKey(keyEncoding.encode(key), keyFormat), options, (err, value) => {
      if (err) {
        // Normalize not found error for backwards compatibility with abstract-leveldown and level(up)
        if (err.code === 'LEVEL_NOT_FOUND' || err.notFound || /NotFound/i.test(err)) {
          if (!err.code) err.code = 'LEVEL_NOT_FOUND' // Preferred way going forward
          if (!err.notFound) err.notFound = true // Same as level-errors
          if (!err.status) err.status = 404 // Same as level-errors
        }

        return callback(err)
      }

      try {
        value = valueEncoding.decode(value)
      } catch (err) {
        return callback(new ModuleError('Could not decode value', {
          code: 'LEVEL_DECODE_ERROR',
          cause: err
        }))
      }

      callback(null, value)
    })

    return callback[kPromise]
  }

  _get (key, options, callback) {
    this.nextTick(callback, new Error('NotFound'))
  }

  getMany (keys, options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].entry)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.getMany(keys, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    if (!Array.isArray(keys)) {
      this.nextTick(callback, new TypeError("The first argument 'keys' must be an array"))
      return callback[kPromise]
    }

    if (keys.length === 0) {
      this.nextTick(callback, null, [])
      return callback[kPromise]
    }

    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format

    // Forward encoding options
    if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      options = Object.assign({}, options, { keyEncoding: keyFormat, valueEncoding: valueFormat })
    }

    const mappedKeys = new Array(keys.length)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const err = this._checkKey(key)

      if (err) {
        this.nextTick(callback, err)
        return callback[kPromise]
      }

      mappedKeys[i] = this.prefixKey(keyEncoding.encode(key), keyFormat)
    }

    this._getMany(mappedKeys, options, (err, values) => {
      if (err) return callback(err)

      try {
        for (let i = 0; i < values.length; i++) {
          if (values[i] !== undefined) {
            values[i] = valueEncoding.decode(values[i])
          }
        }
      } catch (err) {
        return callback(new ModuleError(`Could not decode one or more of ${values.length} value(s)`, {
          code: 'LEVEL_DECODE_ERROR',
          cause: err
        }))
      }

      callback(null, values)
    })

    return callback[kPromise]
  }

  _getMany (keys, options, callback) {
    this.nextTick(callback, null, new Array(keys.length).fill(undefined))
  }

  put (key, value, options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].entry)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.put(key, value, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    const err = this._checkKey(key) || this._checkValue(value)

    if (err) {
      this.nextTick(callback, err)
      return callback[kPromise]
    }

    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const valueEncoding = this.valueEncoding(options.valueEncoding)
    const keyFormat = keyEncoding.format
    const valueFormat = valueEncoding.format

    // Forward encoding options
    if (options.keyEncoding !== keyFormat || options.valueEncoding !== valueFormat) {
      options = Object.assign({}, options, { keyEncoding: keyFormat, valueEncoding: valueFormat })
    }

    const mappedKey = this.prefixKey(keyEncoding.encode(key), keyFormat)
    const mappedValue = valueEncoding.encode(value)

    this._put(mappedKey, mappedValue, options, (err) => {
      if (err) return callback(err)
      this.emit('put', key, value)
      callback()
    })

    return callback[kPromise]
  }

  _put (key, value, options, callback) {
    this.nextTick(callback)
  }

  del (key, options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].key)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.del(key, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    const err = this._checkKey(key)

    if (err) {
      this.nextTick(callback, err)
      return callback[kPromise]
    }

    const keyEncoding = this.keyEncoding(options.keyEncoding)
    const keyFormat = keyEncoding.format

    // Forward encoding options
    if (options.keyEncoding !== keyFormat) {
      options = Object.assign({}, options, { keyEncoding: keyFormat })
    }

    this._del(this.prefixKey(keyEncoding.encode(key), keyFormat), options, (err) => {
      if (err) return callback(err)
      this.emit('del', key)
      callback()
    })

    return callback[kPromise]
  }

  _del (key, options, callback) {
    this.nextTick(callback)
  }

  batch (operations, options, callback) {
    if (!arguments.length) {
      if (this[kStatus] === 'opening') return new DefaultChainedBatch(this)
      if (this[kStatus] !== 'open') {
        throw new ModuleError('Database is not open', {
          code: 'LEVEL_DATABASE_NOT_OPEN'
        })
      }
      return this._chainedBatch()
    }

    if (typeof operations === 'function') callback = operations
    else callback = getCallback(options, callback)

    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].empty)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.batch(operations, options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    if (!Array.isArray(operations)) {
      this.nextTick(callback, new TypeError("The first argument 'operations' must be an array"))
      return callback[kPromise]
    }

    if (operations.length === 0) {
      this.nextTick(callback)
      return callback[kPromise]
    }

    const mapped = new Array(operations.length)
    const { keyEncoding: ke, valueEncoding: ve, ...forward } = options

    for (let i = 0; i < operations.length; i++) {
      if (typeof operations[i] !== 'object' || operations[i] === null) {
        this.nextTick(callback, new TypeError('A batch operation must be an object'))
        return callback[kPromise]
      }

      const op = Object.assign({}, operations[i])

      if (op.type !== 'put' && op.type !== 'del') {
        this.nextTick(callback, new TypeError("A batch operation must have a type property that is 'put' or 'del'"))
        return callback[kPromise]
      }

      const err = this._checkKey(op.key)

      if (err) {
        this.nextTick(callback, err)
        return callback[kPromise]
      }

      const db = op.sublevel != null ? op.sublevel : this
      const keyEncoding = db.keyEncoding(op.keyEncoding || ke)
      const keyFormat = keyEncoding.format

      op.key = db.prefixKey(keyEncoding.encode(op.key), keyFormat)
      op.keyEncoding = keyFormat

      if (op.type === 'put') {
        const valueErr = this._checkValue(op.value)

        if (valueErr) {
          this.nextTick(callback, valueErr)
          return callback[kPromise]
        }

        const valueEncoding = db.valueEncoding(op.valueEncoding || ve)

        op.value = valueEncoding.encode(op.value)
        op.valueEncoding = valueEncoding.format
      }

      // Prevent double prefixing
      if (db !== this) {
        op.sublevel = null
      }

      mapped[i] = op
    }

    this._batch(mapped, forward, (err) => {
      if (err) return callback(err)
      this.emit('batch', operations)
      callback()
    })

    return callback[kPromise]
  }

  _batch (operations, options, callback) {
    this.nextTick(callback)
  }

  sublevel (name, options) {
    return this._sublevel(name, AbstractSublevel.defaults(options))
  }

  _sublevel (name, options) {
    return new AbstractSublevel(this, name, options)
  }

  prefixKey (key, keyFormat) {
    return key
  }

  clear (options, callback) {
    callback = getCallback(options, callback)
    callback = fromCallback(callback, kPromise)
    options = getOptions(options, this[kDefaultOptions].empty)

    if (this[kStatus] === 'opening') {
      this.defer(() => this.clear(options, callback))
      return callback[kPromise]
    }

    if (maybeError(this, callback)) {
      return callback[kPromise]
    }

    const original = options
    const keyEncoding = this.keyEncoding(options.keyEncoding)

    options = rangeOptions(options, keyEncoding)
    options.keyEncoding = keyEncoding.format

    if (options.limit === 0) {
      this.nextTick(callback)
    } else {
      this._clear(options, (err) => {
        if (err) return callback(err)
        this.emit('clear', original)
        callback()
      })
    }

    return callback[kPromise]
  }

  _clear (options, callback) {
    this.nextTick(callback)
  }

  iterator (options) {
    const keyEncoding = this.keyEncoding(options && options.keyEncoding)
    const valueEncoding = this.valueEncoding(options && options.valueEncoding)

    options = rangeOptions(options, keyEncoding)
    options.keys = options.keys !== false
    options.values = options.values !== false

    // We need the original encoding options in AbstractIterator in order to decode data
    options[AbstractIterator.keyEncoding] = keyEncoding
    options[AbstractIterator.valueEncoding] = valueEncoding

    // Forward encoding options to private API
    options.keyEncoding = keyEncoding.format
    options.valueEncoding = valueEncoding.format

    if (this[kStatus] === 'opening') {
      return new DeferredIterator(this, options)
    } else if (this[kStatus] !== 'open') {
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }

    return this._iterator(options)
  }

  _iterator (options) {
    return new AbstractIterator(this, options)
  }

  keys (options) {
    // Also include valueEncoding (though unused) because we may fallback to _iterator()
    const keyEncoding = this.keyEncoding(options && options.keyEncoding)
    const valueEncoding = this.valueEncoding(options && options.valueEncoding)

    options = rangeOptions(options, keyEncoding)

    // We need the original encoding options in AbstractKeyIterator in order to decode data
    options[AbstractIterator.keyEncoding] = keyEncoding
    options[AbstractIterator.valueEncoding] = valueEncoding

    // Forward encoding options to private API
    options.keyEncoding = keyEncoding.format
    options.valueEncoding = valueEncoding.format

    if (this[kStatus] === 'opening') {
      return new DeferredKeyIterator(this, options)
    } else if (this[kStatus] !== 'open') {
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }

    return this._keys(options)
  }

  _keys (options) {
    return new DefaultKeyIterator(this, options)
  }

  values (options) {
    const keyEncoding = this.keyEncoding(options && options.keyEncoding)
    const valueEncoding = this.valueEncoding(options && options.valueEncoding)

    options = rangeOptions(options, keyEncoding)

    // We need the original encoding options in AbstractValueIterator in order to decode data
    options[AbstractIterator.keyEncoding] = keyEncoding
    options[AbstractIterator.valueEncoding] = valueEncoding

    // Forward encoding options to private API
    options.keyEncoding = keyEncoding.format
    options.valueEncoding = valueEncoding.format

    if (this[kStatus] === 'opening') {
      return new DeferredValueIterator(this, options)
    } else if (this[kStatus] !== 'open') {
      throw new ModuleError('Database is not open', {
        code: 'LEVEL_DATABASE_NOT_OPEN'
      })
    }

    return this._values(options)
  }

  _values (options) {
    return new DefaultValueIterator(this, options)
  }

  defer (fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('The first argument must be a function')
    }

    this[kOperations].push(fn)
  }

  [kUndefer] () {
    if (this[kOperations].length === 0) {
      return
    }

    const operations = this[kOperations]
    this[kOperations] = []

    for (const op of operations) {
      op()
    }
  }

  // TODO: docs and types
  attachResource (resource) {
    if (typeof resource !== 'object' || resource === null ||
      typeof resource.close !== 'function') {
      throw new TypeError('The first argument must be a resource object')
    }

    this[kResources].add(resource)
  }

  // TODO: docs and types
  detachResource (resource) {
    this[kResources].delete(resource)
  }

  _chainedBatch () {
    return new DefaultChainedBatch(this)
  }

  _checkKey (key) {
    if (key === null || key === undefined) {
      return new ModuleError('Key cannot be null or undefined', {
        code: 'LEVEL_INVALID_KEY'
      })
    }
  }

  _checkValue (value) {
    if (value === null || value === undefined) {
      return new ModuleError('Value cannot be null or undefined', {
        code: 'LEVEL_INVALID_VALUE'
      })
    }
  }
}

// Expose browser-compatible nextTick for dependents
// TODO: after we drop node 10, also use queueMicrotask in node
AbstractLevel.prototype.nextTick = require('./lib/next-tick')

const { AbstractSublevel } = require('./lib/abstract-sublevel')({ AbstractLevel })

exports.AbstractLevel = AbstractLevel
exports.AbstractSublevel = AbstractSublevel

const maybeError = function (db, callback) {
  if (db[kStatus] !== 'open') {
    db.nextTick(callback, new ModuleError('Database is not open', {
      code: 'LEVEL_DATABASE_NOT_OPEN'
    }))
    return true
  }

  return false
}

const formats = function (db) {
  return Object.keys(db.supports.encodings)
    .filter(k => !!db.supports.encodings[k])
}

},{"./abstract-iterator":3,"./lib/abstract-sublevel":7,"./lib/common":8,"./lib/default-chained-batch":9,"./lib/default-kv-iterator":10,"./lib/deferred-iterator":11,"./lib/next-tick":12,"./lib/range-options":13,"catering":29,"events":38,"level-supports":44,"level-transcoder":45,"module-error":52}],5:[function(require,module,exports){
'use strict'

exports.AbstractLevel = require('./abstract-level').AbstractLevel
exports.AbstractSublevel = require('./abstract-level').AbstractSublevel
exports.AbstractIterator = require('./abstract-iterator').AbstractIterator
exports.AbstractKeyIterator = require('./abstract-iterator').AbstractKeyIterator
exports.AbstractValueIterator = require('./abstract-iterator').AbstractValueIterator
exports.AbstractChainedBatch = require('./abstract-chained-batch').AbstractChainedBatch

},{"./abstract-chained-batch":2,"./abstract-iterator":3,"./abstract-level":4}],6:[function(require,module,exports){
'use strict'

const { AbstractIterator, AbstractKeyIterator, AbstractValueIterator } = require('../abstract-iterator')

const kUnfix = Symbol('unfix')
const kIterator = Symbol('iterator')
const kHandleOne = Symbol('handleOne')
const kHandleMany = Symbol('handleMany')
const kCallback = Symbol('callback')

// TODO: unfix natively if db supports it
class AbstractSublevelIterator extends AbstractIterator {
  constructor (db, options, iterator, unfix) {
    super(db, options)

    this[kIterator] = iterator
    this[kUnfix] = unfix
    this[kHandleOne] = this[kHandleOne].bind(this)
    this[kHandleMany] = this[kHandleMany].bind(this)
    this[kCallback] = null
  }

  [kHandleOne] (err, key, value) {
    const callback = this[kCallback]
    if (err) return callback(err)
    if (key !== undefined) key = this[kUnfix](key)
    callback(err, key, value)
  }

  [kHandleMany] (err, entries) {
    const callback = this[kCallback]
    if (err) return callback(err)

    for (const entry of entries) {
      const key = entry[0]
      if (key !== undefined) entry[0] = this[kUnfix](key)
    }

    callback(err, entries)
  }
}

class AbstractSublevelKeyIterator extends AbstractKeyIterator {
  constructor (db, options, iterator, unfix) {
    super(db, options)

    this[kIterator] = iterator
    this[kUnfix] = unfix
    this[kHandleOne] = this[kHandleOne].bind(this)
    this[kHandleMany] = this[kHandleMany].bind(this)
    this[kCallback] = null
  }

  [kHandleOne] (err, key) {
    const callback = this[kCallback]
    if (err) return callback(err)
    if (key !== undefined) key = this[kUnfix](key)
    callback(err, key)
  }

  [kHandleMany] (err, keys) {
    const callback = this[kCallback]
    if (err) return callback(err)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (key !== undefined) keys[i] = this[kUnfix](key)
    }

    callback(err, keys)
  }
}

class AbstractSublevelValueIterator extends AbstractValueIterator {
  constructor (db, options, iterator) {
    super(db, options)
    this[kIterator] = iterator
  }
}

for (const Iterator of [AbstractSublevelIterator, AbstractSublevelKeyIterator]) {
  Iterator.prototype._next = function (callback) {
    this[kCallback] = callback
    this[kIterator].next(this[kHandleOne])
  }

  Iterator.prototype._nextv = function (size, options, callback) {
    this[kCallback] = callback
    this[kIterator].nextv(size, options, this[kHandleMany])
  }

  Iterator.prototype._all = function (options, callback) {
    this[kCallback] = callback
    this[kIterator].all(options, this[kHandleMany])
  }
}

for (const Iterator of [AbstractSublevelValueIterator]) {
  Iterator.prototype._next = function (callback) {
    this[kIterator].next(callback)
  }

  Iterator.prototype._nextv = function (size, options, callback) {
    this[kIterator].nextv(size, options, callback)
  }

  Iterator.prototype._all = function (options, callback) {
    this[kIterator].all(options, callback)
  }
}

for (const Iterator of [AbstractSublevelIterator, AbstractSublevelKeyIterator, AbstractSublevelValueIterator]) {
  Iterator.prototype._seek = function (target, options) {
    this[kIterator].seek(target, options)
  }

  Iterator.prototype._close = function (callback) {
    this[kIterator].close(callback)
  }
}

exports.AbstractSublevelIterator = AbstractSublevelIterator
exports.AbstractSublevelKeyIterator = AbstractSublevelKeyIterator
exports.AbstractSublevelValueIterator = AbstractSublevelValueIterator

},{"../abstract-iterator":3}],7:[function(require,module,exports){
'use strict'

const ModuleError = require('module-error')
const { Buffer } = require('buffer') || {}
const {
  AbstractSublevelIterator,
  AbstractSublevelKeyIterator,
  AbstractSublevelValueIterator
} = require('./abstract-sublevel-iterator')

const kPrefix = Symbol('prefix')
const kUpperBound = Symbol('upperBound')
const kPrefixRange = Symbol('prefixRange')
const kParent = Symbol('parent')
const kUnfix = Symbol('unfix')

const textEncoder = new TextEncoder()
const defaults = { separator: '!' }

// Wrapped to avoid circular dependency
module.exports = function ({ AbstractLevel }) {
  class AbstractSublevel extends AbstractLevel {
    static defaults (options) {
      // To help migrating from subleveldown to abstract-level
      if (typeof options === 'string') {
        throw new ModuleError('The subleveldown string shorthand for { separator } has been removed', {
          code: 'LEVEL_LEGACY'
        })
      } else if (options && options.open) {
        throw new ModuleError('The subleveldown open option has been removed', {
          code: 'LEVEL_LEGACY'
        })
      }

      if (options == null) {
        return defaults
      } else if (!options.separator) {
        return { ...options, separator: '!' }
      } else {
        return options
      }
    }

    // TODO: add autoClose option, which if true, does parent.attachResource(this)
    constructor (db, name, options) {
      // Don't forward AbstractSublevel options to AbstractLevel
      const { separator, manifest, ...forward } = AbstractSublevel.defaults(options)
      name = trim(name, separator)

      // Reserve one character between separator and name to give us an upper bound
      const reserved = separator.charCodeAt(0) + 1
      const parent = db[kParent] || db

      // Keys should sort like ['!a!', '!a!!a!', '!a"', '!aa!', '!b!'].
      // Use ASCII for consistent length between string, Buffer and Uint8Array
      if (!textEncoder.encode(name).every(x => x > reserved && x < 127)) {
        throw new ModuleError(`Prefix must use bytes > ${reserved} < ${127}`, {
          code: 'LEVEL_INVALID_PREFIX'
        })
      }

      super(mergeManifests(parent, manifest), forward)

      const prefix = (db.prefix || '') + separator + name + separator
      const upperBound = prefix.slice(0, -1) + String.fromCharCode(reserved)

      this[kParent] = parent
      this[kPrefix] = new MultiFormat(prefix)
      this[kUpperBound] = new MultiFormat(upperBound)
      this[kUnfix] = new Unfixer()

      this.nextTick = parent.nextTick
    }

    prefixKey (key, keyFormat) {
      if (keyFormat === 'utf8') {
        return this[kPrefix].utf8 + key
      } else if (key.byteLength === 0) {
        // Fast path for empty key (no copy)
        return this[kPrefix][keyFormat]
      } else if (keyFormat === 'view') {
        const view = this[kPrefix].view
        const result = new Uint8Array(view.byteLength + key.byteLength)

        result.set(view, 0)
        result.set(key, view.byteLength)

        return result
      } else {
        const buffer = this[kPrefix].buffer
        return Buffer.concat([buffer, key], buffer.byteLength + key.byteLength)
      }
    }

    // Not exposed for now.
    [kPrefixRange] (range, keyFormat) {
      if (range.gte !== undefined) {
        range.gte = this.prefixKey(range.gte, keyFormat)
      } else if (range.gt !== undefined) {
        range.gt = this.prefixKey(range.gt, keyFormat)
      } else {
        range.gte = this[kPrefix][keyFormat]
      }

      if (range.lte !== undefined) {
        range.lte = this.prefixKey(range.lte, keyFormat)
      } else if (range.lt !== undefined) {
        range.lt = this.prefixKey(range.lt, keyFormat)
      } else {
        range.lte = this[kUpperBound][keyFormat]
      }
    }

    get prefix () {
      return this[kPrefix].utf8
    }

    get db () {
      return this[kParent]
    }

    _open (options, callback) {
      // The parent db must open itself or be (re)opened by the user because
      // a sublevel should not initiate state changes on the rest of the db.
      this[kParent].open({ passive: true }, callback)
    }

    _put (key, value, options, callback) {
      this[kParent].put(key, value, options, callback)
    }

    _get (key, options, callback) {
      this[kParent].get(key, options, callback)
    }

    _getMany (keys, options, callback) {
      this[kParent].getMany(keys, options, callback)
    }

    _del (key, options, callback) {
      this[kParent].del(key, options, callback)
    }

    _batch (operations, options, callback) {
      this[kParent].batch(operations, options, callback)
    }

    _clear (options, callback) {
      // TODO (refactor): move to AbstractLevel
      this[kPrefixRange](options, options.keyEncoding)
      this[kParent].clear(options, callback)
    }

    _iterator (options) {
      // TODO (refactor): move to AbstractLevel
      this[kPrefixRange](options, options.keyEncoding)
      const iterator = this[kParent].iterator(options)
      const unfix = this[kUnfix].get(this[kPrefix].utf8.length, options.keyEncoding)
      return new AbstractSublevelIterator(this, options, iterator, unfix)
    }

    _keys (options) {
      this[kPrefixRange](options, options.keyEncoding)
      const iterator = this[kParent].keys(options)
      const unfix = this[kUnfix].get(this[kPrefix].utf8.length, options.keyEncoding)
      return new AbstractSublevelKeyIterator(this, options, iterator, unfix)
    }

    _values (options) {
      this[kPrefixRange](options, options.keyEncoding)
      const iterator = this[kParent].values(options)
      return new AbstractSublevelValueIterator(this, options, iterator)
    }
  }

  return { AbstractSublevel }
}

const mergeManifests = function (parent, manifest) {
  return {
    // Inherit manifest of parent db
    ...parent.supports,

    // Disable unsupported features
    createIfMissing: false,
    errorIfExists: false,

    // Unset additional events because we're not forwarding them
    events: {},

    // Unset additional methods (like approximateSize) which we can't support here unless
    // the AbstractSublevel class is overridden by an implementation of `abstract-level`.
    additionalMethods: {},

    // Inherit manifest of custom AbstractSublevel subclass. Such a class is not
    // allowed to override encodings.
    ...manifest,

    encodings: {
      utf8: supportsEncoding(parent, 'utf8'),
      buffer: supportsEncoding(parent, 'buffer'),
      view: supportsEncoding(parent, 'view')
    }
  }
}

const supportsEncoding = function (parent, encoding) {
  // Prefer a non-transcoded encoding for optimal performance
  return parent.supports.encodings[encoding]
    ? parent.keyEncoding(encoding).name === encoding
    : false
}

class MultiFormat {
  constructor (key) {
    this.utf8 = key
    this.view = textEncoder.encode(key)
    this.buffer = Buffer ? Buffer.from(this.view.buffer, 0, this.view.byteLength) : {}
  }
}

class Unfixer {
  constructor () {
    this.cache = new Map()
  }

  get (prefixLength, keyFormat) {
    let unfix = this.cache.get(keyFormat)

    if (unfix === undefined) {
      if (keyFormat === 'view') {
        unfix = function (prefixLength, key) {
          // Avoid Uint8Array#slice() because it copies
          return key.subarray(prefixLength)
        }.bind(null, prefixLength)
      } else {
        unfix = function (prefixLength, key) {
          // Avoid Buffer#subarray() because it's slow
          return key.slice(prefixLength)
        }.bind(null, prefixLength)
      }

      this.cache.set(keyFormat, unfix)
    }

    return unfix
  }
}

const trim = function (str, char) {
  let start = 0
  let end = str.length

  while (start < end && str[start] === char) start++
  while (end > start && str[end - 1] === char) end--

  return str.slice(start, end)
}

},{"./abstract-sublevel-iterator":6,"buffer":21,"module-error":52}],8:[function(require,module,exports){
'use strict'

exports.getCallback = function (options, callback) {
  return typeof options === 'function' ? options : callback
}

exports.getOptions = function (options, def) {
  if (typeof options === 'object' && options !== null) {
    return options
  }

  if (def !== undefined) {
    return def
  }

  return {}
}

},{}],9:[function(require,module,exports){
'use strict'

const { AbstractChainedBatch } = require('../abstract-chained-batch')
const ModuleError = require('module-error')
const kEncoded = Symbol('encoded')

// Functional default for chained batch, with support of deferred open
class DefaultChainedBatch extends AbstractChainedBatch {
  constructor (db) {
    super(db)
    this[kEncoded] = []
  }

  _put (key, value, options) {
    this[kEncoded].push({ ...options, type: 'put', key, value })
  }

  _del (key, options) {
    this[kEncoded].push({ ...options, type: 'del', key })
  }

  _clear () {
    this[kEncoded] = []
  }

  // Assumes this[kEncoded] cannot change after write()
  _write (options, callback) {
    if (this.db.status === 'opening') {
      this.db.defer(() => this._write(options, callback))
    } else if (this.db.status === 'open') {
      if (this[kEncoded].length === 0) this.nextTick(callback)
      else this.db._batch(this[kEncoded], options, callback)
    } else {
      this.nextTick(callback, new ModuleError('Batch is not open: cannot call write() after write() or close()', {
        code: 'LEVEL_BATCH_NOT_OPEN'
      }))
    }
  }
}

exports.DefaultChainedBatch = DefaultChainedBatch

},{"../abstract-chained-batch":2,"module-error":52}],10:[function(require,module,exports){
'use strict'

const { AbstractKeyIterator, AbstractValueIterator } = require('../abstract-iterator')

const kIterator = Symbol('iterator')
const kCallback = Symbol('callback')
const kHandleOne = Symbol('handleOne')
const kHandleMany = Symbol('handleMany')

class DefaultKeyIterator extends AbstractKeyIterator {
  constructor (db, options) {
    super(db, options)

    this[kIterator] = db.iterator({ ...options, keys: true, values: false })
    this[kHandleOne] = this[kHandleOne].bind(this)
    this[kHandleMany] = this[kHandleMany].bind(this)
  }
}

class DefaultValueIterator extends AbstractValueIterator {
  constructor (db, options) {
    super(db, options)

    this[kIterator] = db.iterator({ ...options, keys: false, values: true })
    this[kHandleOne] = this[kHandleOne].bind(this)
    this[kHandleMany] = this[kHandleMany].bind(this)
  }
}

for (const Iterator of [DefaultKeyIterator, DefaultValueIterator]) {
  const keys = Iterator === DefaultKeyIterator
  const mapEntry = keys ? (entry) => entry[0] : (entry) => entry[1]

  Iterator.prototype._next = function (callback) {
    this[kCallback] = callback
    this[kIterator].next(this[kHandleOne])
  }

  Iterator.prototype[kHandleOne] = function (err, key, value) {
    const callback = this[kCallback]
    if (err) callback(err)
    else callback(null, keys ? key : value)
  }

  Iterator.prototype._nextv = function (size, options, callback) {
    this[kCallback] = callback
    this[kIterator].nextv(size, options, this[kHandleMany])
  }

  Iterator.prototype._all = function (options, callback) {
    this[kCallback] = callback
    this[kIterator].all(options, this[kHandleMany])
  }

  Iterator.prototype[kHandleMany] = function (err, entries) {
    const callback = this[kCallback]
    if (err) callback(err)
    else callback(null, entries.map(mapEntry))
  }

  Iterator.prototype._seek = function (target, options) {
    this[kIterator].seek(target, options)
  }

  Iterator.prototype._close = function (callback) {
    this[kIterator].close(callback)
  }
}

// Internal utilities, should be typed as AbstractKeyIterator and AbstractValueIterator
exports.DefaultKeyIterator = DefaultKeyIterator
exports.DefaultValueIterator = DefaultValueIterator

},{"../abstract-iterator":3}],11:[function(require,module,exports){
'use strict'

const { AbstractIterator, AbstractKeyIterator, AbstractValueIterator } = require('../abstract-iterator')
const ModuleError = require('module-error')

const kNut = Symbol('nut')
const kUndefer = Symbol('undefer')
const kFactory = Symbol('factory')

class DeferredIterator extends AbstractIterator {
  constructor (db, options) {
    super(db, options)

    this[kNut] = null
    this[kFactory] = () => db.iterator(options)

    this.db.defer(() => this[kUndefer]())
  }
}

class DeferredKeyIterator extends AbstractKeyIterator {
  constructor (db, options) {
    super(db, options)

    this[kNut] = null
    this[kFactory] = () => db.keys(options)

    this.db.defer(() => this[kUndefer]())
  }
}

class DeferredValueIterator extends AbstractValueIterator {
  constructor (db, options) {
    super(db, options)

    this[kNut] = null
    this[kFactory] = () => db.values(options)

    this.db.defer(() => this[kUndefer]())
  }
}

for (const Iterator of [DeferredIterator, DeferredKeyIterator, DeferredValueIterator]) {
  Iterator.prototype[kUndefer] = function () {
    if (this.db.status === 'open') {
      this[kNut] = this[kFactory]()
    }
  }

  Iterator.prototype._next = function (callback) {
    if (this[kNut] !== null) {
      this[kNut].next(callback)
    } else if (this.db.status === 'opening') {
      this.db.defer(() => this._next(callback))
    } else {
      this.nextTick(callback, new ModuleError('Iterator is not open: cannot call next() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      }))
    }
  }

  Iterator.prototype._nextv = function (size, options, callback) {
    if (this[kNut] !== null) {
      this[kNut].nextv(size, options, callback)
    } else if (this.db.status === 'opening') {
      this.db.defer(() => this._nextv(size, options, callback))
    } else {
      this.nextTick(callback, new ModuleError('Iterator is not open: cannot call nextv() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      }))
    }
  }

  Iterator.prototype._all = function (options, callback) {
    if (this[kNut] !== null) {
      this[kNut].all(callback)
    } else if (this.db.status === 'opening') {
      this.db.defer(() => this._all(options, callback))
    } else {
      this.nextTick(callback, new ModuleError('Iterator is not open: cannot call all() after close()', {
        code: 'LEVEL_ITERATOR_NOT_OPEN'
      }))
    }
  }

  Iterator.prototype._seek = function (target, options) {
    if (this[kNut] !== null) {
      // TODO: explain why we need _seek() rather than seek() here
      this[kNut]._seek(target, options)
    } else if (this.db.status === 'opening') {
      this.db.defer(() => this._seek(target, options))
    }
  }

  Iterator.prototype._close = function (callback) {
    if (this[kNut] !== null) {
      this[kNut].close(callback)
    } else if (this.db.status === 'opening') {
      this.db.defer(() => this._close(callback))
    } else {
      this.nextTick(callback)
    }
  }
}

exports.DeferredIterator = DeferredIterator
exports.DeferredKeyIterator = DeferredKeyIterator
exports.DeferredValueIterator = DeferredValueIterator

},{"../abstract-iterator":3,"module-error":52}],12:[function(require,module,exports){
'use strict'

const queueMicrotask = require('queue-microtask')

module.exports = function (fn, ...args) {
  if (args.length === 0) {
    queueMicrotask(fn)
  } else {
    queueMicrotask(() => fn(...args))
  }
}

},{"queue-microtask":76}],13:[function(require,module,exports){
'use strict'

const ModuleError = require('module-error')
const hasOwnProperty = Object.prototype.hasOwnProperty
const rangeOptions = new Set(['lt', 'lte', 'gt', 'gte'])

module.exports = function (options, keyEncoding) {
  const result = {}

  for (const k in options) {
    if (!hasOwnProperty.call(options, k)) continue
    if (k === 'keyEncoding' || k === 'valueEncoding') continue

    if (k === 'start' || k === 'end') {
      throw new ModuleError(`The legacy range option '${k}' has been removed`, {
        code: 'LEVEL_LEGACY'
      })
    } else if (k === 'encoding') {
      // To help migrating to abstract-level
      throw new ModuleError("The levelup-style 'encoding' alias has been removed, use 'valueEncoding' instead", {
        code: 'LEVEL_LEGACY'
      })
    }

    if (rangeOptions.has(k)) {
      // Note that we don't reject nullish and empty options here. While
      // those types are invalid as keys, they are valid as range options.
      result[k] = keyEncoding.encode(options[k])
    } else {
      result[k] = options[k]
    }
  }

  result.reverse = !!result.reverse
  result.limit = Number.isInteger(result.limit) && result.limit >= 0 ? result.limit : -1

  return result
}

},{"module-error":52}],14:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],15:[function(require,module,exports){
/* global indexedDB */

'use strict'

const { AbstractLevel } = require('abstract-level')
const ModuleError = require('module-error')
const parallel = require('run-parallel-limit')
const { fromCallback } = require('catering')
const { Iterator } = require('./iterator')
const deserialize = require('./util/deserialize')
const clear = require('./util/clear')
const createKeyRange = require('./util/key-range')

// Keep as-is for compatibility with existing level-js databases
const DEFAULT_PREFIX = 'level-js-'

const kIDB = Symbol('idb')
const kNamePrefix = Symbol('namePrefix')
const kLocation = Symbol('location')
const kVersion = Symbol('version')
const kStore = Symbol('store')
const kOnComplete = Symbol('onComplete')
const kPromise = Symbol('promise')

class BrowserLevel extends AbstractLevel {
  constructor (location, options, _) {
    // To help migrating to abstract-level
    if (typeof options === 'function' || typeof _ === 'function') {
      throw new ModuleError('The levelup-style callback argument has been removed', {
        code: 'LEVEL_LEGACY'
      })
    }

    const { prefix, version, ...forward } = options || {}

    super({
      encodings: { view: true },
      snapshots: false,
      createIfMissing: false,
      errorIfExists: false,
      seek: true
    }, forward)

    if (typeof location !== 'string') {
      throw new Error('constructor requires a location string argument')
    }

    // TODO (next major): remove default prefix
    this[kLocation] = location
    this[kNamePrefix] = prefix == null ? DEFAULT_PREFIX : prefix
    this[kVersion] = parseInt(version || 1, 10)
    this[kIDB] = null
  }

  get location () {
    return this[kLocation]
  }

  get namePrefix () {
    return this[kNamePrefix]
  }

  get version () {
    return this[kVersion]
  }

  // Exposed for backwards compat and unit tests
  get db () {
    return this[kIDB]
  }

  get type () {
    return 'browser-level'
  }

  _open (options, callback) {
    const req = indexedDB.open(this[kNamePrefix] + this[kLocation], this[kVersion])

    req.onerror = function () {
      callback(req.error || new Error('unknown error'))
    }

    req.onsuccess = () => {
      this[kIDB] = req.result
      callback()
    }

    req.onupgradeneeded = (ev) => {
      const db = ev.target.result

      if (!db.objectStoreNames.contains(this[kLocation])) {
        db.createObjectStore(this[kLocation])
      }
    }
  }

  [kStore] (mode) {
    const transaction = this[kIDB].transaction([this[kLocation]], mode)
    return transaction.objectStore(this[kLocation])
  }

  [kOnComplete] (request, callback) {
    const transaction = request.transaction

    // Take advantage of the fact that a non-canceled request error aborts
    // the transaction. I.e. no need to listen for "request.onerror".
    transaction.onabort = function () {
      callback(transaction.error || new Error('aborted by user'))
    }

    transaction.oncomplete = function () {
      callback(null, request.result)
    }
  }

  _get (key, options, callback) {
    const store = this[kStore]('readonly')
    let req

    try {
      req = store.get(key)
    } catch (err) {
      return this.nextTick(callback, err)
    }

    this[kOnComplete](req, function (err, value) {
      if (err) return callback(err)

      if (value === undefined) {
        return callback(new ModuleError('Entry not found', {
          code: 'LEVEL_NOT_FOUND'
        }))
      }

      callback(null, deserialize(value))
    })
  }

  _getMany (keys, options, callback) {
    const store = this[kStore]('readonly')
    const tasks = keys.map((key) => (next) => {
      let request

      try {
        request = store.get(key)
      } catch (err) {
        return next(err)
      }

      request.onsuccess = () => {
        const value = request.result
        next(null, value === undefined ? value : deserialize(value))
      }

      request.onerror = (ev) => {
        ev.stopPropagation()
        next(request.error)
      }
    })

    parallel(tasks, 16, callback)
  }

  _del (key, options, callback) {
    const store = this[kStore]('readwrite')
    let req

    try {
      req = store.delete(key)
    } catch (err) {
      return this.nextTick(callback, err)
    }

    this[kOnComplete](req, callback)
  }

  _put (key, value, options, callback) {
    const store = this[kStore]('readwrite')
    let req

    try {
      // Will throw a DataError or DataCloneError if the environment
      // does not support serializing the key or value respectively.
      req = store.put(value, key)
    } catch (err) {
      return this.nextTick(callback, err)
    }

    this[kOnComplete](req, callback)
  }

  // TODO: implement key and value iterators
  _iterator (options) {
    return new Iterator(this, this[kLocation], options)
  }

  _batch (operations, options, callback) {
    const store = this[kStore]('readwrite')
    const transaction = store.transaction
    let index = 0
    let error

    transaction.onabort = function () {
      callback(error || transaction.error || new Error('aborted by user'))
    }

    transaction.oncomplete = function () {
      callback()
    }

    // Wait for a request to complete before making the next, saving CPU.
    function loop () {
      const op = operations[index++]
      const key = op.key

      let req

      try {
        req = op.type === 'del' ? store.delete(key) : store.put(op.value, key)
      } catch (err) {
        error = err
        transaction.abort()
        return
      }

      if (index < operations.length) {
        req.onsuccess = loop
      } else if (typeof transaction.commit === 'function') {
        // Commit now instead of waiting for auto-commit
        transaction.commit()
      }
    }

    loop()
  }

  _clear (options, callback) {
    let keyRange
    let req

    try {
      keyRange = createKeyRange(options)
    } catch (e) {
      // The lower key is greater than the upper key.
      // IndexedDB throws an error, but we'll just do nothing.
      return this.nextTick(callback)
    }

    if (options.limit >= 0) {
      // IDBObjectStore#delete(range) doesn't have such an option.
      // Fall back to cursor-based implementation.
      return clear(this, this[kLocation], keyRange, options, callback)
    }

    try {
      const store = this[kStore]('readwrite')
      req = keyRange ? store.delete(keyRange) : store.clear()
    } catch (err) {
      return this.nextTick(callback, err)
    }

    this[kOnComplete](req, callback)
  }

  _close (callback) {
    this[kIDB].close()
    this.nextTick(callback)
  }
}

BrowserLevel.destroy = function (location, prefix, callback) {
  if (typeof prefix === 'function') {
    callback = prefix
    prefix = DEFAULT_PREFIX
  }

  callback = fromCallback(callback, kPromise)
  const request = indexedDB.deleteDatabase(prefix + location)

  request.onsuccess = function () {
    callback()
  }

  request.onerror = function (err) {
    callback(err)
  }

  return callback[kPromise]
}

exports.BrowserLevel = BrowserLevel

},{"./iterator":16,"./util/clear":17,"./util/deserialize":18,"./util/key-range":19,"abstract-level":5,"catering":29,"module-error":52,"run-parallel-limit":78}],16:[function(require,module,exports){
'use strict'

const { AbstractIterator } = require('abstract-level')
const createKeyRange = require('./util/key-range')
const deserialize = require('./util/deserialize')

const kCache = Symbol('cache')
const kFinished = Symbol('finished')
const kOptions = Symbol('options')
const kCurrentOptions = Symbol('currentOptions')
const kPosition = Symbol('position')
const kLocation = Symbol('location')
const kFirst = Symbol('first')
const emptyOptions = {}

class Iterator extends AbstractIterator {
  constructor (db, location, options) {
    super(db, options)

    this[kCache] = []
    this[kFinished] = this.limit === 0
    this[kOptions] = options
    this[kCurrentOptions] = { ...options }
    this[kPosition] = undefined
    this[kLocation] = location
    this[kFirst] = true
  }

  // Note: if called by _all() then size can be Infinity. This is an internal
  // detail; by design AbstractIterator.nextv() does not support Infinity.
  _nextv (size, options, callback) {
    this[kFirst] = false

    if (this[kFinished]) {
      return this.nextTick(callback, null, [])
    } else if (this[kCache].length > 0) {
      // TODO: mixing next and nextv is not covered by test suite
      size = Math.min(size, this[kCache].length)
      return this.nextTick(callback, null, this[kCache].splice(0, size))
    }

    // Adjust range by what we already visited
    if (this[kPosition] !== undefined) {
      if (this[kOptions].reverse) {
        this[kCurrentOptions].lt = this[kPosition]
        this[kCurrentOptions].lte = undefined
      } else {
        this[kCurrentOptions].gt = this[kPosition]
        this[kCurrentOptions].gte = undefined
      }
    }

    let keyRange

    try {
      keyRange = createKeyRange(this[kCurrentOptions])
    } catch (_) {
      // The lower key is greater than the upper key.
      // IndexedDB throws an error, but we'll just return 0 results.
      this[kFinished] = true
      return this.nextTick(callback, null, [])
    }

    const transaction = this.db.db.transaction([this[kLocation]], 'readonly')
    const store = transaction.objectStore(this[kLocation])
    const entries = []

    if (!this[kOptions].reverse) {
      let keys
      let values

      const complete = () => {
        // Wait for both requests to complete
        if (keys === undefined || values === undefined) return

        const length = Math.max(keys.length, values.length)

        if (length === 0 || size === Infinity) {
          this[kFinished] = true
        } else {
          this[kPosition] = keys[length - 1]
        }

        // Resize
        entries.length = length

        // Merge keys and values
        for (let i = 0; i < length; i++) {
          const key = keys[i]
          const value = values[i]

          entries[i] = [
            this[kOptions].keys && key !== undefined ? deserialize(key) : undefined,
            this[kOptions].values && value !== undefined ? deserialize(value) : undefined
          ]
        }

        maybeCommit(transaction)
      }

      // If keys were not requested and size is Infinity, we don't have to keep
      // track of position and can thus skip getting keys.
      if (this[kOptions].keys || size < Infinity) {
        store.getAllKeys(keyRange, size < Infinity ? size : undefined).onsuccess = (ev) => {
          keys = ev.target.result
          complete()
        }
      } else {
        keys = []
        this.nextTick(complete)
      }

      if (this[kOptions].values) {
        store.getAll(keyRange, size < Infinity ? size : undefined).onsuccess = (ev) => {
          values = ev.target.result
          complete()
        }
      } else {
        values = []
        this.nextTick(complete)
      }
    } else {
      // Can't use getAll() in reverse, so use a slower cursor that yields one item at a time
      // TODO: test if all target browsers support openKeyCursor
      const method = !this[kOptions].values && store.openKeyCursor ? 'openKeyCursor' : 'openCursor'

      store[method](keyRange, 'prev').onsuccess = (ev) => {
        const cursor = ev.target.result

        if (cursor) {
          const { key, value } = cursor
          this[kPosition] = key

          entries.push([
            this[kOptions].keys && key !== undefined ? deserialize(key) : undefined,
            this[kOptions].values && value !== undefined ? deserialize(value) : undefined
          ])

          if (entries.length < size) {
            cursor.continue()
          } else {
            maybeCommit(transaction)
          }
        } else {
          this[kFinished] = true
        }
      }
    }

    // If an error occurs (on the request), the transaction will abort.
    transaction.onabort = () => {
      callback(transaction.error || new Error('aborted by user'))
      callback = null
    }

    transaction.oncomplete = () => {
      callback(null, entries)
      callback = null
    }
  }

  _next (callback) {
    if (this[kCache].length > 0) {
      const [key, value] = this[kCache].shift()
      this.nextTick(callback, null, key, value)
    } else if (this[kFinished]) {
      this.nextTick(callback)
    } else {
      let size = Math.min(100, this.limit - this.count)

      if (this[kFirst]) {
        // It's common to only want one entry initially or after a seek()
        this[kFirst] = false
        size = 1
      }

      this._nextv(size, emptyOptions, (err, entries) => {
        if (err) return callback(err)
        this[kCache] = entries
        this._next(callback)
      })
    }
  }

  _all (options, callback) {
    this[kFirst] = false

    // TODO: mixing next and all is not covered by test suite
    const cache = this[kCache].splice(0, this[kCache].length)
    const size = this.limit - this.count - cache.length

    if (size <= 0) {
      return this.nextTick(callback, null, cache)
    }

    this._nextv(size, emptyOptions, (err, entries) => {
      if (err) return callback(err)
      if (cache.length > 0) entries = cache.concat(entries)
      callback(null, entries)
    })
  }

  _seek (target, options) {
    this[kFirst] = true
    this[kCache] = []
    this[kFinished] = false
    this[kPosition] = undefined

    // TODO: not covered by test suite
    this[kCurrentOptions] = { ...this[kOptions] }

    let keyRange

    try {
      keyRange = createKeyRange(this[kOptions])
    } catch (_) {
      this[kFinished] = true
      return
    }

    if (keyRange !== null && !keyRange.includes(target)) {
      this[kFinished] = true
    } else if (this[kOptions].reverse) {
      this[kCurrentOptions].lte = target
    } else {
      this[kCurrentOptions].gte = target
    }
  }
}

exports.Iterator = Iterator

function maybeCommit (transaction) {
  // Commit (meaning close) now instead of waiting for auto-commit
  if (typeof transaction.commit === 'function') {
    transaction.commit()
  }
}

},{"./util/deserialize":18,"./util/key-range":19,"abstract-level":5}],17:[function(require,module,exports){
'use strict'

module.exports = function clear (db, location, keyRange, options, callback) {
  if (options.limit === 0) return db.nextTick(callback)

  const transaction = db.db.transaction([location], 'readwrite')
  const store = transaction.objectStore(location)
  let count = 0

  transaction.oncomplete = function () {
    callback()
  }

  transaction.onabort = function () {
    callback(transaction.error || new Error('aborted by user'))
  }

  // A key cursor is faster (skips reading values) but not supported by IE
  // TODO: we no longer support IE. Test others
  const method = store.openKeyCursor ? 'openKeyCursor' : 'openCursor'
  const direction = options.reverse ? 'prev' : 'next'

  store[method](keyRange, direction).onsuccess = function (ev) {
    const cursor = ev.target.result

    if (cursor) {
      // Wait for a request to complete before continuing, saving CPU.
      store.delete(cursor.key).onsuccess = function () {
        if (options.limit <= 0 || ++count < options.limit) {
          cursor.continue()
        }
      }
    }
  }
}

},{}],18:[function(require,module,exports){
'use strict'

const textEncoder = new TextEncoder()

module.exports = function (data) {
  if (data instanceof Uint8Array) {
    return data
  } else if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  } else {
    // Non-binary data stored with an old version (level-js < 5.0.0)
    return textEncoder.encode(data)
  }
}

},{}],19:[function(require,module,exports){
/* global IDBKeyRange */

'use strict'

module.exports = function createKeyRange (options) {
  const lower = options.gte !== undefined ? options.gte : options.gt !== undefined ? options.gt : undefined
  const upper = options.lte !== undefined ? options.lte : options.lt !== undefined ? options.lt : undefined
  const lowerExclusive = options.gte === undefined
  const upperExclusive = options.lte === undefined

  if (lower !== undefined && upper !== undefined) {
    return IDBKeyRange.bound(lower, upper, lowerExclusive, upperExclusive)
  } else if (lower !== undefined) {
    return IDBKeyRange.lowerBound(lower, lowerExclusive)
  } else if (upper !== undefined) {
    return IDBKeyRange.upperBound(upper, upperExclusive)
  } else {
    return null
  }
}

},{}],20:[function(require,module,exports){

},{}],21:[function(require,module,exports){
(function (Buffer){(function (){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this)}).call(this,require("buffer").Buffer)
},{"base64-js":14,"buffer":21,"ieee754":43}],22:[function(require,module,exports){
var base = require('typewise-core/base')
var codecs = require('./codecs')
var util = require('./util')

//
// extend core sorts defined by typewise with bytewise-specific functionality
//

// byte represents byte tag prefix in encoded form, enforcing binary total order
// type tag is 1 byte, which gives us plenty of room to grow

//
// boundary types
//
base.bound.encode = util.encodeBaseBound

//
// value types
//
var sorts = base.sorts

sorts.void.byte = 0xf0

sorts.null.byte = 0x10


var BOOLEAN = sorts.boolean
BOOLEAN.sorts.false.byte = 0x20
BOOLEAN.sorts.true.byte = 0x21
BOOLEAN.bound.encode = util.encodeBound


var NUMBER = sorts.number
NUMBER.sorts.min.byte = 0x40
NUMBER.sorts.negative.byte = 0x41
NUMBER.sorts.positive.byte = 0x42
NUMBER.sorts.max.byte = 0x43
NUMBER.sorts.negative.codec = codecs.NEGATIVE_FLOAT
NUMBER.sorts.positive.codec = codecs.POSITIVE_FLOAT
NUMBER.bound.encode = util.encodeBound


var DATE = sorts.date
DATE.sorts.negative.byte = 0x51
DATE.sorts.positive.byte = 0x52
DATE.sorts.negative.codec = codecs.PRE_EPOCH_DATE
DATE.sorts.positive.codec = codecs.POST_EPOCH_DATE
DATE.bound.encode = util.encodeBound


var BINARY = sorts.binary
BINARY.byte = 0x60
BINARY.codec = codecs.UINT8
BINARY.bound.encode = util.encodeBound


var STRING = sorts.string
STRING.byte = 0x70
STRING.codec = codecs.UTF8
STRING.bound.encode = util.encodeBound


var ARRAY = sorts.array
ARRAY.byte = 0xa0
ARRAY.codec = codecs.LIST
ARRAY.bound.encode = util.encodeListBound


// var OBJECT = sorts.object
// OBJECT.byte = 0xb0
// OBJECT.codec = codecs.HASH
// OBJECT.bound.encode = util.encodeListBound

module.exports = base

},{"./codecs":23,"./util":25,"typewise-core/base":80}],23:[function(require,module,exports){
(function (Buffer){(function (){
var util = require('./util')

var FLOAT_LENGTH = 8

function identity(value) {
  return value
}

function shortlexEncode(codec) {
  return function (source, base) {
    // stupid lazy implementation
    // TODO: allow length getter to be provided
    var length = util.encodeFloat(source.length)
    var body = codec.encode(source, base)
    return Buffer.concat([ length, body ])
  }
}

function shortlexDecode(codec) {
  return function (buffer) {
    // stupid lazy implementation
    return codec.decode(this, buffer.slice(FLOAT_LENGTH))
  }
}

function shortlexParse(codec) {
  // TODO
  return function (buffer, base) {
    throw new Error('NYI')
  }
}

function shortlex(codec) {
  return {
    encode: shortlexEncode(codec),
    decode: shortlexDecode(codec),
    parse: shortlexParse(codec)
  }
}

//
// pairs of encode/decode functions
//
var codecs = exports

codecs.HEX = {
  encode: function (source) {
    return new Buffer(source, 'hex')
  },
  decode: function (buffer) {
    return buffer.toString('hex')
  }
}

codecs.UINT8 = {
  encode: identity,
  decode: identity,
  escape: util.escapeFlat,
  unescape: util.unescapeFlat
}

codecs.UINT8_SHORTLEX = shortlex(codecs.UINT8)

codecs.UTF8 = {
  encode: function (source) {
    return new Buffer(source, 'utf8')
  },
  decode: function (buffer) {
    return buffer.toString('utf8')
  },
  escape: util.escapeFlatLow,
  unescape: util.unescapeFlatLow
}

codecs.UTF8_SHORTLEX = shortlex(codecs.UTF8)

codecs.POSITIVE_FLOAT = {
  length: FLOAT_LENGTH,
  encode: util.encodeFloat,
  decode: util.decodeFloat
}

codecs.NEGATIVE_FLOAT = {
  length: FLOAT_LENGTH,
  encode: util.encodeFloat,
  decode: function (buffer) {
    return util.decodeFloat(buffer, null, true)
  }
}

codecs.POST_EPOCH_DATE = {
  length: FLOAT_LENGTH,
  encode: util.encodeFloat,
  decode: function (buffer) {
    return new Date(util.decodeFloat(buffer))
  }
}

codecs.PRE_EPOCH_DATE = {
  length: FLOAT_LENGTH,
  encode: util.encodeFloat,
  decode: function (buffer) {
    return new Date(util.decodeFloat(buffer, null, true))
  }
}

//
// base encoding for complex structures
//
codecs.LIST = {
  encode: util.encodeList,
  decode: util.decodeList
}

codecs.TUPLE = shortlex(codecs.LIST)

//
// member order is preserved and accounted for in sort (except for number keys)
//
codecs.HASH = {
  // TODO
  // encode: util.encodeHash,
  // decode: util.decodeHash
}

codecs.RECORD = shortlex(codecs.HASH)

}).call(this)}).call(this,require("buffer").Buffer)
},{"./util":25,"buffer":21}],24:[function(require,module,exports){
(function (Buffer){(function (){
var assert = require('./util').assert
var base = require('./base')
var codecs = require('./codecs')

var bytewise = exports

//
// expose type information
//
var sorts = bytewise.sorts = base.sorts
bytewise.bound = base.bound
bytewise.compare = base.compare
bytewise.equal = base.equal

//
// generate a buffer with type's byte prefix from source value
//
function serialize(type, source, options) {
  var codec = type.codec
  if (!codec)
    return postEncode(new Buffer([ type.byte ]), options)

  var buffer = codec.encode(source, bytewise)

  if (options && options.nested && codec.escape)
    buffer = codec.escape(buffer)

  var hint = typeof codec.length === 'number' ? (codec.length + 1) : void 0 
  var buffers = [ new Buffer([ type.byte ]), buffer ]
  return postEncode(Buffer.concat(buffers, hint), options)
}

//
// core encode logic
//
bytewise.encode = function(source, options) {

  // check for invalid/incomparable values
  assert(!base.invalid(source), 'Invalid value')

  // encode bound types (ranges)
  var boundary = base.bound.getBoundary(source)
  if (boundary)
    return boundary.encode(source, bytewise)

  // encode standard value-typed sorts
  var order = base.order
  var sort
  for (var i = 0, length = order.length; i < length; ++i) {
    sort = sorts[order[i]]

    if (sort.is(source)) {

      // loop over any subsorts defined on sort
      // TODO: clean up
      var subsorts = sort.sorts ||  { '': sort }
      for (key in subsorts) {
        var subsort = subsorts[key]
        if (subsort.is(source)) 
          return serialize(subsort, source, options)
      }

      // source is an unsupported subsort
      assert(false, 'Unsupported sort value')
    }
  }

  // no type descriptor found
  assert(false, 'Unknown value')
}

//
// core decode logic
//
bytewise.decode = function (buffer, options) {
  // attempt to decode string input using configurable codec
  if (typeof buffer === 'string') {
    buffer = bytewise.stringCodec.encode(buffer)
  }

  assert(!buffer || !buffer.undecodable, 'Encoded value not decodable')

  var byte = buffer[0]
  var type = bytewise.getType(byte)
  assert(type, 'Invalid encoding: ' + buffer)

  // if type provides a decoder it is passed the base type system as second arg
  var codec = type.codec
  if (codec) {
    var decoded = codec.decode(buffer.slice(1), bytewise)

    if (options && options.nested && codec.unescape)
      decoded = codec.unescape(decoded)

    return postDecode(decoded, options)
  }

  // nullary types without a codec must provide a value for their decoded form
  assert('value' in type, 'Unsupported encoding: ' + buffer)
  return postDecode(type.value, options)
}

//
// process top level
//
function postEncode(encoded, options) {
  if (options === null)
    return encoded

  return bytewise.postEncode(encoded, options)
}

//
// invoked after encoding with encoded buffer instance
//
bytewise.postEncode = function (encoded, options) {

  // override buffer toString method to default to hex to help coercion issues
  // TODO: just return pure buffer, do this toString hackery in bytewise
  encoded.toString = function (encoding) {
    if (!encoding)
      return bytewise.stringCodec.decode(encoded)

    return Buffer.prototype.toString.apply(encoded, arguments)
  }

  return encoded
}

function postDecode(decoded, options) {
  if (options === null)
    return decoded

  return bytewise.postDecode(decoded, options)
}

//
// invoked after decoding with decoded value
//
bytewise.postDecode = function (decoded, options) {
  return decoded
}


//
// registry mapping byte prefixes to type descriptors
//
var PREFIX_REGISTRY

function registerType(type) {
  var byte = type && type.byte
  if (byte == null)
    return

  if (byte in PREFIX_REGISTRY)
    assert.deepEqual(type, PREFIX_REGISTRY[byte], 'Duplicate prefix: ' + byte)

  PREFIX_REGISTRY[type.byte] = type
}

function registerTypes(types) {
  for (var key in types) {
    registerType(types[key])
  }
}

//
// look up type descriptor associated with a given byte prefix
//
bytewise.getType = function (byte) {

  // construct and memoize byte prefix registry on first run
  if (!PREFIX_REGISTRY) {
    PREFIX_REGISTRY = {}

    // register sorts
    var sort
    for (var key in sorts) {
      sort = sorts[key]

      // if sort has subsorts register these instead
      sort.sorts ? registerTypes(sort.sorts) : registerType(sort)
    }
  }

  return PREFIX_REGISTRY[byte]
}

bytewise.buffer = true
bytewise.stringCodec = codecs.HEX
bytewise.type = 'bytewise-core'


}).call(this)}).call(this,require("buffer").Buffer)
},{"./base":22,"./codecs":23,"./util":25,"buffer":21}],25:[function(require,module,exports){
(function (Buffer){(function (){
var util = exports

//
// buffer compare
//
util.compare = require('typewise-core/collation').bitwise

//
// buffer equality
//
util.equal = function (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b))
    return

  if (a === b)
    return true

  if (typeof a.equals === 'function')
    return a.equals(b)

  return util.compare(a, b) === 0
}

var assert = util.assert = function (test, message) {
  if (!test)
    throw new TypeError(message)
}

var FLOAT_LENGTH = 8

util.invertBytes = function (buffer) {
  var bytes = []
  for (var i = 0, end = buffer.length; i < end; ++i) {
    bytes.push(~buffer[i])
  }

  return new Buffer(bytes)
}

util.encodeFloat = function (value) {
  var buffer = new Buffer(FLOAT_LENGTH)
  if (value < 0) {
    //
    // write negative numbers as negated positive values to invert bytes
    //
    buffer.writeDoubleBE(-value.valueOf(), 0)
    return util.invertBytes(buffer)
  }

  //
  // normalize -0 values to 0
  //
  buffer.writeDoubleBE(value.valueOf() || 0, 0)
  return buffer
}

util.decodeFloat = function (buffer, base, negative) {
  assert(buffer.length === FLOAT_LENGTH, 'Invalid float encoding length')

  if (negative)
    buffer = util.invertBytes(buffer)

  var value = buffer.readDoubleBE(0)
  return negative ? -value : value
}

//
// sigil for controlling the escapement functions (TODO: clean this up)
//
var SKIP_HIGH_BYTES = {}

util.escapeFlat = function (buffer, options) {
  //
  // escape high and low bytes 0x00 and 0xff (and by necessity, 0x01 and 0xfe)
  //
  var b, bytes = []
  for (var i = 0, end = buffer.length; i < end; ++i) {
    b = buffer[i]

    //
    // escape low bytes with 0x01 and by adding 1
    //
    if (b === 0x01 || b === 0x00)
      bytes.push(0x01, b + 1)

    //
    // escape high bytes with 0xfe and by subtracting 1
    //
    else if (options !== SKIP_HIGH_BYTES && (b === 0xfe || b === 0xff))
      bytes.push(0xfe, b - 1)

    //
    // no escapement needed
    //
    else
      bytes.push(b)
  }

  return new Buffer(bytes)
}

util.unescapeFlat = function (buffer, options) {
  var b, bytes = []
  //
  // don't escape last byte
  //
  for (var i = 0, end = buffer.length; i < end; ++i) {
    b = buffer[i]

    //
    // if low-byte escape tag use the following byte minus 1
    //
    if (b === 0x01)
      bytes.push(buffer[++i] - 1)

    //
    // if high-byte escape tag use the following byte plus 1
    //
    else if (options !== SKIP_HIGH_BYTES && b === 0xfe)
      bytes.push(buffer[++i] + 1)

    //
    // no unescapement needed
    //
    else
      bytes.push(b)
  }
  return new Buffer(bytes)
}

util.escapeFlatLow = function (buffer) {
  return util.escapeFlat(buffer, SKIP_HIGH_BYTES)
}

util.unescapeFlatLow = function (buffer) {
  return util.unescapeFlat(buffer, SKIP_HIGH_BYTES)
}

util.encodeList = function (source, base) {
  // TODO: cycle detection
  var buffers = []
  var undecodable

  for (var i = 0, end = source.length; i < end; ++i) {
    var buffer = base.encode(source[i], null)

    //
    // bypass assertions for undecodable types (i.e. range bounds)
    //
    undecodable || (undecodable = buffer.undecodable)
    if (undecodable) {
      buffers.push(buffer)
      continue
    }

    var sort = base.getType(buffer[0])
    assert(sort, 'List encoding failure: ' + buffer)

    //
    // escape sorts if it requires it and add closing byte for element
    //
    if (sort.codec && sort.codec.escape)
      buffers.push(sort.codec.escape(buffer), new Buffer([ 0x00 ]))

    else
      buffers.push(buffer)
  }

  //
  // close the list with an end byte
  //
  buffers.push(new Buffer([ 0x00 ]))
  buffer = Buffer.concat(buffers)

  //
  // propagate undecoable bit if set
  //
  undecodable && (buffer.undecodable = undecodable)
  return buffer
}

util.decodeList = function (buffer, base) {
  var result = util.parse(buffer, base)

  assert(result[1] === buffer.length, 'Invalid encoding')
  return result[0]
}

util.encodeHash = function (source, base) {
  //
  // packs hash into an array, e.g. `[ k1, v1, k2, v2, ... ]`
  //
  var list = []
  Object.keys(source).forEach(function(key) {
    list.push(key)
    list.push(source[key])
  })
  return util.encodeList(list, base)
}

util.decodeHash = function (buffer, base) {
  var list = util.decodeList(buffer, base)
  var hash = Object.create(null)

  for (var i = 0, end = list.length; i < end; ++i) {
    hash[list[i]] = list[++i]
  }

  return hash
}

//
// base parser for nested/recursive sorts
//
util.parse = function (buffer, base, sort) {
  //
  // parses and returns the first sort on the buffer and total bytes consumed
  //
  var codec = sort && sort.codec
  var index, end

  //
  // nullary
  //
  if (sort && !codec)
    return [ base.decode(new Buffer([ sort.byte ]), null), 0 ]

  //
  // custom parse implementation provided by sort
  //
  if (codec && codec.parse)
    return codec.parse(buffer, base, sort)

  //
  // fixed length sort, decode fixed bytes
  //
  var length = codec && codec.length
  if (typeof length === 'number')
    return [ codec.decode(buffer.slice(0, length)), length ]

  //
  // escaped sort, seek to end byte and unescape
  //
  if (codec && codec.unescape) {
    for (index = 0, end = buffer.length; index < end; ++index) {
      if (buffer[index] === 0x00)
        break
    }

    assert(index < buffer.length, 'No closing byte found for sequence')
    var unescaped = codec.unescape(buffer.slice(0, index))

    //
    // add 1 to index to account for closing tag byte
    //
    return [ codec.decode(unescaped), index + 1 ]
  }

  //
  // recursive sort, resolve each item iteratively
  //
  index = 0
  var list = []
  var next
  while ((next = buffer[index]) !== 0x00) {
    sort = base.getType(next)
    var result = util.parse(buffer.slice(index + 1), base, sort)
    list.push(result[0])

    //
    // offset current index by bytes consumed (plus a byte for the sort tag)
    //
    index += result[1] + 1
    assert(index < buffer.length, 'No closing byte found for nested sequence')
  }

  //
  // return parsed list and bytes consumed (plus a byte for the closing tag)
  //
  return [ list, index + 1 ]
}

//
// helpers for encoding boundary types
//
function encodeBound(data, base) {
  var prefix = data.prefix
  var buffer = prefix ? base.encode(prefix, null) : new Buffer([ data.byte ])

  if (data.upper)
    buffer = Buffer.concat([ buffer, new Buffer([ 0xff ]) ])

  return util.encodedBound(data, buffer)
}

util.encodeBound = function (data, base) {
  return util.encodedBound(data, encodeBound(data, base))
}

util.encodeBaseBound = function (data, base) {
  return util.encodedBound(data, new Buffer([ data.upper ? 0xff : 0x00 ]))
}

util.encodeListBound = function (data, base) {
  var buffer = encodeBound(data, base)

  if (data.prefix) {
    //
    // trim off end byte if a prefix, and do some hackery if an upper bound
    //
    var endByte = buffer[buffer.length - 1]
    buffer = buffer.slice(0, -1)
    if (data.upper)
      buffer[buffer.length - 1] = endByte
  }

  return util.encodedBound(data, buffer)
}

//
// add some metadata to generated buffer instance
//
util.encodedBound = function (data, buffer) {
  buffer.undecodable = true
  return buffer
}

}).call(this)}).call(this,require("buffer").Buffer)
},{"buffer":21,"typewise-core/collation":81}],26:[function(require,module,exports){
// require typewise first to extend with core typewise functionality
require('typewise')

// TODO: bytewise-binary encoding -- no hex parsing or toString hackery
module.exports = require('bytewise-core')

},{"bytewise-core":24,"typewise":84}],27:[function(require,module,exports){
// TODO: standard bytewise encoding constructor
// TODO: enhance binary encoding with optional hex helpers
module.exports = require('./binary')
},{"./binary":26}],28:[function(require,module,exports){
// TODO: initialize and export a standard bytewise encoding, add hex and binary
module.exports = require('./encoding/')

},{"./encoding/":27}],29:[function(require,module,exports){
'use strict'

var nextTick = require('./next-tick')

exports.fromCallback = function (callback, symbol) {
  if (callback === undefined) {
    var promise = new Promise(function (resolve, reject) {
      callback = function (err, res) {
        if (err) reject(err)
        else resolve(res)
      }
    })

    callback[symbol !== undefined ? symbol : 'promise'] = promise
  } else if (typeof callback !== 'function') {
    throw new TypeError('Callback must be a function')
  }

  return callback
}

exports.fromPromise = function (promise, callback) {
  if (callback === undefined) return promise

  promise
    .then(function (res) { nextTick(() => callback(null, res)) })
    .catch(function (err) { nextTick(() => callback(err)) })
}

},{"./next-tick":30}],30:[function(require,module,exports){
module.exports = typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => Promise.resolve().then(fn)

},{}],31:[function(require,module,exports){
var assert = require('assert')
var LRU = require('nanolru')

module.exports = ChooComponentCache

function ChooComponentCache (state, emit, lru) {
  assert.ok(this instanceof ChooComponentCache, 'ChooComponentCache should be created with `new`')

  assert.equal(typeof state, 'object', 'ChooComponentCache: state should be type object')
  assert.equal(typeof emit, 'function', 'ChooComponentCache: emit should be type function')

  if (typeof lru === 'number') this.cache = new LRU(lru)
  else this.cache = lru || new LRU(100)
  this.state = state
  this.emit = emit
}

// Get & create component instances.
ChooComponentCache.prototype.render = function (Component, id) {
  assert.equal(typeof Component, 'function', 'ChooComponentCache.render: Component should be type function')
  assert.ok(typeof id === 'string' || typeof id === 'number', 'ChooComponentCache.render: id should be type string or type number')

  var el = this.cache.get(id)
  if (!el) {
    var args = []
    for (var i = 2, len = arguments.length; i < len; i++) {
      args.push(arguments[i])
    }
    args.unshift(Component, id, this.state, this.emit)
    el = newCall.apply(newCall, args)
    this.cache.set(id, el)
  }

  return el
}

// Because you can't call `new` and `.apply()` at the same time. This is a mad
// hack, but hey it works so we gonna go for it. Whoop.
function newCall (Cls) {
  return new (Cls.bind.apply(Cls, arguments)) // eslint-disable-line
}

},{"assert":53,"nanolru":64}],32:[function(require,module,exports){
module.exports = require('nanocomponent')

},{"nanocomponent":55}],33:[function(require,module,exports){
module.exports = require('nanohtml')

},{"nanohtml":60}],34:[function(require,module,exports){
var scrollToAnchor = require('scroll-to-anchor')
var documentReady = require('document-ready')
var nanotiming = require('nanotiming')
var nanorouter = require('nanorouter')
var nanomorph = require('nanomorph')
var nanoquery = require('nanoquery')
var nanohref = require('nanohref')
var nanoraf = require('nanoraf')
var nanobus = require('nanobus')
var assert = require('assert')

var Cache = require('./component/cache')

module.exports = Choo

var HISTORY_OBJECT = {}

function Choo (opts) {
  var timing = nanotiming('choo.constructor')
  if (!(this instanceof Choo)) return new Choo(opts)
  opts = opts || {}

  assert.equal(typeof opts, 'object', 'choo: opts should be type object')

  var self = this

  // define events used by choo
  this._events = {
    DOMCONTENTLOADED: 'DOMContentLoaded',
    DOMTITLECHANGE: 'DOMTitleChange',
    REPLACESTATE: 'replaceState',
    PUSHSTATE: 'pushState',
    NAVIGATE: 'navigate',
    POPSTATE: 'popState',
    RENDER: 'render'
  }

  // properties for internal use only
  this._historyEnabled = opts.history === undefined ? true : opts.history
  this._hrefEnabled = opts.href === undefined ? true : opts.href
  this._hashEnabled = opts.hash === undefined ? false : opts.hash
  this._hasWindow = typeof window !== 'undefined'
  this._cache = opts.cache
  this._loaded = false
  this._stores = [ondomtitlechange]
  this._tree = null

  // state
  var _state = {
    events: this._events,
    components: {}
  }
  if (this._hasWindow) {
    this.state = window.initialState
      ? Object.assign({}, window.initialState, _state)
      : _state
    delete window.initialState
  } else {
    this.state = _state
  }

  // properties that are part of the API
  this.router = nanorouter({ curry: true })
  this.emitter = nanobus('choo.emit')
  this.emit = this.emitter.emit.bind(this.emitter)

  // listen for title changes; available even when calling .toString()
  if (this._hasWindow) this.state.title = document.title
  function ondomtitlechange (state) {
    self.emitter.prependListener(self._events.DOMTITLECHANGE, function (title) {
      assert.equal(typeof title, 'string', 'events.DOMTitleChange: title should be type string')
      state.title = title
      if (self._hasWindow) document.title = title
    })
  }
  timing()
}

Choo.prototype.route = function (route, handler) {
  var routeTiming = nanotiming("choo.route('" + route + "')")
  assert.equal(typeof route, 'string', 'choo.route: route should be type string')
  assert.equal(typeof handler, 'function', 'choo.handler: route should be type function')
  this.router.on(route, handler)
  routeTiming()
}

Choo.prototype.use = function (cb) {
  assert.equal(typeof cb, 'function', 'choo.use: cb should be type function')
  var self = this
  this._stores.push(function (state) {
    var msg = 'choo.use'
    msg = cb.storeName ? msg + '(' + cb.storeName + ')' : msg
    var endTiming = nanotiming(msg)
    cb(state, self.emitter, self)
    endTiming()
  })
}

Choo.prototype.start = function () {
  assert.equal(typeof window, 'object', 'choo.start: window was not found. .start() must be called in a browser, use .toString() if running in Node')
  var startTiming = nanotiming('choo.start')

  var self = this
  if (this._historyEnabled) {
    this.emitter.prependListener(this._events.NAVIGATE, function () {
      self._matchRoute(self.state)
      if (self._loaded) {
        self.emitter.emit(self._events.RENDER)
        setTimeout(scrollToAnchor.bind(null, window.location.hash), 0)
      }
    })

    this.emitter.prependListener(this._events.POPSTATE, function () {
      self.emitter.emit(self._events.NAVIGATE)
    })

    this.emitter.prependListener(this._events.PUSHSTATE, function (href) {
      assert.equal(typeof href, 'string', 'events.pushState: href should be type string')
      window.history.pushState(HISTORY_OBJECT, null, href)
      self.emitter.emit(self._events.NAVIGATE)
    })

    this.emitter.prependListener(this._events.REPLACESTATE, function (href) {
      assert.equal(typeof href, 'string', 'events.replaceState: href should be type string')
      window.history.replaceState(HISTORY_OBJECT, null, href)
      self.emitter.emit(self._events.NAVIGATE)
    })

    window.onpopstate = function () {
      self.emitter.emit(self._events.POPSTATE)
    }

    if (self._hrefEnabled) {
      nanohref(function (location) {
        var href = location.href
        var hash = location.hash
        if (href === window.location.href) {
          if (!self._hashEnabled && hash) scrollToAnchor(hash)
          return
        }
        self.emitter.emit(self._events.PUSHSTATE, href)
      })
    }
  }

  this._setCache(this.state)
  this._matchRoute(this.state)
  this._stores.forEach(function (initStore) {
    initStore(self.state)
  })

  this._tree = this._prerender(this.state)
  assert.ok(this._tree, 'choo.start: no valid DOM node returned for location ' + this.state.href)

  this.emitter.prependListener(self._events.RENDER, nanoraf(function () {
    var renderTiming = nanotiming('choo.render')
    var newTree = self._prerender(self.state)
    assert.ok(newTree, 'choo.render: no valid DOM node returned for location ' + self.state.href)

    assert.equal(self._tree.nodeName, newTree.nodeName, 'choo.render: The target node <' +
      self._tree.nodeName.toLowerCase() + '> is not the same type as the new node <' +
      newTree.nodeName.toLowerCase() + '>.')

    var morphTiming = nanotiming('choo.morph')
    nanomorph(self._tree, newTree)
    morphTiming()

    renderTiming()
  }))

  documentReady(function () {
    self.emitter.emit(self._events.DOMCONTENTLOADED)
    self._loaded = true
  })

  startTiming()
  return this._tree
}

Choo.prototype.mount = function mount (selector) {
  var mountTiming = nanotiming("choo.mount('" + selector + "')")
  if (typeof window !== 'object') {
    assert.ok(typeof selector === 'string', 'choo.mount: selector should be type String')
    this.selector = selector
    mountTiming()
    return this
  }

  assert.ok(typeof selector === 'string' || typeof selector === 'object', 'choo.mount: selector should be type String or HTMLElement')

  var self = this

  documentReady(function () {
    var renderTiming = nanotiming('choo.render')
    var newTree = self.start()
    if (typeof selector === 'string') {
      self._tree = document.querySelector(selector)
    } else {
      self._tree = selector
    }

    assert.ok(self._tree, 'choo.mount: could not query selector: ' + selector)
    assert.equal(self._tree.nodeName, newTree.nodeName, 'choo.mount: The target node <' +
      self._tree.nodeName.toLowerCase() + '> is not the same type as the new node <' +
      newTree.nodeName.toLowerCase() + '>.')

    var morphTiming = nanotiming('choo.morph')
    nanomorph(self._tree, newTree)
    morphTiming()

    renderTiming()
  })
  mountTiming()
}

Choo.prototype.toString = function (location, state) {
  state = state || {}
  state.components = state.components || {}
  state.events = Object.assign({}, state.events, this._events)

  assert.notEqual(typeof window, 'object', 'choo.mount: window was found. .toString() must be called in Node, use .start() or .mount() if running in the browser')
  assert.equal(typeof location, 'string', 'choo.toString: location should be type string')
  assert.equal(typeof state, 'object', 'choo.toString: state should be type object')

  this._setCache(state)
  this._matchRoute(state, location)
  this.emitter.removeAllListeners()
  this._stores.forEach(function (initStore) {
    initStore(state)
  })

  var html = this._prerender(state)
  assert.ok(html, 'choo.toString: no valid value returned for the route ' + location)
  assert(!Array.isArray(html), 'choo.toString: return value was an array for the route ' + location)
  return typeof html.outerHTML === 'string' ? html.outerHTML : html.toString()
}

Choo.prototype._matchRoute = function (state, locationOverride) {
  var location, queryString
  if (locationOverride) {
    location = locationOverride.replace(/\?.+$/, '').replace(/\/$/, '')
    if (!this._hashEnabled) location = location.replace(/#.+$/, '')
    queryString = locationOverride
  } else {
    location = window.location.pathname.replace(/\/$/, '')
    if (this._hashEnabled) location += window.location.hash.replace(/^#/, '/')
    queryString = window.location.search
  }
  var matched = this.router.match(location)
  this._handler = matched.cb
  state.href = location
  state.query = nanoquery(queryString)
  state.route = matched.route
  state.params = matched.params
}

Choo.prototype._prerender = function (state) {
  var routeTiming = nanotiming("choo.prerender('" + state.route + "')")
  var res = this._handler(state, this.emit)
  routeTiming()
  return res
}

Choo.prototype._setCache = function (state) {
  var cache = new Cache(state, this.emitter.emit.bind(this.emitter), this._cache)
  state.cache = renderComponent

  function renderComponent (Component, id) {
    assert.equal(typeof Component, 'function', 'choo.state.cache: Component should be type function')
    var args = []
    for (var i = 0, len = arguments.length; i < len; i++) {
      args.push(arguments[i])
    }
    return cache.render.apply(cache, args)
  }

  // When the state gets stringified, make sure `state.cache` isn't
  // stringified too.
  renderComponent.toJSON = function () {
    return null
  }
}

},{"./component/cache":31,"assert":53,"document-ready":37,"nanobus":54,"nanohref":57,"nanomorph":65,"nanoquery":68,"nanoraf":69,"nanorouter":70,"nanotiming":72,"scroll-to-anchor":79}],35:[function(require,module,exports){
/**
 * chroma.js - JavaScript library for color conversions
 *
 * Copyright (c) 2011-2019, Gregor Aisch
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 * list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. The name Gregor Aisch may not be used to endorse or promote products
 * derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL GREGOR AISCH OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * -------------------------------------------------------
 *
 * chroma.js includes colors from colorbrewer2.org, which are released under
 * the following license:
 *
 * Copyright (c) 2002 Cynthia Brewer, Mark Harrower,
 * and The Pennsylvania State University.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 *
 * ------------------------------------------------------
 *
 * Named colors are taken from X11 Color Names.
 * http://www.w3.org/TR/css3-color/#svg-color
 *
 * @preserve
 */

(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.chroma = factory());
})(this, (function () { 'use strict';

    var limit$2 = function (x, min, max) {
        if ( min === void 0 ) min=0;
        if ( max === void 0 ) max=1;

        return x < min ? min : x > max ? max : x;
    };

    var limit$1 = limit$2;

    var clip_rgb$3 = function (rgb) {
        rgb._clipped = false;
        rgb._unclipped = rgb.slice(0);
        for (var i=0; i<=3; i++) {
            if (i < 3) {
                if (rgb[i] < 0 || rgb[i] > 255) { rgb._clipped = true; }
                rgb[i] = limit$1(rgb[i], 0, 255);
            } else if (i === 3) {
                rgb[i] = limit$1(rgb[i], 0, 1);
            }
        }
        return rgb;
    };

    // ported from jQuery's $.type
    var classToType = {};
    for (var i$1 = 0, list$1 = ['Boolean', 'Number', 'String', 'Function', 'Array', 'Date', 'RegExp', 'Undefined', 'Null']; i$1 < list$1.length; i$1 += 1) {
        var name = list$1[i$1];

        classToType[("[object " + name + "]")] = name.toLowerCase();
    }
    var type$p = function(obj) {
        return classToType[Object.prototype.toString.call(obj)] || "object";
    };

    var type$o = type$p;

    var unpack$B = function (args, keyOrder) {
        if ( keyOrder === void 0 ) keyOrder=null;

    	// if called with more than 3 arguments, we return the arguments
        if (args.length >= 3) { return Array.prototype.slice.call(args); }
        // with less than 3 args we check if first arg is object
        // and use the keyOrder string to extract and sort properties
    	if (type$o(args[0]) == 'object' && keyOrder) {
    		return keyOrder.split('')
    			.filter(function (k) { return args[0][k] !== undefined; })
    			.map(function (k) { return args[0][k]; });
    	}
    	// otherwise we just return the first argument
    	// (which we suppose is an array of args)
        return args[0];
    };

    var type$n = type$p;

    var last$4 = function (args) {
        if (args.length < 2) { return null; }
        var l = args.length-1;
        if (type$n(args[l]) == 'string') { return args[l].toLowerCase(); }
        return null;
    };

    var PI$2 = Math.PI;

    var utils = {
    	clip_rgb: clip_rgb$3,
    	limit: limit$2,
    	type: type$p,
    	unpack: unpack$B,
    	last: last$4,
    	PI: PI$2,
    	TWOPI: PI$2*2,
    	PITHIRD: PI$2/3,
    	DEG2RAD: PI$2 / 180,
    	RAD2DEG: 180 / PI$2
    };

    var input$h = {
    	format: {},
    	autodetect: []
    };

    var last$3 = utils.last;
    var clip_rgb$2 = utils.clip_rgb;
    var type$m = utils.type;
    var _input = input$h;

    var Color$D = function Color() {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var me = this;
        if (type$m(args[0]) === 'object' &&
            args[0].constructor &&
            args[0].constructor === this.constructor) {
            // the argument is already a Color instance
            return args[0];
        }

        // last argument could be the mode
        var mode = last$3(args);
        var autodetect = false;

        if (!mode) {
            autodetect = true;
            if (!_input.sorted) {
                _input.autodetect = _input.autodetect.sort(function (a,b) { return b.p - a.p; });
                _input.sorted = true;
            }
            // auto-detect format
            for (var i = 0, list = _input.autodetect; i < list.length; i += 1) {
                var chk = list[i];

                mode = chk.test.apply(chk, args);
                if (mode) { break; }
            }
        }

        if (_input.format[mode]) {
            var rgb = _input.format[mode].apply(null, autodetect ? args : args.slice(0,-1));
            me._rgb = clip_rgb$2(rgb);
        } else {
            throw new Error('unknown format: '+args);
        }

        // add alpha channel
        if (me._rgb.length === 3) { me._rgb.push(1); }
    };

    Color$D.prototype.toString = function toString () {
        if (type$m(this.hex) == 'function') { return this.hex(); }
        return ("[" + (this._rgb.join(',')) + "]");
    };

    var Color_1 = Color$D;

    var chroma$k = function () {
    	var args = [], len = arguments.length;
    	while ( len-- ) args[ len ] = arguments[ len ];

    	return new (Function.prototype.bind.apply( chroma$k.Color, [ null ].concat( args) ));
    };

    chroma$k.Color = Color_1;
    chroma$k.version = '2.4.2';

    var chroma_1 = chroma$k;

    var unpack$A = utils.unpack;
    var max$2 = Math.max;

    var rgb2cmyk$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var ref = unpack$A(args, 'rgb');
        var r = ref[0];
        var g = ref[1];
        var b = ref[2];
        r = r / 255;
        g = g / 255;
        b = b / 255;
        var k = 1 - max$2(r,max$2(g,b));
        var f = k < 1 ? 1 / (1-k) : 0;
        var c = (1-r-k) * f;
        var m = (1-g-k) * f;
        var y = (1-b-k) * f;
        return [c,m,y,k];
    };

    var rgb2cmyk_1 = rgb2cmyk$1;

    var unpack$z = utils.unpack;

    var cmyk2rgb = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        args = unpack$z(args, 'cmyk');
        var c = args[0];
        var m = args[1];
        var y = args[2];
        var k = args[3];
        var alpha = args.length > 4 ? args[4] : 1;
        if (k === 1) { return [0,0,0,alpha]; }
        return [
            c >= 1 ? 0 : 255 * (1-c) * (1-k), // r
            m >= 1 ? 0 : 255 * (1-m) * (1-k), // g
            y >= 1 ? 0 : 255 * (1-y) * (1-k), // b
            alpha
        ];
    };

    var cmyk2rgb_1 = cmyk2rgb;

    var chroma$j = chroma_1;
    var Color$C = Color_1;
    var input$g = input$h;
    var unpack$y = utils.unpack;
    var type$l = utils.type;

    var rgb2cmyk = rgb2cmyk_1;

    Color$C.prototype.cmyk = function() {
        return rgb2cmyk(this._rgb);
    };

    chroma$j.cmyk = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$C, [ null ].concat( args, ['cmyk']) ));
    };

    input$g.format.cmyk = cmyk2rgb_1;

    input$g.autodetect.push({
        p: 2,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack$y(args, 'cmyk');
            if (type$l(args) === 'array' && args.length === 4) {
                return 'cmyk';
            }
        }
    });

    var unpack$x = utils.unpack;
    var last$2 = utils.last;
    var rnd = function (a) { return Math.round(a*100)/100; };

    /*
     * supported arguments:
     * - hsl2css(h,s,l)
     * - hsl2css(h,s,l,a)
     * - hsl2css([h,s,l], mode)
     * - hsl2css([h,s,l,a], mode)
     * - hsl2css({h,s,l,a}, mode)
     */
    var hsl2css$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var hsla = unpack$x(args, 'hsla');
        var mode = last$2(args) || 'lsa';
        hsla[0] = rnd(hsla[0] || 0);
        hsla[1] = rnd(hsla[1]*100) + '%';
        hsla[2] = rnd(hsla[2]*100) + '%';
        if (mode === 'hsla' || (hsla.length > 3 && hsla[3]<1)) {
            hsla[3] = hsla.length > 3 ? hsla[3] : 1;
            mode = 'hsla';
        } else {
            hsla.length = 3;
        }
        return (mode + "(" + (hsla.join(',')) + ")");
    };

    var hsl2css_1 = hsl2css$1;

    var unpack$w = utils.unpack;

    /*
     * supported arguments:
     * - rgb2hsl(r,g,b)
     * - rgb2hsl(r,g,b,a)
     * - rgb2hsl([r,g,b])
     * - rgb2hsl([r,g,b,a])
     * - rgb2hsl({r,g,b,a})
     */
    var rgb2hsl$3 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        args = unpack$w(args, 'rgba');
        var r = args[0];
        var g = args[1];
        var b = args[2];

        r /= 255;
        g /= 255;
        b /= 255;

        var min = Math.min(r, g, b);
        var max = Math.max(r, g, b);

        var l = (max + min) / 2;
        var s, h;

        if (max === min){
            s = 0;
            h = Number.NaN;
        } else {
            s = l < 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min);
        }

        if (r == max) { h = (g - b) / (max - min); }
        else if (g == max) { h = 2 + (b - r) / (max - min); }
        else if (b == max) { h = 4 + (r - g) / (max - min); }

        h *= 60;
        if (h < 0) { h += 360; }
        if (args.length>3 && args[3]!==undefined) { return [h,s,l,args[3]]; }
        return [h,s,l];
    };

    var rgb2hsl_1 = rgb2hsl$3;

    var unpack$v = utils.unpack;
    var last$1 = utils.last;
    var hsl2css = hsl2css_1;
    var rgb2hsl$2 = rgb2hsl_1;
    var round$6 = Math.round;

    /*
     * supported arguments:
     * - rgb2css(r,g,b)
     * - rgb2css(r,g,b,a)
     * - rgb2css([r,g,b], mode)
     * - rgb2css([r,g,b,a], mode)
     * - rgb2css({r,g,b,a}, mode)
     */
    var rgb2css$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var rgba = unpack$v(args, 'rgba');
        var mode = last$1(args) || 'rgb';
        if (mode.substr(0,3) == 'hsl') {
            return hsl2css(rgb2hsl$2(rgba), mode);
        }
        rgba[0] = round$6(rgba[0]);
        rgba[1] = round$6(rgba[1]);
        rgba[2] = round$6(rgba[2]);
        if (mode === 'rgba' || (rgba.length > 3 && rgba[3]<1)) {
            rgba[3] = rgba.length > 3 ? rgba[3] : 1;
            mode = 'rgba';
        }
        return (mode + "(" + (rgba.slice(0,mode==='rgb'?3:4).join(',')) + ")");
    };

    var rgb2css_1 = rgb2css$1;

    var unpack$u = utils.unpack;
    var round$5 = Math.round;

    var hsl2rgb$1 = function () {
        var assign;

        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];
        args = unpack$u(args, 'hsl');
        var h = args[0];
        var s = args[1];
        var l = args[2];
        var r,g,b;
        if (s === 0) {
            r = g = b = l*255;
        } else {
            var t3 = [0,0,0];
            var c = [0,0,0];
            var t2 = l < 0.5 ? l * (1+s) : l+s-l*s;
            var t1 = 2 * l - t2;
            var h_ = h / 360;
            t3[0] = h_ + 1/3;
            t3[1] = h_;
            t3[2] = h_ - 1/3;
            for (var i=0; i<3; i++) {
                if (t3[i] < 0) { t3[i] += 1; }
                if (t3[i] > 1) { t3[i] -= 1; }
                if (6 * t3[i] < 1)
                    { c[i] = t1 + (t2 - t1) * 6 * t3[i]; }
                else if (2 * t3[i] < 1)
                    { c[i] = t2; }
                else if (3 * t3[i] < 2)
                    { c[i] = t1 + (t2 - t1) * ((2 / 3) - t3[i]) * 6; }
                else
                    { c[i] = t1; }
            }
            (assign = [round$5(c[0]*255),round$5(c[1]*255),round$5(c[2]*255)], r = assign[0], g = assign[1], b = assign[2]);
        }
        if (args.length > 3) {
            // keep alpha channel
            return [r,g,b,args[3]];
        }
        return [r,g,b,1];
    };

    var hsl2rgb_1 = hsl2rgb$1;

    var hsl2rgb = hsl2rgb_1;
    var input$f = input$h;

    var RE_RGB = /^rgb\(\s*(-?\d+),\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/;
    var RE_RGBA = /^rgba\(\s*(-?\d+),\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*([01]|[01]?\.\d+)\)$/;
    var RE_RGB_PCT = /^rgb\(\s*(-?\d+(?:\.\d+)?)%,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*\)$/;
    var RE_RGBA_PCT = /^rgba\(\s*(-?\d+(?:\.\d+)?)%,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*([01]|[01]?\.\d+)\)$/;
    var RE_HSL = /^hsl\(\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*\)$/;
    var RE_HSLA = /^hsla\(\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*([01]|[01]?\.\d+)\)$/;

    var round$4 = Math.round;

    var css2rgb$1 = function (css) {
        css = css.toLowerCase().trim();
        var m;

        if (input$f.format.named) {
            try {
                return input$f.format.named(css);
            } catch (e) {
                // eslint-disable-next-line
            }
        }

        // rgb(250,20,0)
        if ((m = css.match(RE_RGB))) {
            var rgb = m.slice(1,4);
            for (var i=0; i<3; i++) {
                rgb[i] = +rgb[i];
            }
            rgb[3] = 1;  // default alpha
            return rgb;
        }

        // rgba(250,20,0,0.4)
        if ((m = css.match(RE_RGBA))) {
            var rgb$1 = m.slice(1,5);
            for (var i$1=0; i$1<4; i$1++) {
                rgb$1[i$1] = +rgb$1[i$1];
            }
            return rgb$1;
        }

        // rgb(100%,0%,0%)
        if ((m = css.match(RE_RGB_PCT))) {
            var rgb$2 = m.slice(1,4);
            for (var i$2=0; i$2<3; i$2++) {
                rgb$2[i$2] = round$4(rgb$2[i$2] * 2.55);
            }
            rgb$2[3] = 1;  // default alpha
            return rgb$2;
        }

        // rgba(100%,0%,0%,0.4)
        if ((m = css.match(RE_RGBA_PCT))) {
            var rgb$3 = m.slice(1,5);
            for (var i$3=0; i$3<3; i$3++) {
                rgb$3[i$3] = round$4(rgb$3[i$3] * 2.55);
            }
            rgb$3[3] = +rgb$3[3];
            return rgb$3;
        }

        // hsl(0,100%,50%)
        if ((m = css.match(RE_HSL))) {
            var hsl = m.slice(1,4);
            hsl[1] *= 0.01;
            hsl[2] *= 0.01;
            var rgb$4 = hsl2rgb(hsl);
            rgb$4[3] = 1;
            return rgb$4;
        }

        // hsla(0,100%,50%,0.5)
        if ((m = css.match(RE_HSLA))) {
            var hsl$1 = m.slice(1,4);
            hsl$1[1] *= 0.01;
            hsl$1[2] *= 0.01;
            var rgb$5 = hsl2rgb(hsl$1);
            rgb$5[3] = +m[4];  // default alpha = 1
            return rgb$5;
        }
    };

    css2rgb$1.test = function (s) {
        return RE_RGB.test(s) ||
            RE_RGBA.test(s) ||
            RE_RGB_PCT.test(s) ||
            RE_RGBA_PCT.test(s) ||
            RE_HSL.test(s) ||
            RE_HSLA.test(s);
    };

    var css2rgb_1 = css2rgb$1;

    var chroma$i = chroma_1;
    var Color$B = Color_1;
    var input$e = input$h;
    var type$k = utils.type;

    var rgb2css = rgb2css_1;
    var css2rgb = css2rgb_1;

    Color$B.prototype.css = function(mode) {
        return rgb2css(this._rgb, mode);
    };

    chroma$i.css = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$B, [ null ].concat( args, ['css']) ));
    };

    input$e.format.css = css2rgb;

    input$e.autodetect.push({
        p: 5,
        test: function (h) {
            var rest = [], len = arguments.length - 1;
            while ( len-- > 0 ) rest[ len ] = arguments[ len + 1 ];

            if (!rest.length && type$k(h) === 'string' && css2rgb.test(h)) {
                return 'css';
            }
        }
    });

    var Color$A = Color_1;
    var chroma$h = chroma_1;
    var input$d = input$h;
    var unpack$t = utils.unpack;

    input$d.format.gl = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var rgb = unpack$t(args, 'rgba');
        rgb[0] *= 255;
        rgb[1] *= 255;
        rgb[2] *= 255;
        return rgb;
    };

    chroma$h.gl = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$A, [ null ].concat( args, ['gl']) ));
    };

    Color$A.prototype.gl = function() {
        var rgb = this._rgb;
        return [rgb[0]/255, rgb[1]/255, rgb[2]/255, rgb[3]];
    };

    var unpack$s = utils.unpack;

    var rgb2hcg$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var ref = unpack$s(args, 'rgb');
        var r = ref[0];
        var g = ref[1];
        var b = ref[2];
        var min = Math.min(r, g, b);
        var max = Math.max(r, g, b);
        var delta = max - min;
        var c = delta * 100 / 255;
        var _g = min / (255 - delta) * 100;
        var h;
        if (delta === 0) {
            h = Number.NaN;
        } else {
            if (r === max) { h = (g - b) / delta; }
            if (g === max) { h = 2+(b - r) / delta; }
            if (b === max) { h = 4+(r - g) / delta; }
            h *= 60;
            if (h < 0) { h += 360; }
        }
        return [h, c, _g];
    };

    var rgb2hcg_1 = rgb2hcg$1;

    var unpack$r = utils.unpack;
    var floor$3 = Math.floor;

    /*
     * this is basically just HSV with some minor tweaks
     *
     * hue.. [0..360]
     * chroma .. [0..1]
     * grayness .. [0..1]
     */

    var hcg2rgb = function () {
        var assign, assign$1, assign$2, assign$3, assign$4, assign$5;

        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];
        args = unpack$r(args, 'hcg');
        var h = args[0];
        var c = args[1];
        var _g = args[2];
        var r,g,b;
        _g = _g * 255;
        var _c = c * 255;
        if (c === 0) {
            r = g = b = _g;
        } else {
            if (h === 360) { h = 0; }
            if (h > 360) { h -= 360; }
            if (h < 0) { h += 360; }
            h /= 60;
            var i = floor$3(h);
            var f = h - i;
            var p = _g * (1 - c);
            var q = p + _c * (1 - f);
            var t = p + _c * f;
            var v = p + _c;
            switch (i) {
                case 0: (assign = [v, t, p], r = assign[0], g = assign[1], b = assign[2]); break
                case 1: (assign$1 = [q, v, p], r = assign$1[0], g = assign$1[1], b = assign$1[2]); break
                case 2: (assign$2 = [p, v, t], r = assign$2[0], g = assign$2[1], b = assign$2[2]); break
                case 3: (assign$3 = [p, q, v], r = assign$3[0], g = assign$3[1], b = assign$3[2]); break
                case 4: (assign$4 = [t, p, v], r = assign$4[0], g = assign$4[1], b = assign$4[2]); break
                case 5: (assign$5 = [v, p, q], r = assign$5[0], g = assign$5[1], b = assign$5[2]); break
            }
        }
        return [r, g, b, args.length > 3 ? args[3] : 1];
    };

    var hcg2rgb_1 = hcg2rgb;

    var unpack$q = utils.unpack;
    var type$j = utils.type;
    var chroma$g = chroma_1;
    var Color$z = Color_1;
    var input$c = input$h;

    var rgb2hcg = rgb2hcg_1;

    Color$z.prototype.hcg = function() {
        return rgb2hcg(this._rgb);
    };

    chroma$g.hcg = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$z, [ null ].concat( args, ['hcg']) ));
    };

    input$c.format.hcg = hcg2rgb_1;

    input$c.autodetect.push({
        p: 1,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack$q(args, 'hcg');
            if (type$j(args) === 'array' && args.length === 3) {
                return 'hcg';
            }
        }
    });

    var unpack$p = utils.unpack;
    var last = utils.last;
    var round$3 = Math.round;

    var rgb2hex$2 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var ref = unpack$p(args, 'rgba');
        var r = ref[0];
        var g = ref[1];
        var b = ref[2];
        var a = ref[3];
        var mode = last(args) || 'auto';
        if (a === undefined) { a = 1; }
        if (mode === 'auto') {
            mode = a < 1 ? 'rgba' : 'rgb';
        }
        r = round$3(r);
        g = round$3(g);
        b = round$3(b);
        var u = r << 16 | g << 8 | b;
        var str = "000000" + u.toString(16); //#.toUpperCase();
        str = str.substr(str.length - 6);
        var hxa = '0' + round$3(a * 255).toString(16);
        hxa = hxa.substr(hxa.length - 2);
        switch (mode.toLowerCase()) {
            case 'rgba': return ("#" + str + hxa);
            case 'argb': return ("#" + hxa + str);
            default: return ("#" + str);
        }
    };

    var rgb2hex_1 = rgb2hex$2;

    var RE_HEX = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    var RE_HEXA = /^#?([A-Fa-f0-9]{8}|[A-Fa-f0-9]{4})$/;

    var hex2rgb$1 = function (hex) {
        if (hex.match(RE_HEX)) {
            // remove optional leading #
            if (hex.length === 4 || hex.length === 7) {
                hex = hex.substr(1);
            }
            // expand short-notation to full six-digit
            if (hex.length === 3) {
                hex = hex.split('');
                hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
            }
            var u = parseInt(hex, 16);
            var r = u >> 16;
            var g = u >> 8 & 0xFF;
            var b = u & 0xFF;
            return [r,g,b,1];
        }

        // match rgba hex format, eg #FF000077
        if (hex.match(RE_HEXA)) {
            if (hex.length === 5 || hex.length === 9) {
                // remove optional leading #
                hex = hex.substr(1);
            }
            // expand short-notation to full eight-digit
            if (hex.length === 4) {
                hex = hex.split('');
                hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3];
            }
            var u$1 = parseInt(hex, 16);
            var r$1 = u$1 >> 24 & 0xFF;
            var g$1 = u$1 >> 16 & 0xFF;
            var b$1 = u$1 >> 8 & 0xFF;
            var a = Math.round((u$1 & 0xFF) / 0xFF * 100) / 100;
            return [r$1,g$1,b$1,a];
        }

        // we used to check for css colors here
        // if _input.css? and rgb = _input.css hex
        //     return rgb

        throw new Error(("unknown hex color: " + hex));
    };

    var hex2rgb_1 = hex2rgb$1;

    var chroma$f = chroma_1;
    var Color$y = Color_1;
    var type$i = utils.type;
    var input$b = input$h;

    var rgb2hex$1 = rgb2hex_1;

    Color$y.prototype.hex = function(mode) {
        return rgb2hex$1(this._rgb, mode);
    };

    chroma$f.hex = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$y, [ null ].concat( args, ['hex']) ));
    };

    input$b.format.hex = hex2rgb_1;
    input$b.autodetect.push({
        p: 4,
        test: function (h) {
            var rest = [], len = arguments.length - 1;
            while ( len-- > 0 ) rest[ len ] = arguments[ len + 1 ];

            if (!rest.length && type$i(h) === 'string' && [3,4,5,6,7,8,9].indexOf(h.length) >= 0) {
                return 'hex';
            }
        }
    });

    var unpack$o = utils.unpack;
    var TWOPI$2 = utils.TWOPI;
    var min$2 = Math.min;
    var sqrt$4 = Math.sqrt;
    var acos = Math.acos;

    var rgb2hsi$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        /*
        borrowed from here:
        http://hummer.stanford.edu/museinfo/doc/examples/humdrum/keyscape2/rgb2hsi.cpp
        */
        var ref = unpack$o(args, 'rgb');
        var r = ref[0];
        var g = ref[1];
        var b = ref[2];
        r /= 255;
        g /= 255;
        b /= 255;
        var h;
        var min_ = min$2(r,g,b);
        var i = (r+g+b) / 3;
        var s = i > 0 ? 1 - min_/i : 0;
        if (s === 0) {
            h = NaN;
        } else {
            h = ((r-g)+(r-b)) / 2;
            h /= sqrt$4((r-g)*(r-g) + (r-b)*(g-b));
            h = acos(h);
            if (b > g) {
                h = TWOPI$2 - h;
            }
            h /= TWOPI$2;
        }
        return [h*360,s,i];
    };

    var rgb2hsi_1 = rgb2hsi$1;

    var unpack$n = utils.unpack;
    var limit = utils.limit;
    var TWOPI$1 = utils.TWOPI;
    var PITHIRD = utils.PITHIRD;
    var cos$4 = Math.cos;

    /*
     * hue [0..360]
     * saturation [0..1]
     * intensity [0..1]
     */
    var hsi2rgb = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        /*
        borrowed from here:
        http://hummer.stanford.edu/museinfo/doc/examples/humdrum/keyscape2/hsi2rgb.cpp
        */
        args = unpack$n(args, 'hsi');
        var h = args[0];
        var s = args[1];
        var i = args[2];
        var r,g,b;

        if (isNaN(h)) { h = 0; }
        if (isNaN(s)) { s = 0; }
        // normalize hue
        if (h > 360) { h -= 360; }
        if (h < 0) { h += 360; }
        h /= 360;
        if (h < 1/3) {
            b = (1-s)/3;
            r = (1+s*cos$4(TWOPI$1*h)/cos$4(PITHIRD-TWOPI$1*h))/3;
            g = 1 - (b+r);
        } else if (h < 2/3) {
            h -= 1/3;
            r = (1-s)/3;
            g = (1+s*cos$4(TWOPI$1*h)/cos$4(PITHIRD-TWOPI$1*h))/3;
            b = 1 - (r+g);
        } else {
            h -= 2/3;
            g = (1-s)/3;
            b = (1+s*cos$4(TWOPI$1*h)/cos$4(PITHIRD-TWOPI$1*h))/3;
            r = 1 - (g+b);
        }
        r = limit(i*r*3);
        g = limit(i*g*3);
        b = limit(i*b*3);
        return [r*255, g*255, b*255, args.length > 3 ? args[3] : 1];
    };

    var hsi2rgb_1 = hsi2rgb;

    var unpack$m = utils.unpack;
    var type$h = utils.type;
    var chroma$e = chroma_1;
    var Color$x = Color_1;
    var input$a = input$h;

    var rgb2hsi = rgb2hsi_1;

    Color$x.prototype.hsi = function() {
        return rgb2hsi(this._rgb);
    };

    chroma$e.hsi = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$x, [ null ].concat( args, ['hsi']) ));
    };

    input$a.format.hsi = hsi2rgb_1;

    input$a.autodetect.push({
        p: 2,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack$m(args, 'hsi');
            if (type$h(args) === 'array' && args.length === 3) {
                return 'hsi';
            }
        }
    });

    var unpack$l = utils.unpack;
    var type$g = utils.type;
    var chroma$d = chroma_1;
    var Color$w = Color_1;
    var input$9 = input$h;

    var rgb2hsl$1 = rgb2hsl_1;

    Color$w.prototype.hsl = function() {
        return rgb2hsl$1(this._rgb);
    };

    chroma$d.hsl = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$w, [ null ].concat( args, ['hsl']) ));
    };

    input$9.format.hsl = hsl2rgb_1;

    input$9.autodetect.push({
        p: 2,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack$l(args, 'hsl');
            if (type$g(args) === 'array' && args.length === 3) {
                return 'hsl';
            }
        }
    });

    var unpack$k = utils.unpack;
    var min$1 = Math.min;
    var max$1 = Math.max;

    /*
     * supported arguments:
     * - rgb2hsv(r,g,b)
     * - rgb2hsv([r,g,b])
     * - rgb2hsv({r,g,b})
     */
    var rgb2hsl = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        args = unpack$k(args, 'rgb');
        var r = args[0];
        var g = args[1];
        var b = args[2];
        var min_ = min$1(r, g, b);
        var max_ = max$1(r, g, b);
        var delta = max_ - min_;
        var h,s,v;
        v = max_ / 255.0;
        if (max_ === 0) {
            h = Number.NaN;
            s = 0;
        } else {
            s = delta / max_;
            if (r === max_) { h = (g - b) / delta; }
            if (g === max_) { h = 2+(b - r) / delta; }
            if (b === max_) { h = 4+(r - g) / delta; }
            h *= 60;
            if (h < 0) { h += 360; }
        }
        return [h, s, v]
    };

    var rgb2hsv$1 = rgb2hsl;

    var unpack$j = utils.unpack;
    var floor$2 = Math.floor;

    var hsv2rgb = function () {
        var assign, assign$1, assign$2, assign$3, assign$4, assign$5;

        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];
        args = unpack$j(args, 'hsv');
        var h = args[0];
        var s = args[1];
        var v = args[2];
        var r,g,b;
        v *= 255;
        if (s === 0) {
            r = g = b = v;
        } else {
            if (h === 360) { h = 0; }
            if (h > 360) { h -= 360; }
            if (h < 0) { h += 360; }
            h /= 60;

            var i = floor$2(h);
            var f = h - i;
            var p = v * (1 - s);
            var q = v * (1 - s * f);
            var t = v * (1 - s * (1 - f));

            switch (i) {
                case 0: (assign = [v, t, p], r = assign[0], g = assign[1], b = assign[2]); break
                case 1: (assign$1 = [q, v, p], r = assign$1[0], g = assign$1[1], b = assign$1[2]); break
                case 2: (assign$2 = [p, v, t], r = assign$2[0], g = assign$2[1], b = assign$2[2]); break
                case 3: (assign$3 = [p, q, v], r = assign$3[0], g = assign$3[1], b = assign$3[2]); break
                case 4: (assign$4 = [t, p, v], r = assign$4[0], g = assign$4[1], b = assign$4[2]); break
                case 5: (assign$5 = [v, p, q], r = assign$5[0], g = assign$5[1], b = assign$5[2]); break
            }
        }
        return [r,g,b,args.length > 3?args[3]:1];
    };

    var hsv2rgb_1 = hsv2rgb;

    var unpack$i = utils.unpack;
    var type$f = utils.type;
    var chroma$c = chroma_1;
    var Color$v = Color_1;
    var input$8 = input$h;

    var rgb2hsv = rgb2hsv$1;

    Color$v.prototype.hsv = function() {
        return rgb2hsv(this._rgb);
    };

    chroma$c.hsv = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$v, [ null ].concat( args, ['hsv']) ));
    };

    input$8.format.hsv = hsv2rgb_1;

    input$8.autodetect.push({
        p: 2,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack$i(args, 'hsv');
            if (type$f(args) === 'array' && args.length === 3) {
                return 'hsv';
            }
        }
    });

    var labConstants = {
        // Corresponds roughly to RGB brighter/darker
        Kn: 18,

        // D65 standard referent
        Xn: 0.950470,
        Yn: 1,
        Zn: 1.088830,

        t0: 0.137931034,  // 4 / 29
        t1: 0.206896552,  // 6 / 29
        t2: 0.12841855,   // 3 * t1 * t1
        t3: 0.008856452,  // t1 * t1 * t1
    };

    var LAB_CONSTANTS$3 = labConstants;
    var unpack$h = utils.unpack;
    var pow$a = Math.pow;

    var rgb2lab$2 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var ref = unpack$h(args, 'rgb');
        var r = ref[0];
        var g = ref[1];
        var b = ref[2];
        var ref$1 = rgb2xyz(r,g,b);
        var x = ref$1[0];
        var y = ref$1[1];
        var z = ref$1[2];
        var l = 116 * y - 16;
        return [l < 0 ? 0 : l, 500 * (x - y), 200 * (y - z)];
    };

    var rgb_xyz = function (r) {
        if ((r /= 255) <= 0.04045) { return r / 12.92; }
        return pow$a((r + 0.055) / 1.055, 2.4);
    };

    var xyz_lab = function (t) {
        if (t > LAB_CONSTANTS$3.t3) { return pow$a(t, 1 / 3); }
        return t / LAB_CONSTANTS$3.t2 + LAB_CONSTANTS$3.t0;
    };

    var rgb2xyz = function (r,g,b) {
        r = rgb_xyz(r);
        g = rgb_xyz(g);
        b = rgb_xyz(b);
        var x = xyz_lab((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / LAB_CONSTANTS$3.Xn);
        var y = xyz_lab((0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / LAB_CONSTANTS$3.Yn);
        var z = xyz_lab((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / LAB_CONSTANTS$3.Zn);
        return [x,y,z];
    };

    var rgb2lab_1 = rgb2lab$2;

    var LAB_CONSTANTS$2 = labConstants;
    var unpack$g = utils.unpack;
    var pow$9 = Math.pow;

    /*
     * L* [0..100]
     * a [-100..100]
     * b [-100..100]
     */
    var lab2rgb$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        args = unpack$g(args, 'lab');
        var l = args[0];
        var a = args[1];
        var b = args[2];
        var x,y,z, r,g,b_;

        y = (l + 16) / 116;
        x = isNaN(a) ? y : y + a / 500;
        z = isNaN(b) ? y : y - b / 200;

        y = LAB_CONSTANTS$2.Yn * lab_xyz(y);
        x = LAB_CONSTANTS$2.Xn * lab_xyz(x);
        z = LAB_CONSTANTS$2.Zn * lab_xyz(z);

        r = xyz_rgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z);  // D65 -> sRGB
        g = xyz_rgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z);
        b_ = xyz_rgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z);

        return [r,g,b_,args.length > 3 ? args[3] : 1];
    };

    var xyz_rgb = function (r) {
        return 255 * (r <= 0.00304 ? 12.92 * r : 1.055 * pow$9(r, 1 / 2.4) - 0.055)
    };

    var lab_xyz = function (t) {
        return t > LAB_CONSTANTS$2.t1 ? t * t * t : LAB_CONSTANTS$2.t2 * (t - LAB_CONSTANTS$2.t0)
    };

    var lab2rgb_1 = lab2rgb$1;

    var unpack$f = utils.unpack;
    var type$e = utils.type;
    var chroma$b = chroma_1;
    var Color$u = Color_1;
    var input$7 = input$h;

    var rgb2lab$1 = rgb2lab_1;

    Color$u.prototype.lab = function() {
        return rgb2lab$1(this._rgb);
    };

    chroma$b.lab = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$u, [ null ].concat( args, ['lab']) ));
    };

    input$7.format.lab = lab2rgb_1;

    input$7.autodetect.push({
        p: 2,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack$f(args, 'lab');
            if (type$e(args) === 'array' && args.length === 3) {
                return 'lab';
            }
        }
    });

    var unpack$e = utils.unpack;
    var RAD2DEG = utils.RAD2DEG;
    var sqrt$3 = Math.sqrt;
    var atan2$2 = Math.atan2;
    var round$2 = Math.round;

    var lab2lch$2 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var ref = unpack$e(args, 'lab');
        var l = ref[0];
        var a = ref[1];
        var b = ref[2];
        var c = sqrt$3(a * a + b * b);
        var h = (atan2$2(b, a) * RAD2DEG + 360) % 360;
        if (round$2(c*10000) === 0) { h = Number.NaN; }
        return [l, c, h];
    };

    var lab2lch_1 = lab2lch$2;

    var unpack$d = utils.unpack;
    var rgb2lab = rgb2lab_1;
    var lab2lch$1 = lab2lch_1;

    var rgb2lch$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var ref = unpack$d(args, 'rgb');
        var r = ref[0];
        var g = ref[1];
        var b = ref[2];
        var ref$1 = rgb2lab(r,g,b);
        var l = ref$1[0];
        var a = ref$1[1];
        var b_ = ref$1[2];
        return lab2lch$1(l,a,b_);
    };

    var rgb2lch_1 = rgb2lch$1;

    var unpack$c = utils.unpack;
    var DEG2RAD = utils.DEG2RAD;
    var sin$3 = Math.sin;
    var cos$3 = Math.cos;

    var lch2lab$2 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        /*
        Convert from a qualitative parameter h and a quantitative parameter l to a 24-bit pixel.
        These formulas were invented by David Dalrymple to obtain maximum contrast without going
        out of gamut if the parameters are in the range 0-1.

        A saturation multiplier was added by Gregor Aisch
        */
        var ref = unpack$c(args, 'lch');
        var l = ref[0];
        var c = ref[1];
        var h = ref[2];
        if (isNaN(h)) { h = 0; }
        h = h * DEG2RAD;
        return [l, cos$3(h) * c, sin$3(h) * c]
    };

    var lch2lab_1 = lch2lab$2;

    var unpack$b = utils.unpack;
    var lch2lab$1 = lch2lab_1;
    var lab2rgb = lab2rgb_1;

    var lch2rgb$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        args = unpack$b(args, 'lch');
        var l = args[0];
        var c = args[1];
        var h = args[2];
        var ref = lch2lab$1 (l,c,h);
        var L = ref[0];
        var a = ref[1];
        var b_ = ref[2];
        var ref$1 = lab2rgb (L,a,b_);
        var r = ref$1[0];
        var g = ref$1[1];
        var b = ref$1[2];
        return [r, g, b, args.length > 3 ? args[3] : 1];
    };

    var lch2rgb_1 = lch2rgb$1;

    var unpack$a = utils.unpack;
    var lch2rgb = lch2rgb_1;

    var hcl2rgb = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var hcl = unpack$a(args, 'hcl').reverse();
        return lch2rgb.apply(void 0, hcl);
    };

    var hcl2rgb_1 = hcl2rgb;

    var unpack$9 = utils.unpack;
    var type$d = utils.type;
    var chroma$a = chroma_1;
    var Color$t = Color_1;
    var input$6 = input$h;

    var rgb2lch = rgb2lch_1;

    Color$t.prototype.lch = function() { return rgb2lch(this._rgb); };
    Color$t.prototype.hcl = function() { return rgb2lch(this._rgb).reverse(); };

    chroma$a.lch = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$t, [ null ].concat( args, ['lch']) ));
    };
    chroma$a.hcl = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$t, [ null ].concat( args, ['hcl']) ));
    };

    input$6.format.lch = lch2rgb_1;
    input$6.format.hcl = hcl2rgb_1;

    ['lch','hcl'].forEach(function (m) { return input$6.autodetect.push({
        p: 2,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack$9(args, m);
            if (type$d(args) === 'array' && args.length === 3) {
                return m;
            }
        }
    }); });

    /**
    	X11 color names

    	http://www.w3.org/TR/css3-color/#svg-color
    */

    var w3cx11$1 = {
        aliceblue: '#f0f8ff',
        antiquewhite: '#faebd7',
        aqua: '#00ffff',
        aquamarine: '#7fffd4',
        azure: '#f0ffff',
        beige: '#f5f5dc',
        bisque: '#ffe4c4',
        black: '#000000',
        blanchedalmond: '#ffebcd',
        blue: '#0000ff',
        blueviolet: '#8a2be2',
        brown: '#a52a2a',
        burlywood: '#deb887',
        cadetblue: '#5f9ea0',
        chartreuse: '#7fff00',
        chocolate: '#d2691e',
        coral: '#ff7f50',
        cornflower: '#6495ed',
        cornflowerblue: '#6495ed',
        cornsilk: '#fff8dc',
        crimson: '#dc143c',
        cyan: '#00ffff',
        darkblue: '#00008b',
        darkcyan: '#008b8b',
        darkgoldenrod: '#b8860b',
        darkgray: '#a9a9a9',
        darkgreen: '#006400',
        darkgrey: '#a9a9a9',
        darkkhaki: '#bdb76b',
        darkmagenta: '#8b008b',
        darkolivegreen: '#556b2f',
        darkorange: '#ff8c00',
        darkorchid: '#9932cc',
        darkred: '#8b0000',
        darksalmon: '#e9967a',
        darkseagreen: '#8fbc8f',
        darkslateblue: '#483d8b',
        darkslategray: '#2f4f4f',
        darkslategrey: '#2f4f4f',
        darkturquoise: '#00ced1',
        darkviolet: '#9400d3',
        deeppink: '#ff1493',
        deepskyblue: '#00bfff',
        dimgray: '#696969',
        dimgrey: '#696969',
        dodgerblue: '#1e90ff',
        firebrick: '#b22222',
        floralwhite: '#fffaf0',
        forestgreen: '#228b22',
        fuchsia: '#ff00ff',
        gainsboro: '#dcdcdc',
        ghostwhite: '#f8f8ff',
        gold: '#ffd700',
        goldenrod: '#daa520',
        gray: '#808080',
        green: '#008000',
        greenyellow: '#adff2f',
        grey: '#808080',
        honeydew: '#f0fff0',
        hotpink: '#ff69b4',
        indianred: '#cd5c5c',
        indigo: '#4b0082',
        ivory: '#fffff0',
        khaki: '#f0e68c',
        laserlemon: '#ffff54',
        lavender: '#e6e6fa',
        lavenderblush: '#fff0f5',
        lawngreen: '#7cfc00',
        lemonchiffon: '#fffacd',
        lightblue: '#add8e6',
        lightcoral: '#f08080',
        lightcyan: '#e0ffff',
        lightgoldenrod: '#fafad2',
        lightgoldenrodyellow: '#fafad2',
        lightgray: '#d3d3d3',
        lightgreen: '#90ee90',
        lightgrey: '#d3d3d3',
        lightpink: '#ffb6c1',
        lightsalmon: '#ffa07a',
        lightseagreen: '#20b2aa',
        lightskyblue: '#87cefa',
        lightslategray: '#778899',
        lightslategrey: '#778899',
        lightsteelblue: '#b0c4de',
        lightyellow: '#ffffe0',
        lime: '#00ff00',
        limegreen: '#32cd32',
        linen: '#faf0e6',
        magenta: '#ff00ff',
        maroon: '#800000',
        maroon2: '#7f0000',
        maroon3: '#b03060',
        mediumaquamarine: '#66cdaa',
        mediumblue: '#0000cd',
        mediumorchid: '#ba55d3',
        mediumpurple: '#9370db',
        mediumseagreen: '#3cb371',
        mediumslateblue: '#7b68ee',
        mediumspringgreen: '#00fa9a',
        mediumturquoise: '#48d1cc',
        mediumvioletred: '#c71585',
        midnightblue: '#191970',
        mintcream: '#f5fffa',
        mistyrose: '#ffe4e1',
        moccasin: '#ffe4b5',
        navajowhite: '#ffdead',
        navy: '#000080',
        oldlace: '#fdf5e6',
        olive: '#808000',
        olivedrab: '#6b8e23',
        orange: '#ffa500',
        orangered: '#ff4500',
        orchid: '#da70d6',
        palegoldenrod: '#eee8aa',
        palegreen: '#98fb98',
        paleturquoise: '#afeeee',
        palevioletred: '#db7093',
        papayawhip: '#ffefd5',
        peachpuff: '#ffdab9',
        peru: '#cd853f',
        pink: '#ffc0cb',
        plum: '#dda0dd',
        powderblue: '#b0e0e6',
        purple: '#800080',
        purple2: '#7f007f',
        purple3: '#a020f0',
        rebeccapurple: '#663399',
        red: '#ff0000',
        rosybrown: '#bc8f8f',
        royalblue: '#4169e1',
        saddlebrown: '#8b4513',
        salmon: '#fa8072',
        sandybrown: '#f4a460',
        seagreen: '#2e8b57',
        seashell: '#fff5ee',
        sienna: '#a0522d',
        silver: '#c0c0c0',
        skyblue: '#87ceeb',
        slateblue: '#6a5acd',
        slategray: '#708090',
        slategrey: '#708090',
        snow: '#fffafa',
        springgreen: '#00ff7f',
        steelblue: '#4682b4',
        tan: '#d2b48c',
        teal: '#008080',
        thistle: '#d8bfd8',
        tomato: '#ff6347',
        turquoise: '#40e0d0',
        violet: '#ee82ee',
        wheat: '#f5deb3',
        white: '#ffffff',
        whitesmoke: '#f5f5f5',
        yellow: '#ffff00',
        yellowgreen: '#9acd32'
    };

    var w3cx11_1 = w3cx11$1;

    var Color$s = Color_1;
    var input$5 = input$h;
    var type$c = utils.type;

    var w3cx11 = w3cx11_1;
    var hex2rgb = hex2rgb_1;
    var rgb2hex = rgb2hex_1;

    Color$s.prototype.name = function() {
        var hex = rgb2hex(this._rgb, 'rgb');
        for (var i = 0, list = Object.keys(w3cx11); i < list.length; i += 1) {
            var n = list[i];

            if (w3cx11[n] === hex) { return n.toLowerCase(); }
        }
        return hex;
    };

    input$5.format.named = function (name) {
        name = name.toLowerCase();
        if (w3cx11[name]) { return hex2rgb(w3cx11[name]); }
        throw new Error('unknown color name: '+name);
    };

    input$5.autodetect.push({
        p: 5,
        test: function (h) {
            var rest = [], len = arguments.length - 1;
            while ( len-- > 0 ) rest[ len ] = arguments[ len + 1 ];

            if (!rest.length && type$c(h) === 'string' && w3cx11[h.toLowerCase()]) {
                return 'named';
            }
        }
    });

    var unpack$8 = utils.unpack;

    var rgb2num$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var ref = unpack$8(args, 'rgb');
        var r = ref[0];
        var g = ref[1];
        var b = ref[2];
        return (r << 16) + (g << 8) + b;
    };

    var rgb2num_1 = rgb2num$1;

    var type$b = utils.type;

    var num2rgb = function (num) {
        if (type$b(num) == "number" && num >= 0 && num <= 0xFFFFFF) {
            var r = num >> 16;
            var g = (num >> 8) & 0xFF;
            var b = num & 0xFF;
            return [r,g,b,1];
        }
        throw new Error("unknown num color: "+num);
    };

    var num2rgb_1 = num2rgb;

    var chroma$9 = chroma_1;
    var Color$r = Color_1;
    var input$4 = input$h;
    var type$a = utils.type;

    var rgb2num = rgb2num_1;

    Color$r.prototype.num = function() {
        return rgb2num(this._rgb);
    };

    chroma$9.num = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$r, [ null ].concat( args, ['num']) ));
    };

    input$4.format.num = num2rgb_1;

    input$4.autodetect.push({
        p: 5,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            if (args.length === 1 && type$a(args[0]) === 'number' && args[0] >= 0 && args[0] <= 0xFFFFFF) {
                return 'num';
            }
        }
    });

    var chroma$8 = chroma_1;
    var Color$q = Color_1;
    var input$3 = input$h;
    var unpack$7 = utils.unpack;
    var type$9 = utils.type;
    var round$1 = Math.round;

    Color$q.prototype.rgb = function(rnd) {
        if ( rnd === void 0 ) rnd=true;

        if (rnd === false) { return this._rgb.slice(0,3); }
        return this._rgb.slice(0,3).map(round$1);
    };

    Color$q.prototype.rgba = function(rnd) {
        if ( rnd === void 0 ) rnd=true;

        return this._rgb.slice(0,4).map(function (v,i) {
            return i<3 ? (rnd === false ? v : round$1(v)) : v;
        });
    };

    chroma$8.rgb = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$q, [ null ].concat( args, ['rgb']) ));
    };

    input$3.format.rgb = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var rgba = unpack$7(args, 'rgba');
        if (rgba[3] === undefined) { rgba[3] = 1; }
        return rgba;
    };

    input$3.autodetect.push({
        p: 3,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack$7(args, 'rgba');
            if (type$9(args) === 'array' && (args.length === 3 ||
                args.length === 4 && type$9(args[3]) == 'number' && args[3] >= 0 && args[3] <= 1)) {
                return 'rgb';
            }
        }
    });

    /*
     * Based on implementation by Neil Bartlett
     * https://github.com/neilbartlett/color-temperature
     */

    var log$1 = Math.log;

    var temperature2rgb$1 = function (kelvin) {
        var temp = kelvin / 100;
        var r,g,b;
        if (temp < 66) {
            r = 255;
            g = temp < 6 ? 0 : -155.25485562709179 - 0.44596950469579133 * (g = temp-2) + 104.49216199393888 * log$1(g);
            b = temp < 20 ? 0 : -254.76935184120902 + 0.8274096064007395 * (b = temp-10) + 115.67994401066147 * log$1(b);
        } else {
            r = 351.97690566805693 + 0.114206453784165 * (r = temp-55) - 40.25366309332127 * log$1(r);
            g = 325.4494125711974 + 0.07943456536662342 * (g = temp-50) - 28.0852963507957 * log$1(g);
            b = 255;
        }
        return [r,g,b,1];
    };

    var temperature2rgb_1 = temperature2rgb$1;

    /*
     * Based on implementation by Neil Bartlett
     * https://github.com/neilbartlett/color-temperature
     **/

    var temperature2rgb = temperature2rgb_1;
    var unpack$6 = utils.unpack;
    var round = Math.round;

    var rgb2temperature$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var rgb = unpack$6(args, 'rgb');
        var r = rgb[0], b = rgb[2];
        var minTemp = 1000;
        var maxTemp = 40000;
        var eps = 0.4;
        var temp;
        while (maxTemp - minTemp > eps) {
            temp = (maxTemp + minTemp) * 0.5;
            var rgb$1 = temperature2rgb(temp);
            if ((rgb$1[2] / rgb$1[0]) >= (b / r)) {
                maxTemp = temp;
            } else {
                minTemp = temp;
            }
        }
        return round(temp);
    };

    var rgb2temperature_1 = rgb2temperature$1;

    var chroma$7 = chroma_1;
    var Color$p = Color_1;
    var input$2 = input$h;

    var rgb2temperature = rgb2temperature_1;

    Color$p.prototype.temp =
    Color$p.prototype.kelvin =
    Color$p.prototype.temperature = function() {
        return rgb2temperature(this._rgb);
    };

    chroma$7.temp =
    chroma$7.kelvin =
    chroma$7.temperature = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$p, [ null ].concat( args, ['temp']) ));
    };

    input$2.format.temp =
    input$2.format.kelvin =
    input$2.format.temperature = temperature2rgb_1;

    var unpack$5 = utils.unpack;
    var cbrt = Math.cbrt;
    var pow$8 = Math.pow;
    var sign$1 = Math.sign;

    var rgb2oklab$2 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        // OKLab color space implementation taken from
        // https://bottosson.github.io/posts/oklab/
        var ref = unpack$5(args, 'rgb');
        var r = ref[0];
        var g = ref[1];
        var b = ref[2];
        var ref$1 = [rgb2lrgb(r / 255), rgb2lrgb(g / 255), rgb2lrgb(b / 255)];
        var lr = ref$1[0];
        var lg = ref$1[1];
        var lb = ref$1[2];
        var l = cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
        var m = cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
        var s = cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

        return [
            0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
        ];
    };

    var rgb2oklab_1 = rgb2oklab$2;

    function rgb2lrgb(c) {
        var abs = Math.abs(c);
        if (abs < 0.04045) {
            return c / 12.92;
        }
        return (sign$1(c) || 1) * pow$8((abs + 0.055) / 1.055, 2.4);
    }

    var unpack$4 = utils.unpack;
    var pow$7 = Math.pow;
    var sign = Math.sign;

    /*
     * L* [0..100]
     * a [-100..100]
     * b [-100..100]
     */
    var oklab2rgb$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        args = unpack$4(args, 'lab');
        var L = args[0];
        var a = args[1];
        var b = args[2];

        var l = pow$7(L + 0.3963377774 * a + 0.2158037573 * b, 3);
        var m = pow$7(L - 0.1055613458 * a - 0.0638541728 * b, 3);
        var s = pow$7(L - 0.0894841775 * a - 1.291485548 * b, 3);

        return [
            255 * lrgb2rgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            255 * lrgb2rgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            255 * lrgb2rgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
            args.length > 3 ? args[3] : 1
        ];
    };

    var oklab2rgb_1 = oklab2rgb$1;

    function lrgb2rgb(c) {
        var abs = Math.abs(c);
        if (abs > 0.0031308) {
            return (sign(c) || 1) * (1.055 * pow$7(abs, 1 / 2.4) - 0.055);
        }
        return c * 12.92;
    }

    var unpack$3 = utils.unpack;
    var type$8 = utils.type;
    var chroma$6 = chroma_1;
    var Color$o = Color_1;
    var input$1 = input$h;

    var rgb2oklab$1 = rgb2oklab_1;

    Color$o.prototype.oklab = function () {
        return rgb2oklab$1(this._rgb);
    };

    chroma$6.oklab = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$o, [ null ].concat( args, ['oklab']) ));
    };

    input$1.format.oklab = oklab2rgb_1;

    input$1.autodetect.push({
        p: 3,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack$3(args, 'oklab');
            if (type$8(args) === 'array' && args.length === 3) {
                return 'oklab';
            }
        }
    });

    var unpack$2 = utils.unpack;
    var rgb2oklab = rgb2oklab_1;
    var lab2lch = lab2lch_1;

    var rgb2oklch$1 = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        var ref = unpack$2(args, 'rgb');
        var r = ref[0];
        var g = ref[1];
        var b = ref[2];
        var ref$1 = rgb2oklab(r, g, b);
        var l = ref$1[0];
        var a = ref$1[1];
        var b_ = ref$1[2];
        return lab2lch(l, a, b_);
    };

    var rgb2oklch_1 = rgb2oklch$1;

    var unpack$1 = utils.unpack;
    var lch2lab = lch2lab_1;
    var oklab2rgb = oklab2rgb_1;

    var oklch2rgb = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        args = unpack$1(args, 'lch');
        var l = args[0];
        var c = args[1];
        var h = args[2];
        var ref = lch2lab(l, c, h);
        var L = ref[0];
        var a = ref[1];
        var b_ = ref[2];
        var ref$1 = oklab2rgb(L, a, b_);
        var r = ref$1[0];
        var g = ref$1[1];
        var b = ref$1[2];
        return [r, g, b, args.length > 3 ? args[3] : 1];
    };

    var oklch2rgb_1 = oklch2rgb;

    var unpack = utils.unpack;
    var type$7 = utils.type;
    var chroma$5 = chroma_1;
    var Color$n = Color_1;
    var input = input$h;

    var rgb2oklch = rgb2oklch_1;

    Color$n.prototype.oklch = function () {
        return rgb2oklch(this._rgb);
    };

    chroma$5.oklch = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        return new (Function.prototype.bind.apply( Color$n, [ null ].concat( args, ['oklch']) ));
    };

    input.format.oklch = oklch2rgb_1;

    input.autodetect.push({
        p: 3,
        test: function () {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            args = unpack(args, 'oklch');
            if (type$7(args) === 'array' && args.length === 3) {
                return 'oklch';
            }
        }
    });

    var Color$m = Color_1;
    var type$6 = utils.type;

    Color$m.prototype.alpha = function(a, mutate) {
        if ( mutate === void 0 ) mutate=false;

        if (a !== undefined && type$6(a) === 'number') {
            if (mutate) {
                this._rgb[3] = a;
                return this;
            }
            return new Color$m([this._rgb[0], this._rgb[1], this._rgb[2], a], 'rgb');
        }
        return this._rgb[3];
    };

    var Color$l = Color_1;

    Color$l.prototype.clipped = function() {
        return this._rgb._clipped || false;
    };

    var Color$k = Color_1;
    var LAB_CONSTANTS$1 = labConstants;

    Color$k.prototype.darken = function(amount) {
    	if ( amount === void 0 ) amount=1;

    	var me = this;
    	var lab = me.lab();
    	lab[0] -= LAB_CONSTANTS$1.Kn * amount;
    	return new Color$k(lab, 'lab').alpha(me.alpha(), true);
    };

    Color$k.prototype.brighten = function(amount) {
    	if ( amount === void 0 ) amount=1;

    	return this.darken(-amount);
    };

    Color$k.prototype.darker = Color$k.prototype.darken;
    Color$k.prototype.brighter = Color$k.prototype.brighten;

    var Color$j = Color_1;

    Color$j.prototype.get = function (mc) {
        var ref = mc.split('.');
        var mode = ref[0];
        var channel = ref[1];
        var src = this[mode]();
        if (channel) {
            var i = mode.indexOf(channel) - (mode.substr(0, 2) === 'ok' ? 2 : 0);
            if (i > -1) { return src[i]; }
            throw new Error(("unknown channel " + channel + " in mode " + mode));
        } else {
            return src;
        }
    };

    var Color$i = Color_1;
    var type$5 = utils.type;
    var pow$6 = Math.pow;

    var EPS = 1e-7;
    var MAX_ITER = 20;

    Color$i.prototype.luminance = function(lum) {
        if (lum !== undefined && type$5(lum) === 'number') {
            if (lum === 0) {
                // return pure black
                return new Color$i([0,0,0,this._rgb[3]], 'rgb');
            }
            if (lum === 1) {
                // return pure white
                return new Color$i([255,255,255,this._rgb[3]], 'rgb');
            }
            // compute new color using...
            var cur_lum = this.luminance();
            var mode = 'rgb';
            var max_iter = MAX_ITER;

            var test = function (low, high) {
                var mid = low.interpolate(high, 0.5, mode);
                var lm = mid.luminance();
                if (Math.abs(lum - lm) < EPS || !max_iter--) {
                    // close enough
                    return mid;
                }
                return lm > lum ? test(low, mid) : test(mid, high);
            };

            var rgb = (cur_lum > lum ? test(new Color$i([0,0,0]), this) : test(this, new Color$i([255,255,255]))).rgb();
            return new Color$i(rgb.concat( [this._rgb[3]]));
        }
        return rgb2luminance.apply(void 0, (this._rgb).slice(0,3));
    };


    var rgb2luminance = function (r,g,b) {
        // relative luminance
        // see http://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
        r = luminance_x(r);
        g = luminance_x(g);
        b = luminance_x(b);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    var luminance_x = function (x) {
        x /= 255;
        return x <= 0.03928 ? x/12.92 : pow$6((x+0.055)/1.055, 2.4);
    };

    var interpolator$1 = {};

    var Color$h = Color_1;
    var type$4 = utils.type;
    var interpolator = interpolator$1;

    var mix$1 = function (col1, col2, f) {
        if ( f === void 0 ) f=0.5;
        var rest = [], len = arguments.length - 3;
        while ( len-- > 0 ) rest[ len ] = arguments[ len + 3 ];

        var mode = rest[0] || 'lrgb';
        if (!interpolator[mode] && !rest.length) {
            // fall back to the first supported mode
            mode = Object.keys(interpolator)[0];
        }
        if (!interpolator[mode]) {
            throw new Error(("interpolation mode " + mode + " is not defined"));
        }
        if (type$4(col1) !== 'object') { col1 = new Color$h(col1); }
        if (type$4(col2) !== 'object') { col2 = new Color$h(col2); }
        return interpolator[mode](col1, col2, f)
            .alpha(col1.alpha() + f * (col2.alpha() - col1.alpha()));
    };

    var Color$g = Color_1;
    var mix = mix$1;

    Color$g.prototype.mix =
    Color$g.prototype.interpolate = function(col2, f) {
    	if ( f === void 0 ) f=0.5;
    	var rest = [], len = arguments.length - 2;
    	while ( len-- > 0 ) rest[ len ] = arguments[ len + 2 ];

    	return mix.apply(void 0, [ this, col2, f ].concat( rest ));
    };

    var Color$f = Color_1;

    Color$f.prototype.premultiply = function(mutate) {
    	if ( mutate === void 0 ) mutate=false;

    	var rgb = this._rgb;
    	var a = rgb[3];
    	if (mutate) {
    		this._rgb = [rgb[0]*a, rgb[1]*a, rgb[2]*a, a];
    		return this;
    	} else {
    		return new Color$f([rgb[0]*a, rgb[1]*a, rgb[2]*a, a], 'rgb');
    	}
    };

    var Color$e = Color_1;
    var LAB_CONSTANTS = labConstants;

    Color$e.prototype.saturate = function(amount) {
    	if ( amount === void 0 ) amount=1;

    	var me = this;
    	var lch = me.lch();
    	lch[1] += LAB_CONSTANTS.Kn * amount;
    	if (lch[1] < 0) { lch[1] = 0; }
    	return new Color$e(lch, 'lch').alpha(me.alpha(), true);
    };

    Color$e.prototype.desaturate = function(amount) {
    	if ( amount === void 0 ) amount=1;

    	return this.saturate(-amount);
    };

    var Color$d = Color_1;
    var type$3 = utils.type;

    Color$d.prototype.set = function (mc, value, mutate) {
        if ( mutate === void 0 ) mutate = false;

        var ref = mc.split('.');
        var mode = ref[0];
        var channel = ref[1];
        var src = this[mode]();
        if (channel) {
            var i = mode.indexOf(channel) - (mode.substr(0, 2) === 'ok' ? 2 : 0);
            if (i > -1) {
                if (type$3(value) == 'string') {
                    switch (value.charAt(0)) {
                        case '+':
                            src[i] += +value;
                            break;
                        case '-':
                            src[i] += +value;
                            break;
                        case '*':
                            src[i] *= +value.substr(1);
                            break;
                        case '/':
                            src[i] /= +value.substr(1);
                            break;
                        default:
                            src[i] = +value;
                    }
                } else if (type$3(value) === 'number') {
                    src[i] = value;
                } else {
                    throw new Error("unsupported value for Color.set");
                }
                var out = new Color$d(src, mode);
                if (mutate) {
                    this._rgb = out._rgb;
                    return this;
                }
                return out;
            }
            throw new Error(("unknown channel " + channel + " in mode " + mode));
        } else {
            return src;
        }
    };

    var Color$c = Color_1;

    var rgb = function (col1, col2, f) {
        var xyz0 = col1._rgb;
        var xyz1 = col2._rgb;
        return new Color$c(
            xyz0[0] + f * (xyz1[0]-xyz0[0]),
            xyz0[1] + f * (xyz1[1]-xyz0[1]),
            xyz0[2] + f * (xyz1[2]-xyz0[2]),
            'rgb'
        )
    };

    // register interpolator
    interpolator$1.rgb = rgb;

    var Color$b = Color_1;
    var sqrt$2 = Math.sqrt;
    var pow$5 = Math.pow;

    var lrgb = function (col1, col2, f) {
        var ref = col1._rgb;
        var x1 = ref[0];
        var y1 = ref[1];
        var z1 = ref[2];
        var ref$1 = col2._rgb;
        var x2 = ref$1[0];
        var y2 = ref$1[1];
        var z2 = ref$1[2];
        return new Color$b(
            sqrt$2(pow$5(x1,2) * (1-f) + pow$5(x2,2) * f),
            sqrt$2(pow$5(y1,2) * (1-f) + pow$5(y2,2) * f),
            sqrt$2(pow$5(z1,2) * (1-f) + pow$5(z2,2) * f),
            'rgb'
        )
    };

    // register interpolator
    interpolator$1.lrgb = lrgb;

    var Color$a = Color_1;

    var lab = function (col1, col2, f) {
        var xyz0 = col1.lab();
        var xyz1 = col2.lab();
        return new Color$a(
            xyz0[0] + f * (xyz1[0]-xyz0[0]),
            xyz0[1] + f * (xyz1[1]-xyz0[1]),
            xyz0[2] + f * (xyz1[2]-xyz0[2]),
            'lab'
        )
    };

    // register interpolator
    interpolator$1.lab = lab;

    var Color$9 = Color_1;

    var _hsx = function (col1, col2, f, m) {
        var assign, assign$1;

        var xyz0, xyz1;
        if (m === 'hsl') {
            xyz0 = col1.hsl();
            xyz1 = col2.hsl();
        } else if (m === 'hsv') {
            xyz0 = col1.hsv();
            xyz1 = col2.hsv();
        } else if (m === 'hcg') {
            xyz0 = col1.hcg();
            xyz1 = col2.hcg();
        } else if (m === 'hsi') {
            xyz0 = col1.hsi();
            xyz1 = col2.hsi();
        } else if (m === 'lch' || m === 'hcl') {
            m = 'hcl';
            xyz0 = col1.hcl();
            xyz1 = col2.hcl();
        } else if (m === 'oklch') {
            xyz0 = col1.oklch().reverse();
            xyz1 = col2.oklch().reverse();
        }

        var hue0, hue1, sat0, sat1, lbv0, lbv1;
        if (m.substr(0, 1) === 'h' || m === 'oklch') {
            (assign = xyz0, hue0 = assign[0], sat0 = assign[1], lbv0 = assign[2]);
            (assign$1 = xyz1, hue1 = assign$1[0], sat1 = assign$1[1], lbv1 = assign$1[2]);
        }

        var sat, hue, lbv, dh;

        if (!isNaN(hue0) && !isNaN(hue1)) {
            // both colors have hue
            if (hue1 > hue0 && hue1 - hue0 > 180) {
                dh = hue1 - (hue0 + 360);
            } else if (hue1 < hue0 && hue0 - hue1 > 180) {
                dh = hue1 + 360 - hue0;
            } else {
                dh = hue1 - hue0;
            }
            hue = hue0 + f * dh;
        } else if (!isNaN(hue0)) {
            hue = hue0;
            if ((lbv1 == 1 || lbv1 == 0) && m != 'hsv') { sat = sat0; }
        } else if (!isNaN(hue1)) {
            hue = hue1;
            if ((lbv0 == 1 || lbv0 == 0) && m != 'hsv') { sat = sat1; }
        } else {
            hue = Number.NaN;
        }

        if (sat === undefined) { sat = sat0 + f * (sat1 - sat0); }
        lbv = lbv0 + f * (lbv1 - lbv0);
        return m === 'oklch' ? new Color$9([lbv, sat, hue], m) : new Color$9([hue, sat, lbv], m);
    };

    var interpolate_hsx$5 = _hsx;

    var lch = function (col1, col2, f) {
    	return interpolate_hsx$5(col1, col2, f, 'lch');
    };

    // register interpolator
    interpolator$1.lch = lch;
    interpolator$1.hcl = lch;

    var Color$8 = Color_1;

    var num = function (col1, col2, f) {
        var c1 = col1.num();
        var c2 = col2.num();
        return new Color$8(c1 + f * (c2-c1), 'num')
    };

    // register interpolator
    interpolator$1.num = num;

    var interpolate_hsx$4 = _hsx;

    var hcg = function (col1, col2, f) {
    	return interpolate_hsx$4(col1, col2, f, 'hcg');
    };

    // register interpolator
    interpolator$1.hcg = hcg;

    var interpolate_hsx$3 = _hsx;

    var hsi = function (col1, col2, f) {
    	return interpolate_hsx$3(col1, col2, f, 'hsi');
    };

    // register interpolator
    interpolator$1.hsi = hsi;

    var interpolate_hsx$2 = _hsx;

    var hsl = function (col1, col2, f) {
    	return interpolate_hsx$2(col1, col2, f, 'hsl');
    };

    // register interpolator
    interpolator$1.hsl = hsl;

    var interpolate_hsx$1 = _hsx;

    var hsv = function (col1, col2, f) {
    	return interpolate_hsx$1(col1, col2, f, 'hsv');
    };

    // register interpolator
    interpolator$1.hsv = hsv;

    var Color$7 = Color_1;

    var oklab = function (col1, col2, f) {
        var xyz0 = col1.oklab();
        var xyz1 = col2.oklab();
        return new Color$7(
            xyz0[0] + f * (xyz1[0] - xyz0[0]),
            xyz0[1] + f * (xyz1[1] - xyz0[1]),
            xyz0[2] + f * (xyz1[2] - xyz0[2]),
            'oklab'
        );
    };

    // register interpolator
    interpolator$1.oklab = oklab;

    var interpolate_hsx = _hsx;

    var oklch = function (col1, col2, f) {
        return interpolate_hsx(col1, col2, f, 'oklch');
    };

    // register interpolator
    interpolator$1.oklch = oklch;

    var Color$6 = Color_1;
    var clip_rgb$1 = utils.clip_rgb;
    var pow$4 = Math.pow;
    var sqrt$1 = Math.sqrt;
    var PI$1 = Math.PI;
    var cos$2 = Math.cos;
    var sin$2 = Math.sin;
    var atan2$1 = Math.atan2;

    var average = function (colors, mode, weights) {
        if ( mode === void 0 ) mode='lrgb';
        if ( weights === void 0 ) weights=null;

        var l = colors.length;
        if (!weights) { weights = Array.from(new Array(l)).map(function () { return 1; }); }
        // normalize weights
        var k = l / weights.reduce(function(a, b) { return a + b; });
        weights.forEach(function (w,i) { weights[i] *= k; });
        // convert colors to Color objects
        colors = colors.map(function (c) { return new Color$6(c); });
        if (mode === 'lrgb') {
            return _average_lrgb(colors, weights)
        }
        var first = colors.shift();
        var xyz = first.get(mode);
        var cnt = [];
        var dx = 0;
        var dy = 0;
        // initial color
        for (var i=0; i<xyz.length; i++) {
            xyz[i] = (xyz[i] || 0) * weights[0];
            cnt.push(isNaN(xyz[i]) ? 0 : weights[0]);
            if (mode.charAt(i) === 'h' && !isNaN(xyz[i])) {
                var A = xyz[i] / 180 * PI$1;
                dx += cos$2(A) * weights[0];
                dy += sin$2(A) * weights[0];
            }
        }

        var alpha = first.alpha() * weights[0];
        colors.forEach(function (c,ci) {
            var xyz2 = c.get(mode);
            alpha += c.alpha() * weights[ci+1];
            for (var i=0; i<xyz.length; i++) {
                if (!isNaN(xyz2[i])) {
                    cnt[i] += weights[ci+1];
                    if (mode.charAt(i) === 'h') {
                        var A = xyz2[i] / 180 * PI$1;
                        dx += cos$2(A) * weights[ci+1];
                        dy += sin$2(A) * weights[ci+1];
                    } else {
                        xyz[i] += xyz2[i] * weights[ci+1];
                    }
                }
            }
        });

        for (var i$1=0; i$1<xyz.length; i$1++) {
            if (mode.charAt(i$1) === 'h') {
                var A$1 = atan2$1(dy / cnt[i$1], dx / cnt[i$1]) / PI$1 * 180;
                while (A$1 < 0) { A$1 += 360; }
                while (A$1 >= 360) { A$1 -= 360; }
                xyz[i$1] = A$1;
            } else {
                xyz[i$1] = xyz[i$1]/cnt[i$1];
            }
        }
        alpha /= l;
        return (new Color$6(xyz, mode)).alpha(alpha > 0.99999 ? 1 : alpha, true);
    };


    var _average_lrgb = function (colors, weights) {
        var l = colors.length;
        var xyz = [0,0,0,0];
        for (var i=0; i < colors.length; i++) {
            var col = colors[i];
            var f = weights[i] / l;
            var rgb = col._rgb;
            xyz[0] += pow$4(rgb[0],2) * f;
            xyz[1] += pow$4(rgb[1],2) * f;
            xyz[2] += pow$4(rgb[2],2) * f;
            xyz[3] += rgb[3] * f;
        }
        xyz[0] = sqrt$1(xyz[0]);
        xyz[1] = sqrt$1(xyz[1]);
        xyz[2] = sqrt$1(xyz[2]);
        if (xyz[3] > 0.9999999) { xyz[3] = 1; }
        return new Color$6(clip_rgb$1(xyz));
    };

    // minimal multi-purpose interface

    // @requires utils color analyze

    var chroma$4 = chroma_1;
    var type$2 = utils.type;

    var pow$3 = Math.pow;

    var scale$2 = function(colors) {

        // constructor
        var _mode = 'rgb';
        var _nacol = chroma$4('#ccc');
        var _spread = 0;
        // const _fixed = false;
        var _domain = [0, 1];
        var _pos = [];
        var _padding = [0,0];
        var _classes = false;
        var _colors = [];
        var _out = false;
        var _min = 0;
        var _max = 1;
        var _correctLightness = false;
        var _colorCache = {};
        var _useCache = true;
        var _gamma = 1;

        // private methods

        var setColors = function(colors) {
            colors = colors || ['#fff', '#000'];
            if (colors && type$2(colors) === 'string' && chroma$4.brewer &&
                chroma$4.brewer[colors.toLowerCase()]) {
                colors = chroma$4.brewer[colors.toLowerCase()];
            }
            if (type$2(colors) === 'array') {
                // handle single color
                if (colors.length === 1) {
                    colors = [colors[0], colors[0]];
                }
                // make a copy of the colors
                colors = colors.slice(0);
                // convert to chroma classes
                for (var c=0; c<colors.length; c++) {
                    colors[c] = chroma$4(colors[c]);
                }
                // auto-fill color position
                _pos.length = 0;
                for (var c$1=0; c$1<colors.length; c$1++) {
                    _pos.push(c$1/(colors.length-1));
                }
            }
            resetCache();
            return _colors = colors;
        };

        var getClass = function(value) {
            if (_classes != null) {
                var n = _classes.length-1;
                var i = 0;
                while (i < n && value >= _classes[i]) {
                    i++;
                }
                return i-1;
            }
            return 0;
        };

        var tMapLightness = function (t) { return t; };
        var tMapDomain = function (t) { return t; };

        // const classifyValue = function(value) {
        //     let val = value;
        //     if (_classes.length > 2) {
        //         const n = _classes.length-1;
        //         const i = getClass(value);
        //         const minc = _classes[0] + ((_classes[1]-_classes[0]) * (0 + (_spread * 0.5)));  // center of 1st class
        //         const maxc = _classes[n-1] + ((_classes[n]-_classes[n-1]) * (1 - (_spread * 0.5)));  // center of last class
        //         val = _min + ((((_classes[i] + ((_classes[i+1] - _classes[i]) * 0.5)) - minc) / (maxc-minc)) * (_max - _min));
        //     }
        //     return val;
        // };

        var getColor = function(val, bypassMap) {
            var col, t;
            if (bypassMap == null) { bypassMap = false; }
            if (isNaN(val) || (val === null)) { return _nacol; }
            if (!bypassMap) {
                if (_classes && (_classes.length > 2)) {
                    // find the class
                    var c = getClass(val);
                    t = c / (_classes.length-2);
                } else if (_max !== _min) {
                    // just interpolate between min/max
                    t = (val - _min) / (_max - _min);
                } else {
                    t = 1;
                }
            } else {
                t = val;
            }

            // domain map
            t = tMapDomain(t);

            if (!bypassMap) {
                t = tMapLightness(t);  // lightness correction
            }

            if (_gamma !== 1) { t = pow$3(t, _gamma); }

            t = _padding[0] + (t * (1 - _padding[0] - _padding[1]));

            t = Math.min(1, Math.max(0, t));

            var k = Math.floor(t * 10000);

            if (_useCache && _colorCache[k]) {
                col = _colorCache[k];
            } else {
                if (type$2(_colors) === 'array') {
                    //for i in [0.._pos.length-1]
                    for (var i=0; i<_pos.length; i++) {
                        var p = _pos[i];
                        if (t <= p) {
                            col = _colors[i];
                            break;
                        }
                        if ((t >= p) && (i === (_pos.length-1))) {
                            col = _colors[i];
                            break;
                        }
                        if (t > p && t < _pos[i+1]) {
                            t = (t-p)/(_pos[i+1]-p);
                            col = chroma$4.interpolate(_colors[i], _colors[i+1], t, _mode);
                            break;
                        }
                    }
                } else if (type$2(_colors) === 'function') {
                    col = _colors(t);
                }
                if (_useCache) { _colorCache[k] = col; }
            }
            return col;
        };

        var resetCache = function () { return _colorCache = {}; };

        setColors(colors);

        // public interface

        var f = function(v) {
            var c = chroma$4(getColor(v));
            if (_out && c[_out]) { return c[_out](); } else { return c; }
        };

        f.classes = function(classes) {
            if (classes != null) {
                if (type$2(classes) === 'array') {
                    _classes = classes;
                    _domain = [classes[0], classes[classes.length-1]];
                } else {
                    var d = chroma$4.analyze(_domain);
                    if (classes === 0) {
                        _classes = [d.min, d.max];
                    } else {
                        _classes = chroma$4.limits(d, 'e', classes);
                    }
                }
                return f;
            }
            return _classes;
        };


        f.domain = function(domain) {
            if (!arguments.length) {
                return _domain;
            }
            _min = domain[0];
            _max = domain[domain.length-1];
            _pos = [];
            var k = _colors.length;
            if ((domain.length === k) && (_min !== _max)) {
                // update positions
                for (var i = 0, list = Array.from(domain); i < list.length; i += 1) {
                    var d = list[i];

                  _pos.push((d-_min) / (_max-_min));
                }
            } else {
                for (var c=0; c<k; c++) {
                    _pos.push(c/(k-1));
                }
                if (domain.length > 2) {
                    // set domain map
                    var tOut = domain.map(function (d,i) { return i/(domain.length-1); });
                    var tBreaks = domain.map(function (d) { return (d - _min) / (_max - _min); });
                    if (!tBreaks.every(function (val, i) { return tOut[i] === val; })) {
                        tMapDomain = function (t) {
                            if (t <= 0 || t >= 1) { return t; }
                            var i = 0;
                            while (t >= tBreaks[i+1]) { i++; }
                            var f = (t - tBreaks[i]) / (tBreaks[i+1] - tBreaks[i]);
                            var out = tOut[i] + f * (tOut[i+1] - tOut[i]);
                            return out;
                        };
                    }

                }
            }
            _domain = [_min, _max];
            return f;
        };

        f.mode = function(_m) {
            if (!arguments.length) {
                return _mode;
            }
            _mode = _m;
            resetCache();
            return f;
        };

        f.range = function(colors, _pos) {
            setColors(colors);
            return f;
        };

        f.out = function(_o) {
            _out = _o;
            return f;
        };

        f.spread = function(val) {
            if (!arguments.length) {
                return _spread;
            }
            _spread = val;
            return f;
        };

        f.correctLightness = function(v) {
            if (v == null) { v = true; }
            _correctLightness = v;
            resetCache();
            if (_correctLightness) {
                tMapLightness = function(t) {
                    var L0 = getColor(0, true).lab()[0];
                    var L1 = getColor(1, true).lab()[0];
                    var pol = L0 > L1;
                    var L_actual = getColor(t, true).lab()[0];
                    var L_ideal = L0 + ((L1 - L0) * t);
                    var L_diff = L_actual - L_ideal;
                    var t0 = 0;
                    var t1 = 1;
                    var max_iter = 20;
                    while ((Math.abs(L_diff) > 1e-2) && (max_iter-- > 0)) {
                        (function() {
                            if (pol) { L_diff *= -1; }
                            if (L_diff < 0) {
                                t0 = t;
                                t += (t1 - t) * 0.5;
                            } else {
                                t1 = t;
                                t += (t0 - t) * 0.5;
                            }
                            L_actual = getColor(t, true).lab()[0];
                            return L_diff = L_actual - L_ideal;
                        })();
                    }
                    return t;
                };
            } else {
                tMapLightness = function (t) { return t; };
            }
            return f;
        };

        f.padding = function(p) {
            if (p != null) {
                if (type$2(p) === 'number') {
                    p = [p,p];
                }
                _padding = p;
                return f;
            } else {
                return _padding;
            }
        };

        f.colors = function(numColors, out) {
            // If no arguments are given, return the original colors that were provided
            if (arguments.length < 2) { out = 'hex'; }
            var result = [];

            if (arguments.length === 0) {
                result = _colors.slice(0);

            } else if (numColors === 1) {
                result = [f(0.5)];

            } else if (numColors > 1) {
                var dm = _domain[0];
                var dd = _domain[1] - dm;
                result = __range__(0, numColors, false).map(function (i) { return f( dm + ((i/(numColors-1)) * dd) ); });

            } else { // returns all colors based on the defined classes
                colors = [];
                var samples = [];
                if (_classes && (_classes.length > 2)) {
                    for (var i = 1, end = _classes.length, asc = 1 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                        samples.push((_classes[i-1]+_classes[i])*0.5);
                    }
                } else {
                    samples = _domain;
                }
                result = samples.map(function (v) { return f(v); });
            }

            if (chroma$4[out]) {
                result = result.map(function (c) { return c[out](); });
            }
            return result;
        };

        f.cache = function(c) {
            if (c != null) {
                _useCache = c;
                return f;
            } else {
                return _useCache;
            }
        };

        f.gamma = function(g) {
            if (g != null) {
                _gamma = g;
                return f;
            } else {
                return _gamma;
            }
        };

        f.nodata = function(d) {
            if (d != null) {
                _nacol = chroma$4(d);
                return f;
            } else {
                return _nacol;
            }
        };

        return f;
    };

    function __range__(left, right, inclusive) {
      var range = [];
      var ascending = left < right;
      var end = !inclusive ? right : ascending ? right + 1 : right - 1;
      for (var i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
        range.push(i);
      }
      return range;
    }

    //
    // interpolates between a set of colors uzing a bezier spline
    //

    // @requires utils lab
    var Color$5 = Color_1;

    var scale$1 = scale$2;

    // nth row of the pascal triangle
    var binom_row = function(n) {
        var row = [1, 1];
        for (var i = 1; i < n; i++) {
            var newrow = [1];
            for (var j = 1; j <= row.length; j++) {
                newrow[j] = (row[j] || 0) + row[j - 1];
            }
            row = newrow;
        }
        return row;
    };

    var bezier = function(colors) {
        var assign, assign$1, assign$2;

        var I, lab0, lab1, lab2;
        colors = colors.map(function (c) { return new Color$5(c); });
        if (colors.length === 2) {
            // linear interpolation
            (assign = colors.map(function (c) { return c.lab(); }), lab0 = assign[0], lab1 = assign[1]);
            I = function(t) {
                var lab = ([0, 1, 2].map(function (i) { return lab0[i] + (t * (lab1[i] - lab0[i])); }));
                return new Color$5(lab, 'lab');
            };
        } else if (colors.length === 3) {
            // quadratic bezier interpolation
            (assign$1 = colors.map(function (c) { return c.lab(); }), lab0 = assign$1[0], lab1 = assign$1[1], lab2 = assign$1[2]);
            I = function(t) {
                var lab = ([0, 1, 2].map(function (i) { return ((1-t)*(1-t) * lab0[i]) + (2 * (1-t) * t * lab1[i]) + (t * t * lab2[i]); }));
                return new Color$5(lab, 'lab');
            };
        } else if (colors.length === 4) {
            // cubic bezier interpolation
            var lab3;
            (assign$2 = colors.map(function (c) { return c.lab(); }), lab0 = assign$2[0], lab1 = assign$2[1], lab2 = assign$2[2], lab3 = assign$2[3]);
            I = function(t) {
                var lab = ([0, 1, 2].map(function (i) { return ((1-t)*(1-t)*(1-t) * lab0[i]) + (3 * (1-t) * (1-t) * t * lab1[i]) + (3 * (1-t) * t * t * lab2[i]) + (t*t*t * lab3[i]); }));
                return new Color$5(lab, 'lab');
            };
        } else if (colors.length >= 5) {
            // general case (degree n bezier)
            var labs, row, n;
            labs = colors.map(function (c) { return c.lab(); });
            n = colors.length - 1;
            row = binom_row(n);
            I = function (t) {
                var u = 1 - t;
                var lab = ([0, 1, 2].map(function (i) { return labs.reduce(function (sum, el, j) { return (sum + row[j] * Math.pow( u, (n - j) ) * Math.pow( t, j ) * el[i]); }, 0); }));
                return new Color$5(lab, 'lab');
            };
        } else {
            throw new RangeError("No point in running bezier with only one color.")
        }
        return I;
    };

    var bezier_1 = function (colors) {
        var f = bezier(colors);
        f.scale = function () { return scale$1(f); };
        return f;
    };

    /*
     * interpolates between a set of colors uzing a bezier spline
     * blend mode formulas taken from http://www.venture-ware.com/kevin/coding/lets-learn-math-photoshop-blend-modes/
     */

    var chroma$3 = chroma_1;

    var blend = function (bottom, top, mode) {
        if (!blend[mode]) {
            throw new Error('unknown blend mode ' + mode);
        }
        return blend[mode](bottom, top);
    };

    var blend_f = function (f) { return function (bottom,top) {
            var c0 = chroma$3(top).rgb();
            var c1 = chroma$3(bottom).rgb();
            return chroma$3.rgb(f(c0, c1));
        }; };

    var each = function (f) { return function (c0, c1) {
            var out = [];
            out[0] = f(c0[0], c1[0]);
            out[1] = f(c0[1], c1[1]);
            out[2] = f(c0[2], c1[2]);
            return out;
        }; };

    var normal = function (a) { return a; };
    var multiply = function (a,b) { return a * b / 255; };
    var darken = function (a,b) { return a > b ? b : a; };
    var lighten = function (a,b) { return a > b ? a : b; };
    var screen = function (a,b) { return 255 * (1 - (1-a/255) * (1-b/255)); };
    var overlay = function (a,b) { return b < 128 ? 2 * a * b / 255 : 255 * (1 - 2 * (1 - a / 255 ) * ( 1 - b / 255 )); };
    var burn = function (a,b) { return 255 * (1 - (1 - b / 255) / (a/255)); };
    var dodge = function (a,b) {
        if (a === 255) { return 255; }
        a = 255 * (b / 255) / (1 - a / 255);
        return a > 255 ? 255 : a
    };

    // # add = (a,b) ->
    // #     if (a + b > 255) then 255 else a + b

    blend.normal = blend_f(each(normal));
    blend.multiply = blend_f(each(multiply));
    blend.screen = blend_f(each(screen));
    blend.overlay = blend_f(each(overlay));
    blend.darken = blend_f(each(darken));
    blend.lighten = blend_f(each(lighten));
    blend.dodge = blend_f(each(dodge));
    blend.burn = blend_f(each(burn));
    // blend.add = blend_f(each(add));

    var blend_1 = blend;

    // cubehelix interpolation
    // based on D.A. Green "A colour scheme for the display of astronomical intensity images"
    // http://astron-soc.in/bulletin/11June/289392011.pdf

    var type$1 = utils.type;
    var clip_rgb = utils.clip_rgb;
    var TWOPI = utils.TWOPI;
    var pow$2 = Math.pow;
    var sin$1 = Math.sin;
    var cos$1 = Math.cos;
    var chroma$2 = chroma_1;

    var cubehelix = function(start, rotations, hue, gamma, lightness) {
        if ( start === void 0 ) start=300;
        if ( rotations === void 0 ) rotations=-1.5;
        if ( hue === void 0 ) hue=1;
        if ( gamma === void 0 ) gamma=1;
        if ( lightness === void 0 ) lightness=[0,1];

        var dh = 0, dl;
        if (type$1(lightness) === 'array') {
            dl = lightness[1] - lightness[0];
        } else {
            dl = 0;
            lightness = [lightness, lightness];
        }

        var f = function(fract) {
            var a = TWOPI * (((start+120)/360) + (rotations * fract));
            var l = pow$2(lightness[0] + (dl * fract), gamma);
            var h = dh !== 0 ? hue[0] + (fract * dh) : hue;
            var amp = (h * l * (1-l)) / 2;
            var cos_a = cos$1(a);
            var sin_a = sin$1(a);
            var r = l + (amp * ((-0.14861 * cos_a) + (1.78277* sin_a)));
            var g = l + (amp * ((-0.29227 * cos_a) - (0.90649* sin_a)));
            var b = l + (amp * (+1.97294 * cos_a));
            return chroma$2(clip_rgb([r*255,g*255,b*255,1]));
        };

        f.start = function(s) {
            if ((s == null)) { return start; }
            start = s;
            return f;
        };

        f.rotations = function(r) {
            if ((r == null)) { return rotations; }
            rotations = r;
            return f;
        };

        f.gamma = function(g) {
            if ((g == null)) { return gamma; }
            gamma = g;
            return f;
        };

        f.hue = function(h) {
            if ((h == null)) { return hue; }
            hue = h;
            if (type$1(hue) === 'array') {
                dh = hue[1] - hue[0];
                if (dh === 0) { hue = hue[1]; }
            } else {
                dh = 0;
            }
            return f;
        };

        f.lightness = function(h) {
            if ((h == null)) { return lightness; }
            if (type$1(h) === 'array') {
                lightness = h;
                dl = h[1] - h[0];
            } else {
                lightness = [h,h];
                dl = 0;
            }
            return f;
        };

        f.scale = function () { return chroma$2.scale(f); };

        f.hue(hue);

        return f;
    };

    var Color$4 = Color_1;
    var digits = '0123456789abcdef';

    var floor$1 = Math.floor;
    var random = Math.random;

    var random_1 = function () {
        var code = '#';
        for (var i=0; i<6; i++) {
            code += digits.charAt(floor$1(random() * 16));
        }
        return new Color$4(code, 'hex');
    };

    var type = type$p;
    var log = Math.log;
    var pow$1 = Math.pow;
    var floor = Math.floor;
    var abs$1 = Math.abs;


    var analyze = function (data, key) {
        if ( key === void 0 ) key=null;

        var r = {
            min: Number.MAX_VALUE,
            max: Number.MAX_VALUE*-1,
            sum: 0,
            values: [],
            count: 0
        };
        if (type(data) === 'object') {
            data = Object.values(data);
        }
        data.forEach(function (val) {
            if (key && type(val) === 'object') { val = val[key]; }
            if (val !== undefined && val !== null && !isNaN(val)) {
                r.values.push(val);
                r.sum += val;
                if (val < r.min) { r.min = val; }
                if (val > r.max) { r.max = val; }
                r.count += 1;
            }
        });

        r.domain = [r.min, r.max];

        r.limits = function (mode, num) { return limits(r, mode, num); };

        return r;
    };


    var limits = function (data, mode, num) {
        if ( mode === void 0 ) mode='equal';
        if ( num === void 0 ) num=7;

        if (type(data) == 'array') {
            data = analyze(data);
        }
        var min = data.min;
        var max = data.max;
        var values = data.values.sort(function (a,b) { return a-b; });

        if (num === 1) { return [min,max]; }

        var limits = [];

        if (mode.substr(0,1) === 'c') { // continuous
            limits.push(min);
            limits.push(max);
        }

        if (mode.substr(0,1) === 'e') { // equal interval
            limits.push(min);
            for (var i=1; i<num; i++) {
                limits.push(min+((i/num)*(max-min)));
            }
            limits.push(max);
        }

        else if (mode.substr(0,1) === 'l') { // log scale
            if (min <= 0) {
                throw new Error('Logarithmic scales are only possible for values > 0');
            }
            var min_log = Math.LOG10E * log(min);
            var max_log = Math.LOG10E * log(max);
            limits.push(min);
            for (var i$1=1; i$1<num; i$1++) {
                limits.push(pow$1(10, min_log + ((i$1/num) * (max_log - min_log))));
            }
            limits.push(max);
        }

        else if (mode.substr(0,1) === 'q') { // quantile scale
            limits.push(min);
            for (var i$2=1; i$2<num; i$2++) {
                var p = ((values.length-1) * i$2)/num;
                var pb = floor(p);
                if (pb === p) {
                    limits.push(values[pb]);
                } else { // p > pb
                    var pr = p - pb;
                    limits.push((values[pb]*(1-pr)) + (values[pb+1]*pr));
                }
            }
            limits.push(max);

        }

        else if (mode.substr(0,1) === 'k') { // k-means clustering
            /*
            implementation based on
            http://code.google.com/p/figue/source/browse/trunk/figue.js#336
            simplified for 1-d input values
            */
            var cluster;
            var n = values.length;
            var assignments = new Array(n);
            var clusterSizes = new Array(num);
            var repeat = true;
            var nb_iters = 0;
            var centroids = null;

            // get seed values
            centroids = [];
            centroids.push(min);
            for (var i$3=1; i$3<num; i$3++) {
                centroids.push(min + ((i$3/num) * (max-min)));
            }
            centroids.push(max);

            while (repeat) {
                // assignment step
                for (var j=0; j<num; j++) {
                    clusterSizes[j] = 0;
                }
                for (var i$4=0; i$4<n; i$4++) {
                    var value = values[i$4];
                    var mindist = Number.MAX_VALUE;
                    var best = (void 0);
                    for (var j$1=0; j$1<num; j$1++) {
                        var dist = abs$1(centroids[j$1]-value);
                        if (dist < mindist) {
                            mindist = dist;
                            best = j$1;
                        }
                        clusterSizes[best]++;
                        assignments[i$4] = best;
                    }
                }

                // update centroids step
                var newCentroids = new Array(num);
                for (var j$2=0; j$2<num; j$2++) {
                    newCentroids[j$2] = null;
                }
                for (var i$5=0; i$5<n; i$5++) {
                    cluster = assignments[i$5];
                    if (newCentroids[cluster] === null) {
                        newCentroids[cluster] = values[i$5];
                    } else {
                        newCentroids[cluster] += values[i$5];
                    }
                }
                for (var j$3=0; j$3<num; j$3++) {
                    newCentroids[j$3] *= 1/clusterSizes[j$3];
                }

                // check convergence
                repeat = false;
                for (var j$4=0; j$4<num; j$4++) {
                    if (newCentroids[j$4] !== centroids[j$4]) {
                        repeat = true;
                        break;
                    }
                }

                centroids = newCentroids;
                nb_iters++;

                if (nb_iters > 200) {
                    repeat = false;
                }
            }

            // finished k-means clustering
            // the next part is borrowed from gabrielflor.it
            var kClusters = {};
            for (var j$5=0; j$5<num; j$5++) {
                kClusters[j$5] = [];
            }
            for (var i$6=0; i$6<n; i$6++) {
                cluster = assignments[i$6];
                kClusters[cluster].push(values[i$6]);
            }
            var tmpKMeansBreaks = [];
            for (var j$6=0; j$6<num; j$6++) {
                tmpKMeansBreaks.push(kClusters[j$6][0]);
                tmpKMeansBreaks.push(kClusters[j$6][kClusters[j$6].length-1]);
            }
            tmpKMeansBreaks = tmpKMeansBreaks.sort(function (a,b){ return a-b; });
            limits.push(tmpKMeansBreaks[0]);
            for (var i$7=1; i$7 < tmpKMeansBreaks.length; i$7+= 2) {
                var v = tmpKMeansBreaks[i$7];
                if (!isNaN(v) && (limits.indexOf(v) === -1)) {
                    limits.push(v);
                }
            }
        }
        return limits;
    };

    var analyze_1 = {analyze: analyze, limits: limits};

    var Color$3 = Color_1;


    var contrast = function (a, b) {
        // WCAG contrast ratio
        // see http://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef
        a = new Color$3(a);
        b = new Color$3(b);
        var l1 = a.luminance();
        var l2 = b.luminance();
        return l1 > l2 ? (l1 + 0.05) / (l2 + 0.05) : (l2 + 0.05) / (l1 + 0.05);
    };

    var Color$2 = Color_1;
    var sqrt = Math.sqrt;
    var pow = Math.pow;
    var min = Math.min;
    var max = Math.max;
    var atan2 = Math.atan2;
    var abs = Math.abs;
    var cos = Math.cos;
    var sin = Math.sin;
    var exp = Math.exp;
    var PI = Math.PI;

    var deltaE = function(a, b, Kl, Kc, Kh) {
        if ( Kl === void 0 ) Kl=1;
        if ( Kc === void 0 ) Kc=1;
        if ( Kh === void 0 ) Kh=1;

        // Delta E (CIE 2000)
        // see http://www.brucelindbloom.com/index.html?Eqn_DeltaE_CIE2000.html
        var rad2deg = function(rad) {
            return 360 * rad / (2 * PI);
        };
        var deg2rad = function(deg) {
            return (2 * PI * deg) / 360;
        };
        a = new Color$2(a);
        b = new Color$2(b);
        var ref = Array.from(a.lab());
        var L1 = ref[0];
        var a1 = ref[1];
        var b1 = ref[2];
        var ref$1 = Array.from(b.lab());
        var L2 = ref$1[0];
        var a2 = ref$1[1];
        var b2 = ref$1[2];
        var avgL = (L1 + L2)/2;
        var C1 = sqrt(pow(a1, 2) + pow(b1, 2));
        var C2 = sqrt(pow(a2, 2) + pow(b2, 2));
        var avgC = (C1 + C2)/2;
        var G = 0.5*(1-sqrt(pow(avgC, 7)/(pow(avgC, 7) + pow(25, 7))));
        var a1p = a1*(1+G);
        var a2p = a2*(1+G);
        var C1p = sqrt(pow(a1p, 2) + pow(b1, 2));
        var C2p = sqrt(pow(a2p, 2) + pow(b2, 2));
        var avgCp = (C1p + C2p)/2;
        var arctan1 = rad2deg(atan2(b1, a1p));
        var arctan2 = rad2deg(atan2(b2, a2p));
        var h1p = arctan1 >= 0 ? arctan1 : arctan1 + 360;
        var h2p = arctan2 >= 0 ? arctan2 : arctan2 + 360;
        var avgHp = abs(h1p - h2p) > 180 ? (h1p + h2p + 360)/2 : (h1p + h2p)/2;
        var T = 1 - 0.17*cos(deg2rad(avgHp - 30)) + 0.24*cos(deg2rad(2*avgHp)) + 0.32*cos(deg2rad(3*avgHp + 6)) - 0.2*cos(deg2rad(4*avgHp - 63));
        var deltaHp = h2p - h1p;
        deltaHp = abs(deltaHp) <= 180 ? deltaHp : h2p <= h1p ? deltaHp + 360 : deltaHp - 360;
        deltaHp = 2*sqrt(C1p*C2p)*sin(deg2rad(deltaHp)/2);
        var deltaL = L2 - L1;
        var deltaCp = C2p - C1p;    
        var sl = 1 + (0.015*pow(avgL - 50, 2))/sqrt(20 + pow(avgL - 50, 2));
        var sc = 1 + 0.045*avgCp;
        var sh = 1 + 0.015*avgCp*T;
        var deltaTheta = 30*exp(-pow((avgHp - 275)/25, 2));
        var Rc = 2*sqrt(pow(avgCp, 7)/(pow(avgCp, 7) + pow(25, 7)));
        var Rt = -Rc*sin(2*deg2rad(deltaTheta));
        var result = sqrt(pow(deltaL/(Kl*sl), 2) + pow(deltaCp/(Kc*sc), 2) + pow(deltaHp/(Kh*sh), 2) + Rt*(deltaCp/(Kc*sc))*(deltaHp/(Kh*sh)));
        return max(0, min(100, result));
    };

    var Color$1 = Color_1;

    // simple Euclidean distance
    var distance = function(a, b, mode) {
        if ( mode === void 0 ) mode='lab';

        // Delta E (CIE 1976)
        // see http://www.brucelindbloom.com/index.html?Equations.html
        a = new Color$1(a);
        b = new Color$1(b);
        var l1 = a.get(mode);
        var l2 = b.get(mode);
        var sum_sq = 0;
        for (var i in l1) {
            var d = (l1[i] || 0) - (l2[i] || 0);
            sum_sq += d*d;
        }
        return Math.sqrt(sum_sq);
    };

    var Color = Color_1;

    var valid = function () {
        var args = [], len = arguments.length;
        while ( len-- ) args[ len ] = arguments[ len ];

        try {
            new (Function.prototype.bind.apply( Color, [ null ].concat( args) ));
            return true;
        } catch (e) {
            return false;
        }
    };

    // some pre-defined color scales:
    var chroma$1 = chroma_1;

    var scale = scale$2;

    var scales = {
    	cool: function cool() { return scale([chroma$1.hsl(180,1,.9), chroma$1.hsl(250,.7,.4)]) },
    	hot: function hot() { return scale(['#000','#f00','#ff0','#fff']).mode('rgb') }
    };

    /**
        ColorBrewer colors for chroma.js

        Copyright (c) 2002 Cynthia Brewer, Mark Harrower, and The
        Pennsylvania State University.

        Licensed under the Apache License, Version 2.0 (the "License");
        you may not use this file except in compliance with the License.
        You may obtain a copy of the License at
        http://www.apache.org/licenses/LICENSE-2.0

        Unless required by applicable law or agreed to in writing, software distributed
        under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
        CONDITIONS OF ANY KIND, either express or implied. See the License for the
        specific language governing permissions and limitations under the License.
    */

    var colorbrewer = {
        // sequential
        OrRd: ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#b30000', '#7f0000'],
        PuBu: ['#fff7fb', '#ece7f2', '#d0d1e6', '#a6bddb', '#74a9cf', '#3690c0', '#0570b0', '#045a8d', '#023858'],
        BuPu: ['#f7fcfd', '#e0ecf4', '#bfd3e6', '#9ebcda', '#8c96c6', '#8c6bb1', '#88419d', '#810f7c', '#4d004b'],
        Oranges: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'],
        BuGn: ['#f7fcfd', '#e5f5f9', '#ccece6', '#99d8c9', '#66c2a4', '#41ae76', '#238b45', '#006d2c', '#00441b'],
        YlOrBr: ['#ffffe5', '#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#993404', '#662506'],
        YlGn: ['#ffffe5', '#f7fcb9', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'],
        Reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
        RdPu: ['#fff7f3', '#fde0dd', '#fcc5c0', '#fa9fb5', '#f768a1', '#dd3497', '#ae017e', '#7a0177', '#49006a'],
        Greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
        YlGnBu: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58'],
        Purples: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#54278f', '#3f007d'],
        GnBu: ['#f7fcf0', '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#0868ac', '#084081'],
        Greys: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525', '#000000'],
        YlOrRd: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
        PuRd: ['#f7f4f9', '#e7e1ef', '#d4b9da', '#c994c7', '#df65b0', '#e7298a', '#ce1256', '#980043', '#67001f'],
        Blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
        PuBuGn: ['#fff7fb', '#ece2f0', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016c59', '#014636'],
        Viridis: ['#440154', '#482777', '#3f4a8a', '#31678e', '#26838f', '#1f9d8a', '#6cce5a', '#b6de2b', '#fee825'],

        // diverging

        Spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'],
        RdYlGn: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'],
        RdBu: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'],
        PiYG: ['#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221', '#276419'],
        PRGn: ['#40004b', '#762a83', '#9970ab', '#c2a5cf', '#e7d4e8', '#f7f7f7', '#d9f0d3', '#a6dba0', '#5aae61', '#1b7837', '#00441b'],
        RdYlBu: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
        BrBG: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'],
        RdGy: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#ffffff', '#e0e0e0', '#bababa', '#878787', '#4d4d4d', '#1a1a1a'],
        PuOr: ['#7f3b08', '#b35806', '#e08214', '#fdb863', '#fee0b6', '#f7f7f7', '#d8daeb', '#b2abd2', '#8073ac', '#542788', '#2d004b'],

        // qualitative

        Set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
        Accent: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666'],
        Set1: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
        Set3: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5', '#ffed6f'],
        Dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
        Paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
        Pastel2: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc'],
        Pastel1: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2'],
    };

    // add lowercase aliases for case-insensitive matches
    for (var i = 0, list = Object.keys(colorbrewer); i < list.length; i += 1) {
        var key = list[i];

        colorbrewer[key.toLowerCase()] = colorbrewer[key];
    }

    var colorbrewer_1 = colorbrewer;

    var chroma = chroma_1;

    // feel free to comment out anything to rollup
    // a smaller chroma.js built

    // io --> convert colors

















    // operators --> modify existing Colors










    // interpolators












    // generators -- > create new colors
    chroma.average = average;
    chroma.bezier = bezier_1;
    chroma.blend = blend_1;
    chroma.cubehelix = cubehelix;
    chroma.mix = chroma.interpolate = mix$1;
    chroma.random = random_1;
    chroma.scale = scale$2;

    // other utility methods
    chroma.analyze = analyze_1.analyze;
    chroma.contrast = contrast;
    chroma.deltaE = deltaE;
    chroma.distance = distance;
    chroma.limits = analyze_1.limits;
    chroma.valid = valid;

    // scale
    chroma.scales = scales;

    // colors
    chroma.colors = w3cx11_1;
    chroma.brewer = colorbrewer_1;

    var chroma_js = chroma;

    return chroma_js;

}));

},{}],36:[function(require,module,exports){
/*!
	Copyright (c) 2018 Jed Watson.
	Licensed under the MIT License (MIT), see
	http://jedwatson.github.io/classnames
*/
/* global define */

(function () {
	'use strict';

	var hasOwn = {}.hasOwnProperty;
	var nativeCodeString = '[native code]';

	function classNames() {
		var classes = [];

		for (var i = 0; i < arguments.length; i++) {
			var arg = arguments[i];
			if (!arg) continue;

			var argType = typeof arg;

			if (argType === 'string' || argType === 'number') {
				classes.push(arg);
			} else if (Array.isArray(arg)) {
				if (arg.length) {
					var inner = classNames.apply(null, arg);
					if (inner) {
						classes.push(inner);
					}
				}
			} else if (argType === 'object') {
				if (arg.toString !== Object.prototype.toString && !arg.toString.toString().includes('[native code]')) {
					classes.push(arg.toString());
					continue;
				}

				for (var key in arg) {
					if (hasOwn.call(arg, key) && arg[key]) {
						classes.push(key);
					}
				}
			}
		}

		return classes.join(' ');
	}

	if (typeof module !== 'undefined' && module.exports) {
		classNames.default = classNames;
		module.exports = classNames;
	} else if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {
		// register as 'classnames', consistent with npm package name
		define('classnames', [], function () {
			return classNames;
		});
	} else {
		window.classNames = classNames;
	}
}());

},{}],37:[function(require,module,exports){
'use strict'

module.exports = ready

function ready (callback) {
  if (typeof document === 'undefined') {
    throw new Error('document-ready only runs in the browser')
  }
  var state = document.readyState
  if (state === 'complete' || state === 'interactive') {
    return setTimeout(callback, 0)
  }

  document.addEventListener('DOMContentLoaded', function onLoad () {
    callback()
  })
}

},{}],38:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var R = typeof Reflect === 'object' ? Reflect : null
var ReflectApply = R && typeof R.apply === 'function'
  ? R.apply
  : function ReflectApply(target, receiver, args) {
    return Function.prototype.apply.call(target, receiver, args);
  }

var ReflectOwnKeys
if (R && typeof R.ownKeys === 'function') {
  ReflectOwnKeys = R.ownKeys
} else if (Object.getOwnPropertySymbols) {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target)
      .concat(Object.getOwnPropertySymbols(target));
  };
} else {
  ReflectOwnKeys = function ReflectOwnKeys(target) {
    return Object.getOwnPropertyNames(target);
  };
}

function ProcessEmitWarning(warning) {
  if (console && console.warn) console.warn(warning);
}

var NumberIsNaN = Number.isNaN || function NumberIsNaN(value) {
  return value !== value;
}

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;
module.exports.once = once;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

function checkListener(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
  }
}

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function() {
    return defaultMaxListeners;
  },
  set: function(arg) {
    if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + '.');
    }
    defaultMaxListeners = arg;
  }
});

EventEmitter.init = function() {

  if (this._events === undefined ||
      this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
    throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.');
  }
  this._maxListeners = n;
  return this;
};

function _getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return _getMaxListeners(this);
};

EventEmitter.prototype.emit = function emit(type) {
  var args = [];
  for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
  var doError = (type === 'error');

  var events = this._events;
  if (events !== undefined)
    doError = (doError && events.error === undefined);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    var er;
    if (args.length > 0)
      er = args[0];
    if (er instanceof Error) {
      // Note: The comments on the `throw` lines are intentional, they show
      // up in Node's output if this results in an unhandled exception.
      throw er; // Unhandled 'error' event
    }
    // At least give some kind of context to the user
    var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
    err.context = er;
    throw err; // Unhandled 'error' event
  }

  var handler = events[type];

  if (handler === undefined)
    return false;

  if (typeof handler === 'function') {
    ReflectApply(handler, this, args);
  } else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      ReflectApply(listeners[i], this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  checkListener(listener);

  events = target._events;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener !== undefined) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (existing === undefined) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
        prepend ? [listener, existing] : [existing, listener];
      // If we've already got an array, just append.
    } else if (prepend) {
      existing.unshift(listener);
    } else {
      existing.push(listener);
    }

    // Check for listener leak
    m = _getMaxListeners(target);
    if (m > 0 && existing.length > m && !existing.warned) {
      existing.warned = true;
      // No error code for this since it is a Warning
      // eslint-disable-next-line no-restricted-syntax
      var w = new Error('Possible EventEmitter memory leak detected. ' +
                          existing.length + ' ' + String(type) + ' listeners ' +
                          'added. Use emitter.setMaxListeners() to ' +
                          'increase limit');
      w.name = 'MaxListenersExceededWarning';
      w.emitter = target;
      w.type = type;
      w.count = existing.length;
      ProcessEmitWarning(w);
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    if (arguments.length === 0)
      return this.listener.call(this.target);
    return this.listener.apply(this.target, arguments);
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = onceWrapper.bind(state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  checkListener(listener);
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      checkListener(listener);
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      checkListener(listener);

      events = this._events;
      if (events === undefined)
        return this;

      list = events[type];
      if (list === undefined)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = Object.create(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else {
          spliceOne(list, position);
        }

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener !== undefined)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (events === undefined)
        return this;

      // not listening for removeListener, no need to emit
      if (events.removeListener === undefined) {
        if (arguments.length === 0) {
          this._events = Object.create(null);
          this._eventsCount = 0;
        } else if (events[type] !== undefined) {
          if (--this._eventsCount === 0)
            this._events = Object.create(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = Object.create(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners !== undefined) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (events === undefined)
    return [];

  var evlistener = events[type];
  if (evlistener === undefined)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ?
    unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events !== undefined) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener !== undefined) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
};

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function spliceOne(list, index) {
  for (; index + 1 < list.length; index++)
    list[index] = list[index + 1];
  list.pop();
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function once(emitter, name) {
  return new Promise(function (resolve, reject) {
    function errorListener(err) {
      emitter.removeListener(name, resolver);
      reject(err);
    }

    function resolver() {
      if (typeof emitter.removeListener === 'function') {
        emitter.removeListener('error', errorListener);
      }
      resolve([].slice.call(arguments));
    };

    eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
    if (name !== 'error') {
      addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
    }
  });
}

function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
  if (typeof emitter.on === 'function') {
    eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
  }
}

function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
  if (typeof emitter.on === 'function') {
    if (flags.once) {
      emitter.once(name, listener);
    } else {
      emitter.on(name, listener);
    }
  } else if (typeof emitter.addEventListener === 'function') {
    // EventTarget does not have `error` event semantics like Node
    // EventEmitters, we do not listen for `error` events here.
    emitter.addEventListener(name, function wrapListener(arg) {
      // IE does not have builtin `{ once: true }` support so we
      // have to do it manually.
      if (flags.once) {
        emitter.removeEventListener(name, wrapListener);
      }
      listener(arg);
    });
  } else {
    throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
  }
}

},{}],39:[function(require,module,exports){
(function (global){(function (){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

var doccy;

if (typeof document !== 'undefined') {
    doccy = document;
} else {
    doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }
}

module.exports = doccy;

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"min-document":20}],40:[function(require,module,exports){
(function (global){(function (){
var win;

if (typeof window !== "undefined") {
    win = window;
} else if (typeof global !== "undefined") {
    win = global;
} else if (typeof self !== "undefined"){
    win = self;
} else {
    win = {};
}

module.exports = win;

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],41:[function(require,module,exports){
module.exports = attributeToProperty

var transform = {
  'class': 'className',
  'for': 'htmlFor',
  'http-equiv': 'httpEquiv'
}

function attributeToProperty (h) {
  return function (tagName, attrs, children) {
    for (var attr in attrs) {
      if (attr in transform) {
        attrs[transform[attr]] = attrs[attr]
        delete attrs[attr]
      }
    }
    return h(tagName, attrs, children)
  }
}

},{}],42:[function(require,module,exports){
var attrToProp = require('hyperscript-attribute-to-property')

var VAR = 0, TEXT = 1, OPEN = 2, CLOSE = 3, ATTR = 4
var ATTR_KEY = 5, ATTR_KEY_W = 6
var ATTR_VALUE_W = 7, ATTR_VALUE = 8
var ATTR_VALUE_SQ = 9, ATTR_VALUE_DQ = 10
var ATTR_EQ = 11, ATTR_BREAK = 12
var COMMENT = 13

module.exports = function (h, opts) {
  if (!opts) opts = {}
  var concat = opts.concat || function (a, b) {
    return String(a) + String(b)
  }
  if (opts.attrToProp !== false) {
    h = attrToProp(h)
  }

  return function (strings) {
    var state = TEXT, reg = ''
    var arglen = arguments.length
    var parts = []

    for (var i = 0; i < strings.length; i++) {
      if (i < arglen - 1) {
        var arg = arguments[i+1]
        var p = parse(strings[i])
        var xstate = state
        if (xstate === ATTR_VALUE_DQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_SQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_W) xstate = ATTR_VALUE
        if (xstate === ATTR) xstate = ATTR_KEY
        if (xstate === OPEN) {
          if (reg === '/') {
            p.push([ OPEN, '/', arg ])
            reg = ''
          } else {
            p.push([ OPEN, arg ])
          }
        } else if (xstate === COMMENT && opts.comments) {
          reg += String(arg)
        } else if (xstate !== COMMENT) {
          p.push([ VAR, xstate, arg ])
        }
        parts.push.apply(parts, p)
      } else parts.push.apply(parts, parse(strings[i]))
    }

    var tree = [null,{},[]]
    var stack = [[tree,-1]]
    for (var i = 0; i < parts.length; i++) {
      var cur = stack[stack.length-1][0]
      var p = parts[i], s = p[0]
      if (s === OPEN && /^\//.test(p[1])) {
        var ix = stack[stack.length-1][1]
        if (stack.length > 1) {
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === OPEN) {
        var c = [p[1],{},[]]
        cur[2].push(c)
        stack.push([c,cur[2].length-1])
      } else if (s === ATTR_KEY || (s === VAR && p[1] === ATTR_KEY)) {
        var key = ''
        var copyKey
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_KEY) {
            key = concat(key, parts[i][1])
          } else if (parts[i][0] === VAR && parts[i][1] === ATTR_KEY) {
            if (typeof parts[i][2] === 'object' && !key) {
              for (copyKey in parts[i][2]) {
                if (parts[i][2].hasOwnProperty(copyKey) && !cur[1][copyKey]) {
                  cur[1][copyKey] = parts[i][2][copyKey]
                }
              }
            } else {
              key = concat(key, parts[i][2])
            }
          } else break
        }
        if (parts[i][0] === ATTR_EQ) i++
        var j = i
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_VALUE || parts[i][0] === ATTR_KEY) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][1])
            else parts[i][1]==="" || (cur[1][key] = concat(cur[1][key], parts[i][1]));
          } else if (parts[i][0] === VAR
          && (parts[i][1] === ATTR_VALUE || parts[i][1] === ATTR_KEY)) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][2])
            else parts[i][2]==="" || (cur[1][key] = concat(cur[1][key], parts[i][2]));
          } else {
            if (key.length && !cur[1][key] && i === j
            && (parts[i][0] === CLOSE || parts[i][0] === ATTR_BREAK)) {
              // https://html.spec.whatwg.org/multipage/infrastructure.html#boolean-attributes
              // empty string is falsy, not well behaved value in browser
              cur[1][key] = key.toLowerCase()
            }
            if (parts[i][0] === CLOSE) {
              i--
            }
            break
          }
        }
      } else if (s === ATTR_KEY) {
        cur[1][p[1]] = true
      } else if (s === VAR && p[1] === ATTR_KEY) {
        cur[1][p[2]] = true
      } else if (s === CLOSE) {
        if (selfClosing(cur[0]) && stack.length) {
          var ix = stack[stack.length-1][1]
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === VAR && p[1] === TEXT) {
        if (p[2] === undefined || p[2] === null) p[2] = ''
        else if (!p[2]) p[2] = concat('', p[2])
        if (Array.isArray(p[2][0])) {
          cur[2].push.apply(cur[2], p[2])
        } else {
          cur[2].push(p[2])
        }
      } else if (s === TEXT) {
        cur[2].push(p[1])
      } else if (s === ATTR_EQ || s === ATTR_BREAK) {
        // no-op
      } else {
        throw new Error('unhandled: ' + s)
      }
    }

    if (tree[2].length > 1 && /^\s*$/.test(tree[2][0])) {
      tree[2].shift()
    }

    if (tree[2].length > 2
    || (tree[2].length === 2 && /\S/.test(tree[2][1]))) {
      if (opts.createFragment) return opts.createFragment(tree[2])
      throw new Error(
        'multiple root elements must be wrapped in an enclosing tag'
      )
    }
    if (Array.isArray(tree[2][0]) && typeof tree[2][0][0] === 'string'
    && Array.isArray(tree[2][0][2])) {
      tree[2][0] = h(tree[2][0][0], tree[2][0][1], tree[2][0][2])
    }
    return tree[2][0]

    function parse (str) {
      var res = []
      if (state === ATTR_VALUE_W) state = ATTR
      for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i)
        if (state === TEXT && c === '<') {
          if (reg.length) res.push([TEXT, reg])
          reg = ''
          state = OPEN
        } else if (c === '>' && !quot(state) && state !== COMMENT) {
          if (state === OPEN && reg.length) {
            res.push([OPEN,reg])
          } else if (state === ATTR_KEY) {
            res.push([ATTR_KEY,reg])
          } else if (state === ATTR_VALUE && reg.length) {
            res.push([ATTR_VALUE,reg])
          }
          res.push([CLOSE])
          reg = ''
          state = TEXT
        } else if (state === COMMENT && /-$/.test(reg) && c === '-') {
          if (opts.comments) {
            res.push([ATTR_VALUE,reg.substr(0, reg.length - 1)])
          }
          reg = ''
          state = TEXT
        } else if (state === OPEN && /^!--$/.test(reg)) {
          if (opts.comments) {
            res.push([OPEN, reg],[ATTR_KEY,'comment'],[ATTR_EQ])
          }
          reg = c
          state = COMMENT
        } else if (state === TEXT || state === COMMENT) {
          reg += c
        } else if (state === OPEN && c === '/' && reg.length) {
          // no-op, self closing tag without a space <br/>
        } else if (state === OPEN && /\s/.test(c)) {
          if (reg.length) {
            res.push([OPEN, reg])
          }
          reg = ''
          state = ATTR
        } else if (state === OPEN) {
          reg += c
        } else if (state === ATTR && /[^\s"'=/]/.test(c)) {
          state = ATTR_KEY
          reg = c
        } else if (state === ATTR && /\s/.test(c)) {
          if (reg.length) res.push([ATTR_KEY,reg])
          res.push([ATTR_BREAK])
        } else if (state === ATTR_KEY && /\s/.test(c)) {
          res.push([ATTR_KEY,reg])
          reg = ''
          state = ATTR_KEY_W
        } else if (state === ATTR_KEY && c === '=') {
          res.push([ATTR_KEY,reg],[ATTR_EQ])
          reg = ''
          state = ATTR_VALUE_W
        } else if (state === ATTR_KEY) {
          reg += c
        } else if ((state === ATTR_KEY_W || state === ATTR) && c === '=') {
          res.push([ATTR_EQ])
          state = ATTR_VALUE_W
        } else if ((state === ATTR_KEY_W || state === ATTR) && !/\s/.test(c)) {
          res.push([ATTR_BREAK])
          if (/[\w-]/.test(c)) {
            reg += c
            state = ATTR_KEY
          } else state = ATTR
        } else if (state === ATTR_VALUE_W && c === '"') {
          state = ATTR_VALUE_DQ
        } else if (state === ATTR_VALUE_W && c === "'") {
          state = ATTR_VALUE_SQ
        } else if (state === ATTR_VALUE_DQ && c === '"') {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_SQ && c === "'") {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_W && !/\s/.test(c)) {
          state = ATTR_VALUE
          i--
        } else if (state === ATTR_VALUE && /\s/.test(c)) {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE || state === ATTR_VALUE_SQ
        || state === ATTR_VALUE_DQ) {
          reg += c
        }
      }
      if (state === TEXT && reg.length) {
        res.push([TEXT,reg])
        reg = ''
      } else if (state === ATTR_VALUE && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_DQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_SQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_KEY) {
        res.push([ATTR_KEY,reg])
        reg = ''
      }
      return res
    }
  }

  function strfn (x) {
    if (typeof x === 'function') return x
    else if (typeof x === 'string') return x
    else if (x && typeof x === 'object') return x
    else if (x === null || x === undefined) return x
    else return concat('', x)
  }
}

function quot (state) {
  return state === ATTR_VALUE_SQ || state === ATTR_VALUE_DQ
}

var closeRE = RegExp('^(' + [
  'area', 'base', 'basefont', 'bgsound', 'br', 'col', 'command', 'embed',
  'frame', 'hr', 'img', 'input', 'isindex', 'keygen', 'link', 'meta', 'param',
  'source', 'track', 'wbr', '!--',
  // SVG TAGS
  'animate', 'animateTransform', 'circle', 'cursor', 'desc', 'ellipse',
  'feBlend', 'feColorMatrix', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'font-face-format', 'font-face-name', 'font-face-uri',
  'glyph', 'glyphRef', 'hkern', 'image', 'line', 'missing-glyph', 'mpath',
  'path', 'polygon', 'polyline', 'rect', 'set', 'stop', 'tref', 'use', 'view',
  'vkern'
].join('|') + ')(?:[\.#][a-zA-Z0-9\u007F-\uFFFF_:-]+)*$')
function selfClosing (tag) { return closeRE.test(tag) }

},{"hyperscript-attribute-to-property":41}],43:[function(require,module,exports){
/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],44:[function(require,module,exports){
'use strict'

exports.supports = function supports (...manifests) {
  const manifest = manifests.reduce((acc, m) => Object.assign(acc, m), {})

  return Object.assign(manifest, {
    snapshots: manifest.snapshots || false,
    permanence: manifest.permanence || false,
    seek: manifest.seek || false,
    clear: manifest.clear || false,
    getMany: manifest.getMany || false,
    keyIterator: manifest.keyIterator || false,
    valueIterator: manifest.valueIterator || false,
    iteratorNextv: manifest.iteratorNextv || false,
    iteratorAll: manifest.iteratorAll || false,
    status: manifest.status || false,
    createIfMissing: manifest.createIfMissing || false,
    errorIfExists: manifest.errorIfExists || false,
    deferredOpen: manifest.deferredOpen || false,
    promises: manifest.promises || false,
    streams: manifest.streams || false,
    encodings: Object.assign({}, manifest.encodings),
    events: Object.assign({}, manifest.events),
    additionalMethods: Object.assign({}, manifest.additionalMethods)
  })
}

},{}],45:[function(require,module,exports){
'use strict'

const ModuleError = require('module-error')
const encodings = require('./lib/encodings')
const { Encoding } = require('./lib/encoding')
const { BufferFormat, ViewFormat, UTF8Format } = require('./lib/formats')

const kFormats = Symbol('formats')
const kEncodings = Symbol('encodings')
const validFormats = new Set(['buffer', 'view', 'utf8'])

/** @template T */
class Transcoder {
  /**
   * @param {Array<'buffer'|'view'|'utf8'>} formats
   */
  constructor (formats) {
    if (!Array.isArray(formats)) {
      throw new TypeError("The first argument 'formats' must be an array")
    } else if (!formats.every(f => validFormats.has(f))) {
      // Note: we only only support aliases in key- and valueEncoding options (where we already did)
      throw new TypeError("Format must be one of 'buffer', 'view', 'utf8'")
    }

    /** @type {Map<string|MixedEncoding<any, any, any>, Encoding<any, any, any>>} */
    this[kEncodings] = new Map()
    this[kFormats] = new Set(formats)

    // Register encodings (done early in order to populate encodings())
    for (const k in encodings) {
      try {
        this.encoding(k)
      } catch (err) {
        /* istanbul ignore if: assertion */
        if (err.code !== 'LEVEL_ENCODING_NOT_SUPPORTED') throw err
      }
    }
  }

  /**
   * @returns {Array<Encoding<any,T,any>>}
   */
  encodings () {
    return Array.from(new Set(this[kEncodings].values()))
  }

  /**
   * @param {string|MixedEncoding<any, any, any>} encoding
   * @returns {Encoding<any, T, any>}
   */
  encoding (encoding) {
    let resolved = this[kEncodings].get(encoding)

    if (resolved === undefined) {
      if (typeof encoding === 'string' && encoding !== '') {
        resolved = lookup[encoding]

        if (!resolved) {
          throw new ModuleError(`Encoding '${encoding}' is not found`, {
            code: 'LEVEL_ENCODING_NOT_FOUND'
          })
        }
      } else if (typeof encoding !== 'object' || encoding === null) {
        throw new TypeError("First argument 'encoding' must be a string or object")
      } else {
        resolved = from(encoding)
      }

      const { name, format } = resolved

      if (!this[kFormats].has(format)) {
        if (this[kFormats].has('view')) {
          resolved = resolved.createViewTranscoder()
        } else if (this[kFormats].has('buffer')) {
          resolved = resolved.createBufferTranscoder()
        } else if (this[kFormats].has('utf8')) {
          resolved = resolved.createUTF8Transcoder()
        } else {
          throw new ModuleError(`Encoding '${name}' cannot be transcoded`, {
            code: 'LEVEL_ENCODING_NOT_SUPPORTED'
          })
        }
      }

      for (const k of [encoding, name, resolved.name, resolved.commonName]) {
        this[kEncodings].set(k, resolved)
      }
    }

    return resolved
  }
}

exports.Transcoder = Transcoder

/**
 * @param {MixedEncoding<any, any, any>} options
 * @returns {Encoding<any, any, any>}
 */
function from (options) {
  if (options instanceof Encoding) {
    return options
  }

  // Loosely typed for ecosystem compatibility
  const maybeType = 'type' in options && typeof options.type === 'string' ? options.type : undefined
  const name = options.name || maybeType || `anonymous-${anonymousCount++}`

  switch (detectFormat(options)) {
    case 'view': return new ViewFormat({ ...options, name })
    case 'utf8': return new UTF8Format({ ...options, name })
    case 'buffer': return new BufferFormat({ ...options, name })
    default: {
      throw new TypeError("Format must be one of 'buffer', 'view', 'utf8'")
    }
  }
}

/**
 * If format is not provided, fallback to detecting `level-codec`
 * or `multiformats` encodings, else assume a format of buffer.
 * @param {MixedEncoding<any, any, any>} options
 * @returns {string}
 */
function detectFormat (options) {
  if ('format' in options && options.format !== undefined) {
    return options.format
  } else if ('buffer' in options && typeof options.buffer === 'boolean') {
    return options.buffer ? 'buffer' : 'utf8' // level-codec
  } else if ('code' in options && Number.isInteger(options.code)) {
    return 'view' // multiformats
  } else {
    return 'buffer'
  }
}

/**
 * @typedef {import('./lib/encoding').MixedEncoding<TIn,TFormat,TOut>} MixedEncoding
 * @template TIn, TFormat, TOut
 */

/**
 * @type {Object.<string, Encoding<any, any, any>>}
 */
const aliases = {
  binary: encodings.buffer,
  'utf-8': encodings.utf8
}

/**
 * @type {Object.<string, Encoding<any, any, any>>}
 */
const lookup = {
  ...encodings,
  ...aliases
}

let anonymousCount = 0

},{"./lib/encoding":46,"./lib/encodings":47,"./lib/formats":48,"module-error":52}],46:[function(require,module,exports){
'use strict'

const ModuleError = require('module-error')
const formats = new Set(['buffer', 'view', 'utf8'])

/**
 * @template TIn, TFormat, TOut
 * @abstract
 */
class Encoding {
  /**
   * @param {IEncoding<TIn,TFormat,TOut>} options
   */
  constructor (options) {
    /** @type {(data: TIn) => TFormat} */
    this.encode = options.encode || this.encode

    /** @type {(data: TFormat) => TOut} */
    this.decode = options.decode || this.decode

    /** @type {string} */
    this.name = options.name || this.name

    /** @type {string} */
    this.format = options.format || this.format

    if (typeof this.encode !== 'function') {
      throw new TypeError("The 'encode' property must be a function")
    }

    if (typeof this.decode !== 'function') {
      throw new TypeError("The 'decode' property must be a function")
    }

    this.encode = this.encode.bind(this)
    this.decode = this.decode.bind(this)

    if (typeof this.name !== 'string' || this.name === '') {
      throw new TypeError("The 'name' property must be a string")
    }

    if (typeof this.format !== 'string' || !formats.has(this.format)) {
      throw new TypeError("The 'format' property must be one of 'buffer', 'view', 'utf8'")
    }

    if (options.createViewTranscoder) {
      this.createViewTranscoder = options.createViewTranscoder
    }

    if (options.createBufferTranscoder) {
      this.createBufferTranscoder = options.createBufferTranscoder
    }

    if (options.createUTF8Transcoder) {
      this.createUTF8Transcoder = options.createUTF8Transcoder
    }
  }

  get commonName () {
    return /** @type {string} */ (this.name.split('+')[0])
  }

  /** @return {BufferFormat<TIn,TOut>} */
  createBufferTranscoder () {
    throw new ModuleError(`Encoding '${this.name}' cannot be transcoded to 'buffer'`, {
      code: 'LEVEL_ENCODING_NOT_SUPPORTED'
    })
  }

  /** @return {ViewFormat<TIn,TOut>} */
  createViewTranscoder () {
    throw new ModuleError(`Encoding '${this.name}' cannot be transcoded to 'view'`, {
      code: 'LEVEL_ENCODING_NOT_SUPPORTED'
    })
  }

  /** @return {UTF8Format<TIn,TOut>} */
  createUTF8Transcoder () {
    throw new ModuleError(`Encoding '${this.name}' cannot be transcoded to 'utf8'`, {
      code: 'LEVEL_ENCODING_NOT_SUPPORTED'
    })
  }
}

exports.Encoding = Encoding

/**
 * @typedef {import('./encoding').IEncoding<TIn,TFormat,TOut>} IEncoding
 * @template TIn, TFormat, TOut
 */

/**
 * @typedef {import('./formats').BufferFormat<TIn,TOut>} BufferFormat
 * @template TIn, TOut
 */

/**
 * @typedef {import('./formats').ViewFormat<TIn,TOut>} ViewFormat
 * @template TIn, TOut
 */

/**
 * @typedef {import('./formats').UTF8Format<TIn,TOut>} UTF8Format
 * @template TIn, TOut
 */

},{"module-error":52}],47:[function(require,module,exports){
'use strict'

const { Buffer } = require('buffer') || { Buffer: { isBuffer: () => false } }
const { textEncoder, textDecoder } = require('./text-endec')()
const { BufferFormat, ViewFormat, UTF8Format } = require('./formats')

/** @type {<T>(v: T) => v} */
const identity = (v) => v

/**
 * @type {typeof import('./encodings').utf8}
 */
exports.utf8 = new UTF8Format({
  encode: function (data) {
    // On node 16.9.1 buffer.toString() is 5x faster than TextDecoder
    return Buffer.isBuffer(data)
      ? data.toString('utf8')
      : ArrayBuffer.isView(data)
        ? textDecoder.decode(data)
        : String(data)
  },
  decode: identity,
  name: 'utf8',
  createViewTranscoder () {
    return new ViewFormat({
      encode: function (data) {
        return ArrayBuffer.isView(data) ? data : textEncoder.encode(data)
      },
      decode: function (data) {
        return textDecoder.decode(data)
      },
      name: `${this.name}+view`
    })
  },
  createBufferTranscoder () {
    return new BufferFormat({
      encode: function (data) {
        return Buffer.isBuffer(data)
          ? data
          : ArrayBuffer.isView(data)
            ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
            : Buffer.from(String(data), 'utf8')
      },
      decode: function (data) {
        return data.toString('utf8')
      },
      name: `${this.name}+buffer`
    })
  }
})

/**
 * @type {typeof import('./encodings').json}
 */
exports.json = new UTF8Format({
  encode: JSON.stringify,
  decode: JSON.parse,
  name: 'json'
})

/**
 * @type {typeof import('./encodings').buffer}
 */
exports.buffer = new BufferFormat({
  encode: function (data) {
    return Buffer.isBuffer(data)
      ? data
      : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : Buffer.from(String(data), 'utf8')
  },
  decode: identity,
  name: 'buffer',
  createViewTranscoder () {
    return new ViewFormat({
      encode: function (data) {
        return ArrayBuffer.isView(data) ? data : Buffer.from(String(data), 'utf8')
      },
      decode: function (data) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      },
      name: `${this.name}+view`
    })
  }
})

/**
 * @type {typeof import('./encodings').view}
 */
exports.view = new ViewFormat({
  encode: function (data) {
    return ArrayBuffer.isView(data) ? data : textEncoder.encode(data)
  },
  decode: identity,
  name: 'view',
  createBufferTranscoder () {
    return new BufferFormat({
      encode: function (data) {
        return Buffer.isBuffer(data)
          ? data
          : ArrayBuffer.isView(data)
            ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
            : Buffer.from(String(data), 'utf8')
      },
      decode: identity,
      name: `${this.name}+buffer`
    })
  }
})

/**
 * @type {typeof import('./encodings').hex}
 */
exports.hex = new BufferFormat({
  encode: function (data) {
    return Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'hex')
  },
  decode: function (buffer) {
    return buffer.toString('hex')
  },
  name: 'hex'
})

/**
 * @type {typeof import('./encodings').base64}
 */
exports.base64 = new BufferFormat({
  encode: function (data) {
    return Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'base64')
  },
  decode: function (buffer) {
    return buffer.toString('base64')
  },
  name: 'base64'
})

},{"./formats":48,"./text-endec":49,"buffer":21}],48:[function(require,module,exports){
'use strict'

const { Buffer } = require('buffer') || {}
const { Encoding } = require('./encoding')
const textEndec = require('./text-endec')

/**
 * @template TIn, TOut
 * @extends {Encoding<TIn,Buffer,TOut>}
 */
class BufferFormat extends Encoding {
  /**
   * @param {Omit<IEncoding<TIn, Buffer, TOut>, 'format'>} options
   */
  constructor (options) {
    super({ ...options, format: 'buffer' })
  }

  /** @override */
  createViewTranscoder () {
    return new ViewFormat({
      encode: this.encode, // Buffer is a view (UInt8Array)
      decode: (data) => this.decode(
        Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      ),
      name: `${this.name}+view`
    })
  }

  /** @override */
  createBufferTranscoder () {
    return this
  }
}

/**
 * @extends {Encoding<TIn,Uint8Array,TOut>}
 * @template TIn, TOut
 */
class ViewFormat extends Encoding {
  /**
   * @param {Omit<IEncoding<TIn, Uint8Array, TOut>, 'format'>} options
   */
  constructor (options) {
    super({ ...options, format: 'view' })
  }

  /** @override */
  createBufferTranscoder () {
    return new BufferFormat({
      encode: (data) => {
        const view = this.encode(data)
        return Buffer.from(view.buffer, view.byteOffset, view.byteLength)
      },
      decode: this.decode, // Buffer is a view (UInt8Array)
      name: `${this.name}+buffer`
    })
  }

  /** @override */
  createViewTranscoder () {
    return this
  }
}

/**
 * @extends {Encoding<TIn,string,TOut>}
 * @template TIn, TOut
 */
class UTF8Format extends Encoding {
  /**
   * @param {Omit<IEncoding<TIn, string, TOut>, 'format'>} options
   */
  constructor (options) {
    super({ ...options, format: 'utf8' })
  }

  /** @override */
  createBufferTranscoder () {
    return new BufferFormat({
      encode: (data) => Buffer.from(this.encode(data), 'utf8'),
      decode: (data) => this.decode(data.toString('utf8')),
      name: `${this.name}+buffer`
    })
  }

  /** @override */
  createViewTranscoder () {
    const { textEncoder, textDecoder } = textEndec()

    return new ViewFormat({
      encode: (data) => textEncoder.encode(this.encode(data)),
      decode: (data) => this.decode(textDecoder.decode(data)),
      name: `${this.name}+view`
    })
  }

  /** @override */
  createUTF8Transcoder () {
    return this
  }
}

exports.BufferFormat = BufferFormat
exports.ViewFormat = ViewFormat
exports.UTF8Format = UTF8Format

/**
 * @typedef {import('./encoding').IEncoding<TIn,TFormat,TOut>} IEncoding
 * @template TIn, TFormat, TOut
 */

},{"./encoding":46,"./text-endec":49,"buffer":21}],49:[function(require,module,exports){
'use strict'

/** @type {{ textEncoder: TextEncoder, textDecoder: TextDecoder }|null} */
let lazy = null

/**
 * Get semi-global instances of TextEncoder and TextDecoder.
 * @returns {{ textEncoder: TextEncoder, textDecoder: TextDecoder }}
 */
module.exports = function () {
  if (lazy === null) {
    lazy = {
      textEncoder: new TextEncoder(),
      textDecoder: new TextDecoder()
    }
  }

  return lazy
}

},{}],50:[function(require,module,exports){
exports.Level = require('browser-level').BrowserLevel

},{"browser-level":15}],51:[function(require,module,exports){
/* MapLibre GL JS is licensed under the 3-Clause BSD License. Full text of license: https://github.com/maplibre/maplibre-gl-js/blob/v3.2.2/LICENSE.txt */
(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
typeof define === 'function' && define.amd ? define(factory) :
(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.maplibregl = factory());
})(this, (function () { 'use strict';

/* eslint-disable */

var shared, worker, maplibregl;
// define gets called three times: one for each chunk. we rely on the order
// they're imported to know which is which
function define(_, chunk) {
    if (!shared) {
        shared = chunk;
    } else if (!worker) {
        worker = chunk;
    } else {
        var workerBundleString = 'var sharedChunk = {}; (' + shared + ')(sharedChunk); (' + worker + ')(sharedChunk);'

        var sharedChunk = {};
        shared(sharedChunk);
        maplibregl = chunk(sharedChunk);
        if (typeof window !== 'undefined') {
            maplibregl.workerUrl = window.URL.createObjectURL(new Blob([workerBundleString], { type: 'text/javascript' }));
        }
    }
}


define(["exports"],(function(t){"use strict";function e(t){return t&&t.__esModule&&Object.prototype.hasOwnProperty.call(t,"default")?t.default:t}var r=n;function n(t,e){this.x=t,this.y=e;}n.prototype={clone:function(){return new n(this.x,this.y)},add:function(t){return this.clone()._add(t)},sub:function(t){return this.clone()._sub(t)},multByPoint:function(t){return this.clone()._multByPoint(t)},divByPoint:function(t){return this.clone()._divByPoint(t)},mult:function(t){return this.clone()._mult(t)},div:function(t){return this.clone()._div(t)},rotate:function(t){return this.clone()._rotate(t)},rotateAround:function(t,e){return this.clone()._rotateAround(t,e)},matMult:function(t){return this.clone()._matMult(t)},unit:function(){return this.clone()._unit()},perp:function(){return this.clone()._perp()},round:function(){return this.clone()._round()},mag:function(){return Math.sqrt(this.x*this.x+this.y*this.y)},equals:function(t){return this.x===t.x&&this.y===t.y},dist:function(t){return Math.sqrt(this.distSqr(t))},distSqr:function(t){var e=t.x-this.x,r=t.y-this.y;return e*e+r*r},angle:function(){return Math.atan2(this.y,this.x)},angleTo:function(t){return Math.atan2(this.y-t.y,this.x-t.x)},angleWith:function(t){return this.angleWithSep(t.x,t.y)},angleWithSep:function(t,e){return Math.atan2(this.x*e-this.y*t,this.x*t+this.y*e)},_matMult:function(t){var e=t[2]*this.x+t[3]*this.y;return this.x=t[0]*this.x+t[1]*this.y,this.y=e,this},_add:function(t){return this.x+=t.x,this.y+=t.y,this},_sub:function(t){return this.x-=t.x,this.y-=t.y,this},_mult:function(t){return this.x*=t,this.y*=t,this},_div:function(t){return this.x/=t,this.y/=t,this},_multByPoint:function(t){return this.x*=t.x,this.y*=t.y,this},_divByPoint:function(t){return this.x/=t.x,this.y/=t.y,this},_unit:function(){return this._div(this.mag()),this},_perp:function(){var t=this.y;return this.y=this.x,this.x=-t,this},_rotate:function(t){var e=Math.cos(t),r=Math.sin(t),n=r*this.x+e*this.y;return this.x=e*this.x-r*this.y,this.y=n,this},_rotateAround:function(t,e){var r=Math.cos(t),n=Math.sin(t),i=e.y+n*(this.x-e.x)+r*(this.y-e.y);return this.x=e.x+r*(this.x-e.x)-n*(this.y-e.y),this.y=i,this},_round:function(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}},n.convert=function(t){return t instanceof n?t:Array.isArray(t)?new n(t[0],t[1]):t};var i=e(r),a=s;function s(t,e,r,n){this.cx=3*t,this.bx=3*(r-t)-this.cx,this.ax=1-this.cx-this.bx,this.cy=3*e,this.by=3*(n-e)-this.cy,this.ay=1-this.cy-this.by,this.p1x=t,this.p1y=e,this.p2x=r,this.p2y=n;}s.prototype={sampleCurveX:function(t){return ((this.ax*t+this.bx)*t+this.cx)*t},sampleCurveY:function(t){return ((this.ay*t+this.by)*t+this.cy)*t},sampleCurveDerivativeX:function(t){return (3*this.ax*t+2*this.bx)*t+this.cx},solveCurveX:function(t,e){if(void 0===e&&(e=1e-6),t<0)return 0;if(t>1)return 1;for(var r=t,n=0;n<8;n++){var i=this.sampleCurveX(r)-t;if(Math.abs(i)<e)return r;var a=this.sampleCurveDerivativeX(r);if(Math.abs(a)<1e-6)break;r-=i/a;}var s=0,o=1;for(r=t,n=0;n<20&&(i=this.sampleCurveX(r),!(Math.abs(i-t)<e));n++)t>i?s=r:o=r,r=.5*(o-s)+s;return r},solve:function(t,e){return this.sampleCurveY(this.solveCurveX(t,e))}};var o=e(a);function l(t,e,r,n){const i=new o(t,e,r,n);return function(t){return i.solve(t)}}const u=l(.25,.1,.25,1);function c(t,e,r){return Math.min(r,Math.max(e,t))}function h(t,e,r){const n=r-e,i=((t-e)%n+n)%n+e;return i===e?r:i}function p(t,...e){for(const r of e)for(const e in r)t[e]=r[e];return t}let f=1;function d(t,e,r){const n={};for(const i in t)n[i]=e.call(r||this,t[i],i,t);return n}function y(t,e,r){const n={};for(const i in t)e.call(r||this,t[i],i,t)&&(n[i]=t[i]);return n}function m(t){return Array.isArray(t)?t.map(m):"object"==typeof t&&t?d(t,m):t}const g={};function x(t){g[t]||("undefined"!=typeof console&&console.warn(t),g[t]=!0);}function v(t,e,r){return (r.y-t.y)*(e.x-t.x)>(e.y-t.y)*(r.x-t.x)}function b(t){let e=0;for(let r,n,i=0,a=t.length,s=a-1;i<a;s=i++)r=t[i],n=t[s],e+=(n.x-r.x)*(r.y+n.y);return e}function w(){return "undefined"!=typeof WorkerGlobalScope&&"undefined"!=typeof self&&self instanceof WorkerGlobalScope}let _=null;function A(t){if(null==_){const e=t.navigator?t.navigator.userAgent:null;_=!!t.safari||!(!e||!(/\b(iPad|iPhone|iPod)\b/.test(e)||e.match("Safari")&&!e.match("Chrome")));}return _}function k(t){return "undefined"!=typeof ImageBitmap&&t instanceof ImageBitmap}const S="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=";let I,z;const M={now:"undefined"!=typeof performance&&performance&&performance.now?performance.now.bind(performance):Date.now.bind(Date),frame(t){const e=requestAnimationFrame(t);return {cancel:()=>cancelAnimationFrame(e)}},getImageData(t,e=0){return this.getImageCanvasContext(t).getImageData(-e,-e,t.width+2*e,t.height+2*e)},getImageCanvasContext(t){const e=window.document.createElement("canvas"),r=e.getContext("2d",{willReadFrequently:!0});if(!r)throw new Error("failed to create canvas 2d context");return e.width=t.width,e.height=t.height,r.drawImage(t,0,0,t.width,t.height),r},resolveURL:t=>(I||(I=document.createElement("a")),I.href=t,I.href),hardwareConcurrency:"undefined"!=typeof navigator&&navigator.hardwareConcurrency||4,get prefersReducedMotion(){return !!matchMedia&&(null==z&&(z=matchMedia("(prefers-reduced-motion: reduce)")),z.matches)}},P={MAX_PARALLEL_IMAGE_REQUESTS:16,MAX_PARALLEL_IMAGE_REQUESTS_PER_FRAME:8,MAX_TILE_CACHE_ZOOM_LEVELS:5,REGISTERED_PROTOCOLS:{},WORKER_URL:""};class B extends Error{constructor(t,e,r,n){super(`AJAXError: ${e} (${t}): ${r}`),this.status=t,this.statusText=e,this.url=r,this.body=n;}}const C=w()?()=>self.worker&&self.worker.referrer:()=>("blob:"===window.location.protocol?window.parent:window).location.href,V=t=>P.REGISTERED_PROTOCOLS[t.substring(0,t.indexOf("://"))];function E(t,e){const r=new AbortController,n=new Request(t.url,{method:t.method||"GET",body:t.body,credentials:t.credentials,headers:t.headers,cache:t.cache,referrer:C(),signal:r.signal});let i=!1,a=!1;"json"===t.type&&n.headers.set("Accept","application/json");return a||fetch(n).then((r=>r.ok?(r=>{("arrayBuffer"===t.type||"image"===t.type?r.arrayBuffer():"json"===t.type?r.json():r.text()).then((t=>{a||(i=!0,e(null,t,r.headers.get("Cache-Control"),r.headers.get("Expires")));})).catch((t=>{a||e(new Error(t.message));}));})(r):r.blob().then((n=>e(new B(r.status,r.statusText,t.url,n)))))).catch((t=>{20!==t.code&&e(new Error(t.message));})),{cancel:()=>{a=!0,i||r.abort();}}}const F=function(t,e){if(/:\/\//.test(t.url)&&!/^https?:|^file:/.test(t.url)){if(w()&&self.worker&&self.worker.actor)return self.worker.actor.send("getResource",t,e);if(!w())return (V(t.url)||E)(t,e)}if(!(/^file:/.test(r=t.url)||/^file:/.test(C())&&!/^\w+:/.test(r))){if(fetch&&Request&&AbortController&&Object.prototype.hasOwnProperty.call(Request.prototype,"signal"))return E(t,e);if(w()&&self.worker&&self.worker.actor)return self.worker.actor.send("getResource",t,e,void 0,!0)}var r;return function(t,e){const r=new XMLHttpRequest;r.open(t.method||"GET",t.url,!0),"arrayBuffer"!==t.type&&"image"!==t.type||(r.responseType="arraybuffer");for(const e in t.headers)r.setRequestHeader(e,t.headers[e]);return "json"===t.type&&(r.responseType="text",r.setRequestHeader("Accept","application/json")),r.withCredentials="include"===t.credentials,r.onerror=()=>{e(new Error(r.statusText));},r.onload=()=>{if((r.status>=200&&r.status<300||0===r.status)&&null!==r.response){let n=r.response;if("json"===t.type)try{n=JSON.parse(r.response);}catch(t){return e(t)}e(null,n,r.getResponseHeader("Cache-Control"),r.getResponseHeader("Expires"));}else {const n=new Blob([r.response],{type:r.getResponseHeader("Content-Type")});e(new B(r.status,r.statusText,t.url,n));}},r.send(t.body),{cancel:()=>r.abort()}}(t,e)},T=function(t,e){return F(p(t,{type:"arrayBuffer"}),e)};function L(t){if(!t||t.indexOf("://")<=0||0===t.indexOf("data:image/")||0===t.indexOf("blob:"))return !0;const e=new URL(t),r=window.location;return e.protocol===r.protocol&&e.host===r.host}function $(t,e,r){r[t]&&-1!==r[t].indexOf(e)||(r[t]=r[t]||[],r[t].push(e));}function D(t,e,r){if(r&&r[t]){const n=r[t].indexOf(e);-1!==n&&r[t].splice(n,1);}}class O{constructor(t,e={}){p(this,e),this.type=t;}}class U extends O{constructor(t,e={}){super("error",p({error:t},e));}}class R{on(t,e){return this._listeners=this._listeners||{},$(t,e,this._listeners),this}off(t,e){return D(t,e,this._listeners),D(t,e,this._oneTimeListeners),this}once(t,e){return e?(this._oneTimeListeners=this._oneTimeListeners||{},$(t,e,this._oneTimeListeners),this):new Promise((e=>this.once(t,e)))}fire(t,e){"string"==typeof t&&(t=new O(t,e||{}));const r=t.type;if(this.listens(r)){t.target=this;const e=this._listeners&&this._listeners[r]?this._listeners[r].slice():[];for(const r of e)r.call(this,t);const n=this._oneTimeListeners&&this._oneTimeListeners[r]?this._oneTimeListeners[r].slice():[];for(const e of n)D(r,e,this._oneTimeListeners),e.call(this,t);const i=this._eventedParent;i&&(p(t,"function"==typeof this._eventedParentData?this._eventedParentData():this._eventedParentData),i.fire(t));}else t instanceof U&&console.error(t.error);return this}listens(t){return this._listeners&&this._listeners[t]&&this._listeners[t].length>0||this._oneTimeListeners&&this._oneTimeListeners[t]&&this._oneTimeListeners[t].length>0||this._eventedParent&&this._eventedParent.listens(t)}setEventedParent(t,e){return this._eventedParent=t,this._eventedParentData=e,this}}var q={$version:8,$root:{version:{required:!0,type:"enum",values:[8]},name:{type:"string"},metadata:{type:"*"},center:{type:"array",value:"number"},zoom:{type:"number"},bearing:{type:"number",default:0,period:360,units:"degrees"},pitch:{type:"number",default:0,units:"degrees"},light:{type:"light"},terrain:{type:"terrain"},sources:{required:!0,type:"sources"},sprite:{type:"sprite"},glyphs:{type:"string"},transition:{type:"transition"},layers:{required:!0,type:"array",value:"layer"}},sources:{"*":{type:"source"}},source:["source_vector","source_raster","source_raster_dem","source_geojson","source_video","source_image"],source_vector:{type:{required:!0,type:"enum",values:{vector:{}}},url:{type:"string"},tiles:{type:"array",value:"string"},bounds:{type:"array",value:"number",length:4,default:[-180,-85.051129,180,85.051129]},scheme:{type:"enum",values:{xyz:{},tms:{}},default:"xyz"},minzoom:{type:"number",default:0},maxzoom:{type:"number",default:22},attribution:{type:"string"},promoteId:{type:"promoteId"},volatile:{type:"boolean",default:!1},"*":{type:"*"}},source_raster:{type:{required:!0,type:"enum",values:{raster:{}}},url:{type:"string"},tiles:{type:"array",value:"string"},bounds:{type:"array",value:"number",length:4,default:[-180,-85.051129,180,85.051129]},minzoom:{type:"number",default:0},maxzoom:{type:"number",default:22},tileSize:{type:"number",default:512,units:"pixels"},scheme:{type:"enum",values:{xyz:{},tms:{}},default:"xyz"},attribution:{type:"string"},volatile:{type:"boolean",default:!1},"*":{type:"*"}},source_raster_dem:{type:{required:!0,type:"enum",values:{"raster-dem":{}}},url:{type:"string"},tiles:{type:"array",value:"string"},bounds:{type:"array",value:"number",length:4,default:[-180,-85.051129,180,85.051129]},minzoom:{type:"number",default:0},maxzoom:{type:"number",default:22},tileSize:{type:"number",default:512,units:"pixels"},attribution:{type:"string"},encoding:{type:"enum",values:{terrarium:{},mapbox:{}},default:"mapbox"},volatile:{type:"boolean",default:!1},"*":{type:"*"}},source_geojson:{type:{required:!0,type:"enum",values:{geojson:{}}},data:{required:!0,type:"*"},maxzoom:{type:"number",default:18},attribution:{type:"string"},buffer:{type:"number",default:128,maximum:512,minimum:0},filter:{type:"*"},tolerance:{type:"number",default:.375},cluster:{type:"boolean",default:!1},clusterRadius:{type:"number",default:50,minimum:0},clusterMaxZoom:{type:"number"},clusterMinPoints:{type:"number"},clusterProperties:{type:"*"},lineMetrics:{type:"boolean",default:!1},generateId:{type:"boolean",default:!1},promoteId:{type:"promoteId"}},source_video:{type:{required:!0,type:"enum",values:{video:{}}},urls:{required:!0,type:"array",value:"string"},coordinates:{required:!0,type:"array",length:4,value:{type:"array",length:2,value:"number"}}},source_image:{type:{required:!0,type:"enum",values:{image:{}}},url:{required:!0,type:"string"},coordinates:{required:!0,type:"array",length:4,value:{type:"array",length:2,value:"number"}}},layer:{id:{type:"string",required:!0},type:{type:"enum",values:{fill:{},line:{},symbol:{},circle:{},heatmap:{},"fill-extrusion":{},raster:{},hillshade:{},background:{}},required:!0},metadata:{type:"*"},source:{type:"string"},"source-layer":{type:"string"},minzoom:{type:"number",minimum:0,maximum:24},maxzoom:{type:"number",minimum:0,maximum:24},filter:{type:"filter"},layout:{type:"layout"},paint:{type:"paint"}},layout:["layout_fill","layout_line","layout_circle","layout_heatmap","layout_fill-extrusion","layout_symbol","layout_raster","layout_hillshade","layout_background"],layout_background:{visibility:{type:"enum",values:{visible:{},none:{}},default:"visible","property-type":"constant"}},layout_fill:{"fill-sort-key":{type:"number",expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},visibility:{type:"enum",values:{visible:{},none:{}},default:"visible","property-type":"constant"}},layout_circle:{"circle-sort-key":{type:"number",expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},visibility:{type:"enum",values:{visible:{},none:{}},default:"visible","property-type":"constant"}},layout_heatmap:{visibility:{type:"enum",values:{visible:{},none:{}},default:"visible","property-type":"constant"}},"layout_fill-extrusion":{visibility:{type:"enum",values:{visible:{},none:{}},default:"visible","property-type":"constant"}},layout_line:{"line-cap":{type:"enum",values:{butt:{},round:{},square:{}},default:"butt",expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"line-join":{type:"enum",values:{bevel:{},round:{},miter:{}},default:"miter",expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},"line-miter-limit":{type:"number",default:2,requires:[{"line-join":"miter"}],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"line-round-limit":{type:"number",default:1.05,requires:[{"line-join":"round"}],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"line-sort-key":{type:"number",expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},visibility:{type:"enum",values:{visible:{},none:{}},default:"visible","property-type":"constant"}},layout_symbol:{"symbol-placement":{type:"enum",values:{point:{},line:{},"line-center":{}},default:"point",expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"symbol-spacing":{type:"number",default:250,minimum:1,units:"pixels",requires:[{"symbol-placement":"line"}],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"symbol-avoid-edges":{type:"boolean",default:!1,expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"symbol-sort-key":{type:"number",expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},"symbol-z-order":{type:"enum",values:{auto:{},"viewport-y":{},source:{}},default:"auto",expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"icon-allow-overlap":{type:"boolean",default:!1,requires:["icon-image",{"!":"icon-overlap"}],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"icon-overlap":{type:"enum",values:{never:{},always:{},cooperative:{}},requires:["icon-image"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"icon-ignore-placement":{type:"boolean",default:!1,requires:["icon-image"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"icon-optional":{type:"boolean",default:!1,requires:["icon-image","text-field"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"icon-rotation-alignment":{type:"enum",values:{map:{},viewport:{},auto:{}},default:"auto",requires:["icon-image"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"icon-size":{type:"number",default:1,minimum:0,units:"factor of the original icon size",requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom","feature"]},"property-type":"data-driven"},"icon-text-fit":{type:"enum",values:{none:{},width:{},height:{},both:{}},default:"none",requires:["icon-image","text-field"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"icon-text-fit-padding":{type:"array",value:"number",length:4,default:[0,0,0,0],units:"pixels",requires:["icon-image","text-field",{"icon-text-fit":["both","width","height"]}],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"icon-image":{type:"resolvedImage",tokens:!0,expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},"icon-rotate":{type:"number",default:0,period:360,units:"degrees",requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom","feature"]},"property-type":"data-driven"},"icon-padding":{type:"padding",default:[2],units:"pixels",requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom","feature"]},"property-type":"data-driven"},"icon-keep-upright":{type:"boolean",default:!1,requires:["icon-image",{"icon-rotation-alignment":"map"},{"symbol-placement":["line","line-center"]}],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"icon-offset":{type:"array",value:"number",length:2,default:[0,0],requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom","feature"]},"property-type":"data-driven"},"icon-anchor":{type:"enum",values:{center:{},left:{},right:{},top:{},bottom:{},"top-left":{},"top-right":{},"bottom-left":{},"bottom-right":{}},default:"center",requires:["icon-image"],expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},"icon-pitch-alignment":{type:"enum",values:{map:{},viewport:{},auto:{}},default:"auto",requires:["icon-image"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-pitch-alignment":{type:"enum",values:{map:{},viewport:{},auto:{}},default:"auto",requires:["text-field"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-rotation-alignment":{type:"enum",values:{map:{},viewport:{},"viewport-glyph":{},auto:{}},default:"auto",requires:["text-field"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-field":{type:"formatted",default:"",tokens:!0,expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-font":{type:"array",value:"string",default:["Open Sans Regular","Arial Unicode MS Regular"],requires:["text-field"],expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-size":{type:"number",default:16,minimum:0,units:"pixels",requires:["text-field"],expression:{interpolated:!0,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-max-width":{type:"number",default:10,minimum:0,units:"ems",requires:["text-field"],expression:{interpolated:!0,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-line-height":{type:"number",default:1.2,units:"ems",requires:["text-field"],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"text-letter-spacing":{type:"number",default:0,units:"ems",requires:["text-field"],expression:{interpolated:!0,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-justify":{type:"enum",values:{auto:{},left:{},center:{},right:{}},default:"center",requires:["text-field"],expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-radial-offset":{type:"number",units:"ems",default:0,requires:["text-field"],"property-type":"data-driven",expression:{interpolated:!0,parameters:["zoom","feature"]}},"text-variable-anchor":{type:"array",value:"enum",values:{center:{},left:{},right:{},top:{},bottom:{},"top-left":{},"top-right":{},"bottom-left":{},"bottom-right":{}},requires:["text-field",{"symbol-placement":["point"]}],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-anchor":{type:"enum",values:{center:{},left:{},right:{},top:{},bottom:{},"top-left":{},"top-right":{},"bottom-left":{},"bottom-right":{}},default:"center",requires:["text-field",{"!":"text-variable-anchor"}],expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-max-angle":{type:"number",default:45,units:"degrees",requires:["text-field",{"symbol-placement":["line","line-center"]}],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"text-writing-mode":{type:"array",value:"enum",values:{horizontal:{},vertical:{}},requires:["text-field",{"symbol-placement":["point"]}],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-rotate":{type:"number",default:0,period:360,units:"degrees",requires:["text-field"],expression:{interpolated:!0,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-padding":{type:"number",default:2,minimum:0,units:"pixels",requires:["text-field"],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"text-keep-upright":{type:"boolean",default:!0,requires:["text-field",{"text-rotation-alignment":"map"},{"symbol-placement":["line","line-center"]}],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-transform":{type:"enum",values:{none:{},uppercase:{},lowercase:{}},default:"none",requires:["text-field"],expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-offset":{type:"array",value:"number",units:"ems",length:2,default:[0,0],requires:["text-field",{"!":"text-radial-offset"}],expression:{interpolated:!0,parameters:["zoom","feature"]},"property-type":"data-driven"},"text-allow-overlap":{type:"boolean",default:!1,requires:["text-field",{"!":"text-overlap"}],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-overlap":{type:"enum",values:{never:{},always:{},cooperative:{}},requires:["text-field"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-ignore-placement":{type:"boolean",default:!1,requires:["text-field"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-optional":{type:"boolean",default:!1,requires:["text-field","icon-image"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},visibility:{type:"enum",values:{visible:{},none:{}},default:"visible","property-type":"constant"}},layout_raster:{visibility:{type:"enum",values:{visible:{},none:{}},default:"visible","property-type":"constant"}},layout_hillshade:{visibility:{type:"enum",values:{visible:{},none:{}},default:"visible","property-type":"constant"}},filter:{type:"array",value:"*"},filter_operator:{type:"enum",values:{"==":{},"!=":{},">":{},">=":{},"<":{},"<=":{},in:{},"!in":{},all:{},any:{},none:{},has:{},"!has":{},within:{}}},geometry_type:{type:"enum",values:{Point:{},LineString:{},Polygon:{}}},function:{expression:{type:"expression"},stops:{type:"array",value:"function_stop"},base:{type:"number",default:1,minimum:0},property:{type:"string",default:"$zoom"},type:{type:"enum",values:{identity:{},exponential:{},interval:{},categorical:{}},default:"exponential"},colorSpace:{type:"enum",values:{rgb:{},lab:{},hcl:{}},default:"rgb"},default:{type:"*",required:!1}},function_stop:{type:"array",minimum:0,maximum:24,value:["number","color"],length:2},expression:{type:"array",value:"*",minimum:1},light:{anchor:{type:"enum",default:"viewport",values:{map:{},viewport:{}},"property-type":"data-constant",transition:!1,expression:{interpolated:!1,parameters:["zoom"]}},position:{type:"array",default:[1.15,210,30],length:3,value:"number","property-type":"data-constant",transition:!0,expression:{interpolated:!0,parameters:["zoom"]}},color:{type:"color","property-type":"data-constant",default:"#ffffff",expression:{interpolated:!0,parameters:["zoom"]},transition:!0},intensity:{type:"number","property-type":"data-constant",default:.5,minimum:0,maximum:1,expression:{interpolated:!0,parameters:["zoom"]},transition:!0}},terrain:{source:{type:"string",required:!0},exaggeration:{type:"number",minimum:0,default:1}},paint:["paint_fill","paint_line","paint_circle","paint_heatmap","paint_fill-extrusion","paint_symbol","paint_raster","paint_hillshade","paint_background"],paint_fill:{"fill-antialias":{type:"boolean",default:!0,expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"fill-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"fill-color":{type:"color",default:"#000000",transition:!0,requires:[{"!":"fill-pattern"}],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"fill-outline-color":{type:"color",transition:!0,requires:[{"!":"fill-pattern"},{"fill-antialias":!0}],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"fill-translate":{type:"array",value:"number",length:2,default:[0,0],transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"fill-translate-anchor":{type:"enum",values:{map:{},viewport:{}},default:"map",requires:["fill-translate"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"fill-pattern":{type:"resolvedImage",transition:!0,expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"cross-faded-data-driven"}},"paint_fill-extrusion":{"fill-extrusion-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"fill-extrusion-color":{type:"color",default:"#000000",transition:!0,requires:[{"!":"fill-extrusion-pattern"}],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"fill-extrusion-translate":{type:"array",value:"number",length:2,default:[0,0],transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"fill-extrusion-translate-anchor":{type:"enum",values:{map:{},viewport:{}},default:"map",requires:["fill-extrusion-translate"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"fill-extrusion-pattern":{type:"resolvedImage",transition:!0,expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"cross-faded-data-driven"},"fill-extrusion-height":{type:"number",default:0,minimum:0,units:"meters",transition:!0,expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"fill-extrusion-base":{type:"number",default:0,minimum:0,units:"meters",transition:!0,requires:["fill-extrusion-height"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"fill-extrusion-vertical-gradient":{type:"boolean",default:!0,transition:!1,expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"}},paint_line:{"line-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"line-color":{type:"color",default:"#000000",transition:!0,requires:[{"!":"line-pattern"}],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"line-translate":{type:"array",value:"number",length:2,default:[0,0],transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"line-translate-anchor":{type:"enum",values:{map:{},viewport:{}},default:"map",requires:["line-translate"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"line-width":{type:"number",default:1,minimum:0,transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"line-gap-width":{type:"number",default:0,minimum:0,transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"line-offset":{type:"number",default:0,transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"line-blur":{type:"number",default:0,minimum:0,transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"line-dasharray":{type:"array",value:"number",minimum:0,transition:!0,units:"line widths",requires:[{"!":"line-pattern"}],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"cross-faded"},"line-pattern":{type:"resolvedImage",transition:!0,expression:{interpolated:!1,parameters:["zoom","feature"]},"property-type":"cross-faded-data-driven"},"line-gradient":{type:"color",transition:!1,requires:[{"!":"line-dasharray"},{"!":"line-pattern"},{source:"geojson",has:{lineMetrics:!0}}],expression:{interpolated:!0,parameters:["line-progress"]},"property-type":"color-ramp"}},paint_circle:{"circle-radius":{type:"number",default:5,minimum:0,transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"circle-color":{type:"color",default:"#000000",transition:!0,expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"circle-blur":{type:"number",default:0,transition:!0,expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"circle-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"circle-translate":{type:"array",value:"number",length:2,default:[0,0],transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"circle-translate-anchor":{type:"enum",values:{map:{},viewport:{}},default:"map",requires:["circle-translate"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"circle-pitch-scale":{type:"enum",values:{map:{},viewport:{}},default:"map",expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"circle-pitch-alignment":{type:"enum",values:{map:{},viewport:{}},default:"viewport",expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"circle-stroke-width":{type:"number",default:0,minimum:0,transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"circle-stroke-color":{type:"color",default:"#000000",transition:!0,expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"circle-stroke-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"}},paint_heatmap:{"heatmap-radius":{type:"number",default:30,minimum:1,transition:!0,units:"pixels",expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"heatmap-weight":{type:"number",default:1,minimum:0,transition:!1,expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"heatmap-intensity":{type:"number",default:1,minimum:0,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"heatmap-color":{type:"color",default:["interpolate",["linear"],["heatmap-density"],0,"rgba(0, 0, 255, 0)",.1,"royalblue",.3,"cyan",.5,"lime",.7,"yellow",1,"red"],transition:!1,expression:{interpolated:!0,parameters:["heatmap-density"]},"property-type":"color-ramp"},"heatmap-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"}},paint_symbol:{"icon-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"icon-color":{type:"color",default:"#000000",transition:!0,requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"icon-halo-color":{type:"color",default:"rgba(0, 0, 0, 0)",transition:!0,requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"icon-halo-width":{type:"number",default:0,minimum:0,transition:!0,units:"pixels",requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"icon-halo-blur":{type:"number",default:0,minimum:0,transition:!0,units:"pixels",requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"icon-translate":{type:"array",value:"number",length:2,default:[0,0],transition:!0,units:"pixels",requires:["icon-image"],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"icon-translate-anchor":{type:"enum",values:{map:{},viewport:{}},default:"map",requires:["icon-image","icon-translate"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"text-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,requires:["text-field"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"text-color":{type:"color",default:"#000000",transition:!0,overridable:!0,requires:["text-field"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"text-halo-color":{type:"color",default:"rgba(0, 0, 0, 0)",transition:!0,requires:["text-field"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"text-halo-width":{type:"number",default:0,minimum:0,transition:!0,units:"pixels",requires:["text-field"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"text-halo-blur":{type:"number",default:0,minimum:0,transition:!0,units:"pixels",requires:["text-field"],expression:{interpolated:!0,parameters:["zoom","feature","feature-state"]},"property-type":"data-driven"},"text-translate":{type:"array",value:"number",length:2,default:[0,0],transition:!0,units:"pixels",requires:["text-field"],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"text-translate-anchor":{type:"enum",values:{map:{},viewport:{}},default:"map",requires:["text-field","text-translate"],expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"}},paint_raster:{"raster-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"raster-hue-rotate":{type:"number",default:0,period:360,transition:!0,units:"degrees",expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"raster-brightness-min":{type:"number",default:0,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"raster-brightness-max":{type:"number",default:1,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"raster-saturation":{type:"number",default:0,minimum:-1,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"raster-contrast":{type:"number",default:0,minimum:-1,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"raster-resampling":{type:"enum",values:{linear:{},nearest:{}},default:"linear",expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"raster-fade-duration":{type:"number",default:300,minimum:0,transition:!1,units:"milliseconds",expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"}},paint_hillshade:{"hillshade-illumination-direction":{type:"number",default:335,minimum:0,maximum:359,transition:!1,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"hillshade-illumination-anchor":{type:"enum",values:{map:{},viewport:{}},default:"viewport",expression:{interpolated:!1,parameters:["zoom"]},"property-type":"data-constant"},"hillshade-exaggeration":{type:"number",default:.5,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"hillshade-shadow-color":{type:"color",default:"#000000",transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"hillshade-highlight-color":{type:"color",default:"#FFFFFF",transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"hillshade-accent-color":{type:"color",default:"#000000",transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"}},paint_background:{"background-color":{type:"color",default:"#000000",transition:!0,requires:[{"!":"background-pattern"}],expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"},"background-pattern":{type:"resolvedImage",transition:!0,expression:{interpolated:!1,parameters:["zoom"]},"property-type":"cross-faded"},"background-opacity":{type:"number",default:1,minimum:0,maximum:1,transition:!0,expression:{interpolated:!0,parameters:["zoom"]},"property-type":"data-constant"}},transition:{duration:{type:"number",default:300,minimum:0,units:"milliseconds"},delay:{type:"number",default:0,minimum:0,units:"milliseconds"}},"property-type":{"data-driven":{type:"property-type"},"cross-faded":{type:"property-type"},"cross-faded-data-driven":{type:"property-type"},"color-ramp":{type:"property-type"},"data-constant":{type:"property-type"},constant:{type:"property-type"}},promoteId:{"*":{type:"string"}}};const j=["type","source","source-layer","minzoom","maxzoom","filter","layout"];function N(t,e){const r={};for(const e in t)"ref"!==e&&(r[e]=t[e]);return j.forEach((t=>{t in e&&(r[t]=e[t]);})),r}function Z(t,e){if(Array.isArray(t)){if(!Array.isArray(e)||t.length!==e.length)return !1;for(let r=0;r<t.length;r++)if(!Z(t[r],e[r]))return !1;return !0}if("object"==typeof t&&null!==t&&null!==e){if("object"!=typeof e)return !1;if(Object.keys(t).length!==Object.keys(e).length)return !1;for(const r in t)if(!Z(t[r],e[r]))return !1;return !0}return t===e}const K={setStyle:"setStyle",addLayer:"addLayer",removeLayer:"removeLayer",setPaintProperty:"setPaintProperty",setLayoutProperty:"setLayoutProperty",setFilter:"setFilter",addSource:"addSource",removeSource:"removeSource",setGeoJSONSourceData:"setGeoJSONSourceData",setLayerZoomRange:"setLayerZoomRange",setLayerProperty:"setLayerProperty",setCenter:"setCenter",setZoom:"setZoom",setBearing:"setBearing",setPitch:"setPitch",setSprite:"setSprite",setGlyphs:"setGlyphs",setTransition:"setTransition",setLight:"setLight"};function G(t,e,r){r.push({command:K.addSource,args:[t,e[t]]});}function J(t,e,r){e.push({command:K.removeSource,args:[t]}),r[t]=!0;}function X(t,e,r,n){J(t,r,n),G(t,e,r);}function Y(t,e,r){let n;for(n in t[r])if(Object.prototype.hasOwnProperty.call(t[r],n)&&"data"!==n&&!Z(t[r][n],e[r][n]))return !1;for(n in e[r])if(Object.prototype.hasOwnProperty.call(e[r],n)&&"data"!==n&&!Z(t[r][n],e[r][n]))return !1;return !0}function H(t,e,r,n,i,a){let s;for(s in e=e||{},t=t||{})Object.prototype.hasOwnProperty.call(t,s)&&(Z(t[s],e[s])||r.push({command:a,args:[n,s,e[s],i]}));for(s in e)Object.prototype.hasOwnProperty.call(e,s)&&!Object.prototype.hasOwnProperty.call(t,s)&&(Z(t[s],e[s])||r.push({command:a,args:[n,s,e[s],i]}));}function W(t){return t.id}function Q(t,e){return t[e.id]=e,t}class tt{constructor(t,e,r,n){this.message=(t?`${t}: `:"")+r,n&&(this.identifier=n),null!=e&&e.__line__&&(this.line=e.__line__);}}function et(t,...e){for(const r of e)for(const e in r)t[e]=r[e];return t}class rt extends Error{constructor(t,e){super(e),this.message=e,this.key=t;}}class nt{constructor(t,e=[]){this.parent=t,this.bindings={};for(const[t,r]of e)this.bindings[t]=r;}concat(t){return new nt(this,t)}get(t){if(this.bindings[t])return this.bindings[t];if(this.parent)return this.parent.get(t);throw new Error(`${t} not found in scope.`)}has(t){return !!this.bindings[t]||!!this.parent&&this.parent.has(t)}}const it={kind:"null"},at={kind:"number"},st={kind:"string"},ot={kind:"boolean"},lt={kind:"color"},ut={kind:"object"},ct={kind:"value"},ht={kind:"collator"},pt={kind:"formatted"},ft={kind:"padding"},dt={kind:"resolvedImage"};function yt(t,e){return {kind:"array",itemType:t,N:e}}function mt(t){if("array"===t.kind){const e=mt(t.itemType);return "number"==typeof t.N?`array<${e}, ${t.N}>`:"value"===t.itemType.kind?"array":`array<${e}>`}return t.kind}const gt=[it,at,st,ot,lt,pt,ut,yt(ct),ft,dt];function xt(t,e){if("error"===e.kind)return null;if("array"===t.kind){if("array"===e.kind&&(0===e.N&&"value"===e.itemType.kind||!xt(t.itemType,e.itemType))&&("number"!=typeof t.N||t.N===e.N))return null}else {if(t.kind===e.kind)return null;if("value"===t.kind)for(const t of gt)if(!xt(t,e))return null}return `Expected ${mt(t)} but found ${mt(e)} instead.`}function vt(t,e){return e.some((e=>e.kind===t.kind))}function bt(t,e){return e.some((e=>"null"===e?null===t:"array"===e?Array.isArray(t):"object"===e?t&&!Array.isArray(t)&&"object"==typeof t:e===typeof t))}function wt(t,e){return "array"===t.kind&&"array"===e.kind?t.itemType.kind===e.itemType.kind&&"number"==typeof t.N:t.kind===e.kind}const _t=.96422,At=.82521,kt=4/29,St=6/29,It=3*St*St,zt=St*St*St,Mt=Math.PI/180,Pt=180/Math.PI;function Bt(t){return (t%=360)<0&&(t+=360),t}function Ct([t,e,r,n]){let i,a;const s=Et((.2225045*(t=Vt(t))+.7168786*(e=Vt(e))+.0606169*(r=Vt(r)))/1);t===e&&e===r?i=a=s:(i=Et((.4360747*t+.3850649*e+.1430804*r)/_t),a=Et((.0139322*t+.0971045*e+.7141733*r)/At));const o=116*s-16;return [o<0?0:o,500*(i-s),200*(s-a),n]}function Vt(t){return t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function Et(t){return t>zt?Math.pow(t,1/3):t/It+kt}function Ft([t,e,r,n]){let i=(t+16)/116,a=isNaN(e)?i:i+e/500,s=isNaN(r)?i:i-r/200;return i=1*Lt(i),a=_t*Lt(a),s=At*Lt(s),[Tt(3.1338561*a-1.6168667*i-.4906146*s),Tt(-.9787684*a+1.9161415*i+.033454*s),Tt(.0719453*a-.2289914*i+1.4052427*s),n]}function Tt(t){return (t=t<=.00304?12.92*t:1.055*Math.pow(t,1/2.4)-.055)<0?0:t>1?1:t}function Lt(t){return t>St?t*t*t:It*(t-kt)}function $t(t){return parseInt(t.padEnd(2,t),16)/255}function Dt(t,e){return Ot(e?t/100:t,0,1)}function Ot(t,e,r){return Math.min(Math.max(e,t),r)}function Ut(t){return !t.some(Number.isNaN)}const Rt={aliceblue:[240,248,255],antiquewhite:[250,235,215],aqua:[0,255,255],aquamarine:[127,255,212],azure:[240,255,255],beige:[245,245,220],bisque:[255,228,196],black:[0,0,0],blanchedalmond:[255,235,205],blue:[0,0,255],blueviolet:[138,43,226],brown:[165,42,42],burlywood:[222,184,135],cadetblue:[95,158,160],chartreuse:[127,255,0],chocolate:[210,105,30],coral:[255,127,80],cornflowerblue:[100,149,237],cornsilk:[255,248,220],crimson:[220,20,60],cyan:[0,255,255],darkblue:[0,0,139],darkcyan:[0,139,139],darkgoldenrod:[184,134,11],darkgray:[169,169,169],darkgreen:[0,100,0],darkgrey:[169,169,169],darkkhaki:[189,183,107],darkmagenta:[139,0,139],darkolivegreen:[85,107,47],darkorange:[255,140,0],darkorchid:[153,50,204],darkred:[139,0,0],darksalmon:[233,150,122],darkseagreen:[143,188,143],darkslateblue:[72,61,139],darkslategray:[47,79,79],darkslategrey:[47,79,79],darkturquoise:[0,206,209],darkviolet:[148,0,211],deeppink:[255,20,147],deepskyblue:[0,191,255],dimgray:[105,105,105],dimgrey:[105,105,105],dodgerblue:[30,144,255],firebrick:[178,34,34],floralwhite:[255,250,240],forestgreen:[34,139,34],fuchsia:[255,0,255],gainsboro:[220,220,220],ghostwhite:[248,248,255],gold:[255,215,0],goldenrod:[218,165,32],gray:[128,128,128],green:[0,128,0],greenyellow:[173,255,47],grey:[128,128,128],honeydew:[240,255,240],hotpink:[255,105,180],indianred:[205,92,92],indigo:[75,0,130],ivory:[255,255,240],khaki:[240,230,140],lavender:[230,230,250],lavenderblush:[255,240,245],lawngreen:[124,252,0],lemonchiffon:[255,250,205],lightblue:[173,216,230],lightcoral:[240,128,128],lightcyan:[224,255,255],lightgoldenrodyellow:[250,250,210],lightgray:[211,211,211],lightgreen:[144,238,144],lightgrey:[211,211,211],lightpink:[255,182,193],lightsalmon:[255,160,122],lightseagreen:[32,178,170],lightskyblue:[135,206,250],lightslategray:[119,136,153],lightslategrey:[119,136,153],lightsteelblue:[176,196,222],lightyellow:[255,255,224],lime:[0,255,0],limegreen:[50,205,50],linen:[250,240,230],magenta:[255,0,255],maroon:[128,0,0],mediumaquamarine:[102,205,170],mediumblue:[0,0,205],mediumorchid:[186,85,211],mediumpurple:[147,112,219],mediumseagreen:[60,179,113],mediumslateblue:[123,104,238],mediumspringgreen:[0,250,154],mediumturquoise:[72,209,204],mediumvioletred:[199,21,133],midnightblue:[25,25,112],mintcream:[245,255,250],mistyrose:[255,228,225],moccasin:[255,228,181],navajowhite:[255,222,173],navy:[0,0,128],oldlace:[253,245,230],olive:[128,128,0],olivedrab:[107,142,35],orange:[255,165,0],orangered:[255,69,0],orchid:[218,112,214],palegoldenrod:[238,232,170],palegreen:[152,251,152],paleturquoise:[175,238,238],palevioletred:[219,112,147],papayawhip:[255,239,213],peachpuff:[255,218,185],peru:[205,133,63],pink:[255,192,203],plum:[221,160,221],powderblue:[176,224,230],purple:[128,0,128],rebeccapurple:[102,51,153],red:[255,0,0],rosybrown:[188,143,143],royalblue:[65,105,225],saddlebrown:[139,69,19],salmon:[250,128,114],sandybrown:[244,164,96],seagreen:[46,139,87],seashell:[255,245,238],sienna:[160,82,45],silver:[192,192,192],skyblue:[135,206,235],slateblue:[106,90,205],slategray:[112,128,144],slategrey:[112,128,144],snow:[255,250,250],springgreen:[0,255,127],steelblue:[70,130,180],tan:[210,180,140],teal:[0,128,128],thistle:[216,191,216],tomato:[255,99,71],turquoise:[64,224,208],violet:[238,130,238],wheat:[245,222,179],white:[255,255,255],whitesmoke:[245,245,245],yellow:[255,255,0],yellowgreen:[154,205,50]};class qt{constructor(t,e,r,n=1,i=!0){this.r=t,this.g=e,this.b=r,this.a=n,i||(this.r*=n,this.g*=n,this.b*=n,n||this.overwriteGetter("rgb",[t,e,r,n]));}static parse(t){if(t instanceof qt)return t;if("string"!=typeof t)return;const e=function(t){if("transparent"===(t=t.toLowerCase().trim()))return [0,0,0,0];const e=Rt[t];if(e){const[t,r,n]=e;return [t/255,r/255,n/255,1]}if(t.startsWith("#")&&/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(t)){const e=t.length<6?1:2;let r=1;return [$t(t.slice(r,r+=e)),$t(t.slice(r,r+=e)),$t(t.slice(r,r+=e)),$t(t.slice(r,r+e)||"ff")]}if(t.startsWith("rgb")){const e=t.match(/^rgba?\(\s*([\de.+-]+)(%)?(?:\s+|\s*(,)\s*)([\de.+-]+)(%)?(?:\s+|\s*(,)\s*)([\de.+-]+)(%)?(?:\s*([,\/])\s*([\de.+-]+)(%)?)?\s*\)$/);if(e){const[t,r,n,i,a,s,o,l,u,c,h,p]=e,f=[i||" ",o||" ",c].join("");if("  "===f||"  /"===f||",,"===f||",,,"===f){const t=[n,s,u].join(""),e="%%%"===t?100:""===t?255:0;if(e){const t=[Ot(+r/e,0,1),Ot(+a/e,0,1),Ot(+l/e,0,1),h?Dt(+h,p):1];if(Ut(t))return t}}return}}const r=t.match(/^hsla?\(\s*([\de.+-]+)(?:deg)?(?:\s+|\s*(,)\s*)([\de.+-]+)%(?:\s+|\s*(,)\s*)([\de.+-]+)%(?:\s*([,\/])\s*([\de.+-]+)(%)?)?\s*\)$/);if(r){const[t,e,n,i,a,s,o,l,u]=r,c=[n||" ",a||" ",o].join("");if("  "===c||"  /"===c||",,"===c||",,,"===c){const t=[+e,Ot(+i,0,100),Ot(+s,0,100),l?Dt(+l,u):1];if(Ut(t))return function([t,e,r,n]){function i(n){const i=(n+t/30)%12,a=e*Math.min(r,1-r);return r-a*Math.max(-1,Math.min(i-3,9-i,1))}return t=Bt(t),e/=100,r/=100,[i(0),i(8),i(4),n]}(t)}}}(t);return e?new qt(...e,!1):void 0}get rgb(){const{r:t,g:e,b:r,a:n}=this,i=n||1/0;return this.overwriteGetter("rgb",[t/i,e/i,r/i,n])}get hcl(){return this.overwriteGetter("hcl",function(t){const[e,r,n,i]=Ct(t),a=Math.sqrt(r*r+n*n);return [Math.round(1e4*a)?Bt(Math.atan2(n,r)*Pt):NaN,a,e,i]}(this.rgb))}get lab(){return this.overwriteGetter("lab",Ct(this.rgb))}overwriteGetter(t,e){return Object.defineProperty(this,t,{value:e}),e}toString(){const[t,e,r,n]=this.rgb;return `rgba(${[t,e,r].map((t=>Math.round(255*t))).join(",")},${n})`}}qt.black=new qt(0,0,0,1),qt.white=new qt(1,1,1,1),qt.transparent=new qt(0,0,0,0),qt.red=new qt(1,0,0,1);class jt{constructor(t,e,r){this.sensitivity=t?e?"variant":"case":e?"accent":"base",this.locale=r,this.collator=new Intl.Collator(this.locale?this.locale:[],{sensitivity:this.sensitivity,usage:"search"});}compare(t,e){return this.collator.compare(t,e)}resolvedLocale(){return new Intl.Collator(this.locale?this.locale:[]).resolvedOptions().locale}}class Nt{constructor(t,e,r,n,i){this.text=t,this.image=e,this.scale=r,this.fontStack=n,this.textColor=i;}}class Zt{constructor(t){this.sections=t;}static fromString(t){return new Zt([new Nt(t,null,null,null,null)])}isEmpty(){return 0===this.sections.length||!this.sections.some((t=>0!==t.text.length||t.image&&0!==t.image.name.length))}static factory(t){return t instanceof Zt?t:Zt.fromString(t)}toString(){return 0===this.sections.length?"":this.sections.map((t=>t.text)).join("")}}class Kt{constructor(t){this.values=t.slice();}static parse(t){if(t instanceof Kt)return t;if("number"==typeof t)return new Kt([t,t,t,t]);if(Array.isArray(t)&&!(t.length<1||t.length>4)){for(const e of t)if("number"!=typeof e)return;switch(t.length){case 1:t=[t[0],t[0],t[0],t[0]];break;case 2:t=[t[0],t[1],t[0],t[1]];break;case 3:t=[t[0],t[1],t[2],t[1]];}return new Kt(t)}}toString(){return JSON.stringify(this.values)}}class Gt{constructor(t){this.name=t.name,this.available=t.available;}toString(){return this.name}static fromString(t){return t?new Gt({name:t,available:!1}):null}}function Jt(t,e,r,n){return "number"==typeof t&&t>=0&&t<=255&&"number"==typeof e&&e>=0&&e<=255&&"number"==typeof r&&r>=0&&r<=255?void 0===n||"number"==typeof n&&n>=0&&n<=1?null:`Invalid rgba value [${[t,e,r,n].join(", ")}]: 'a' must be between 0 and 1.`:`Invalid rgba value [${("number"==typeof n?[t,e,r,n]:[t,e,r]).join(", ")}]: 'r', 'g', and 'b' must be between 0 and 255.`}function Xt(t){if(null===t)return !0;if("string"==typeof t)return !0;if("boolean"==typeof t)return !0;if("number"==typeof t)return !0;if(t instanceof qt)return !0;if(t instanceof jt)return !0;if(t instanceof Zt)return !0;if(t instanceof Kt)return !0;if(t instanceof Gt)return !0;if(Array.isArray(t)){for(const e of t)if(!Xt(e))return !1;return !0}if("object"==typeof t){for(const e in t)if(!Xt(t[e]))return !1;return !0}return !1}function Yt(t){if(null===t)return it;if("string"==typeof t)return st;if("boolean"==typeof t)return ot;if("number"==typeof t)return at;if(t instanceof qt)return lt;if(t instanceof jt)return ht;if(t instanceof Zt)return pt;if(t instanceof Kt)return ft;if(t instanceof Gt)return dt;if(Array.isArray(t)){const e=t.length;let r;for(const e of t){const t=Yt(e);if(r){if(r===t)continue;r=ct;break}r=t;}return yt(r||ct,e)}return ut}function Ht(t){const e=typeof t;return null===t?"":"string"===e||"number"===e||"boolean"===e?String(t):t instanceof qt||t instanceof Zt||t instanceof Kt||t instanceof Gt?t.toString():JSON.stringify(t)}class Wt{constructor(t,e){this.type=t,this.value=e;}static parse(t,e){if(2!==t.length)return e.error(`'literal' expression requires exactly one argument, but found ${t.length-1} instead.`);if(!Xt(t[1]))return e.error("invalid value");const r=t[1];let n=Yt(r);const i=e.expectedType;return "array"!==n.kind||0!==n.N||!i||"array"!==i.kind||"number"==typeof i.N&&0!==i.N||(n=i),new Wt(n,r)}evaluate(){return this.value}eachChild(){}outputDefined(){return !0}}class Qt{constructor(t){this.name="ExpressionEvaluationError",this.message=t;}toJSON(){return this.message}}const te={string:st,number:at,boolean:ot,object:ut};class ee{constructor(t,e){this.type=t,this.args=e;}static parse(t,e){if(t.length<2)return e.error("Expected at least one argument.");let r,n=1;const i=t[0];if("array"===i){let i,a;if(t.length>2){const r=t[1];if("string"!=typeof r||!(r in te)||"object"===r)return e.error('The item type argument of "array" must be one of string, number, boolean',1);i=te[r],n++;}else i=ct;if(t.length>3){if(null!==t[2]&&("number"!=typeof t[2]||t[2]<0||t[2]!==Math.floor(t[2])))return e.error('The length argument to "array" must be a positive integer literal',2);a=t[2],n++;}r=yt(i,a);}else {if(!te[i])throw new Error(`Types doesn't contain name = ${i}`);r=te[i];}const a=[];for(;n<t.length;n++){const r=e.parse(t[n],n,ct);if(!r)return null;a.push(r);}return new ee(r,a)}evaluate(t){for(let e=0;e<this.args.length;e++){const r=this.args[e].evaluate(t);if(!xt(this.type,Yt(r)))return r;if(e===this.args.length-1)throw new Qt(`Expected value to be of type ${mt(this.type)}, but found ${mt(Yt(r))} instead.`)}throw new Error}eachChild(t){this.args.forEach(t);}outputDefined(){return this.args.every((t=>t.outputDefined()))}}const re={"to-boolean":ot,"to-color":lt,"to-number":at,"to-string":st};class ne{constructor(t,e){this.type=t,this.args=e;}static parse(t,e){if(t.length<2)return e.error("Expected at least one argument.");const r=t[0];if(!re[r])throw new Error(`Can't parse ${r} as it is not part of the known types`);if(("to-boolean"===r||"to-string"===r)&&2!==t.length)return e.error("Expected one argument.");const n=re[r],i=[];for(let r=1;r<t.length;r++){const n=e.parse(t[r],r,ct);if(!n)return null;i.push(n);}return new ne(n,i)}evaluate(t){if("boolean"===this.type.kind)return Boolean(this.args[0].evaluate(t));if("color"===this.type.kind){let e,r;for(const n of this.args){if(e=n.evaluate(t),r=null,e instanceof qt)return e;if("string"==typeof e){const r=t.parseColor(e);if(r)return r}else if(Array.isArray(e)&&(r=e.length<3||e.length>4?`Invalid rbga value ${JSON.stringify(e)}: expected an array containing either three or four numeric values.`:Jt(e[0],e[1],e[2],e[3]),!r))return new qt(e[0]/255,e[1]/255,e[2]/255,e[3])}throw new Qt(r||`Could not parse color from value '${"string"==typeof e?e:JSON.stringify(e)}'`)}if("padding"===this.type.kind){let e;for(const r of this.args){e=r.evaluate(t);const n=Kt.parse(e);if(n)return n}throw new Qt(`Could not parse padding from value '${"string"==typeof e?e:JSON.stringify(e)}'`)}if("number"===this.type.kind){let e=null;for(const r of this.args){if(e=r.evaluate(t),null===e)return 0;const n=Number(e);if(!isNaN(n))return n}throw new Qt(`Could not convert ${JSON.stringify(e)} to number.`)}return "formatted"===this.type.kind?Zt.fromString(Ht(this.args[0].evaluate(t))):"resolvedImage"===this.type.kind?Gt.fromString(Ht(this.args[0].evaluate(t))):Ht(this.args[0].evaluate(t))}eachChild(t){this.args.forEach(t);}outputDefined(){return this.args.every((t=>t.outputDefined()))}}const ie=["Unknown","Point","LineString","Polygon"];class ae{constructor(){this.globals=null,this.feature=null,this.featureState=null,this.formattedSection=null,this._parseColorCache={},this.availableImages=null,this.canonical=null;}id(){return this.feature&&"id"in this.feature?this.feature.id:null}geometryType(){return this.feature?"number"==typeof this.feature.type?ie[this.feature.type]:this.feature.type:null}geometry(){return this.feature&&"geometry"in this.feature?this.feature.geometry:null}canonicalID(){return this.canonical}properties(){return this.feature&&this.feature.properties||{}}parseColor(t){let e=this._parseColorCache[t];return e||(e=this._parseColorCache[t]=qt.parse(t)),e}}class se{constructor(t,e,r=[],n,i=new nt,a=[]){this.registry=t,this.path=r,this.key=r.map((t=>`[${t}]`)).join(""),this.scope=i,this.errors=a,this.expectedType=n,this._isConstant=e;}parse(t,e,r,n,i={}){return e?this.concat(e,r,n)._parse(t,i):this._parse(t,i)}_parse(t,e){function r(t,e,r){return "assert"===r?new ee(e,[t]):"coerce"===r?new ne(e,[t]):t}if(null!==t&&"string"!=typeof t&&"boolean"!=typeof t&&"number"!=typeof t||(t=["literal",t]),Array.isArray(t)){if(0===t.length)return this.error('Expected an array with at least one element. If you wanted a literal array, use ["literal", []].');const n=t[0];if("string"!=typeof n)return this.error(`Expression name must be a string, but found ${typeof n} instead. If you wanted a literal array, use ["literal", [...]].`,0),null;const i=this.registry[n];if(i){let n=i.parse(t,this);if(!n)return null;if(this.expectedType){const t=this.expectedType,i=n.type;if("string"!==t.kind&&"number"!==t.kind&&"boolean"!==t.kind&&"object"!==t.kind&&"array"!==t.kind||"value"!==i.kind)if("color"!==t.kind&&"formatted"!==t.kind&&"resolvedImage"!==t.kind||"value"!==i.kind&&"string"!==i.kind)if("padding"!==t.kind||"value"!==i.kind&&"number"!==i.kind&&"array"!==i.kind){if(this.checkSubtype(t,i))return null}else n=r(n,t,e.typeAnnotation||"coerce");else n=r(n,t,e.typeAnnotation||"coerce");else n=r(n,t,e.typeAnnotation||"assert");}if(!(n instanceof Wt)&&"resolvedImage"!==n.type.kind&&this._isConstant(n)){const t=new ae;try{n=new Wt(n.type,n.evaluate(t));}catch(t){return this.error(t.message),null}}return n}return this.error(`Unknown expression "${n}". If you wanted a literal array, use ["literal", [...]].`,0)}return this.error(void 0===t?"'undefined' value invalid. Use null instead.":"object"==typeof t?'Bare objects invalid. Use ["literal", {...}] instead.':`Expected an array, but found ${typeof t} instead.`)}concat(t,e,r){const n="number"==typeof t?this.path.concat(t):this.path,i=r?this.scope.concat(r):this.scope;return new se(this.registry,this._isConstant,n,e||null,i,this.errors)}error(t,...e){const r=`${this.key}${e.map((t=>`[${t}]`)).join("")}`;this.errors.push(new rt(r,t));}checkSubtype(t,e){const r=xt(t,e);return r&&this.error(r),r}}class oe{constructor(t,e,r){this.type=ht,this.locale=r,this.caseSensitive=t,this.diacriticSensitive=e;}static parse(t,e){if(2!==t.length)return e.error("Expected one argument.");const r=t[1];if("object"!=typeof r||Array.isArray(r))return e.error("Collator options argument must be an object.");const n=e.parse(void 0!==r["case-sensitive"]&&r["case-sensitive"],1,ot);if(!n)return null;const i=e.parse(void 0!==r["diacritic-sensitive"]&&r["diacritic-sensitive"],1,ot);if(!i)return null;let a=null;return r.locale&&(a=e.parse(r.locale,1,st),!a)?null:new oe(n,i,a)}evaluate(t){return new jt(this.caseSensitive.evaluate(t),this.diacriticSensitive.evaluate(t),this.locale?this.locale.evaluate(t):null)}eachChild(t){t(this.caseSensitive),t(this.diacriticSensitive),this.locale&&t(this.locale);}outputDefined(){return !1}}const le=8192;function ue(t,e){t[0]=Math.min(t[0],e[0]),t[1]=Math.min(t[1],e[1]),t[2]=Math.max(t[2],e[0]),t[3]=Math.max(t[3],e[1]);}function ce(t,e){return !(t[0]<=e[0]||t[2]>=e[2]||t[1]<=e[1]||t[3]>=e[3])}function he(t,e){const r=(180+t[0])/360,n=(180-180/Math.PI*Math.log(Math.tan(Math.PI/4+t[1]*Math.PI/360)))/360,i=Math.pow(2,e.z);return [Math.round(r*i*le),Math.round(n*i*le)]}function pe(t,e,r){const n=t[0]-e[0],i=t[1]-e[1],a=t[0]-r[0],s=t[1]-r[1];return n*s-a*i==0&&n*a<=0&&i*s<=0}function fe(t,e){let r=!1;for(let s=0,o=e.length;s<o;s++){const o=e[s];for(let e=0,s=o.length;e<s-1;e++){if(pe(t,o[e],o[e+1]))return !1;(i=o[e])[1]>(n=t)[1]!=(a=o[e+1])[1]>n[1]&&n[0]<(a[0]-i[0])*(n[1]-i[1])/(a[1]-i[1])+i[0]&&(r=!r);}}var n,i,a;return r}function de(t,e){for(let r=0;r<e.length;r++)if(fe(t,e[r]))return !0;return !1}function ye(t,e,r,n){const i=n[0]-r[0],a=n[1]-r[1],s=(t[0]-r[0])*a-i*(t[1]-r[1]),o=(e[0]-r[0])*a-i*(e[1]-r[1]);return s>0&&o<0||s<0&&o>0}function me(t,e,r){for(const u of r)for(let r=0;r<u.length-1;++r)if(0!=(o=[(s=u[r+1])[0]-(a=u[r])[0],s[1]-a[1]])[0]*(l=[(i=e)[0]-(n=t)[0],i[1]-n[1]])[1]-o[1]*l[0]&&ye(n,i,a,s)&&ye(a,s,n,i))return !0;var n,i,a,s,o,l;return !1}function ge(t,e){for(let r=0;r<t.length;++r)if(!fe(t[r],e))return !1;for(let r=0;r<t.length-1;++r)if(me(t[r],t[r+1],e))return !1;return !0}function xe(t,e){for(let r=0;r<e.length;r++)if(ge(t,e[r]))return !0;return !1}function ve(t,e,r){const n=[];for(let i=0;i<t.length;i++){const a=[];for(let n=0;n<t[i].length;n++){const s=he(t[i][n],r);ue(e,s),a.push(s);}n.push(a);}return n}function be(t,e,r){const n=[];for(let i=0;i<t.length;i++){const a=ve(t[i],e,r);n.push(a);}return n}function we(t,e,r,n){if(t[0]<r[0]||t[0]>r[2]){const e=.5*n;let i=t[0]-r[0]>e?-n:r[0]-t[0]>e?n:0;0===i&&(i=t[0]-r[2]>e?-n:r[2]-t[0]>e?n:0),t[0]+=i;}ue(e,t);}function _e(t,e,r,n){const i=Math.pow(2,n.z)*le,a=[n.x*le,n.y*le],s=[];for(const n of t)for(const t of n){const n=[t.x+a[0],t.y+a[1]];we(n,e,r,i),s.push(n);}return s}function Ae(t,e,r,n){const i=Math.pow(2,n.z)*le,a=[n.x*le,n.y*le],s=[];for(const r of t){const t=[];for(const n of r){const r=[n.x+a[0],n.y+a[1]];ue(e,r),t.push(r);}s.push(t);}if(e[2]-e[0]<=i/2){(o=e)[0]=o[1]=1/0,o[2]=o[3]=-1/0;for(const t of s)for(const n of t)we(n,e,r,i);}var o;return s}class ke{constructor(t,e){this.type=ot,this.geojson=t,this.geometries=e;}static parse(t,e){if(2!==t.length)return e.error(`'within' expression requires exactly one argument, but found ${t.length-1} instead.`);if(Xt(t[1])){const e=t[1];if("FeatureCollection"===e.type)for(let t=0;t<e.features.length;++t){const r=e.features[t].geometry.type;if("Polygon"===r||"MultiPolygon"===r)return new ke(e,e.features[t].geometry)}else if("Feature"===e.type){const t=e.geometry.type;if("Polygon"===t||"MultiPolygon"===t)return new ke(e,e.geometry)}else if("Polygon"===e.type||"MultiPolygon"===e.type)return new ke(e,e)}return e.error("'within' expression requires valid geojson object that contains polygon geometry type.")}evaluate(t){if(null!=t.geometry()&&null!=t.canonicalID()){if("Point"===t.geometryType())return function(t,e){const r=[1/0,1/0,-1/0,-1/0],n=[1/0,1/0,-1/0,-1/0],i=t.canonicalID();if("Polygon"===e.type){const a=ve(e.coordinates,n,i),s=_e(t.geometry(),r,n,i);if(!ce(r,n))return !1;for(const t of s)if(!fe(t,a))return !1}if("MultiPolygon"===e.type){const a=be(e.coordinates,n,i),s=_e(t.geometry(),r,n,i);if(!ce(r,n))return !1;for(const t of s)if(!de(t,a))return !1}return !0}(t,this.geometries);if("LineString"===t.geometryType())return function(t,e){const r=[1/0,1/0,-1/0,-1/0],n=[1/0,1/0,-1/0,-1/0],i=t.canonicalID();if("Polygon"===e.type){const a=ve(e.coordinates,n,i),s=Ae(t.geometry(),r,n,i);if(!ce(r,n))return !1;for(const t of s)if(!ge(t,a))return !1}if("MultiPolygon"===e.type){const a=be(e.coordinates,n,i),s=Ae(t.geometry(),r,n,i);if(!ce(r,n))return !1;for(const t of s)if(!xe(t,a))return !1}return !0}(t,this.geometries)}return !1}eachChild(){}outputDefined(){return !0}}class Se{constructor(t,e){this.type=e.type,this.name=t,this.boundExpression=e;}static parse(t,e){if(2!==t.length||"string"!=typeof t[1])return e.error("'var' expression requires exactly one string literal argument.");const r=t[1];return e.scope.has(r)?new Se(r,e.scope.get(r)):e.error(`Unknown variable "${r}". Make sure "${r}" has been bound in an enclosing "let" expression before using it.`,1)}evaluate(t){return this.boundExpression.evaluate(t)}eachChild(){}outputDefined(){return !1}}class Ie{constructor(t,e,r,n){this.name=t,this.type=e,this._evaluate=r,this.args=n;}evaluate(t){return this._evaluate(t,this.args)}eachChild(t){this.args.forEach(t);}outputDefined(){return !1}static parse(t,e){const r=t[0],n=Ie.definitions[r];if(!n)return e.error(`Unknown expression "${r}". If you wanted a literal array, use ["literal", [...]].`,0);const i=Array.isArray(n)?n[0]:n.type,a=Array.isArray(n)?[[n[1],n[2]]]:n.overloads,s=a.filter((([e])=>!Array.isArray(e)||e.length===t.length-1));let o=null;for(const[n,a]of s){o=new se(e.registry,ze,e.path,null,e.scope);const s=[];let l=!1;for(let e=1;e<t.length;e++){const r=t[e],i=Array.isArray(n)?n[e-1]:n.type,a=o.parse(r,1+s.length,i);if(!a){l=!0;break}s.push(a);}if(!l)if(Array.isArray(n)&&n.length!==s.length)o.error(`Expected ${n.length} arguments, but found ${s.length} instead.`);else {for(let t=0;t<s.length;t++){const e=Array.isArray(n)?n[t]:n.type,r=s[t];o.concat(t+1).checkSubtype(e,r.type);}if(0===o.errors.length)return new Ie(r,i,a,s)}}if(1===s.length)e.errors.push(...o.errors);else {const r=(s.length?s:a).map((([t])=>{return e=t,Array.isArray(e)?`(${e.map(mt).join(", ")})`:`(${mt(e.type)}...)`;var e;})).join(" | "),n=[];for(let r=1;r<t.length;r++){const i=e.parse(t[r],1+n.length);if(!i)return null;n.push(mt(i.type));}e.error(`Expected arguments of type ${r}, but found (${n.join(", ")}) instead.`);}return null}static register(t,e){Ie.definitions=e;for(const r in e)t[r]=Ie;}}function ze(t){if(t instanceof Se)return ze(t.boundExpression);if(t instanceof Ie&&"error"===t.name)return !1;if(t instanceof oe)return !1;if(t instanceof ke)return !1;const e=t instanceof ne||t instanceof ee;let r=!0;return t.eachChild((t=>{r=e?r&&ze(t):r&&t instanceof Wt;})),!!r&&Me(t)&&Be(t,["zoom","heatmap-density","line-progress","accumulated","is-supported-script"])}function Me(t){if(t instanceof Ie){if("get"===t.name&&1===t.args.length)return !1;if("feature-state"===t.name)return !1;if("has"===t.name&&1===t.args.length)return !1;if("properties"===t.name||"geometry-type"===t.name||"id"===t.name)return !1;if(/^filter-/.test(t.name))return !1}if(t instanceof ke)return !1;let e=!0;return t.eachChild((t=>{e&&!Me(t)&&(e=!1);})),e}function Pe(t){if(t instanceof Ie&&"feature-state"===t.name)return !1;let e=!0;return t.eachChild((t=>{e&&!Pe(t)&&(e=!1);})),e}function Be(t,e){if(t instanceof Ie&&e.indexOf(t.name)>=0)return !1;let r=!0;return t.eachChild((t=>{r&&!Be(t,e)&&(r=!1);})),r}function Ce(t,e){const r=t.length-1;let n,i,a=0,s=r,o=0;for(;a<=s;)if(o=Math.floor((a+s)/2),n=t[o],i=t[o+1],n<=e){if(o===r||e<i)return o;a=o+1;}else {if(!(n>e))throw new Qt("Input is not a number.");s=o-1;}return 0}class Ve{constructor(t,e,r){this.type=t,this.input=e,this.labels=[],this.outputs=[];for(const[t,e]of r)this.labels.push(t),this.outputs.push(e);}static parse(t,e){if(t.length-1<4)return e.error(`Expected at least 4 arguments, but found only ${t.length-1}.`);if((t.length-1)%2!=0)return e.error("Expected an even number of arguments.");const r=e.parse(t[1],1,at);if(!r)return null;const n=[];let i=null;e.expectedType&&"value"!==e.expectedType.kind&&(i=e.expectedType);for(let r=1;r<t.length;r+=2){const a=1===r?-1/0:t[r],s=t[r+1],o=r,l=r+1;if("number"!=typeof a)return e.error('Input/output pairs for "step" expressions must be defined using literal numeric values (not computed expressions) for the input values.',o);if(n.length&&n[n.length-1][0]>=a)return e.error('Input/output pairs for "step" expressions must be arranged with input values in strictly ascending order.',o);const u=e.parse(s,l,i);if(!u)return null;i=i||u.type,n.push([a,u]);}return new Ve(i,r,n)}evaluate(t){const e=this.labels,r=this.outputs;if(1===e.length)return r[0].evaluate(t);const n=this.input.evaluate(t);if(n<=e[0])return r[0].evaluate(t);const i=e.length;return n>=e[i-1]?r[i-1].evaluate(t):r[Ce(e,n)].evaluate(t)}eachChild(t){t(this.input);for(const e of this.outputs)t(e);}outputDefined(){return this.outputs.every((t=>t.outputDefined()))}}function Ee(t,e,r){return t+r*(e-t)}function Fe(t,e,r){return t.map(((t,n)=>Ee(t,e[n],r)))}const Te={number:Ee,color:function(t,e,r,n="rgb"){switch(n){case"rgb":{const[n,i,a,s]=Fe(t.rgb,e.rgb,r);return new qt(n,i,a,s,!1)}case"hcl":{const[n,i,a,s]=t.hcl,[o,l,u,c]=e.hcl;let h,p;if(isNaN(n)||isNaN(o))isNaN(n)?isNaN(o)?h=NaN:(h=o,1!==a&&0!==a||(p=l)):(h=n,1!==u&&0!==u||(p=i));else {let t=o-n;o>n&&t>180?t-=360:o<n&&n-o>180&&(t+=360),h=n+r*t;}const[f,d,y,m]=function([t,e,r,n]){return t=isNaN(t)?0:t*Mt,Ft([r,Math.cos(t)*e,Math.sin(t)*e,n])}([h,null!=p?p:Ee(i,l,r),Ee(a,u,r),Ee(s,c,r)]);return new qt(f,d,y,m,!1)}case"lab":{const[n,i,a,s]=Ft(Fe(t.lab,e.lab,r));return new qt(n,i,a,s,!1)}}},array:Fe,padding:function(t,e,r){return new Kt(Fe(t.values,e.values,r))}};class Le{constructor(t,e,r,n,i){this.type=t,this.operator=e,this.interpolation=r,this.input=n,this.labels=[],this.outputs=[];for(const[t,e]of i)this.labels.push(t),this.outputs.push(e);}static interpolationFactor(t,e,r,n){let i=0;if("exponential"===t.name)i=$e(e,t.base,r,n);else if("linear"===t.name)i=$e(e,1,r,n);else if("cubic-bezier"===t.name){const a=t.controlPoints;i=new o(a[0],a[1],a[2],a[3]).solve($e(e,1,r,n));}return i}static parse(t,e){let[r,n,i,...a]=t;if(!Array.isArray(n)||0===n.length)return e.error("Expected an interpolation type expression.",1);if("linear"===n[0])n={name:"linear"};else if("exponential"===n[0]){const t=n[1];if("number"!=typeof t)return e.error("Exponential interpolation requires a numeric base.",1,1);n={name:"exponential",base:t};}else {if("cubic-bezier"!==n[0])return e.error(`Unknown interpolation type ${String(n[0])}`,1,0);{const t=n.slice(1);if(4!==t.length||t.some((t=>"number"!=typeof t||t<0||t>1)))return e.error("Cubic bezier interpolation requires four numeric arguments with values between 0 and 1.",1);n={name:"cubic-bezier",controlPoints:t};}}if(t.length-1<4)return e.error(`Expected at least 4 arguments, but found only ${t.length-1}.`);if((t.length-1)%2!=0)return e.error("Expected an even number of arguments.");if(i=e.parse(i,2,at),!i)return null;const s=[];let o=null;"interpolate-hcl"===r||"interpolate-lab"===r?o=lt:e.expectedType&&"value"!==e.expectedType.kind&&(o=e.expectedType);for(let t=0;t<a.length;t+=2){const r=a[t],n=a[t+1],i=t+3,l=t+4;if("number"!=typeof r)return e.error('Input/output pairs for "interpolate" expressions must be defined using literal numeric values (not computed expressions) for the input values.',i);if(s.length&&s[s.length-1][0]>=r)return e.error('Input/output pairs for "interpolate" expressions must be arranged with input values in strictly ascending order.',i);const u=e.parse(n,l,o);if(!u)return null;o=o||u.type,s.push([r,u]);}return wt(o,at)||wt(o,lt)||wt(o,ft)||wt(o,yt(at))?new Le(o,r,n,i,s):e.error(`Type ${mt(o)} is not interpolatable.`)}evaluate(t){const e=this.labels,r=this.outputs;if(1===e.length)return r[0].evaluate(t);const n=this.input.evaluate(t);if(n<=e[0])return r[0].evaluate(t);const i=e.length;if(n>=e[i-1])return r[i-1].evaluate(t);const a=Ce(e,n),s=Le.interpolationFactor(this.interpolation,n,e[a],e[a+1]),o=r[a].evaluate(t),l=r[a+1].evaluate(t);switch(this.operator){case"interpolate":return Te[this.type.kind](o,l,s);case"interpolate-hcl":return Te.color(o,l,s,"hcl");case"interpolate-lab":return Te.color(o,l,s,"lab")}}eachChild(t){t(this.input);for(const e of this.outputs)t(e);}outputDefined(){return this.outputs.every((t=>t.outputDefined()))}}function $e(t,e,r,n){const i=n-r,a=t-r;return 0===i?0:1===e?a/i:(Math.pow(e,a)-1)/(Math.pow(e,i)-1)}class De{constructor(t,e){this.type=t,this.args=e;}static parse(t,e){if(t.length<2)return e.error("Expectected at least one argument.");let r=null;const n=e.expectedType;n&&"value"!==n.kind&&(r=n);const i=[];for(const n of t.slice(1)){const t=e.parse(n,1+i.length,r,void 0,{typeAnnotation:"omit"});if(!t)return null;r=r||t.type,i.push(t);}if(!r)throw new Error("No output type");const a=n&&i.some((t=>xt(n,t.type)));return new De(a?ct:r,i)}evaluate(t){let e,r=null,n=0;for(const i of this.args)if(n++,r=i.evaluate(t),r&&r instanceof Gt&&!r.available&&(e||(e=r.name),r=null,n===this.args.length&&(r=e)),null!==r)break;return r}eachChild(t){this.args.forEach(t);}outputDefined(){return this.args.every((t=>t.outputDefined()))}}class Oe{constructor(t,e){this.type=e.type,this.bindings=[].concat(t),this.result=e;}evaluate(t){return this.result.evaluate(t)}eachChild(t){for(const e of this.bindings)t(e[1]);t(this.result);}static parse(t,e){if(t.length<4)return e.error(`Expected at least 3 arguments, but found ${t.length-1} instead.`);const r=[];for(let n=1;n<t.length-1;n+=2){const i=t[n];if("string"!=typeof i)return e.error(`Expected string, but found ${typeof i} instead.`,n);if(/[^a-zA-Z0-9_]/.test(i))return e.error("Variable names must contain only alphanumeric characters or '_'.",n);const a=e.parse(t[n+1],n+1);if(!a)return null;r.push([i,a]);}const n=e.parse(t[t.length-1],t.length-1,e.expectedType,r);return n?new Oe(r,n):null}outputDefined(){return this.result.outputDefined()}}class Ue{constructor(t,e,r){this.type=t,this.index=e,this.input=r;}static parse(t,e){if(3!==t.length)return e.error(`Expected 2 arguments, but found ${t.length-1} instead.`);const r=e.parse(t[1],1,at),n=e.parse(t[2],2,yt(e.expectedType||ct));return r&&n?new Ue(n.type.itemType,r,n):null}evaluate(t){const e=this.index.evaluate(t),r=this.input.evaluate(t);if(e<0)throw new Qt(`Array index out of bounds: ${e} < 0.`);if(e>=r.length)throw new Qt(`Array index out of bounds: ${e} > ${r.length-1}.`);if(e!==Math.floor(e))throw new Qt(`Array index must be an integer, but found ${e} instead.`);return r[e]}eachChild(t){t(this.index),t(this.input);}outputDefined(){return !1}}class Re{constructor(t,e){this.type=ot,this.needle=t,this.haystack=e;}static parse(t,e){if(3!==t.length)return e.error(`Expected 2 arguments, but found ${t.length-1} instead.`);const r=e.parse(t[1],1,ct),n=e.parse(t[2],2,ct);return r&&n?vt(r.type,[ot,st,at,it,ct])?new Re(r,n):e.error(`Expected first argument to be of type boolean, string, number or null, but found ${mt(r.type)} instead`):null}evaluate(t){const e=this.needle.evaluate(t),r=this.haystack.evaluate(t);if(!r)return !1;if(!bt(e,["boolean","string","number","null"]))throw new Qt(`Expected first argument to be of type boolean, string, number or null, but found ${mt(Yt(e))} instead.`);if(!bt(r,["string","array"]))throw new Qt(`Expected second argument to be of type array or string, but found ${mt(Yt(r))} instead.`);return r.indexOf(e)>=0}eachChild(t){t(this.needle),t(this.haystack);}outputDefined(){return !0}}class qe{constructor(t,e,r){this.type=at,this.needle=t,this.haystack=e,this.fromIndex=r;}static parse(t,e){if(t.length<=2||t.length>=5)return e.error(`Expected 3 or 4 arguments, but found ${t.length-1} instead.`);const r=e.parse(t[1],1,ct),n=e.parse(t[2],2,ct);if(!r||!n)return null;if(!vt(r.type,[ot,st,at,it,ct]))return e.error(`Expected first argument to be of type boolean, string, number or null, but found ${mt(r.type)} instead`);if(4===t.length){const i=e.parse(t[3],3,at);return i?new qe(r,n,i):null}return new qe(r,n)}evaluate(t){const e=this.needle.evaluate(t),r=this.haystack.evaluate(t);if(!bt(e,["boolean","string","number","null"]))throw new Qt(`Expected first argument to be of type boolean, string, number or null, but found ${mt(Yt(e))} instead.`);if(!bt(r,["string","array"]))throw new Qt(`Expected second argument to be of type array or string, but found ${mt(Yt(r))} instead.`);if(this.fromIndex){const n=this.fromIndex.evaluate(t);return r.indexOf(e,n)}return r.indexOf(e)}eachChild(t){t(this.needle),t(this.haystack),this.fromIndex&&t(this.fromIndex);}outputDefined(){return !1}}class je{constructor(t,e,r,n,i,a){this.inputType=t,this.type=e,this.input=r,this.cases=n,this.outputs=i,this.otherwise=a;}static parse(t,e){if(t.length<5)return e.error(`Expected at least 4 arguments, but found only ${t.length-1}.`);if(t.length%2!=1)return e.error("Expected an even number of arguments.");let r,n;e.expectedType&&"value"!==e.expectedType.kind&&(n=e.expectedType);const i={},a=[];for(let s=2;s<t.length-1;s+=2){let o=t[s];const l=t[s+1];Array.isArray(o)||(o=[o]);const u=e.concat(s);if(0===o.length)return u.error("Expected at least one branch label.");for(const t of o){if("number"!=typeof t&&"string"!=typeof t)return u.error("Branch labels must be numbers or strings.");if("number"==typeof t&&Math.abs(t)>Number.MAX_SAFE_INTEGER)return u.error(`Branch labels must be integers no larger than ${Number.MAX_SAFE_INTEGER}.`);if("number"==typeof t&&Math.floor(t)!==t)return u.error("Numeric branch labels must be integer values.");if(r){if(u.checkSubtype(r,Yt(t)))return null}else r=Yt(t);if(void 0!==i[String(t)])return u.error("Branch labels must be unique.");i[String(t)]=a.length;}const c=e.parse(l,s,n);if(!c)return null;n=n||c.type,a.push(c);}const s=e.parse(t[1],1,ct);if(!s)return null;const o=e.parse(t[t.length-1],t.length-1,n);return o?"value"!==s.type.kind&&e.concat(1).checkSubtype(r,s.type)?null:new je(r,n,s,i,a,o):null}evaluate(t){const e=this.input.evaluate(t);return (Yt(e)===this.inputType&&this.outputs[this.cases[e]]||this.otherwise).evaluate(t)}eachChild(t){t(this.input),this.outputs.forEach(t),t(this.otherwise);}outputDefined(){return this.outputs.every((t=>t.outputDefined()))&&this.otherwise.outputDefined()}}class Ne{constructor(t,e,r){this.type=t,this.branches=e,this.otherwise=r;}static parse(t,e){if(t.length<4)return e.error(`Expected at least 3 arguments, but found only ${t.length-1}.`);if(t.length%2!=0)return e.error("Expected an odd number of arguments.");let r;e.expectedType&&"value"!==e.expectedType.kind&&(r=e.expectedType);const n=[];for(let i=1;i<t.length-1;i+=2){const a=e.parse(t[i],i,ot);if(!a)return null;const s=e.parse(t[i+1],i+1,r);if(!s)return null;n.push([a,s]),r=r||s.type;}const i=e.parse(t[t.length-1],t.length-1,r);if(!i)return null;if(!r)throw new Error("Can't infer output type");return new Ne(r,n,i)}evaluate(t){for(const[e,r]of this.branches)if(e.evaluate(t))return r.evaluate(t);return this.otherwise.evaluate(t)}eachChild(t){for(const[e,r]of this.branches)t(e),t(r);t(this.otherwise);}outputDefined(){return this.branches.every((([t,e])=>e.outputDefined()))&&this.otherwise.outputDefined()}}class Ze{constructor(t,e,r,n){this.type=t,this.input=e,this.beginIndex=r,this.endIndex=n;}static parse(t,e){if(t.length<=2||t.length>=5)return e.error(`Expected 3 or 4 arguments, but found ${t.length-1} instead.`);const r=e.parse(t[1],1,ct),n=e.parse(t[2],2,at);if(!r||!n)return null;if(!vt(r.type,[yt(ct),st,ct]))return e.error(`Expected first argument to be of type array or string, but found ${mt(r.type)} instead`);if(4===t.length){const i=e.parse(t[3],3,at);return i?new Ze(r.type,r,n,i):null}return new Ze(r.type,r,n)}evaluate(t){const e=this.input.evaluate(t),r=this.beginIndex.evaluate(t);if(!bt(e,["string","array"]))throw new Qt(`Expected first argument to be of type array or string, but found ${mt(Yt(e))} instead.`);if(this.endIndex){const n=this.endIndex.evaluate(t);return e.slice(r,n)}return e.slice(r)}eachChild(t){t(this.input),t(this.beginIndex),this.endIndex&&t(this.endIndex);}outputDefined(){return !1}}function Ke(t,e){return "=="===t||"!="===t?"boolean"===e.kind||"string"===e.kind||"number"===e.kind||"null"===e.kind||"value"===e.kind:"string"===e.kind||"number"===e.kind||"value"===e.kind}function Ge(t,e,r,n){return 0===n.compare(e,r)}function Je(t,e,r){const n="=="!==t&&"!="!==t;return class i{constructor(t,e,r){this.type=ot,this.lhs=t,this.rhs=e,this.collator=r,this.hasUntypedArgument="value"===t.type.kind||"value"===e.type.kind;}static parse(t,e){if(3!==t.length&&4!==t.length)return e.error("Expected two or three arguments.");const r=t[0];let a=e.parse(t[1],1,ct);if(!a)return null;if(!Ke(r,a.type))return e.concat(1).error(`"${r}" comparisons are not supported for type '${mt(a.type)}'.`);let s=e.parse(t[2],2,ct);if(!s)return null;if(!Ke(r,s.type))return e.concat(2).error(`"${r}" comparisons are not supported for type '${mt(s.type)}'.`);if(a.type.kind!==s.type.kind&&"value"!==a.type.kind&&"value"!==s.type.kind)return e.error(`Cannot compare types '${mt(a.type)}' and '${mt(s.type)}'.`);n&&("value"===a.type.kind&&"value"!==s.type.kind?a=new ee(s.type,[a]):"value"!==a.type.kind&&"value"===s.type.kind&&(s=new ee(a.type,[s])));let o=null;if(4===t.length){if("string"!==a.type.kind&&"string"!==s.type.kind&&"value"!==a.type.kind&&"value"!==s.type.kind)return e.error("Cannot use collator to compare non-string types.");if(o=e.parse(t[3],3,ht),!o)return null}return new i(a,s,o)}evaluate(i){const a=this.lhs.evaluate(i),s=this.rhs.evaluate(i);if(n&&this.hasUntypedArgument){const e=Yt(a),r=Yt(s);if(e.kind!==r.kind||"string"!==e.kind&&"number"!==e.kind)throw new Qt(`Expected arguments for "${t}" to be (string, string) or (number, number), but found (${e.kind}, ${r.kind}) instead.`)}if(this.collator&&!n&&this.hasUntypedArgument){const t=Yt(a),r=Yt(s);if("string"!==t.kind||"string"!==r.kind)return e(i,a,s)}return this.collator?r(i,a,s,this.collator.evaluate(i)):e(i,a,s)}eachChild(t){t(this.lhs),t(this.rhs),this.collator&&t(this.collator);}outputDefined(){return !0}}}const Xe=Je("==",(function(t,e,r){return e===r}),Ge),Ye=Je("!=",(function(t,e,r){return e!==r}),(function(t,e,r,n){return !Ge(0,e,r,n)})),He=Je("<",(function(t,e,r){return e<r}),(function(t,e,r,n){return n.compare(e,r)<0})),We=Je(">",(function(t,e,r){return e>r}),(function(t,e,r,n){return n.compare(e,r)>0})),Qe=Je("<=",(function(t,e,r){return e<=r}),(function(t,e,r,n){return n.compare(e,r)<=0})),tr=Je(">=",(function(t,e,r){return e>=r}),(function(t,e,r,n){return n.compare(e,r)>=0}));class er{constructor(t,e,r,n,i){this.type=st,this.number=t,this.locale=e,this.currency=r,this.minFractionDigits=n,this.maxFractionDigits=i;}static parse(t,e){if(3!==t.length)return e.error("Expected two arguments.");const r=e.parse(t[1],1,at);if(!r)return null;const n=t[2];if("object"!=typeof n||Array.isArray(n))return e.error("NumberFormat options argument must be an object.");let i=null;if(n.locale&&(i=e.parse(n.locale,1,st),!i))return null;let a=null;if(n.currency&&(a=e.parse(n.currency,1,st),!a))return null;let s=null;if(n["min-fraction-digits"]&&(s=e.parse(n["min-fraction-digits"],1,at),!s))return null;let o=null;return n["max-fraction-digits"]&&(o=e.parse(n["max-fraction-digits"],1,at),!o)?null:new er(r,i,a,s,o)}evaluate(t){return new Intl.NumberFormat(this.locale?this.locale.evaluate(t):[],{style:this.currency?"currency":"decimal",currency:this.currency?this.currency.evaluate(t):void 0,minimumFractionDigits:this.minFractionDigits?this.minFractionDigits.evaluate(t):void 0,maximumFractionDigits:this.maxFractionDigits?this.maxFractionDigits.evaluate(t):void 0}).format(this.number.evaluate(t))}eachChild(t){t(this.number),this.locale&&t(this.locale),this.currency&&t(this.currency),this.minFractionDigits&&t(this.minFractionDigits),this.maxFractionDigits&&t(this.maxFractionDigits);}outputDefined(){return !1}}class rr{constructor(t){this.type=pt,this.sections=t;}static parse(t,e){if(t.length<2)return e.error("Expected at least one argument.");const r=t[1];if(!Array.isArray(r)&&"object"==typeof r)return e.error("First argument must be an image or text section.");const n=[];let i=!1;for(let r=1;r<=t.length-1;++r){const a=t[r];if(i&&"object"==typeof a&&!Array.isArray(a)){i=!1;let t=null;if(a["font-scale"]&&(t=e.parse(a["font-scale"],1,at),!t))return null;let r=null;if(a["text-font"]&&(r=e.parse(a["text-font"],1,yt(st)),!r))return null;let s=null;if(a["text-color"]&&(s=e.parse(a["text-color"],1,lt),!s))return null;const o=n[n.length-1];o.scale=t,o.font=r,o.textColor=s;}else {const a=e.parse(t[r],1,ct);if(!a)return null;const s=a.type.kind;if("string"!==s&&"value"!==s&&"null"!==s&&"resolvedImage"!==s)return e.error("Formatted text type must be 'string', 'value', 'image' or 'null'.");i=!0,n.push({content:a,scale:null,font:null,textColor:null});}}return new rr(n)}evaluate(t){return new Zt(this.sections.map((e=>{const r=e.content.evaluate(t);return Yt(r)===dt?new Nt("",r,null,null,null):new Nt(Ht(r),null,e.scale?e.scale.evaluate(t):null,e.font?e.font.evaluate(t).join(","):null,e.textColor?e.textColor.evaluate(t):null)})))}eachChild(t){for(const e of this.sections)t(e.content),e.scale&&t(e.scale),e.font&&t(e.font),e.textColor&&t(e.textColor);}outputDefined(){return !1}}class nr{constructor(t){this.type=dt,this.input=t;}static parse(t,e){if(2!==t.length)return e.error("Expected two arguments.");const r=e.parse(t[1],1,st);return r?new nr(r):e.error("No image name provided.")}evaluate(t){const e=this.input.evaluate(t),r=Gt.fromString(e);return r&&t.availableImages&&(r.available=t.availableImages.indexOf(e)>-1),r}eachChild(t){t(this.input);}outputDefined(){return !1}}class ir{constructor(t){this.type=at,this.input=t;}static parse(t,e){if(2!==t.length)return e.error(`Expected 1 argument, but found ${t.length-1} instead.`);const r=e.parse(t[1],1);return r?"array"!==r.type.kind&&"string"!==r.type.kind&&"value"!==r.type.kind?e.error(`Expected argument of type string or array, but found ${mt(r.type)} instead.`):new ir(r):null}evaluate(t){const e=this.input.evaluate(t);if("string"==typeof e)return e.length;if(Array.isArray(e))return e.length;throw new Qt(`Expected value to be of type string or array, but found ${mt(Yt(e))} instead.`)}eachChild(t){t(this.input);}outputDefined(){return !1}}const ar={"==":Xe,"!=":Ye,">":We,"<":He,">=":tr,"<=":Qe,array:ee,at:Ue,boolean:ee,case:Ne,coalesce:De,collator:oe,format:rr,image:nr,in:Re,"index-of":qe,interpolate:Le,"interpolate-hcl":Le,"interpolate-lab":Le,length:ir,let:Oe,literal:Wt,match:je,number:ee,"number-format":er,object:ee,slice:Ze,step:Ve,string:ee,"to-boolean":ne,"to-color":ne,"to-number":ne,"to-string":ne,var:Se,within:ke};function sr(t,[e,r,n,i]){e=e.evaluate(t),r=r.evaluate(t),n=n.evaluate(t);const a=i?i.evaluate(t):1,s=Jt(e,r,n,a);if(s)throw new Qt(s);return new qt(e/255,r/255,n/255,a,!1)}function or(t,e){return t in e}function lr(t,e){const r=e[t];return void 0===r?null:r}function ur(t){return {type:t}}function cr(t){return {result:"success",value:t}}function hr(t){return {result:"error",value:t}}function pr(t){return "data-driven"===t["property-type"]||"cross-faded-data-driven"===t["property-type"]}function fr(t){return !!t.expression&&t.expression.parameters.indexOf("zoom")>-1}function dr(t){return !!t.expression&&t.expression.interpolated}function yr(t){return t instanceof Number?"number":t instanceof String?"string":t instanceof Boolean?"boolean":Array.isArray(t)?"array":null===t?"null":typeof t}function mr(t){return "object"==typeof t&&null!==t&&!Array.isArray(t)}function gr(t){return t}function xr(t,e){const r="color"===e.type,n=t.stops&&"object"==typeof t.stops[0][0],i=n||!(n||void 0!==t.property),a=t.type||(dr(e)?"exponential":"interval");if(r||"padding"===e.type){const n=r?qt.parse:Kt.parse;(t=et({},t)).stops&&(t.stops=t.stops.map((t=>[t[0],n(t[1])]))),t.default=n(t.default?t.default:e.default);}if(t.colorSpace&&"rgb"!==(s=t.colorSpace)&&"hcl"!==s&&"lab"!==s)throw new Error(`Unknown color space: "${t.colorSpace}"`);var s;let o,l,u;if("exponential"===a)o=_r;else if("interval"===a)o=wr;else if("categorical"===a){o=br,l=Object.create(null);for(const e of t.stops)l[e[0]]=e[1];u=typeof t.stops[0][0];}else {if("identity"!==a)throw new Error(`Unknown function type "${a}"`);o=Ar;}if(n){const r={},n=[];for(let e=0;e<t.stops.length;e++){const i=t.stops[e],a=i[0].zoom;void 0===r[a]&&(r[a]={zoom:a,type:t.type,property:t.property,default:t.default,stops:[]},n.push(a)),r[a].stops.push([i[0].value,i[1]]);}const i=[];for(const t of n)i.push([r[t].zoom,xr(r[t],e)]);const a={name:"linear"};return {kind:"composite",interpolationType:a,interpolationFactor:Le.interpolationFactor.bind(void 0,a),zoomStops:i.map((t=>t[0])),evaluate:({zoom:r},n)=>_r({stops:i,base:t.base},e,r).evaluate(r,n)}}if(i){const r="exponential"===a?{name:"exponential",base:void 0!==t.base?t.base:1}:null;return {kind:"camera",interpolationType:r,interpolationFactor:Le.interpolationFactor.bind(void 0,r),zoomStops:t.stops.map((t=>t[0])),evaluate:({zoom:r})=>o(t,e,r,l,u)}}return {kind:"source",evaluate(r,n){const i=n&&n.properties?n.properties[t.property]:void 0;return void 0===i?vr(t.default,e.default):o(t,e,i,l,u)}}}function vr(t,e,r){return void 0!==t?t:void 0!==e?e:void 0!==r?r:void 0}function br(t,e,r,n,i){return vr(typeof r===i?n[r]:void 0,t.default,e.default)}function wr(t,e,r){if("number"!==yr(r))return vr(t.default,e.default);const n=t.stops.length;if(1===n)return t.stops[0][1];if(r<=t.stops[0][0])return t.stops[0][1];if(r>=t.stops[n-1][0])return t.stops[n-1][1];const i=Ce(t.stops.map((t=>t[0])),r);return t.stops[i][1]}function _r(t,e,r){const n=void 0!==t.base?t.base:1;if("number"!==yr(r))return vr(t.default,e.default);const i=t.stops.length;if(1===i)return t.stops[0][1];if(r<=t.stops[0][0])return t.stops[0][1];if(r>=t.stops[i-1][0])return t.stops[i-1][1];const a=Ce(t.stops.map((t=>t[0])),r),s=function(t,e,r,n){const i=n-r,a=t-r;return 0===i?0:1===e?a/i:(Math.pow(e,a)-1)/(Math.pow(e,i)-1)}(r,n,t.stops[a][0],t.stops[a+1][0]),o=t.stops[a][1],l=t.stops[a+1][1],u=Te[e.type]||gr;return "function"==typeof o.evaluate?{evaluate(...e){const r=o.evaluate.apply(void 0,e),n=l.evaluate.apply(void 0,e);if(void 0!==r&&void 0!==n)return u(r,n,s,t.colorSpace)}}:u(o,l,s,t.colorSpace)}function Ar(t,e,r){switch(e.type){case"color":r=qt.parse(r);break;case"formatted":r=Zt.fromString(r.toString());break;case"resolvedImage":r=Gt.fromString(r.toString());break;case"padding":r=Kt.parse(r);break;default:yr(r)===e.type||"enum"===e.type&&e.values[r]||(r=void 0);}return vr(r,t.default,e.default)}Ie.register(ar,{error:[{kind:"error"},[st],(t,[e])=>{throw new Qt(e.evaluate(t))}],typeof:[st,[ct],(t,[e])=>mt(Yt(e.evaluate(t)))],"to-rgba":[yt(at,4),[lt],(t,[e])=>{const[r,n,i,a]=e.evaluate(t).rgb;return [255*r,255*n,255*i,a]}],rgb:[lt,[at,at,at],sr],rgba:[lt,[at,at,at,at],sr],has:{type:ot,overloads:[[[st],(t,[e])=>or(e.evaluate(t),t.properties())],[[st,ut],(t,[e,r])=>or(e.evaluate(t),r.evaluate(t))]]},get:{type:ct,overloads:[[[st],(t,[e])=>lr(e.evaluate(t),t.properties())],[[st,ut],(t,[e,r])=>lr(e.evaluate(t),r.evaluate(t))]]},"feature-state":[ct,[st],(t,[e])=>lr(e.evaluate(t),t.featureState||{})],properties:[ut,[],t=>t.properties()],"geometry-type":[st,[],t=>t.geometryType()],id:[ct,[],t=>t.id()],zoom:[at,[],t=>t.globals.zoom],"heatmap-density":[at,[],t=>t.globals.heatmapDensity||0],"line-progress":[at,[],t=>t.globals.lineProgress||0],accumulated:[ct,[],t=>void 0===t.globals.accumulated?null:t.globals.accumulated],"+":[at,ur(at),(t,e)=>{let r=0;for(const n of e)r+=n.evaluate(t);return r}],"*":[at,ur(at),(t,e)=>{let r=1;for(const n of e)r*=n.evaluate(t);return r}],"-":{type:at,overloads:[[[at,at],(t,[e,r])=>e.evaluate(t)-r.evaluate(t)],[[at],(t,[e])=>-e.evaluate(t)]]},"/":[at,[at,at],(t,[e,r])=>e.evaluate(t)/r.evaluate(t)],"%":[at,[at,at],(t,[e,r])=>e.evaluate(t)%r.evaluate(t)],ln2:[at,[],()=>Math.LN2],pi:[at,[],()=>Math.PI],e:[at,[],()=>Math.E],"^":[at,[at,at],(t,[e,r])=>Math.pow(e.evaluate(t),r.evaluate(t))],sqrt:[at,[at],(t,[e])=>Math.sqrt(e.evaluate(t))],log10:[at,[at],(t,[e])=>Math.log(e.evaluate(t))/Math.LN10],ln:[at,[at],(t,[e])=>Math.log(e.evaluate(t))],log2:[at,[at],(t,[e])=>Math.log(e.evaluate(t))/Math.LN2],sin:[at,[at],(t,[e])=>Math.sin(e.evaluate(t))],cos:[at,[at],(t,[e])=>Math.cos(e.evaluate(t))],tan:[at,[at],(t,[e])=>Math.tan(e.evaluate(t))],asin:[at,[at],(t,[e])=>Math.asin(e.evaluate(t))],acos:[at,[at],(t,[e])=>Math.acos(e.evaluate(t))],atan:[at,[at],(t,[e])=>Math.atan(e.evaluate(t))],min:[at,ur(at),(t,e)=>Math.min(...e.map((e=>e.evaluate(t))))],max:[at,ur(at),(t,e)=>Math.max(...e.map((e=>e.evaluate(t))))],abs:[at,[at],(t,[e])=>Math.abs(e.evaluate(t))],round:[at,[at],(t,[e])=>{const r=e.evaluate(t);return r<0?-Math.round(-r):Math.round(r)}],floor:[at,[at],(t,[e])=>Math.floor(e.evaluate(t))],ceil:[at,[at],(t,[e])=>Math.ceil(e.evaluate(t))],"filter-==":[ot,[st,ct],(t,[e,r])=>t.properties()[e.value]===r.value],"filter-id-==":[ot,[ct],(t,[e])=>t.id()===e.value],"filter-type-==":[ot,[st],(t,[e])=>t.geometryType()===e.value],"filter-<":[ot,[st,ct],(t,[e,r])=>{const n=t.properties()[e.value],i=r.value;return typeof n==typeof i&&n<i}],"filter-id-<":[ot,[ct],(t,[e])=>{const r=t.id(),n=e.value;return typeof r==typeof n&&r<n}],"filter->":[ot,[st,ct],(t,[e,r])=>{const n=t.properties()[e.value],i=r.value;return typeof n==typeof i&&n>i}],"filter-id->":[ot,[ct],(t,[e])=>{const r=t.id(),n=e.value;return typeof r==typeof n&&r>n}],"filter-<=":[ot,[st,ct],(t,[e,r])=>{const n=t.properties()[e.value],i=r.value;return typeof n==typeof i&&n<=i}],"filter-id-<=":[ot,[ct],(t,[e])=>{const r=t.id(),n=e.value;return typeof r==typeof n&&r<=n}],"filter->=":[ot,[st,ct],(t,[e,r])=>{const n=t.properties()[e.value],i=r.value;return typeof n==typeof i&&n>=i}],"filter-id->=":[ot,[ct],(t,[e])=>{const r=t.id(),n=e.value;return typeof r==typeof n&&r>=n}],"filter-has":[ot,[ct],(t,[e])=>e.value in t.properties()],"filter-has-id":[ot,[],t=>null!==t.id()&&void 0!==t.id()],"filter-type-in":[ot,[yt(st)],(t,[e])=>e.value.indexOf(t.geometryType())>=0],"filter-id-in":[ot,[yt(ct)],(t,[e])=>e.value.indexOf(t.id())>=0],"filter-in-small":[ot,[st,yt(ct)],(t,[e,r])=>r.value.indexOf(t.properties()[e.value])>=0],"filter-in-large":[ot,[st,yt(ct)],(t,[e,r])=>function(t,e,r,n){for(;r<=n;){const i=r+n>>1;if(e[i]===t)return !0;e[i]>t?n=i-1:r=i+1;}return !1}(t.properties()[e.value],r.value,0,r.value.length-1)],all:{type:ot,overloads:[[[ot,ot],(t,[e,r])=>e.evaluate(t)&&r.evaluate(t)],[ur(ot),(t,e)=>{for(const r of e)if(!r.evaluate(t))return !1;return !0}]]},any:{type:ot,overloads:[[[ot,ot],(t,[e,r])=>e.evaluate(t)||r.evaluate(t)],[ur(ot),(t,e)=>{for(const r of e)if(r.evaluate(t))return !0;return !1}]]},"!":[ot,[ot],(t,[e])=>!e.evaluate(t)],"is-supported-script":[ot,[st],(t,[e])=>{const r=t.globals&&t.globals.isSupportedScript;return !r||r(e.evaluate(t))}],upcase:[st,[st],(t,[e])=>e.evaluate(t).toUpperCase()],downcase:[st,[st],(t,[e])=>e.evaluate(t).toLowerCase()],concat:[st,ur(ct),(t,e)=>e.map((e=>Ht(e.evaluate(t)))).join("")],"resolved-locale":[st,[ht],(t,[e])=>e.evaluate(t).resolvedLocale()]});class kr{constructor(t,e){var r;this.expression=t,this._warningHistory={},this._evaluator=new ae,this._defaultValue=e?"color"===(r=e).type&&mr(r.default)?new qt(0,0,0,0):"color"===r.type?qt.parse(r.default)||null:"padding"===r.type?Kt.parse(r.default)||null:void 0===r.default?null:r.default:null,this._enumValues=e&&"enum"===e.type?e.values:null;}evaluateWithoutErrorHandling(t,e,r,n,i,a){return this._evaluator.globals=t,this._evaluator.feature=e,this._evaluator.featureState=r,this._evaluator.canonical=n,this._evaluator.availableImages=i||null,this._evaluator.formattedSection=a,this.expression.evaluate(this._evaluator)}evaluate(t,e,r,n,i,a){this._evaluator.globals=t,this._evaluator.feature=e||null,this._evaluator.featureState=r||null,this._evaluator.canonical=n,this._evaluator.availableImages=i||null,this._evaluator.formattedSection=a||null;try{const t=this.expression.evaluate(this._evaluator);if(null==t||"number"==typeof t&&t!=t)return this._defaultValue;if(this._enumValues&&!(t in this._enumValues))throw new Qt(`Expected value to be one of ${Object.keys(this._enumValues).map((t=>JSON.stringify(t))).join(", ")}, but found ${JSON.stringify(t)} instead.`);return t}catch(t){return this._warningHistory[t.message]||(this._warningHistory[t.message]=!0,"undefined"!=typeof console&&console.warn(t.message)),this._defaultValue}}}function Sr(t){return Array.isArray(t)&&t.length>0&&"string"==typeof t[0]&&t[0]in ar}function Ir(t,e){const r=new se(ar,ze,[],e?function(t){const e={color:lt,string:st,number:at,enum:st,boolean:ot,formatted:pt,padding:ft,resolvedImage:dt};return "array"===t.type?yt(e[t.value]||ct,t.length):e[t.type]}(e):void 0),n=r.parse(t,void 0,void 0,void 0,e&&"string"===e.type?{typeAnnotation:"coerce"}:void 0);return n?cr(new kr(n,e)):hr(r.errors)}class zr{constructor(t,e){this.kind=t,this._styleExpression=e,this.isStateDependent="constant"!==t&&!Pe(e.expression);}evaluateWithoutErrorHandling(t,e,r,n,i,a){return this._styleExpression.evaluateWithoutErrorHandling(t,e,r,n,i,a)}evaluate(t,e,r,n,i,a){return this._styleExpression.evaluate(t,e,r,n,i,a)}}class Mr{constructor(t,e,r,n){this.kind=t,this.zoomStops=r,this._styleExpression=e,this.isStateDependent="camera"!==t&&!Pe(e.expression),this.interpolationType=n;}evaluateWithoutErrorHandling(t,e,r,n,i,a){return this._styleExpression.evaluateWithoutErrorHandling(t,e,r,n,i,a)}evaluate(t,e,r,n,i,a){return this._styleExpression.evaluate(t,e,r,n,i,a)}interpolationFactor(t,e,r){return this.interpolationType?Le.interpolationFactor(this.interpolationType,t,e,r):0}}function Pr(t,e){const r=Ir(t,e);if("error"===r.result)return r;const n=r.value.expression,i=Me(n);if(!i&&!pr(e))return hr([new rt("","data expressions not supported")]);const a=Be(n,["zoom"]);if(!a&&!fr(e))return hr([new rt("","zoom expressions not supported")]);const s=Cr(n);return s||a?s instanceof rt?hr([s]):s instanceof Le&&!dr(e)?hr([new rt("",'"interpolate" expressions cannot be used with this property')]):cr(s?new Mr(i?"camera":"composite",r.value,s.labels,s instanceof Le?s.interpolation:void 0):new zr(i?"constant":"source",r.value)):hr([new rt("",'"zoom" expression may only be used as input to a top-level "step" or "interpolate" expression.')])}class Br{constructor(t,e){this._parameters=t,this._specification=e,et(this,xr(this._parameters,this._specification));}static deserialize(t){return new Br(t._parameters,t._specification)}static serialize(t){return {_parameters:t._parameters,_specification:t._specification}}}function Cr(t){let e=null;if(t instanceof Oe)e=Cr(t.result);else if(t instanceof De){for(const r of t.args)if(e=Cr(r),e)break}else (t instanceof Ve||t instanceof Le)&&t.input instanceof Ie&&"zoom"===t.input.name&&(e=t);return e instanceof rt||t.eachChild((t=>{const r=Cr(t);r instanceof rt?e=r:!e&&r?e=new rt("",'"zoom" expression may only be used as input to a top-level "step" or "interpolate" expression.'):e&&r&&e!==r&&(e=new rt("",'Only one zoom-based "step" or "interpolate" subexpression may be used in an expression.'));})),e}function Vr(t){if(!0===t||!1===t)return !0;if(!Array.isArray(t)||0===t.length)return !1;switch(t[0]){case"has":return t.length>=2&&"$id"!==t[1]&&"$type"!==t[1];case"in":return t.length>=3&&("string"!=typeof t[1]||Array.isArray(t[2]));case"!in":case"!has":case"none":return !1;case"==":case"!=":case">":case">=":case"<":case"<=":return 3!==t.length||Array.isArray(t[1])||Array.isArray(t[2]);case"any":case"all":for(const e of t.slice(1))if(!Vr(e)&&"boolean"!=typeof e)return !1;return !0;default:return !0}}const Er={type:"boolean",default:!1,transition:!1,"property-type":"data-driven",expression:{interpolated:!1,parameters:["zoom","feature"]}};function Fr(t){if(null==t)return {filter:()=>!0,needGeometry:!1};Vr(t)||(t=$r(t));const e=Ir(t,Er);if("error"===e.result)throw new Error(e.value.map((t=>`${t.key}: ${t.message}`)).join(", "));return {filter:(t,r,n)=>e.value.evaluate(t,r,{},n),needGeometry:Lr(t)}}function Tr(t,e){return t<e?-1:t>e?1:0}function Lr(t){if(!Array.isArray(t))return !1;if("within"===t[0])return !0;for(let e=1;e<t.length;e++)if(Lr(t[e]))return !0;return !1}function $r(t){if(!t)return !0;const e=t[0];return t.length<=1?"any"!==e:"=="===e?Dr(t[1],t[2],"=="):"!="===e?Rr(Dr(t[1],t[2],"==")):"<"===e||">"===e||"<="===e||">="===e?Dr(t[1],t[2],e):"any"===e?(r=t.slice(1),["any"].concat(r.map($r))):"all"===e?["all"].concat(t.slice(1).map($r)):"none"===e?["all"].concat(t.slice(1).map($r).map(Rr)):"in"===e?Or(t[1],t.slice(2)):"!in"===e?Rr(Or(t[1],t.slice(2))):"has"===e?Ur(t[1]):"!has"===e?Rr(Ur(t[1])):"within"!==e||t;var r;}function Dr(t,e,r){switch(t){case"$type":return [`filter-type-${r}`,e];case"$id":return [`filter-id-${r}`,e];default:return [`filter-${r}`,t,e]}}function Or(t,e){if(0===e.length)return !1;switch(t){case"$type":return ["filter-type-in",["literal",e]];case"$id":return ["filter-id-in",["literal",e]];default:return e.length>200&&!e.some((t=>typeof t!=typeof e[0]))?["filter-in-large",t,["literal",e.sort(Tr)]]:["filter-in-small",t,["literal",e]]}}function Ur(t){switch(t){case"$type":return !0;case"$id":return ["filter-has-id"];default:return ["filter-has",t]}}function Rr(t){return ["!",t]}function qr(t){const e=typeof t;if("number"===e||"boolean"===e||"string"===e||null==t)return JSON.stringify(t);if(Array.isArray(t)){let e="[";for(const r of t)e+=`${qr(r)},`;return `${e}]`}const r=Object.keys(t).sort();let n="{";for(let e=0;e<r.length;e++)n+=`${JSON.stringify(r[e])}:${qr(t[r[e]])},`;return `${n}}`}function jr(t){let e="";for(const r of j)e+=`/${qr(t[r])}`;return e}function Nr(t){const e=t.value;return e?[new tt(t.key,e,"constants have been deprecated as of v8")]:[]}function Zr(t){return t instanceof Number||t instanceof String||t instanceof Boolean?t.valueOf():t}function Kr(t){if(Array.isArray(t))return t.map(Kr);if(t instanceof Object&&!(t instanceof Number||t instanceof String||t instanceof Boolean)){const e={};for(const r in t)e[r]=Kr(t[r]);return e}return Zr(t)}function Gr(t){const e=t.key,r=t.value,n=t.valueSpec||{},i=t.objectElementValidators||{},a=t.style,s=t.styleSpec,o=t.validateSpec;let l=[];const u=yr(r);if("object"!==u)return [new tt(e,r,`object expected, ${u} found`)];for(const t in r){const u=t.split(".")[0],c=n[u]||n["*"];let h;if(i[u])h=i[u];else if(n[u])h=o;else if(i["*"])h=i["*"];else {if(!n["*"]){l.push(new tt(e,r[t],`unknown property "${t}"`));continue}h=o;}l=l.concat(h({key:(e?`${e}.`:e)+t,value:r[t],valueSpec:c,style:a,styleSpec:s,object:r,objectKey:t,validateSpec:o},r));}for(const t in n)i[t]||n[t].required&&void 0===n[t].default&&void 0===r[t]&&l.push(new tt(e,r,`missing required property "${t}"`));return l}function Jr(t){const e=t.value,r=t.valueSpec,n=t.style,i=t.styleSpec,a=t.key,s=t.arrayElementValidator||t.validateSpec;if("array"!==yr(e))return [new tt(a,e,`array expected, ${yr(e)} found`)];if(r.length&&e.length!==r.length)return [new tt(a,e,`array length ${r.length} expected, length ${e.length} found`)];if(r["min-length"]&&e.length<r["min-length"])return [new tt(a,e,`array length at least ${r["min-length"]} expected, length ${e.length} found`)];let o={type:r.value,values:r.values};i.$version<7&&(o.function=r.function),"object"===yr(r.value)&&(o=r.value);let l=[];for(let r=0;r<e.length;r++)l=l.concat(s({array:e,arrayIndex:r,value:e[r],valueSpec:o,validateSpec:t.validateSpec,style:n,styleSpec:i,key:`${a}[${r}]`}));return l}function Xr(t){const e=t.key,r=t.value,n=t.valueSpec;let i=yr(r);return "number"===i&&r!=r&&(i="NaN"),"number"!==i?[new tt(e,r,`number expected, ${i} found`)]:"minimum"in n&&r<n.minimum?[new tt(e,r,`${r} is less than the minimum value ${n.minimum}`)]:"maximum"in n&&r>n.maximum?[new tt(e,r,`${r} is greater than the maximum value ${n.maximum}`)]:[]}function Yr(t){const e=t.valueSpec,r=Zr(t.value.type);let n,i,a,s={};const o="categorical"!==r&&void 0===t.value.property,l=!o,u="array"===yr(t.value.stops)&&"array"===yr(t.value.stops[0])&&"object"===yr(t.value.stops[0][0]),c=Gr({key:t.key,value:t.value,valueSpec:t.styleSpec.function,validateSpec:t.validateSpec,style:t.style,styleSpec:t.styleSpec,objectElementValidators:{stops:function(t){if("identity"===r)return [new tt(t.key,t.value,'identity function may not have a "stops" property')];let e=[];const n=t.value;return e=e.concat(Jr({key:t.key,value:n,valueSpec:t.valueSpec,validateSpec:t.validateSpec,style:t.style,styleSpec:t.styleSpec,arrayElementValidator:h})),"array"===yr(n)&&0===n.length&&e.push(new tt(t.key,n,"array must have at least one stop")),e},default:function(t){return t.validateSpec({key:t.key,value:t.value,valueSpec:e,validateSpec:t.validateSpec,style:t.style,styleSpec:t.styleSpec})}}});return "identity"===r&&o&&c.push(new tt(t.key,t.value,'missing required property "property"')),"identity"===r||t.value.stops||c.push(new tt(t.key,t.value,'missing required property "stops"')),"exponential"===r&&t.valueSpec.expression&&!dr(t.valueSpec)&&c.push(new tt(t.key,t.value,"exponential functions not supported")),t.styleSpec.$version>=8&&(l&&!pr(t.valueSpec)?c.push(new tt(t.key,t.value,"property functions not supported")):o&&!fr(t.valueSpec)&&c.push(new tt(t.key,t.value,"zoom functions not supported"))),"categorical"!==r&&!u||void 0!==t.value.property||c.push(new tt(t.key,t.value,'"property" property is required')),c;function h(t){let r=[];const n=t.value,o=t.key;if("array"!==yr(n))return [new tt(o,n,`array expected, ${yr(n)} found`)];if(2!==n.length)return [new tt(o,n,`array length 2 expected, length ${n.length} found`)];if(u){if("object"!==yr(n[0]))return [new tt(o,n,`object expected, ${yr(n[0])} found`)];if(void 0===n[0].zoom)return [new tt(o,n,"object stop key must have zoom")];if(void 0===n[0].value)return [new tt(o,n,"object stop key must have value")];if(a&&a>Zr(n[0].zoom))return [new tt(o,n[0].zoom,"stop zoom values must appear in ascending order")];Zr(n[0].zoom)!==a&&(a=Zr(n[0].zoom),i=void 0,s={}),r=r.concat(Gr({key:`${o}[0]`,value:n[0],valueSpec:{zoom:{}},validateSpec:t.validateSpec,style:t.style,styleSpec:t.styleSpec,objectElementValidators:{zoom:Xr,value:p}}));}else r=r.concat(p({key:`${o}[0]`,value:n[0],valueSpec:{},validateSpec:t.validateSpec,style:t.style,styleSpec:t.styleSpec},n));return Sr(Kr(n[1]))?r.concat([new tt(`${o}[1]`,n[1],"expressions are not allowed in function stops.")]):r.concat(t.validateSpec({key:`${o}[1]`,value:n[1],valueSpec:e,validateSpec:t.validateSpec,style:t.style,styleSpec:t.styleSpec}))}function p(t,a){const o=yr(t.value),l=Zr(t.value),u=null!==t.value?t.value:a;if(n){if(o!==n)return [new tt(t.key,u,`${o} stop domain type must match previous stop domain type ${n}`)]}else n=o;if("number"!==o&&"string"!==o&&"boolean"!==o)return [new tt(t.key,u,"stop domain value must be a number, string, or boolean")];if("number"!==o&&"categorical"!==r){let n=`number expected, ${o} found`;return pr(e)&&void 0===r&&(n+='\nIf you intended to use a categorical function, specify `"type": "categorical"`.'),[new tt(t.key,u,n)]}return "categorical"!==r||"number"!==o||isFinite(l)&&Math.floor(l)===l?"categorical"!==r&&"number"===o&&void 0!==i&&l<i?[new tt(t.key,u,"stop domain values must appear in ascending order")]:(i=l,"categorical"===r&&l in s?[new tt(t.key,u,"stop domain values must be unique")]:(s[l]=!0,[])):[new tt(t.key,u,`integer expected, found ${l}`)]}}function Hr(t){const e=("property"===t.expressionContext?Pr:Ir)(Kr(t.value),t.valueSpec);if("error"===e.result)return e.value.map((e=>new tt(`${t.key}${e.key}`,t.value,e.message)));const r=e.value.expression||e.value._styleExpression.expression;if("property"===t.expressionContext&&"text-font"===t.propertyKey&&!r.outputDefined())return [new tt(t.key,t.value,`Invalid data expression for "${t.propertyKey}". Output values must be contained as literals within the expression.`)];if("property"===t.expressionContext&&"layout"===t.propertyType&&!Pe(r))return [new tt(t.key,t.value,'"feature-state" data expressions are not supported with layout properties.')];if("filter"===t.expressionContext&&!Pe(r))return [new tt(t.key,t.value,'"feature-state" data expressions are not supported with filters.')];if(t.expressionContext&&0===t.expressionContext.indexOf("cluster")){if(!Be(r,["zoom","feature-state"]))return [new tt(t.key,t.value,'"zoom" and "feature-state" expressions are not supported with cluster properties.')];if("cluster-initial"===t.expressionContext&&!Me(r))return [new tt(t.key,t.value,"Feature data expressions are not supported with initial expression part of cluster properties.")]}return []}function Wr(t){const e=t.key,r=t.value,n=t.valueSpec,i=[];return Array.isArray(n.values)?-1===n.values.indexOf(Zr(r))&&i.push(new tt(e,r,`expected one of [${n.values.join(", ")}], ${JSON.stringify(r)} found`)):-1===Object.keys(n.values).indexOf(Zr(r))&&i.push(new tt(e,r,`expected one of [${Object.keys(n.values).join(", ")}], ${JSON.stringify(r)} found`)),i}function Qr(t){return Vr(Kr(t.value))?Hr(et({},t,{expressionContext:"filter",valueSpec:{value:"boolean"}})):tn(t)}function tn(t){const e=t.value,r=t.key;if("array"!==yr(e))return [new tt(r,e,`array expected, ${yr(e)} found`)];const n=t.styleSpec;let i,a=[];if(e.length<1)return [new tt(r,e,"filter array must have at least 1 element")];switch(a=a.concat(Wr({key:`${r}[0]`,value:e[0],valueSpec:n.filter_operator,style:t.style,styleSpec:t.styleSpec})),Zr(e[0])){case"<":case"<=":case">":case">=":e.length>=2&&"$type"===Zr(e[1])&&a.push(new tt(r,e,`"$type" cannot be use with operator "${e[0]}"`));case"==":case"!=":3!==e.length&&a.push(new tt(r,e,`filter array for operator "${e[0]}" must have 3 elements`));case"in":case"!in":e.length>=2&&(i=yr(e[1]),"string"!==i&&a.push(new tt(`${r}[1]`,e[1],`string expected, ${i} found`)));for(let s=2;s<e.length;s++)i=yr(e[s]),"$type"===Zr(e[1])?a=a.concat(Wr({key:`${r}[${s}]`,value:e[s],valueSpec:n.geometry_type,style:t.style,styleSpec:t.styleSpec})):"string"!==i&&"number"!==i&&"boolean"!==i&&a.push(new tt(`${r}[${s}]`,e[s],`string, number, or boolean expected, ${i} found`));break;case"any":case"all":case"none":for(let n=1;n<e.length;n++)a=a.concat(tn({key:`${r}[${n}]`,value:e[n],style:t.style,styleSpec:t.styleSpec}));break;case"has":case"!has":i=yr(e[1]),2!==e.length?a.push(new tt(r,e,`filter array for "${e[0]}" operator must have 2 elements`)):"string"!==i&&a.push(new tt(`${r}[1]`,e[1],`string expected, ${i} found`));break;case"within":i=yr(e[1]),2!==e.length?a.push(new tt(r,e,`filter array for "${e[0]}" operator must have 2 elements`)):"object"!==i&&a.push(new tt(`${r}[1]`,e[1],`object expected, ${i} found`));}return a}function en(t,e){const r=t.key,n=t.validateSpec,i=t.style,a=t.styleSpec,s=t.value,o=t.objectKey,l=a[`${e}_${t.layerType}`];if(!l)return [];const u=o.match(/^(.*)-transition$/);if("paint"===e&&u&&l[u[1]]&&l[u[1]].transition)return n({key:r,value:s,valueSpec:a.transition,style:i,styleSpec:a});const c=t.valueSpec||l[o];if(!c)return [new tt(r,s,`unknown property "${o}"`)];let h;if("string"===yr(s)&&pr(c)&&!c.tokens&&(h=/^{([^}]+)}$/.exec(s)))return [new tt(r,s,`"${o}" does not support interpolation syntax\nUse an identity property function instead: \`{ "type": "identity", "property": ${JSON.stringify(h[1])} }\`.`)];const p=[];return "symbol"===t.layerType&&("text-field"===o&&i&&!i.glyphs&&p.push(new tt(r,s,'use of "text-field" requires a style "glyphs" property')),"text-font"===o&&mr(Kr(s))&&"identity"===Zr(s.type)&&p.push(new tt(r,s,'"text-font" does not support identity functions'))),p.concat(n({key:t.key,value:s,valueSpec:c,style:i,styleSpec:a,expressionContext:"property",propertyType:e,propertyKey:o}))}function rn(t){return en(t,"paint")}function nn(t){return en(t,"layout")}function an(t){let e=[];const r=t.value,n=t.key,i=t.style,a=t.styleSpec;r.type||r.ref||e.push(new tt(n,r,'either "type" or "ref" is required'));let s=Zr(r.type);const o=Zr(r.ref);if(r.id){const a=Zr(r.id);for(let s=0;s<t.arrayIndex;s++){const t=i.layers[s];Zr(t.id)===a&&e.push(new tt(n,r.id,`duplicate layer id "${r.id}", previously used at line ${t.id.__line__}`));}}if("ref"in r){let t;["type","source","source-layer","filter","layout"].forEach((t=>{t in r&&e.push(new tt(n,r[t],`"${t}" is prohibited for ref layers`));})),i.layers.forEach((e=>{Zr(e.id)===o&&(t=e);})),t?t.ref?e.push(new tt(n,r.ref,"ref cannot reference another ref layer")):s=Zr(t.type):e.push(new tt(n,r.ref,`ref layer "${o}" not found`));}else if("background"!==s)if(r.source){const t=i.sources&&i.sources[r.source],a=t&&Zr(t.type);t?"vector"===a&&"raster"===s?e.push(new tt(n,r.source,`layer "${r.id}" requires a raster source`)):"raster"===a&&"raster"!==s?e.push(new tt(n,r.source,`layer "${r.id}" requires a vector source`)):"vector"!==a||r["source-layer"]?"raster-dem"===a&&"hillshade"!==s?e.push(new tt(n,r.source,"raster-dem source can only be used with layer type 'hillshade'.")):"line"!==s||!r.paint||!r.paint["line-gradient"]||"geojson"===a&&t.lineMetrics||e.push(new tt(n,r,`layer "${r.id}" specifies a line-gradient, which requires a GeoJSON source with \`lineMetrics\` enabled.`)):e.push(new tt(n,r,`layer "${r.id}" must specify a "source-layer"`)):e.push(new tt(n,r.source,`source "${r.source}" not found`));}else e.push(new tt(n,r,'missing required property "source"'));return e=e.concat(Gr({key:n,value:r,valueSpec:a.layer,style:t.style,styleSpec:t.styleSpec,validateSpec:t.validateSpec,objectElementValidators:{"*":()=>[],type:()=>t.validateSpec({key:`${n}.type`,value:r.type,valueSpec:a.layer.type,style:t.style,styleSpec:t.styleSpec,validateSpec:t.validateSpec,object:r,objectKey:"type"}),filter:Qr,layout:t=>Gr({layer:r,key:t.key,value:t.value,style:t.style,styleSpec:t.styleSpec,validateSpec:t.validateSpec,objectElementValidators:{"*":t=>nn(et({layerType:s},t))}}),paint:t=>Gr({layer:r,key:t.key,value:t.value,style:t.style,styleSpec:t.styleSpec,validateSpec:t.validateSpec,objectElementValidators:{"*":t=>rn(et({layerType:s},t))}})}})),e}function sn(t){const e=t.value,r=t.key,n=yr(e);return "string"!==n?[new tt(r,e,`string expected, ${n} found`)]:[]}const on={promoteId:function({key:t,value:e}){if("string"===yr(e))return sn({key:t,value:e});{const r=[];for(const n in e)r.push(...sn({key:`${t}.${n}`,value:e[n]}));return r}}};function ln(t){const e=t.value,r=t.key,n=t.styleSpec,i=t.style,a=t.validateSpec;if(!e.type)return [new tt(r,e,'"type" is required')];const s=Zr(e.type);let o;switch(s){case"vector":case"raster":case"raster-dem":return o=Gr({key:r,value:e,valueSpec:n[`source_${s.replace("-","_")}`],style:t.style,styleSpec:n,objectElementValidators:on,validateSpec:a}),o;case"geojson":if(o=Gr({key:r,value:e,valueSpec:n.source_geojson,style:i,styleSpec:n,validateSpec:a,objectElementValidators:on}),e.cluster)for(const t in e.clusterProperties){const[n,i]=e.clusterProperties[t],s="string"==typeof n?[n,["accumulated"],["get",t]]:n;o.push(...Hr({key:`${r}.${t}.map`,value:i,validateSpec:a,expressionContext:"cluster-map"})),o.push(...Hr({key:`${r}.${t}.reduce`,value:s,validateSpec:a,expressionContext:"cluster-reduce"}));}return o;case"video":return Gr({key:r,value:e,valueSpec:n.source_video,style:i,validateSpec:a,styleSpec:n});case"image":return Gr({key:r,value:e,valueSpec:n.source_image,style:i,validateSpec:a,styleSpec:n});case"canvas":return [new tt(r,null,"Please use runtime APIs to add canvas sources, rather than including them in stylesheets.","source.canvas")];default:return Wr({key:`${r}.type`,value:e.type,valueSpec:{values:["vector","raster","raster-dem","geojson","video","image"]},style:i,validateSpec:a,styleSpec:n})}}function un(t){const e=t.value,r=t.styleSpec,n=r.light,i=t.style;let a=[];const s=yr(e);if(void 0===e)return a;if("object"!==s)return a=a.concat([new tt("light",e,`object expected, ${s} found`)]),a;for(const s in e){const o=s.match(/^(.*)-transition$/);a=a.concat(o&&n[o[1]]&&n[o[1]].transition?t.validateSpec({key:s,value:e[s],valueSpec:r.transition,validateSpec:t.validateSpec,style:i,styleSpec:r}):n[s]?t.validateSpec({key:s,value:e[s],valueSpec:n[s],validateSpec:t.validateSpec,style:i,styleSpec:r}):[new tt(s,e[s],`unknown property "${s}"`)]);}return a}function cn(t){const e=t.value,r=t.styleSpec,n=r.terrain,i=t.style;let a=[];const s=yr(e);if(void 0===e)return a;if("object"!==s)return a=a.concat([new tt("terrain",e,`object expected, ${s} found`)]),a;for(const s in e)a=a.concat(n[s]?t.validateSpec({key:s,value:e[s],valueSpec:n[s],validateSpec:t.validateSpec,style:i,styleSpec:r}):[new tt(s,e[s],`unknown property "${s}"`)]);return a}function hn(t){let e=[];const r=t.value,n=t.key;if(Array.isArray(r)){const i=[],a=[];for(const s in r)r[s].id&&i.includes(r[s].id)&&e.push(new tt(n,r,`all the sprites' ids must be unique, but ${r[s].id} is duplicated`)),i.push(r[s].id),r[s].url&&a.includes(r[s].url)&&e.push(new tt(n,r,`all the sprites' URLs must be unique, but ${r[s].url} is duplicated`)),a.push(r[s].url),e=e.concat(Gr({key:`${n}[${s}]`,value:r[s],valueSpec:{id:{type:"string",required:!0},url:{type:"string",required:!0}},validateSpec:t.validateSpec}));return e}return sn({key:n,value:r})}const pn={"*":()=>[],array:Jr,boolean:function(t){const e=t.value,r=t.key,n=yr(e);return "boolean"!==n?[new tt(r,e,`boolean expected, ${n} found`)]:[]},number:Xr,color:function(t){const e=t.key,r=t.value,n=yr(r);return "string"!==n?[new tt(e,r,`color expected, ${n} found`)]:qt.parse(String(r))?[]:[new tt(e,r,`color expected, "${r}" found`)]},constants:Nr,enum:Wr,filter:Qr,function:Yr,layer:an,object:Gr,source:ln,light:un,terrain:cn,string:sn,formatted:function(t){return 0===sn(t).length?[]:Hr(t)},resolvedImage:function(t){return 0===sn(t).length?[]:Hr(t)},padding:function(t){const e=t.key,r=t.value;if("array"===yr(r)){if(r.length<1||r.length>4)return [new tt(e,r,`padding requires 1 to 4 values; ${r.length} values found`)];const n={type:"number"};let i=[];for(let a=0;a<r.length;a++)i=i.concat(t.validateSpec({key:`${e}[${a}]`,value:r[a],validateSpec:t.validateSpec,valueSpec:n}));return i}return Xr({key:e,value:r,valueSpec:{}})},sprite:hn};function fn(t){const e=t.value,r=t.valueSpec,n=t.styleSpec;return t.validateSpec=fn,r.expression&&mr(Zr(e))?Yr(t):r.expression&&Sr(Kr(e))?Hr(t):r.type&&pn[r.type]?pn[r.type](t):Gr(et({},t,{valueSpec:r.type?n[r.type]:r}))}function dn(t){const e=t.value,r=t.key,n=sn(t);return n.length||(-1===e.indexOf("{fontstack}")&&n.push(new tt(r,e,'"glyphs" url must include a "{fontstack}" token')),-1===e.indexOf("{range}")&&n.push(new tt(r,e,'"glyphs" url must include a "{range}" token'))),n}function yn(t,e=q){let r=[];return r=r.concat(fn({key:"",value:t,valueSpec:e.$root,styleSpec:e,style:t,validateSpec:fn,objectElementValidators:{glyphs:dn,"*":()=>[]}})),t.constants&&(r=r.concat(Nr({key:"constants",value:t.constants,style:t,styleSpec:e,validateSpec:fn}))),gn(r)}function mn(t){return function(e){return t({...e,validateSpec:fn})}}function gn(t){return [].concat(t).sort(((t,e)=>t.line-e.line))}function xn(t){return function(...e){return gn(t.apply(this,e))}}yn.source=xn(mn(ln)),yn.sprite=xn(mn(hn)),yn.glyphs=xn(mn(dn)),yn.light=xn(mn(un)),yn.terrain=xn(mn(cn)),yn.layer=xn(mn(an)),yn.filter=xn(mn(Qr)),yn.paintProperty=xn(mn(rn)),yn.layoutProperty=xn(mn(nn));const vn=yn,bn=vn.light,wn=vn.paintProperty,_n=vn.layoutProperty;function An(t,e){let r=!1;if(e&&e.length)for(const n of e)t.fire(new U(new Error(n.message))),r=!0;return r}class kn{constructor(t,e,r){const n=this.cells=[];if(t instanceof ArrayBuffer){this.arrayBuffer=t;const i=new Int32Array(this.arrayBuffer);t=i[0],this.d=(e=i[1])+2*(r=i[2]);for(let t=0;t<this.d*this.d;t++){const e=i[3+t],r=i[3+t+1];n.push(e===r?null:i.subarray(e,r));}const a=i[3+n.length+1];this.keys=i.subarray(i[3+n.length],a),this.bboxes=i.subarray(a),this.insert=this._insertReadonly;}else {this.d=e+2*r;for(let t=0;t<this.d*this.d;t++)n.push([]);this.keys=[],this.bboxes=[];}this.n=e,this.extent=t,this.padding=r,this.scale=e/t,this.uid=0;const i=r/e*t;this.min=-i,this.max=t+i;}insert(t,e,r,n,i){this._forEachCell(e,r,n,i,this._insertCell,this.uid++,void 0,void 0),this.keys.push(t),this.bboxes.push(e),this.bboxes.push(r),this.bboxes.push(n),this.bboxes.push(i);}_insertReadonly(){throw new Error("Cannot insert into a GridIndex created from an ArrayBuffer.")}_insertCell(t,e,r,n,i,a){this.cells[i].push(a);}query(t,e,r,n,i){const a=this.min,s=this.max;if(t<=a&&e<=a&&s<=r&&s<=n&&!i)return Array.prototype.slice.call(this.keys);{const a=[];return this._forEachCell(t,e,r,n,this._queryCell,a,{},i),a}}_queryCell(t,e,r,n,i,a,s,o){const l=this.cells[i];if(null!==l){const i=this.keys,u=this.bboxes;for(let c=0;c<l.length;c++){const h=l[c];if(void 0===s[h]){const l=4*h;(o?o(u[l+0],u[l+1],u[l+2],u[l+3]):t<=u[l+2]&&e<=u[l+3]&&r>=u[l+0]&&n>=u[l+1])?(s[h]=!0,a.push(i[h])):s[h]=!1;}}}}_forEachCell(t,e,r,n,i,a,s,o){const l=this._convertToCellCoord(t),u=this._convertToCellCoord(e),c=this._convertToCellCoord(r),h=this._convertToCellCoord(n);for(let p=l;p<=c;p++)for(let l=u;l<=h;l++){const u=this.d*l+p;if((!o||o(this._convertFromCellCoord(p),this._convertFromCellCoord(l),this._convertFromCellCoord(p+1),this._convertFromCellCoord(l+1)))&&i.call(this,t,e,r,n,u,a,s,o))return}}_convertFromCellCoord(t){return (t-this.padding)/this.scale}_convertToCellCoord(t){return Math.max(0,Math.min(this.d-1,Math.floor(t*this.scale)+this.padding))}toArrayBuffer(){if(this.arrayBuffer)return this.arrayBuffer;const t=this.cells,e=3+this.cells.length+1+1;let r=0;for(let t=0;t<this.cells.length;t++)r+=this.cells[t].length;const n=new Int32Array(e+r+this.keys.length+this.bboxes.length);n[0]=this.extent,n[1]=this.n,n[2]=this.padding;let i=e;for(let e=0;e<t.length;e++){const r=t[e];n[3+e]=i,n.set(r,i),i+=r.length;}return n[3+t.length]=i,n.set(this.keys,i),i+=this.keys.length,n[3+t.length+1]=i,n.set(this.bboxes,i),i+=this.bboxes.length,n.buffer}static serialize(t,e){const r=t.toArrayBuffer();return e&&e.push(r),{buffer:r}}static deserialize(t){return new kn(t.buffer)}}const Sn={};function In(t,e,r={}){if(Sn[t])throw new Error(`${t} is already registered.`);Object.defineProperty(e,"_classRegistryKey",{value:t,writeable:!1}),Sn[t]={klass:e,omit:r.omit||[],shallow:r.shallow||[]};}In("Object",Object),In("TransferableGridIndex",kn),In("Color",qt),In("Error",Error),In("AJAXError",B),In("ResolvedImage",Gt),In("StylePropertyFunction",Br),In("StyleExpression",kr,{omit:["_evaluator"]}),In("ZoomDependentExpression",Mr),In("ZoomConstantExpression",zr),In("CompoundExpression",Ie,{omit:["_evaluate"]});for(const t in ar)ar[t]._classRegistryKey||In(`Expression_${t}`,ar[t]);function zn(t){return t&&"undefined"!=typeof ArrayBuffer&&(t instanceof ArrayBuffer||t.constructor&&"ArrayBuffer"===t.constructor.name)}function Mn(t,e){if(null==t||"boolean"==typeof t||"number"==typeof t||"string"==typeof t||t instanceof Boolean||t instanceof Number||t instanceof String||t instanceof Date||t instanceof RegExp||t instanceof Blob)return t;if(zn(t))return e&&e.push(t),t;if(k(t))return e&&e.push(t),t;if(ArrayBuffer.isView(t)){const r=t;return e&&e.push(r.buffer),r}if(t instanceof ImageData)return e&&e.push(t.data.buffer),t;if(Array.isArray(t)){const r=[];for(const n of t)r.push(Mn(n,e));return r}if("object"==typeof t){const r=t.constructor,n=r._classRegistryKey;if(!n)throw new Error("can't serialize object of unregistered class");if(!Sn[n])throw new Error(`${n} is not registered.`);const i=r.serialize?r.serialize(t,e):{};if(r.serialize){if(e&&i===e[e.length-1])throw new Error("statically serialized object won't survive transfer of $name property")}else {for(const r in t){if(!t.hasOwnProperty(r))continue;if(Sn[n].omit.indexOf(r)>=0)continue;const a=t[r];i[r]=Sn[n].shallow.indexOf(r)>=0?a:Mn(a,e);}t instanceof Error&&(i.message=t.message);}if(i.$name)throw new Error("$name property is reserved for worker serialization logic.");return "Object"!==n&&(i.$name=n),i}throw new Error("can't serialize object of type "+typeof t)}function Pn(t){if(null==t||"boolean"==typeof t||"number"==typeof t||"string"==typeof t||t instanceof Boolean||t instanceof Number||t instanceof String||t instanceof Date||t instanceof RegExp||t instanceof Blob||zn(t)||k(t)||ArrayBuffer.isView(t)||t instanceof ImageData)return t;if(Array.isArray(t))return t.map(Pn);if("object"==typeof t){const e=t.$name||"Object";if(!Sn[e])throw new Error(`can't deserialize unregistered class ${e}`);const{klass:r}=Sn[e];if(!r)throw new Error(`can't deserialize unregistered class ${e}`);if(r.deserialize)return r.deserialize(t);const n=Object.create(r.prototype);for(const r of Object.keys(t)){if("$name"===r)continue;const i=t[r];n[r]=Sn[e].shallow.indexOf(r)>=0?i:Pn(i);}return n}throw new Error("can't deserialize object of type "+typeof t)}class Bn{constructor(){this.first=!0;}update(t,e){const r=Math.floor(t);return this.first?(this.first=!1,this.lastIntegerZoom=r,this.lastIntegerZoomTime=0,this.lastZoom=t,this.lastFloorZoom=r,!0):(this.lastFloorZoom>r?(this.lastIntegerZoom=r+1,this.lastIntegerZoomTime=e):this.lastFloorZoom<r&&(this.lastIntegerZoom=r,this.lastIntegerZoomTime=e),t!==this.lastZoom&&(this.lastZoom=t,this.lastFloorZoom=r,!0))}}const Cn={"Latin-1 Supplement":t=>t>=128&&t<=255,Arabic:t=>t>=1536&&t<=1791,"Arabic Supplement":t=>t>=1872&&t<=1919,"Arabic Extended-A":t=>t>=2208&&t<=2303,"Hangul Jamo":t=>t>=4352&&t<=4607,"Unified Canadian Aboriginal Syllabics":t=>t>=5120&&t<=5759,Khmer:t=>t>=6016&&t<=6143,"Unified Canadian Aboriginal Syllabics Extended":t=>t>=6320&&t<=6399,"General Punctuation":t=>t>=8192&&t<=8303,"Letterlike Symbols":t=>t>=8448&&t<=8527,"Number Forms":t=>t>=8528&&t<=8591,"Miscellaneous Technical":t=>t>=8960&&t<=9215,"Control Pictures":t=>t>=9216&&t<=9279,"Optical Character Recognition":t=>t>=9280&&t<=9311,"Enclosed Alphanumerics":t=>t>=9312&&t<=9471,"Geometric Shapes":t=>t>=9632&&t<=9727,"Miscellaneous Symbols":t=>t>=9728&&t<=9983,"Miscellaneous Symbols and Arrows":t=>t>=11008&&t<=11263,"CJK Radicals Supplement":t=>t>=11904&&t<=12031,"Kangxi Radicals":t=>t>=12032&&t<=12255,"Ideographic Description Characters":t=>t>=12272&&t<=12287,"CJK Symbols and Punctuation":t=>t>=12288&&t<=12351,Hiragana:t=>t>=12352&&t<=12447,Katakana:t=>t>=12448&&t<=12543,Bopomofo:t=>t>=12544&&t<=12591,"Hangul Compatibility Jamo":t=>t>=12592&&t<=12687,Kanbun:t=>t>=12688&&t<=12703,"Bopomofo Extended":t=>t>=12704&&t<=12735,"CJK Strokes":t=>t>=12736&&t<=12783,"Katakana Phonetic Extensions":t=>t>=12784&&t<=12799,"Enclosed CJK Letters and Months":t=>t>=12800&&t<=13055,"CJK Compatibility":t=>t>=13056&&t<=13311,"CJK Unified Ideographs Extension A":t=>t>=13312&&t<=19903,"Yijing Hexagram Symbols":t=>t>=19904&&t<=19967,"CJK Unified Ideographs":t=>t>=19968&&t<=40959,"Yi Syllables":t=>t>=40960&&t<=42127,"Yi Radicals":t=>t>=42128&&t<=42191,"Hangul Jamo Extended-A":t=>t>=43360&&t<=43391,"Hangul Syllables":t=>t>=44032&&t<=55215,"Hangul Jamo Extended-B":t=>t>=55216&&t<=55295,"Private Use Area":t=>t>=57344&&t<=63743,"CJK Compatibility Ideographs":t=>t>=63744&&t<=64255,"Arabic Presentation Forms-A":t=>t>=64336&&t<=65023,"Vertical Forms":t=>t>=65040&&t<=65055,"CJK Compatibility Forms":t=>t>=65072&&t<=65103,"Small Form Variants":t=>t>=65104&&t<=65135,"Arabic Presentation Forms-B":t=>t>=65136&&t<=65279,"Halfwidth and Fullwidth Forms":t=>t>=65280&&t<=65519};function Vn(t){for(const e of t)if(Tn(e.charCodeAt(0)))return !0;return !1}function En(t){for(const e of t)if(!Fn(e.charCodeAt(0)))return !1;return !0}function Fn(t){return !(Cn.Arabic(t)||Cn["Arabic Supplement"](t)||Cn["Arabic Extended-A"](t)||Cn["Arabic Presentation Forms-A"](t)||Cn["Arabic Presentation Forms-B"](t))}function Tn(t){return !(746!==t&&747!==t&&(t<4352||!(Cn["Bopomofo Extended"](t)||Cn.Bopomofo(t)||Cn["CJK Compatibility Forms"](t)&&!(t>=65097&&t<=65103)||Cn["CJK Compatibility Ideographs"](t)||Cn["CJK Compatibility"](t)||Cn["CJK Radicals Supplement"](t)||Cn["CJK Strokes"](t)||!(!Cn["CJK Symbols and Punctuation"](t)||t>=12296&&t<=12305||t>=12308&&t<=12319||12336===t)||Cn["CJK Unified Ideographs Extension A"](t)||Cn["CJK Unified Ideographs"](t)||Cn["Enclosed CJK Letters and Months"](t)||Cn["Hangul Compatibility Jamo"](t)||Cn["Hangul Jamo Extended-A"](t)||Cn["Hangul Jamo Extended-B"](t)||Cn["Hangul Jamo"](t)||Cn["Hangul Syllables"](t)||Cn.Hiragana(t)||Cn["Ideographic Description Characters"](t)||Cn.Kanbun(t)||Cn["Kangxi Radicals"](t)||Cn["Katakana Phonetic Extensions"](t)||Cn.Katakana(t)&&12540!==t||!(!Cn["Halfwidth and Fullwidth Forms"](t)||65288===t||65289===t||65293===t||t>=65306&&t<=65310||65339===t||65341===t||65343===t||t>=65371&&t<=65503||65507===t||t>=65512&&t<=65519)||!(!Cn["Small Form Variants"](t)||t>=65112&&t<=65118||t>=65123&&t<=65126)||Cn["Unified Canadian Aboriginal Syllabics"](t)||Cn["Unified Canadian Aboriginal Syllabics Extended"](t)||Cn["Vertical Forms"](t)||Cn["Yijing Hexagram Symbols"](t)||Cn["Yi Syllables"](t)||Cn["Yi Radicals"](t))))}function Ln(t){return !(Tn(t)||function(t){return !!(Cn["Latin-1 Supplement"](t)&&(167===t||169===t||174===t||177===t||188===t||189===t||190===t||215===t||247===t)||Cn["General Punctuation"](t)&&(8214===t||8224===t||8225===t||8240===t||8241===t||8251===t||8252===t||8258===t||8263===t||8264===t||8265===t||8273===t)||Cn["Letterlike Symbols"](t)||Cn["Number Forms"](t)||Cn["Miscellaneous Technical"](t)&&(t>=8960&&t<=8967||t>=8972&&t<=8991||t>=8996&&t<=9e3||9003===t||t>=9085&&t<=9114||t>=9150&&t<=9165||9167===t||t>=9169&&t<=9179||t>=9186&&t<=9215)||Cn["Control Pictures"](t)&&9251!==t||Cn["Optical Character Recognition"](t)||Cn["Enclosed Alphanumerics"](t)||Cn["Geometric Shapes"](t)||Cn["Miscellaneous Symbols"](t)&&!(t>=9754&&t<=9759)||Cn["Miscellaneous Symbols and Arrows"](t)&&(t>=11026&&t<=11055||t>=11088&&t<=11097||t>=11192&&t<=11243)||Cn["CJK Symbols and Punctuation"](t)||Cn.Katakana(t)||Cn["Private Use Area"](t)||Cn["CJK Compatibility Forms"](t)||Cn["Small Form Variants"](t)||Cn["Halfwidth and Fullwidth Forms"](t)||8734===t||8756===t||8757===t||t>=9984&&t<=10087||t>=10102&&t<=10131||65532===t||65533===t)}(t))}function $n(t){return t>=1424&&t<=2303||Cn["Arabic Presentation Forms-A"](t)||Cn["Arabic Presentation Forms-B"](t)}function Dn(t,e){return !(!e&&$n(t)||t>=2304&&t<=3583||t>=3840&&t<=4255||Cn.Khmer(t))}function On(t){for(const e of t)if($n(e.charCodeAt(0)))return !0;return !1}const Un="deferred",Rn="loading",qn="loaded";let jn=null,Nn="unavailable",Zn=null;const Kn=function(t){t&&"string"==typeof t&&t.indexOf("NetworkError")>-1&&(Nn="error"),jn&&jn(t);};function Gn(){Jn.fire(new O("pluginStateChange",{pluginStatus:Nn,pluginURL:Zn}));}const Jn=new R,Xn=function(){return Nn},Yn=function(){if(Nn!==Un||!Zn)throw new Error("rtl-text-plugin cannot be downloaded unless a pluginURL is specified");Nn=Rn,Gn(),Zn&&T({url:Zn},(t=>{t?Kn(t):(Nn=qn,Gn());}));},Hn={applyArabicShaping:null,processBidirectionalText:null,processStyledBidirectionalText:null,isLoaded:()=>Nn===qn||null!=Hn.applyArabicShaping,isLoading:()=>Nn===Rn,setState(t){if(!w())throw new Error("Cannot set the state of the rtl-text-plugin when not in the web-worker context");Nn=t.pluginStatus,Zn=t.pluginURL;},isParsed(){if(!w())throw new Error("rtl-text-plugin is only parsed on the worker-threads");return null!=Hn.applyArabicShaping&&null!=Hn.processBidirectionalText&&null!=Hn.processStyledBidirectionalText},getPluginURL(){if(!w())throw new Error("rtl-text-plugin url can only be queried from the worker threads");return Zn}};class Wn{constructor(t,e){this.zoom=t,e?(this.now=e.now,this.fadeDuration=e.fadeDuration,this.zoomHistory=e.zoomHistory,this.transition=e.transition):(this.now=0,this.fadeDuration=0,this.zoomHistory=new Bn,this.transition={});}isSupportedScript(t){return function(t,e){for(const r of t)if(!Dn(r.charCodeAt(0),e))return !1;return !0}(t,Hn.isLoaded())}crossFadingFactor(){return 0===this.fadeDuration?1:Math.min((this.now-this.zoomHistory.lastIntegerZoomTime)/this.fadeDuration,1)}getCrossfadeParameters(){const t=this.zoom,e=t-Math.floor(t),r=this.crossFadingFactor();return t>this.zoomHistory.lastIntegerZoom?{fromScale:2,toScale:1,t:e+(1-e)*r}:{fromScale:.5,toScale:1,t:1-(1-r)*e}}}class Qn{constructor(t,e){this.property=t,this.value=e,this.expression=function(t,e){if(mr(t))return new Br(t,e);if(Sr(t)){const r=Pr(t,e);if("error"===r.result)throw new Error(r.value.map((t=>`${t.key}: ${t.message}`)).join(", "));return r.value}{let r=t;return "color"===e.type&&"string"==typeof t?r=qt.parse(t):"padding"!==e.type||"number"!=typeof t&&!Array.isArray(t)||(r=Kt.parse(t)),{kind:"constant",evaluate:()=>r}}}(void 0===e?t.specification.default:e,t.specification);}isDataDriven(){return "source"===this.expression.kind||"composite"===this.expression.kind}possiblyEvaluate(t,e,r){return this.property.possiblyEvaluate(this,t,e,r)}}class ti{constructor(t){this.property=t,this.value=new Qn(t,void 0);}transitioned(t,e){return new ri(this.property,this.value,e,p({},t.transition,this.transition),t.now)}untransitioned(){return new ri(this.property,this.value,null,{},0)}}class ei{constructor(t){this._properties=t,this._values=Object.create(t.defaultTransitionablePropertyValues);}getValue(t){return m(this._values[t].value.value)}setValue(t,e){Object.prototype.hasOwnProperty.call(this._values,t)||(this._values[t]=new ti(this._values[t].property)),this._values[t].value=new Qn(this._values[t].property,null===e?void 0:m(e));}getTransition(t){return m(this._values[t].transition)}setTransition(t,e){Object.prototype.hasOwnProperty.call(this._values,t)||(this._values[t]=new ti(this._values[t].property)),this._values[t].transition=m(e)||void 0;}serialize(){const t={};for(const e of Object.keys(this._values)){const r=this.getValue(e);void 0!==r&&(t[e]=r);const n=this.getTransition(e);void 0!==n&&(t[`${e}-transition`]=n);}return t}transitioned(t,e){const r=new ni(this._properties);for(const n of Object.keys(this._values))r._values[n]=this._values[n].transitioned(t,e._values[n]);return r}untransitioned(){const t=new ni(this._properties);for(const e of Object.keys(this._values))t._values[e]=this._values[e].untransitioned();return t}}class ri{constructor(t,e,r,n,i){this.property=t,this.value=e,this.begin=i+n.delay||0,this.end=this.begin+n.duration||0,t.specification.transition&&(n.delay||n.duration)&&(this.prior=r);}possiblyEvaluate(t,e,r){const n=t.now||0,i=this.value.possiblyEvaluate(t,e,r),a=this.prior;if(a){if(n>this.end)return this.prior=null,i;if(this.value.isDataDriven())return this.prior=null,i;if(n<this.begin)return a.possiblyEvaluate(t,e,r);{const s=(n-this.begin)/(this.end-this.begin);return this.property.interpolate(a.possiblyEvaluate(t,e,r),i,function(t){if(t<=0)return 0;if(t>=1)return 1;const e=t*t,r=e*t;return 4*(t<.5?r:3*(t-e)+r-.75)}(s))}}return i}}class ni{constructor(t){this._properties=t,this._values=Object.create(t.defaultTransitioningPropertyValues);}possiblyEvaluate(t,e,r){const n=new si(this._properties);for(const i of Object.keys(this._values))n._values[i]=this._values[i].possiblyEvaluate(t,e,r);return n}hasTransition(){for(const t of Object.keys(this._values))if(this._values[t].prior)return !0;return !1}}class ii{constructor(t){this._properties=t,this._values=Object.create(t.defaultPropertyValues);}getValue(t){return m(this._values[t].value)}setValue(t,e){this._values[t]=new Qn(this._values[t].property,null===e?void 0:m(e));}serialize(){const t={};for(const e of Object.keys(this._values)){const r=this.getValue(e);void 0!==r&&(t[e]=r);}return t}possiblyEvaluate(t,e,r){const n=new si(this._properties);for(const i of Object.keys(this._values))n._values[i]=this._values[i].possiblyEvaluate(t,e,r);return n}}class ai{constructor(t,e,r){this.property=t,this.value=e,this.parameters=r;}isConstant(){return "constant"===this.value.kind}constantOr(t){return "constant"===this.value.kind?this.value.value:t}evaluate(t,e,r,n){return this.property.evaluate(this.value,this.parameters,t,e,r,n)}}class si{constructor(t){this._properties=t,this._values=Object.create(t.defaultPossiblyEvaluatedValues);}get(t){return this._values[t]}}class oi{constructor(t){this.specification=t;}possiblyEvaluate(t,e){if(t.isDataDriven())throw new Error("Value should not be data driven");return t.expression.evaluate(e)}interpolate(t,e,r){const n=Te[this.specification.type];return n?n(t,e,r):t}}class li{constructor(t,e){this.specification=t,this.overrides=e;}possiblyEvaluate(t,e,r,n){return new ai(this,"constant"===t.expression.kind||"camera"===t.expression.kind?{kind:"constant",value:t.expression.evaluate(e,null,{},r,n)}:t.expression,e)}interpolate(t,e,r){if("constant"!==t.value.kind||"constant"!==e.value.kind)return t;if(void 0===t.value.value||void 0===e.value.value)return new ai(this,{kind:"constant",value:void 0},t.parameters);const n=Te[this.specification.type];if(n){const i=n(t.value.value,e.value.value,r);return new ai(this,{kind:"constant",value:i},t.parameters)}return t}evaluate(t,e,r,n,i,a){return "constant"===t.kind?t.value:t.evaluate(e,r,n,i,a)}}class ui extends li{possiblyEvaluate(t,e,r,n){if(void 0===t.value)return new ai(this,{kind:"constant",value:void 0},e);if("constant"===t.expression.kind){const i=t.expression.evaluate(e,null,{},r,n),a="resolvedImage"===t.property.specification.type&&"string"!=typeof i?i.name:i,s=this._calculate(a,a,a,e);return new ai(this,{kind:"constant",value:s},e)}if("camera"===t.expression.kind){const r=this._calculate(t.expression.evaluate({zoom:e.zoom-1}),t.expression.evaluate({zoom:e.zoom}),t.expression.evaluate({zoom:e.zoom+1}),e);return new ai(this,{kind:"constant",value:r},e)}return new ai(this,t.expression,e)}evaluate(t,e,r,n,i,a){if("source"===t.kind){const s=t.evaluate(e,r,n,i,a);return this._calculate(s,s,s,e)}return "composite"===t.kind?this._calculate(t.evaluate({zoom:Math.floor(e.zoom)-1},r,n),t.evaluate({zoom:Math.floor(e.zoom)},r,n),t.evaluate({zoom:Math.floor(e.zoom)+1},r,n),e):t.value}_calculate(t,e,r,n){return n.zoom>n.zoomHistory.lastIntegerZoom?{from:t,to:e}:{from:r,to:e}}interpolate(t){return t}}class ci{constructor(t){this.specification=t;}possiblyEvaluate(t,e,r,n){if(void 0!==t.value){if("constant"===t.expression.kind){const i=t.expression.evaluate(e,null,{},r,n);return this._calculate(i,i,i,e)}return this._calculate(t.expression.evaluate(new Wn(Math.floor(e.zoom-1),e)),t.expression.evaluate(new Wn(Math.floor(e.zoom),e)),t.expression.evaluate(new Wn(Math.floor(e.zoom+1),e)),e)}}_calculate(t,e,r,n){return n.zoom>n.zoomHistory.lastIntegerZoom?{from:t,to:e}:{from:r,to:e}}interpolate(t){return t}}class hi{constructor(t){this.specification=t;}possiblyEvaluate(t,e,r,n){return !!t.expression.evaluate(e,null,{},r,n)}interpolate(){return !1}}class pi{constructor(t){this.properties=t,this.defaultPropertyValues={},this.defaultTransitionablePropertyValues={},this.defaultTransitioningPropertyValues={},this.defaultPossiblyEvaluatedValues={},this.overridableProperties=[];for(const e in t){const r=t[e];r.specification.overridable&&this.overridableProperties.push(e);const n=this.defaultPropertyValues[e]=new Qn(r,void 0),i=this.defaultTransitionablePropertyValues[e]=new ti(r);this.defaultTransitioningPropertyValues[e]=i.untransitioned(),this.defaultPossiblyEvaluatedValues[e]=n.possiblyEvaluate({});}}}In("DataDrivenProperty",li),In("DataConstantProperty",oi),In("CrossFadedDataDrivenProperty",ui),In("CrossFadedProperty",ci),In("ColorRampProperty",hi);const fi="-transition";class di extends R{constructor(t,e){if(super(),this.id=t.id,this.type=t.type,this._featureFilter={filter:()=>!0,needGeometry:!1},"custom"!==t.type&&(this.metadata=t.metadata,this.minzoom=t.minzoom,this.maxzoom=t.maxzoom,"background"!==t.type&&(this.source=t.source,this.sourceLayer=t["source-layer"],this.filter=t.filter),e.layout&&(this._unevaluatedLayout=new ii(e.layout)),e.paint)){this._transitionablePaint=new ei(e.paint);for(const e in t.paint)this.setPaintProperty(e,t.paint[e],{validate:!1});for(const e in t.layout)this.setLayoutProperty(e,t.layout[e],{validate:!1});this._transitioningPaint=this._transitionablePaint.untransitioned(),this.paint=new si(e.paint);}}getCrossfadeParameters(){return this._crossfadeParameters}getLayoutProperty(t){return "visibility"===t?this.visibility:this._unevaluatedLayout.getValue(t)}setLayoutProperty(t,e,r={}){null!=e&&this._validate(_n,`layers.${this.id}.layout.${t}`,t,e,r)||("visibility"!==t?this._unevaluatedLayout.setValue(t,e):this.visibility=e);}getPaintProperty(t){return t.endsWith(fi)?this._transitionablePaint.getTransition(t.slice(0,-11)):this._transitionablePaint.getValue(t)}setPaintProperty(t,e,r={}){if(null!=e&&this._validate(wn,`layers.${this.id}.paint.${t}`,t,e,r))return !1;if(t.endsWith(fi))return this._transitionablePaint.setTransition(t.slice(0,-11),e||void 0),!1;{const r=this._transitionablePaint._values[t],n="cross-faded-data-driven"===r.property.specification["property-type"],i=r.value.isDataDriven(),a=r.value;this._transitionablePaint.setValue(t,e),this._handleSpecialPaintPropertyUpdate(t);const s=this._transitionablePaint._values[t].value;return s.isDataDriven()||i||n||this._handleOverridablePaintPropertyUpdate(t,a,s)}}_handleSpecialPaintPropertyUpdate(t){}_handleOverridablePaintPropertyUpdate(t,e,r){return !1}isHidden(t){return !!(this.minzoom&&t<this.minzoom)||!!(this.maxzoom&&t>=this.maxzoom)||"none"===this.visibility}updateTransitions(t){this._transitioningPaint=this._transitionablePaint.transitioned(t,this._transitioningPaint);}hasTransition(){return this._transitioningPaint.hasTransition()}recalculate(t,e){t.getCrossfadeParameters&&(this._crossfadeParameters=t.getCrossfadeParameters()),this._unevaluatedLayout&&(this.layout=this._unevaluatedLayout.possiblyEvaluate(t,void 0,e)),this.paint=this._transitioningPaint.possiblyEvaluate(t,void 0,e);}serialize(){const t={id:this.id,type:this.type,source:this.source,"source-layer":this.sourceLayer,metadata:this.metadata,minzoom:this.minzoom,maxzoom:this.maxzoom,filter:this.filter,layout:this._unevaluatedLayout&&this._unevaluatedLayout.serialize(),paint:this._transitionablePaint&&this._transitionablePaint.serialize()};return this.visibility&&(t.layout=t.layout||{},t.layout.visibility=this.visibility),y(t,((t,e)=>!(void 0===t||"layout"===e&&!Object.keys(t).length||"paint"===e&&!Object.keys(t).length)))}_validate(t,e,r,n,i={}){return (!i||!1!==i.validate)&&An(this,t.call(vn,{key:e,layerType:this.type,objectKey:r,value:n,styleSpec:q,style:{glyphs:!0,sprite:!0}}))}is3D(){return !1}isTileClipped(){return !1}hasOffscreenPass(){return !1}resize(){}isStateDependent(){for(const t in this.paint._values){const e=this.paint.get(t);if(e instanceof ai&&pr(e.property.specification)&&("source"===e.value.kind||"composite"===e.value.kind)&&e.value.isStateDependent)return !0}return !1}}const yi={Int8:Int8Array,Uint8:Uint8Array,Int16:Int16Array,Uint16:Uint16Array,Int32:Int32Array,Uint32:Uint32Array,Float32:Float32Array};class mi{constructor(t,e){this._structArray=t,this._pos1=e*this.size,this._pos2=this._pos1/2,this._pos4=this._pos1/4,this._pos8=this._pos1/8;}}class gi{constructor(){this.isTransferred=!1,this.capacity=-1,this.resize(0);}static serialize(t,e){return t._trim(),e&&(t.isTransferred=!0,e.push(t.arrayBuffer)),{length:t.length,arrayBuffer:t.arrayBuffer}}static deserialize(t){const e=Object.create(this.prototype);return e.arrayBuffer=t.arrayBuffer,e.length=t.length,e.capacity=t.arrayBuffer.byteLength/e.bytesPerElement,e._refreshViews(),e}_trim(){this.length!==this.capacity&&(this.capacity=this.length,this.arrayBuffer=this.arrayBuffer.slice(0,this.length*this.bytesPerElement),this._refreshViews());}clear(){this.length=0;}resize(t){this.reserve(t),this.length=t;}reserve(t){if(t>this.capacity){this.capacity=Math.max(t,Math.floor(5*this.capacity),128),this.arrayBuffer=new ArrayBuffer(this.capacity*this.bytesPerElement);const e=this.uint8;this._refreshViews(),e&&this.uint8.set(e);}}_refreshViews(){throw new Error("_refreshViews() must be implemented by each concrete StructArray layout")}}function xi(t,e=1){let r=0,n=0;return {members:t.map((t=>{const i=yi[t.type].BYTES_PER_ELEMENT,a=r=vi(r,Math.max(e,i)),s=t.components||1;return n=Math.max(n,i),r+=i*s,{name:t.name,type:t.type,components:s,offset:a}})),size:vi(r,Math.max(n,e)),alignment:e}}function vi(t,e){return Math.ceil(t/e)*e}class bi extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer);}emplaceBack(t,e){const r=this.length;return this.resize(r+1),this.emplace(r,t,e)}emplace(t,e,r){const n=2*t;return this.int16[n+0]=e,this.int16[n+1]=r,t}}bi.prototype.bytesPerElement=4,In("StructArrayLayout2i4",bi);class wi extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer);}emplaceBack(t,e,r){const n=this.length;return this.resize(n+1),this.emplace(n,t,e,r)}emplace(t,e,r,n){const i=3*t;return this.int16[i+0]=e,this.int16[i+1]=r,this.int16[i+2]=n,t}}wi.prototype.bytesPerElement=6,In("StructArrayLayout3i6",wi);class _i extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer);}emplaceBack(t,e,r,n){const i=this.length;return this.resize(i+1),this.emplace(i,t,e,r,n)}emplace(t,e,r,n,i){const a=4*t;return this.int16[a+0]=e,this.int16[a+1]=r,this.int16[a+2]=n,this.int16[a+3]=i,t}}_i.prototype.bytesPerElement=8,In("StructArrayLayout4i8",_i);class Ai extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer);}emplaceBack(t,e,r,n,i,a){const s=this.length;return this.resize(s+1),this.emplace(s,t,e,r,n,i,a)}emplace(t,e,r,n,i,a,s){const o=6*t;return this.int16[o+0]=e,this.int16[o+1]=r,this.int16[o+2]=n,this.int16[o+3]=i,this.int16[o+4]=a,this.int16[o+5]=s,t}}Ai.prototype.bytesPerElement=12,In("StructArrayLayout2i4i12",Ai);class ki extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer);}emplaceBack(t,e,r,n,i,a){const s=this.length;return this.resize(s+1),this.emplace(s,t,e,r,n,i,a)}emplace(t,e,r,n,i,a,s){const o=4*t,l=8*t;return this.int16[o+0]=e,this.int16[o+1]=r,this.uint8[l+4]=n,this.uint8[l+5]=i,this.uint8[l+6]=a,this.uint8[l+7]=s,t}}ki.prototype.bytesPerElement=8,In("StructArrayLayout2i4ub8",ki);class Si extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.float32=new Float32Array(this.arrayBuffer);}emplaceBack(t,e){const r=this.length;return this.resize(r+1),this.emplace(r,t,e)}emplace(t,e,r){const n=2*t;return this.float32[n+0]=e,this.float32[n+1]=r,t}}Si.prototype.bytesPerElement=8,In("StructArrayLayout2f8",Si);class Ii extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.uint16=new Uint16Array(this.arrayBuffer);}emplaceBack(t,e,r,n,i,a,s,o,l,u){const c=this.length;return this.resize(c+1),this.emplace(c,t,e,r,n,i,a,s,o,l,u)}emplace(t,e,r,n,i,a,s,o,l,u,c){const h=10*t;return this.uint16[h+0]=e,this.uint16[h+1]=r,this.uint16[h+2]=n,this.uint16[h+3]=i,this.uint16[h+4]=a,this.uint16[h+5]=s,this.uint16[h+6]=o,this.uint16[h+7]=l,this.uint16[h+8]=u,this.uint16[h+9]=c,t}}Ii.prototype.bytesPerElement=20,In("StructArrayLayout10ui20",Ii);class zi extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer),this.uint16=new Uint16Array(this.arrayBuffer);}emplaceBack(t,e,r,n,i,a,s,o,l,u,c,h){const p=this.length;return this.resize(p+1),this.emplace(p,t,e,r,n,i,a,s,o,l,u,c,h)}emplace(t,e,r,n,i,a,s,o,l,u,c,h,p){const f=12*t;return this.int16[f+0]=e,this.int16[f+1]=r,this.int16[f+2]=n,this.int16[f+3]=i,this.uint16[f+4]=a,this.uint16[f+5]=s,this.uint16[f+6]=o,this.uint16[f+7]=l,this.int16[f+8]=u,this.int16[f+9]=c,this.int16[f+10]=h,this.int16[f+11]=p,t}}zi.prototype.bytesPerElement=24,In("StructArrayLayout4i4ui4i24",zi);class Mi extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.float32=new Float32Array(this.arrayBuffer);}emplaceBack(t,e,r){const n=this.length;return this.resize(n+1),this.emplace(n,t,e,r)}emplace(t,e,r,n){const i=3*t;return this.float32[i+0]=e,this.float32[i+1]=r,this.float32[i+2]=n,t}}Mi.prototype.bytesPerElement=12,In("StructArrayLayout3f12",Mi);class Pi extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.uint32=new Uint32Array(this.arrayBuffer);}emplaceBack(t){const e=this.length;return this.resize(e+1),this.emplace(e,t)}emplace(t,e){return this.uint32[1*t+0]=e,t}}Pi.prototype.bytesPerElement=4,In("StructArrayLayout1ul4",Pi);class Bi extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer),this.uint32=new Uint32Array(this.arrayBuffer),this.uint16=new Uint16Array(this.arrayBuffer);}emplaceBack(t,e,r,n,i,a,s,o,l){const u=this.length;return this.resize(u+1),this.emplace(u,t,e,r,n,i,a,s,o,l)}emplace(t,e,r,n,i,a,s,o,l,u){const c=10*t,h=5*t;return this.int16[c+0]=e,this.int16[c+1]=r,this.int16[c+2]=n,this.int16[c+3]=i,this.int16[c+4]=a,this.int16[c+5]=s,this.uint32[h+3]=o,this.uint16[c+8]=l,this.uint16[c+9]=u,t}}Bi.prototype.bytesPerElement=20,In("StructArrayLayout6i1ul2ui20",Bi);class Ci extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer);}emplaceBack(t,e,r,n,i,a){const s=this.length;return this.resize(s+1),this.emplace(s,t,e,r,n,i,a)}emplace(t,e,r,n,i,a,s){const o=6*t;return this.int16[o+0]=e,this.int16[o+1]=r,this.int16[o+2]=n,this.int16[o+3]=i,this.int16[o+4]=a,this.int16[o+5]=s,t}}Ci.prototype.bytesPerElement=12,In("StructArrayLayout2i2i2i12",Ci);class Vi extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.float32=new Float32Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer);}emplaceBack(t,e,r,n,i){const a=this.length;return this.resize(a+1),this.emplace(a,t,e,r,n,i)}emplace(t,e,r,n,i,a){const s=4*t,o=8*t;return this.float32[s+0]=e,this.float32[s+1]=r,this.float32[s+2]=n,this.int16[o+6]=i,this.int16[o+7]=a,t}}Vi.prototype.bytesPerElement=16,In("StructArrayLayout2f1f2i16",Vi);class Ei extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.float32=new Float32Array(this.arrayBuffer);}emplaceBack(t,e,r,n){const i=this.length;return this.resize(i+1),this.emplace(i,t,e,r,n)}emplace(t,e,r,n,i){const a=12*t,s=3*t;return this.uint8[a+0]=e,this.uint8[a+1]=r,this.float32[s+1]=n,this.float32[s+2]=i,t}}Ei.prototype.bytesPerElement=12,In("StructArrayLayout2ub2f12",Ei);class Fi extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.uint16=new Uint16Array(this.arrayBuffer);}emplaceBack(t,e,r){const n=this.length;return this.resize(n+1),this.emplace(n,t,e,r)}emplace(t,e,r,n){const i=3*t;return this.uint16[i+0]=e,this.uint16[i+1]=r,this.uint16[i+2]=n,t}}Fi.prototype.bytesPerElement=6,In("StructArrayLayout3ui6",Fi);class Ti extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer),this.uint16=new Uint16Array(this.arrayBuffer),this.uint32=new Uint32Array(this.arrayBuffer),this.float32=new Float32Array(this.arrayBuffer);}emplaceBack(t,e,r,n,i,a,s,o,l,u,c,h,p,f,d,y,m){const g=this.length;return this.resize(g+1),this.emplace(g,t,e,r,n,i,a,s,o,l,u,c,h,p,f,d,y,m)}emplace(t,e,r,n,i,a,s,o,l,u,c,h,p,f,d,y,m,g){const x=24*t,v=12*t,b=48*t;return this.int16[x+0]=e,this.int16[x+1]=r,this.uint16[x+2]=n,this.uint16[x+3]=i,this.uint32[v+2]=a,this.uint32[v+3]=s,this.uint32[v+4]=o,this.uint16[x+10]=l,this.uint16[x+11]=u,this.uint16[x+12]=c,this.float32[v+7]=h,this.float32[v+8]=p,this.uint8[b+36]=f,this.uint8[b+37]=d,this.uint8[b+38]=y,this.uint32[v+10]=m,this.int16[x+22]=g,t}}Ti.prototype.bytesPerElement=48,In("StructArrayLayout2i2ui3ul3ui2f3ub1ul1i48",Ti);class Li extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.int16=new Int16Array(this.arrayBuffer),this.uint16=new Uint16Array(this.arrayBuffer),this.uint32=new Uint32Array(this.arrayBuffer),this.float32=new Float32Array(this.arrayBuffer);}emplaceBack(t,e,r,n,i,a,s,o,l,u,c,h,p,f,d,y,m,g,x,v,b,w,_,A,k,S,I,z){const M=this.length;return this.resize(M+1),this.emplace(M,t,e,r,n,i,a,s,o,l,u,c,h,p,f,d,y,m,g,x,v,b,w,_,A,k,S,I,z)}emplace(t,e,r,n,i,a,s,o,l,u,c,h,p,f,d,y,m,g,x,v,b,w,_,A,k,S,I,z,M){const P=34*t,B=17*t;return this.int16[P+0]=e,this.int16[P+1]=r,this.int16[P+2]=n,this.int16[P+3]=i,this.int16[P+4]=a,this.int16[P+5]=s,this.int16[P+6]=o,this.int16[P+7]=l,this.uint16[P+8]=u,this.uint16[P+9]=c,this.uint16[P+10]=h,this.uint16[P+11]=p,this.uint16[P+12]=f,this.uint16[P+13]=d,this.uint16[P+14]=y,this.uint16[P+15]=m,this.uint16[P+16]=g,this.uint16[P+17]=x,this.uint16[P+18]=v,this.uint16[P+19]=b,this.uint16[P+20]=w,this.uint16[P+21]=_,this.uint16[P+22]=A,this.uint32[B+12]=k,this.float32[B+13]=S,this.float32[B+14]=I,this.float32[B+15]=z,this.float32[B+16]=M,t}}Li.prototype.bytesPerElement=68,In("StructArrayLayout8i15ui1ul4f68",Li);class $i extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.float32=new Float32Array(this.arrayBuffer);}emplaceBack(t){const e=this.length;return this.resize(e+1),this.emplace(e,t)}emplace(t,e){return this.float32[1*t+0]=e,t}}$i.prototype.bytesPerElement=4,In("StructArrayLayout1f4",$i);class Di extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.uint32=new Uint32Array(this.arrayBuffer),this.uint16=new Uint16Array(this.arrayBuffer);}emplaceBack(t,e,r){const n=this.length;return this.resize(n+1),this.emplace(n,t,e,r)}emplace(t,e,r,n){const i=4*t;return this.uint32[2*t+0]=e,this.uint16[i+2]=r,this.uint16[i+3]=n,t}}Di.prototype.bytesPerElement=8,In("StructArrayLayout1ul2ui8",Di);class Oi extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.uint16=new Uint16Array(this.arrayBuffer);}emplaceBack(t,e){const r=this.length;return this.resize(r+1),this.emplace(r,t,e)}emplace(t,e,r){const n=2*t;return this.uint16[n+0]=e,this.uint16[n+1]=r,t}}Oi.prototype.bytesPerElement=4,In("StructArrayLayout2ui4",Oi);class Ui extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.uint16=new Uint16Array(this.arrayBuffer);}emplaceBack(t){const e=this.length;return this.resize(e+1),this.emplace(e,t)}emplace(t,e){return this.uint16[1*t+0]=e,t}}Ui.prototype.bytesPerElement=2,In("StructArrayLayout1ui2",Ui);class Ri extends gi{_refreshViews(){this.uint8=new Uint8Array(this.arrayBuffer),this.float32=new Float32Array(this.arrayBuffer);}emplaceBack(t,e,r,n){const i=this.length;return this.resize(i+1),this.emplace(i,t,e,r,n)}emplace(t,e,r,n,i){const a=4*t;return this.float32[a+0]=e,this.float32[a+1]=r,this.float32[a+2]=n,this.float32[a+3]=i,t}}Ri.prototype.bytesPerElement=16,In("StructArrayLayout4f16",Ri);class qi extends mi{get anchorPointX(){return this._structArray.int16[this._pos2+0]}get anchorPointY(){return this._structArray.int16[this._pos2+1]}get x1(){return this._structArray.int16[this._pos2+2]}get y1(){return this._structArray.int16[this._pos2+3]}get x2(){return this._structArray.int16[this._pos2+4]}get y2(){return this._structArray.int16[this._pos2+5]}get featureIndex(){return this._structArray.uint32[this._pos4+3]}get sourceLayerIndex(){return this._structArray.uint16[this._pos2+8]}get bucketIndex(){return this._structArray.uint16[this._pos2+9]}get anchorPoint(){return new i(this.anchorPointX,this.anchorPointY)}}qi.prototype.size=20;class ji extends Bi{get(t){return new qi(this,t)}}In("CollisionBoxArray",ji);class Ni extends mi{get anchorX(){return this._structArray.int16[this._pos2+0]}get anchorY(){return this._structArray.int16[this._pos2+1]}get glyphStartIndex(){return this._structArray.uint16[this._pos2+2]}get numGlyphs(){return this._structArray.uint16[this._pos2+3]}get vertexStartIndex(){return this._structArray.uint32[this._pos4+2]}get lineStartIndex(){return this._structArray.uint32[this._pos4+3]}get lineLength(){return this._structArray.uint32[this._pos4+4]}get segment(){return this._structArray.uint16[this._pos2+10]}get lowerSize(){return this._structArray.uint16[this._pos2+11]}get upperSize(){return this._structArray.uint16[this._pos2+12]}get lineOffsetX(){return this._structArray.float32[this._pos4+7]}get lineOffsetY(){return this._structArray.float32[this._pos4+8]}get writingMode(){return this._structArray.uint8[this._pos1+36]}get placedOrientation(){return this._structArray.uint8[this._pos1+37]}set placedOrientation(t){this._structArray.uint8[this._pos1+37]=t;}get hidden(){return this._structArray.uint8[this._pos1+38]}set hidden(t){this._structArray.uint8[this._pos1+38]=t;}get crossTileID(){return this._structArray.uint32[this._pos4+10]}set crossTileID(t){this._structArray.uint32[this._pos4+10]=t;}get associatedIconIndex(){return this._structArray.int16[this._pos2+22]}}Ni.prototype.size=48;class Zi extends Ti{get(t){return new Ni(this,t)}}In("PlacedSymbolArray",Zi);class Ki extends mi{get anchorX(){return this._structArray.int16[this._pos2+0]}get anchorY(){return this._structArray.int16[this._pos2+1]}get rightJustifiedTextSymbolIndex(){return this._structArray.int16[this._pos2+2]}get centerJustifiedTextSymbolIndex(){return this._structArray.int16[this._pos2+3]}get leftJustifiedTextSymbolIndex(){return this._structArray.int16[this._pos2+4]}get verticalPlacedTextSymbolIndex(){return this._structArray.int16[this._pos2+5]}get placedIconSymbolIndex(){return this._structArray.int16[this._pos2+6]}get verticalPlacedIconSymbolIndex(){return this._structArray.int16[this._pos2+7]}get key(){return this._structArray.uint16[this._pos2+8]}get textBoxStartIndex(){return this._structArray.uint16[this._pos2+9]}get textBoxEndIndex(){return this._structArray.uint16[this._pos2+10]}get verticalTextBoxStartIndex(){return this._structArray.uint16[this._pos2+11]}get verticalTextBoxEndIndex(){return this._structArray.uint16[this._pos2+12]}get iconBoxStartIndex(){return this._structArray.uint16[this._pos2+13]}get iconBoxEndIndex(){return this._structArray.uint16[this._pos2+14]}get verticalIconBoxStartIndex(){return this._structArray.uint16[this._pos2+15]}get verticalIconBoxEndIndex(){return this._structArray.uint16[this._pos2+16]}get featureIndex(){return this._structArray.uint16[this._pos2+17]}get numHorizontalGlyphVertices(){return this._structArray.uint16[this._pos2+18]}get numVerticalGlyphVertices(){return this._structArray.uint16[this._pos2+19]}get numIconVertices(){return this._structArray.uint16[this._pos2+20]}get numVerticalIconVertices(){return this._structArray.uint16[this._pos2+21]}get useRuntimeCollisionCircles(){return this._structArray.uint16[this._pos2+22]}get crossTileID(){return this._structArray.uint32[this._pos4+12]}set crossTileID(t){this._structArray.uint32[this._pos4+12]=t;}get textBoxScale(){return this._structArray.float32[this._pos4+13]}get textOffset0(){return this._structArray.float32[this._pos4+14]}get textOffset1(){return this._structArray.float32[this._pos4+15]}get collisionCircleDiameter(){return this._structArray.float32[this._pos4+16]}}Ki.prototype.size=68;class Gi extends Li{get(t){return new Ki(this,t)}}In("SymbolInstanceArray",Gi);class Ji extends $i{getoffsetX(t){return this.float32[1*t+0]}}In("GlyphOffsetArray",Ji);class Xi extends wi{getx(t){return this.int16[3*t+0]}gety(t){return this.int16[3*t+1]}gettileUnitDistanceFromAnchor(t){return this.int16[3*t+2]}}In("SymbolLineVertexArray",Xi);class Yi extends mi{get featureIndex(){return this._structArray.uint32[this._pos4+0]}get sourceLayerIndex(){return this._structArray.uint16[this._pos2+2]}get bucketIndex(){return this._structArray.uint16[this._pos2+3]}}Yi.prototype.size=8;class Hi extends Di{get(t){return new Yi(this,t)}}In("FeatureIndexArray",Hi);class Wi extends bi{}class Qi extends bi{}class ta extends bi{}class ea extends Ai{}class ra extends ki{}class na extends Si{}class ia extends Ii{}class aa extends zi{}class sa extends Mi{}class oa extends Pi{}class la extends Ci{}class ua extends Ei{}class ca extends Fi{}class ha extends Oi{}const pa=xi([{name:"a_pos",components:2,type:"Int16"}],4),{members:fa}=pa;class da{constructor(t=[]){this.segments=t;}prepareSegment(t,e,r,n){let i=this.segments[this.segments.length-1];return t>da.MAX_VERTEX_ARRAY_LENGTH&&x(`Max vertices per segment is ${da.MAX_VERTEX_ARRAY_LENGTH}: bucket requested ${t}`),(!i||i.vertexLength+t>da.MAX_VERTEX_ARRAY_LENGTH||i.sortKey!==n)&&(i={vertexOffset:e.length,primitiveOffset:r.length,vertexLength:0,primitiveLength:0},void 0!==n&&(i.sortKey=n),this.segments.push(i)),i}get(){return this.segments}destroy(){for(const t of this.segments)for(const e in t.vaos)t.vaos[e].destroy();}static simpleSegment(t,e,r,n){return new da([{vertexOffset:t,primitiveOffset:e,vertexLength:r,primitiveLength:n,vaos:{},sortKey:0}])}}function ya(t,e){return 256*(t=c(Math.floor(t),0,255))+c(Math.floor(e),0,255)}da.MAX_VERTEX_ARRAY_LENGTH=Math.pow(2,16)-1,In("SegmentVector",da);const ma=xi([{name:"a_pattern_from",components:4,type:"Uint16"},{name:"a_pattern_to",components:4,type:"Uint16"},{name:"a_pixel_ratio_from",components:1,type:"Uint16"},{name:"a_pixel_ratio_to",components:1,type:"Uint16"}]);var ga={exports:{}},xa={exports:{}};xa.exports=function(t,e){var r,n,i,a,s,o,l,u;for(n=t.length-(r=3&t.length),i=e,s=3432918353,o=461845907,u=0;u<n;)l=255&t.charCodeAt(u)|(255&t.charCodeAt(++u))<<8|(255&t.charCodeAt(++u))<<16|(255&t.charCodeAt(++u))<<24,++u,i=27492+(65535&(a=5*(65535&(i=(i^=l=(65535&(l=(l=(65535&l)*s+(((l>>>16)*s&65535)<<16)&4294967295)<<15|l>>>17))*o+(((l>>>16)*o&65535)<<16)&4294967295)<<13|i>>>19))+((5*(i>>>16)&65535)<<16)&4294967295))+((58964+(a>>>16)&65535)<<16);switch(l=0,r){case 3:l^=(255&t.charCodeAt(u+2))<<16;case 2:l^=(255&t.charCodeAt(u+1))<<8;case 1:i^=l=(65535&(l=(l=(65535&(l^=255&t.charCodeAt(u)))*s+(((l>>>16)*s&65535)<<16)&4294967295)<<15|l>>>17))*o+(((l>>>16)*o&65535)<<16)&4294967295;}return i^=t.length,i=2246822507*(65535&(i^=i>>>16))+((2246822507*(i>>>16)&65535)<<16)&4294967295,i=3266489909*(65535&(i^=i>>>13))+((3266489909*(i>>>16)&65535)<<16)&4294967295,(i^=i>>>16)>>>0};var va=xa.exports,ba={exports:{}};ba.exports=function(t,e){for(var r,n=t.length,i=e^n,a=0;n>=4;)r=1540483477*(65535&(r=255&t.charCodeAt(a)|(255&t.charCodeAt(++a))<<8|(255&t.charCodeAt(++a))<<16|(255&t.charCodeAt(++a))<<24))+((1540483477*(r>>>16)&65535)<<16),i=1540483477*(65535&i)+((1540483477*(i>>>16)&65535)<<16)^(r=1540483477*(65535&(r^=r>>>24))+((1540483477*(r>>>16)&65535)<<16)),n-=4,++a;switch(n){case 3:i^=(255&t.charCodeAt(a+2))<<16;case 2:i^=(255&t.charCodeAt(a+1))<<8;case 1:i=1540483477*(65535&(i^=255&t.charCodeAt(a)))+((1540483477*(i>>>16)&65535)<<16);}return i=1540483477*(65535&(i^=i>>>13))+((1540483477*(i>>>16)&65535)<<16),(i^=i>>>15)>>>0};var wa=va,_a=ba.exports;ga.exports=wa,ga.exports.murmur3=wa,ga.exports.murmur2=_a;var Aa=e(ga.exports);class ka{constructor(){this.ids=[],this.positions=[],this.indexed=!1;}add(t,e,r,n){this.ids.push(Sa(t)),this.positions.push(e,r,n);}getPositions(t){if(!this.indexed)throw new Error("Trying to get index, but feature positions are not indexed");const e=Sa(t);let r=0,n=this.ids.length-1;for(;r<n;){const t=r+n>>1;this.ids[t]>=e?n=t:r=t+1;}const i=[];for(;this.ids[r]===e;)i.push({index:this.positions[3*r],start:this.positions[3*r+1],end:this.positions[3*r+2]}),r++;return i}static serialize(t,e){const r=new Float64Array(t.ids),n=new Uint32Array(t.positions);return Ia(r,n,0,r.length-1),e&&e.push(r.buffer,n.buffer),{ids:r,positions:n}}static deserialize(t){const e=new ka;return e.ids=t.ids,e.positions=t.positions,e.indexed=!0,e}}function Sa(t){const e=+t;return !isNaN(e)&&e<=Number.MAX_SAFE_INTEGER?e:Aa(String(t))}function Ia(t,e,r,n){for(;r<n;){const i=t[r+n>>1];let a=r-1,s=n+1;for(;;){do{a++;}while(t[a]<i);do{s--;}while(t[s]>i);if(a>=s)break;za(t,a,s),za(e,3*a,3*s),za(e,3*a+1,3*s+1),za(e,3*a+2,3*s+2);}s-r<n-s?(Ia(t,e,r,s),r=s+1):(Ia(t,e,s+1,n),n=s);}}function za(t,e,r){const n=t[e];t[e]=t[r],t[r]=n;}In("FeaturePositionMap",ka);class Ma{constructor(t,e){this.gl=t.gl,this.location=e;}}class Pa extends Ma{constructor(t,e){super(t,e),this.current=0;}set(t){this.current!==t&&(this.current=t,this.gl.uniform1f(this.location,t));}}class Ba extends Ma{constructor(t,e){super(t,e),this.current=[0,0,0,0];}set(t){t[0]===this.current[0]&&t[1]===this.current[1]&&t[2]===this.current[2]&&t[3]===this.current[3]||(this.current=t,this.gl.uniform4f(this.location,t[0],t[1],t[2],t[3]));}}class Ca extends Ma{constructor(t,e){super(t,e),this.current=qt.transparent;}set(t){t.r===this.current.r&&t.g===this.current.g&&t.b===this.current.b&&t.a===this.current.a||(this.current=t,this.gl.uniform4f(this.location,t.r,t.g,t.b,t.a));}}const Va=new Float32Array(16);function Ea(t){return [ya(255*t.r,255*t.g),ya(255*t.b,255*t.a)]}class Fa{constructor(t,e,r){this.value=t,this.uniformNames=e.map((t=>`u_${t}`)),this.type=r;}setUniform(t,e,r){t.set(r.constantOr(this.value));}getBinding(t,e,r){return "color"===this.type?new Ca(t,e):new Pa(t,e)}}class Ta{constructor(t,e){this.uniformNames=e.map((t=>`u_${t}`)),this.patternFrom=null,this.patternTo=null,this.pixelRatioFrom=1,this.pixelRatioTo=1;}setConstantPatternPositions(t,e){this.pixelRatioFrom=e.pixelRatio,this.pixelRatioTo=t.pixelRatio,this.patternFrom=e.tlbr,this.patternTo=t.tlbr;}setUniform(t,e,r,n){const i="u_pattern_to"===n?this.patternTo:"u_pattern_from"===n?this.patternFrom:"u_pixel_ratio_to"===n?this.pixelRatioTo:"u_pixel_ratio_from"===n?this.pixelRatioFrom:null;i&&t.set(i);}getBinding(t,e,r){return "u_pattern"===r.substr(0,9)?new Ba(t,e):new Pa(t,e)}}class La{constructor(t,e,r,n){this.expression=t,this.type=r,this.maxValue=0,this.paintVertexAttributes=e.map((t=>({name:`a_${t}`,type:"Float32",components:"color"===r?2:1,offset:0}))),this.paintVertexArray=new n;}populatePaintArray(t,e,r,n,i){const a=this.paintVertexArray.length,s=this.expression.evaluate(new Wn(0),e,{},n,[],i);this.paintVertexArray.resize(t),this._setPaintValue(a,t,s);}updatePaintArray(t,e,r,n){const i=this.expression.evaluate({zoom:0},r,n);this._setPaintValue(t,e,i);}_setPaintValue(t,e,r){if("color"===this.type){const n=Ea(r);for(let r=t;r<e;r++)this.paintVertexArray.emplace(r,n[0],n[1]);}else {for(let n=t;n<e;n++)this.paintVertexArray.emplace(n,r);this.maxValue=Math.max(this.maxValue,Math.abs(r));}}upload(t){this.paintVertexArray&&this.paintVertexArray.arrayBuffer&&(this.paintVertexBuffer&&this.paintVertexBuffer.buffer?this.paintVertexBuffer.updateData(this.paintVertexArray):this.paintVertexBuffer=t.createVertexBuffer(this.paintVertexArray,this.paintVertexAttributes,this.expression.isStateDependent));}destroy(){this.paintVertexBuffer&&this.paintVertexBuffer.destroy();}}class $a{constructor(t,e,r,n,i,a){this.expression=t,this.uniformNames=e.map((t=>`u_${t}_t`)),this.type=r,this.useIntegerZoom=n,this.zoom=i,this.maxValue=0,this.paintVertexAttributes=e.map((t=>({name:`a_${t}`,type:"Float32",components:"color"===r?4:2,offset:0}))),this.paintVertexArray=new a;}populatePaintArray(t,e,r,n,i){const a=this.expression.evaluate(new Wn(this.zoom),e,{},n,[],i),s=this.expression.evaluate(new Wn(this.zoom+1),e,{},n,[],i),o=this.paintVertexArray.length;this.paintVertexArray.resize(t),this._setPaintValue(o,t,a,s);}updatePaintArray(t,e,r,n){const i=this.expression.evaluate({zoom:this.zoom},r,n),a=this.expression.evaluate({zoom:this.zoom+1},r,n);this._setPaintValue(t,e,i,a);}_setPaintValue(t,e,r,n){if("color"===this.type){const i=Ea(r),a=Ea(n);for(let r=t;r<e;r++)this.paintVertexArray.emplace(r,i[0],i[1],a[0],a[1]);}else {for(let i=t;i<e;i++)this.paintVertexArray.emplace(i,r,n);this.maxValue=Math.max(this.maxValue,Math.abs(r),Math.abs(n));}}upload(t){this.paintVertexArray&&this.paintVertexArray.arrayBuffer&&(this.paintVertexBuffer&&this.paintVertexBuffer.buffer?this.paintVertexBuffer.updateData(this.paintVertexArray):this.paintVertexBuffer=t.createVertexBuffer(this.paintVertexArray,this.paintVertexAttributes,this.expression.isStateDependent));}destroy(){this.paintVertexBuffer&&this.paintVertexBuffer.destroy();}setUniform(t,e){const r=this.useIntegerZoom?Math.floor(e.zoom):e.zoom,n=c(this.expression.interpolationFactor(r,this.zoom,this.zoom+1),0,1);t.set(n);}getBinding(t,e,r){return new Pa(t,e)}}class Da{constructor(t,e,r,n,i,a){this.expression=t,this.type=e,this.useIntegerZoom=r,this.zoom=n,this.layerId=a,this.zoomInPaintVertexArray=new i,this.zoomOutPaintVertexArray=new i;}populatePaintArray(t,e,r){const n=this.zoomInPaintVertexArray.length;this.zoomInPaintVertexArray.resize(t),this.zoomOutPaintVertexArray.resize(t),this._setPaintValues(n,t,e.patterns&&e.patterns[this.layerId],r);}updatePaintArray(t,e,r,n,i){this._setPaintValues(t,e,r.patterns&&r.patterns[this.layerId],i);}_setPaintValues(t,e,r,n){if(!n||!r)return;const{min:i,mid:a,max:s}=r,o=n[i],l=n[a],u=n[s];if(o&&l&&u)for(let r=t;r<e;r++)this.zoomInPaintVertexArray.emplace(r,l.tl[0],l.tl[1],l.br[0],l.br[1],o.tl[0],o.tl[1],o.br[0],o.br[1],l.pixelRatio,o.pixelRatio),this.zoomOutPaintVertexArray.emplace(r,l.tl[0],l.tl[1],l.br[0],l.br[1],u.tl[0],u.tl[1],u.br[0],u.br[1],l.pixelRatio,u.pixelRatio);}upload(t){this.zoomInPaintVertexArray&&this.zoomInPaintVertexArray.arrayBuffer&&this.zoomOutPaintVertexArray&&this.zoomOutPaintVertexArray.arrayBuffer&&(this.zoomInPaintVertexBuffer=t.createVertexBuffer(this.zoomInPaintVertexArray,ma.members,this.expression.isStateDependent),this.zoomOutPaintVertexBuffer=t.createVertexBuffer(this.zoomOutPaintVertexArray,ma.members,this.expression.isStateDependent));}destroy(){this.zoomOutPaintVertexBuffer&&this.zoomOutPaintVertexBuffer.destroy(),this.zoomInPaintVertexBuffer&&this.zoomInPaintVertexBuffer.destroy();}}class Oa{constructor(t,e,r){this.binders={},this._buffers=[];const n=[];for(const i in t.paint._values){if(!r(i))continue;const a=t.paint.get(i);if(!(a instanceof ai&&pr(a.property.specification)))continue;const s=Ra(i,t.type),o=a.value,l=a.property.specification.type,u=a.property.useIntegerZoom,c=a.property.specification["property-type"],h="cross-faded"===c||"cross-faded-data-driven"===c;if("constant"===o.kind)this.binders[i]=h?new Ta(o.value,s):new Fa(o.value,s,l),n.push(`/u_${i}`);else if("source"===o.kind||h){const r=qa(i,l,"source");this.binders[i]=h?new Da(o,l,u,e,r,t.id):new La(o,s,l,r),n.push(`/a_${i}`);}else {const t=qa(i,l,"composite");this.binders[i]=new $a(o,s,l,u,e,t),n.push(`/z_${i}`);}}this.cacheKey=n.sort().join("");}getMaxValue(t){const e=this.binders[t];return e instanceof La||e instanceof $a?e.maxValue:0}populatePaintArrays(t,e,r,n,i){for(const a in this.binders){const s=this.binders[a];(s instanceof La||s instanceof $a||s instanceof Da)&&s.populatePaintArray(t,e,r,n,i);}}setConstantPatternPositions(t,e){for(const r in this.binders){const n=this.binders[r];n instanceof Ta&&n.setConstantPatternPositions(t,e);}}updatePaintArrays(t,e,r,n,i){let a=!1;for(const s in t){const o=e.getPositions(s);for(const e of o){const o=r.feature(e.index);for(const r in this.binders){const l=this.binders[r];if((l instanceof La||l instanceof $a||l instanceof Da)&&!0===l.expression.isStateDependent){const u=n.paint.get(r);l.expression=u.value,l.updatePaintArray(e.start,e.end,o,t[s],i),a=!0;}}}}return a}defines(){const t=[];for(const e in this.binders){const r=this.binders[e];(r instanceof Fa||r instanceof Ta)&&t.push(...r.uniformNames.map((t=>`#define HAS_UNIFORM_${t}`)));}return t}getBinderAttributes(){const t=[];for(const e in this.binders){const r=this.binders[e];if(r instanceof La||r instanceof $a)for(let e=0;e<r.paintVertexAttributes.length;e++)t.push(r.paintVertexAttributes[e].name);else if(r instanceof Da)for(let e=0;e<ma.members.length;e++)t.push(ma.members[e].name);}return t}getBinderUniforms(){const t=[];for(const e in this.binders){const r=this.binders[e];if(r instanceof Fa||r instanceof Ta||r instanceof $a)for(const e of r.uniformNames)t.push(e);}return t}getPaintVertexBuffers(){return this._buffers}getUniforms(t,e){const r=[];for(const n in this.binders){const i=this.binders[n];if(i instanceof Fa||i instanceof Ta||i instanceof $a)for(const a of i.uniformNames)if(e[a]){const s=i.getBinding(t,e[a],a);r.push({name:a,property:n,binding:s});}}return r}setUniforms(t,e,r,n){for(const{name:t,property:i,binding:a}of e)this.binders[i].setUniform(a,n,r.get(i),t);}updatePaintBuffers(t){this._buffers=[];for(const e in this.binders){const r=this.binders[e];if(t&&r instanceof Da){const e=2===t.fromScale?r.zoomInPaintVertexBuffer:r.zoomOutPaintVertexBuffer;e&&this._buffers.push(e);}else (r instanceof La||r instanceof $a)&&r.paintVertexBuffer&&this._buffers.push(r.paintVertexBuffer);}}upload(t){for(const e in this.binders){const r=this.binders[e];(r instanceof La||r instanceof $a||r instanceof Da)&&r.upload(t);}this.updatePaintBuffers();}destroy(){for(const t in this.binders){const e=this.binders[t];(e instanceof La||e instanceof $a||e instanceof Da)&&e.destroy();}}}class Ua{constructor(t,e,r=(()=>!0)){this.programConfigurations={};for(const n of t)this.programConfigurations[n.id]=new Oa(n,e,r);this.needsUpload=!1,this._featureMap=new ka,this._bufferOffset=0;}populatePaintArrays(t,e,r,n,i,a){for(const r in this.programConfigurations)this.programConfigurations[r].populatePaintArrays(t,e,n,i,a);void 0!==e.id&&this._featureMap.add(e.id,r,this._bufferOffset,t),this._bufferOffset=t,this.needsUpload=!0;}updatePaintArrays(t,e,r,n){for(const i of r)this.needsUpload=this.programConfigurations[i.id].updatePaintArrays(t,this._featureMap,e,i,n)||this.needsUpload;}get(t){return this.programConfigurations[t]}upload(t){if(this.needsUpload){for(const e in this.programConfigurations)this.programConfigurations[e].upload(t);this.needsUpload=!1;}}destroy(){for(const t in this.programConfigurations)this.programConfigurations[t].destroy();}}function Ra(t,e){return {"text-opacity":["opacity"],"icon-opacity":["opacity"],"text-color":["fill_color"],"icon-color":["fill_color"],"text-halo-color":["halo_color"],"icon-halo-color":["halo_color"],"text-halo-blur":["halo_blur"],"icon-halo-blur":["halo_blur"],"text-halo-width":["halo_width"],"icon-halo-width":["halo_width"],"line-gap-width":["gapwidth"],"line-pattern":["pattern_to","pattern_from","pixel_ratio_to","pixel_ratio_from"],"fill-pattern":["pattern_to","pattern_from","pixel_ratio_to","pixel_ratio_from"],"fill-extrusion-pattern":["pattern_to","pattern_from","pixel_ratio_to","pixel_ratio_from"]}[t]||[t.replace(`${e}-`,"").replace(/-/g,"_")]}function qa(t,e,r){const n={color:{source:Si,composite:Ri},number:{source:$i,composite:Si}},i=function(t){return {"line-pattern":{source:ia,composite:ia},"fill-pattern":{source:ia,composite:ia},"fill-extrusion-pattern":{source:ia,composite:ia}}[t]}(t);return i&&i[r]||n[e][r]}In("ConstantBinder",Fa),In("CrossFadedConstantBinder",Ta),In("SourceExpressionBinder",La),In("CrossFadedCompositeBinder",Da),In("CompositeExpressionBinder",$a),In("ProgramConfiguration",Oa,{omit:["_buffers"]}),In("ProgramConfigurationSet",Ua);const ja=8192,Na=Math.pow(2,14)-1,Za=-Na-1;function Ka(t){const e=ja/t.extent,r=t.loadGeometry();for(let t=0;t<r.length;t++){const n=r[t];for(let t=0;t<n.length;t++){const r=n[t],i=Math.round(r.x*e),a=Math.round(r.y*e);r.x=c(i,Za,Na),r.y=c(a,Za,Na),(i<r.x||i>r.x+1||a<r.y||a>r.y+1)&&x("Geometry exceeds allowed extent, reduce your vector tile buffer size");}}return r}function Ga(t,e){return {type:t.type,id:t.id,properties:t.properties,geometry:e?Ka(t):[]}}function Ja(t,e,r,n,i){t.emplaceBack(2*e+(n+1)/2,2*r+(i+1)/2);}class Xa{constructor(t){this.zoom=t.zoom,this.overscaling=t.overscaling,this.layers=t.layers,this.layerIds=this.layers.map((t=>t.id)),this.index=t.index,this.hasPattern=!1,this.layoutVertexArray=new Qi,this.indexArray=new ca,this.segments=new da,this.programConfigurations=new Ua(t.layers,t.zoom),this.stateDependentLayerIds=this.layers.filter((t=>t.isStateDependent())).map((t=>t.id));}populate(t,e,r){const n=this.layers[0],i=[];let a=null,s=!1;"circle"===n.type&&(a=n.layout.get("circle-sort-key"),s=!a.isConstant());for(const{feature:e,id:n,index:o,sourceLayerIndex:l}of t){const t=this.layers[0]._featureFilter.needGeometry,u=Ga(e,t);if(!this.layers[0]._featureFilter.filter(new Wn(this.zoom),u,r))continue;const c=s?a.evaluate(u,{},r):void 0,h={id:n,properties:e.properties,type:e.type,sourceLayerIndex:l,index:o,geometry:t?u.geometry:Ka(e),patterns:{},sortKey:c};i.push(h);}s&&i.sort(((t,e)=>t.sortKey-e.sortKey));for(const n of i){const{geometry:i,index:a,sourceLayerIndex:s}=n,o=t[a].feature;this.addFeature(n,i,a,r),e.featureIndex.insert(o,i,a,s,this.index);}}update(t,e,r){this.stateDependentLayers.length&&this.programConfigurations.updatePaintArrays(t,e,this.stateDependentLayers,r);}isEmpty(){return 0===this.layoutVertexArray.length}uploadPending(){return !this.uploaded||this.programConfigurations.needsUpload}upload(t){this.uploaded||(this.layoutVertexBuffer=t.createVertexBuffer(this.layoutVertexArray,fa),this.indexBuffer=t.createIndexBuffer(this.indexArray)),this.programConfigurations.upload(t),this.uploaded=!0;}destroy(){this.layoutVertexBuffer&&(this.layoutVertexBuffer.destroy(),this.indexBuffer.destroy(),this.programConfigurations.destroy(),this.segments.destroy());}addFeature(t,e,r,n){for(const r of e)for(const e of r){const r=e.x,n=e.y;if(r<0||r>=ja||n<0||n>=ja)continue;const i=this.segments.prepareSegment(4,this.layoutVertexArray,this.indexArray,t.sortKey),a=i.vertexLength;Ja(this.layoutVertexArray,r,n,-1,-1),Ja(this.layoutVertexArray,r,n,1,-1),Ja(this.layoutVertexArray,r,n,1,1),Ja(this.layoutVertexArray,r,n,-1,1),this.indexArray.emplaceBack(a,a+1,a+2),this.indexArray.emplaceBack(a,a+3,a+2),i.vertexLength+=4,i.primitiveLength+=2;}this.programConfigurations.populatePaintArrays(this.layoutVertexArray.length,t,r,{},n);}}function Ya(t,e){for(let r=0;r<t.length;r++)if(as(e,t[r]))return !0;for(let r=0;r<e.length;r++)if(as(t,e[r]))return !0;return !!ts(t,e)}function Ha(t,e,r){return !!as(t,e)||!!rs(e,t,r)}function Wa(t,e){if(1===t.length)return is(e,t[0]);for(let r=0;r<e.length;r++){const n=e[r];for(let e=0;e<n.length;e++)if(as(t,n[e]))return !0}for(let r=0;r<t.length;r++)if(is(e,t[r]))return !0;for(let r=0;r<e.length;r++)if(ts(t,e[r]))return !0;return !1}function Qa(t,e,r){if(t.length>1){if(ts(t,e))return !0;for(let n=0;n<e.length;n++)if(rs(e[n],t,r))return !0}for(let n=0;n<t.length;n++)if(rs(t[n],e,r))return !0;return !1}function ts(t,e){if(0===t.length||0===e.length)return !1;for(let r=0;r<t.length-1;r++){const n=t[r],i=t[r+1];for(let t=0;t<e.length-1;t++)if(es(n,i,e[t],e[t+1]))return !0}return !1}function es(t,e,r,n){return v(t,r,n)!==v(e,r,n)&&v(t,e,r)!==v(t,e,n)}function rs(t,e,r){const n=r*r;if(1===e.length)return t.distSqr(e[0])<n;for(let r=1;r<e.length;r++)if(ns(t,e[r-1],e[r])<n)return !0;return !1}function ns(t,e,r){const n=e.distSqr(r);if(0===n)return t.distSqr(e);const i=((t.x-e.x)*(r.x-e.x)+(t.y-e.y)*(r.y-e.y))/n;return t.distSqr(i<0?e:i>1?r:r.sub(e)._mult(i)._add(e))}function is(t,e){let r,n,i,a=!1;for(let s=0;s<t.length;s++){r=t[s];for(let t=0,s=r.length-1;t<r.length;s=t++)n=r[t],i=r[s],n.y>e.y!=i.y>e.y&&e.x<(i.x-n.x)*(e.y-n.y)/(i.y-n.y)+n.x&&(a=!a);}return a}function as(t,e){let r=!1;for(let n=0,i=t.length-1;n<t.length;i=n++){const a=t[n],s=t[i];a.y>e.y!=s.y>e.y&&e.x<(s.x-a.x)*(e.y-a.y)/(s.y-a.y)+a.x&&(r=!r);}return r}function ss(t,e,r){const n=r[0],i=r[2];if(t.x<n.x&&e.x<n.x||t.x>i.x&&e.x>i.x||t.y<n.y&&e.y<n.y||t.y>i.y&&e.y>i.y)return !1;const a=v(t,e,r[0]);return a!==v(t,e,r[1])||a!==v(t,e,r[2])||a!==v(t,e,r[3])}function os(t,e,r){const n=e.paint.get(t).value;return "constant"===n.kind?n.value:r.programConfigurations.get(e.id).getMaxValue(t)}function ls(t){return Math.sqrt(t[0]*t[0]+t[1]*t[1])}function us(t,e,r,n,a){if(!e[0]&&!e[1])return t;const s=i.convert(e)._mult(a);"viewport"===r&&s._rotate(-n);const o=[];for(let e=0;e<t.length;e++)o.push(t[e].sub(s));return o}let cs,hs;In("CircleBucket",Xa,{omit:["layers"]});var ps={get paint(){return hs=hs||new pi({"circle-radius":new li(q.paint_circle["circle-radius"]),"circle-color":new li(q.paint_circle["circle-color"]),"circle-blur":new li(q.paint_circle["circle-blur"]),"circle-opacity":new li(q.paint_circle["circle-opacity"]),"circle-translate":new oi(q.paint_circle["circle-translate"]),"circle-translate-anchor":new oi(q.paint_circle["circle-translate-anchor"]),"circle-pitch-scale":new oi(q.paint_circle["circle-pitch-scale"]),"circle-pitch-alignment":new oi(q.paint_circle["circle-pitch-alignment"]),"circle-stroke-width":new li(q.paint_circle["circle-stroke-width"]),"circle-stroke-color":new li(q.paint_circle["circle-stroke-color"]),"circle-stroke-opacity":new li(q.paint_circle["circle-stroke-opacity"])})},get layout(){return cs=cs||new pi({"circle-sort-key":new li(q.layout_circle["circle-sort-key"])})}},fs=1e-6,ds="undefined"!=typeof Float32Array?Float32Array:Array;function ys(t){return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t}function ms(t,e,r){var n=e[0],i=e[1],a=e[2],s=e[3],o=e[4],l=e[5],u=e[6],c=e[7],h=e[8],p=e[9],f=e[10],d=e[11],y=e[12],m=e[13],g=e[14],x=e[15],v=r[0],b=r[1],w=r[2],_=r[3];return t[0]=v*n+b*o+w*h+_*y,t[1]=v*i+b*l+w*p+_*m,t[2]=v*a+b*u+w*f+_*g,t[3]=v*s+b*c+w*d+_*x,t[4]=(v=r[4])*n+(b=r[5])*o+(w=r[6])*h+(_=r[7])*y,t[5]=v*i+b*l+w*p+_*m,t[6]=v*a+b*u+w*f+_*g,t[7]=v*s+b*c+w*d+_*x,t[8]=(v=r[8])*n+(b=r[9])*o+(w=r[10])*h+(_=r[11])*y,t[9]=v*i+b*l+w*p+_*m,t[10]=v*a+b*u+w*f+_*g,t[11]=v*s+b*c+w*d+_*x,t[12]=(v=r[12])*n+(b=r[13])*o+(w=r[14])*h+(_=r[15])*y,t[13]=v*i+b*l+w*p+_*m,t[14]=v*a+b*u+w*f+_*g,t[15]=v*s+b*c+w*d+_*x,t}Math.hypot||(Math.hypot=function(){for(var t=0,e=arguments.length;e--;)t+=arguments[e]*arguments[e];return Math.sqrt(t)});var gs,xs=ms;function vs(t,e,r){var n=e[0],i=e[1],a=e[2],s=e[3];return t[0]=r[0]*n+r[4]*i+r[8]*a+r[12]*s,t[1]=r[1]*n+r[5]*i+r[9]*a+r[13]*s,t[2]=r[2]*n+r[6]*i+r[10]*a+r[14]*s,t[3]=r[3]*n+r[7]*i+r[11]*a+r[15]*s,t}gs=new ds(4),ds!=Float32Array&&(gs[0]=0,gs[1]=0,gs[2]=0,gs[3]=0);class bs extends di{constructor(t){super(t,ps);}createBucket(t){return new Xa(t)}queryRadius(t){const e=t;return os("circle-radius",this,e)+os("circle-stroke-width",this,e)+ls(this.paint.get("circle-translate"))}queryIntersectsFeature(t,e,r,n,i,a,s,o){const l=us(t,this.paint.get("circle-translate"),this.paint.get("circle-translate-anchor"),a.angle,s),u=this.paint.get("circle-radius").evaluate(e,r)+this.paint.get("circle-stroke-width").evaluate(e,r),c="map"===this.paint.get("circle-pitch-alignment"),h=c?l:function(t,e){return t.map((t=>ws(t,e)))}(l,o),p=c?u*s:u;for(const t of n)for(const e of t){const t=c?e:ws(e,o);let r=p;const n=vs([],[e.x,e.y,0,1],o);if("viewport"===this.paint.get("circle-pitch-scale")&&"map"===this.paint.get("circle-pitch-alignment")?r*=n[3]/a.cameraToCenterDistance:"map"===this.paint.get("circle-pitch-scale")&&"viewport"===this.paint.get("circle-pitch-alignment")&&(r*=a.cameraToCenterDistance/n[3]),Ha(h,t,r))return !0}return !1}}function ws(t,e){const r=vs([],[t.x,t.y,0,1],e);return new i(r[0]/r[3],r[1]/r[3])}class _s extends Xa{}let As;In("HeatmapBucket",_s,{omit:["layers"]});var ks={get paint(){return As=As||new pi({"heatmap-radius":new li(q.paint_heatmap["heatmap-radius"]),"heatmap-weight":new li(q.paint_heatmap["heatmap-weight"]),"heatmap-intensity":new oi(q.paint_heatmap["heatmap-intensity"]),"heatmap-color":new hi(q.paint_heatmap["heatmap-color"]),"heatmap-opacity":new oi(q.paint_heatmap["heatmap-opacity"])})}};function Ss(t,{width:e,height:r},n,i){if(i){if(i instanceof Uint8ClampedArray)i=new Uint8Array(i.buffer);else if(i.length!==e*r*n)throw new RangeError(`mismatched image size. expected: ${i.length} but got: ${e*r*n}`)}else i=new Uint8Array(e*r*n);return t.width=e,t.height=r,t.data=i,t}function Is(t,{width:e,height:r},n){if(e===t.width&&r===t.height)return;const i=Ss({},{width:e,height:r},n);zs(t,i,{x:0,y:0},{x:0,y:0},{width:Math.min(t.width,e),height:Math.min(t.height,r)},n),t.width=e,t.height=r,t.data=i.data;}function zs(t,e,r,n,i,a){if(0===i.width||0===i.height)return e;if(i.width>t.width||i.height>t.height||r.x>t.width-i.width||r.y>t.height-i.height)throw new RangeError("out of range source coordinates for image copy");if(i.width>e.width||i.height>e.height||n.x>e.width-i.width||n.y>e.height-i.height)throw new RangeError("out of range destination coordinates for image copy");const s=t.data,o=e.data;if(s===o)throw new Error("srcData equals dstData, so image is already copied");for(let l=0;l<i.height;l++){const u=((r.y+l)*t.width+r.x)*a,c=((n.y+l)*e.width+n.x)*a;for(let t=0;t<i.width*a;t++)o[c+t]=s[u+t];}return e}class Ms{constructor(t,e){Ss(this,t,1,e);}resize(t){Is(this,t,1);}clone(){return new Ms({width:this.width,height:this.height},new Uint8Array(this.data))}static copy(t,e,r,n,i){zs(t,e,r,n,i,1);}}class Ps{constructor(t,e){Ss(this,t,4,e);}resize(t){Is(this,t,4);}replace(t,e){e?this.data.set(t):this.data=t instanceof Uint8ClampedArray?new Uint8Array(t.buffer):t;}clone(){return new Ps({width:this.width,height:this.height},new Uint8Array(this.data))}static copy(t,e,r,n,i){zs(t,e,r,n,i,4);}}function Bs(t){const e={},r=t.resolution||256,n=t.clips?t.clips.length:1,i=t.image||new Ps({width:r,height:n});if(Math.log(r)/Math.LN2%1!=0)throw new Error(`width is not a power of 2 - ${r}`);const a=(r,n,a)=>{e[t.evaluationKey]=a;const s=t.expression.evaluate(e);i.data[r+n+0]=Math.floor(255*s.r/s.a),i.data[r+n+1]=Math.floor(255*s.g/s.a),i.data[r+n+2]=Math.floor(255*s.b/s.a),i.data[r+n+3]=Math.floor(255*s.a);};if(t.clips)for(let e=0,i=0;e<n;++e,i+=4*r)for(let n=0,s=0;n<r;n++,s+=4){const o=n/(r-1),{start:l,end:u}=t.clips[e];a(i,s,l*(1-o)+u*o);}else for(let t=0,e=0;t<r;t++,e+=4)a(0,e,t/(r-1));return i}In("AlphaImage",Ms),In("RGBAImage",Ps);class Cs extends di{createBucket(t){return new _s(t)}constructor(t){super(t,ks),this._updateColorRamp();}_handleSpecialPaintPropertyUpdate(t){"heatmap-color"===t&&this._updateColorRamp();}_updateColorRamp(){this.colorRamp=Bs({expression:this._transitionablePaint._values["heatmap-color"].value.expression,evaluationKey:"heatmapDensity",image:this.colorRamp}),this.colorRampTexture=null;}resize(){this.heatmapFbo&&(this.heatmapFbo.destroy(),this.heatmapFbo=null);}queryRadius(){return 0}queryIntersectsFeature(){return !1}hasOffscreenPass(){return 0!==this.paint.get("heatmap-opacity")&&"none"!==this.visibility}}let Vs;var Es={get paint(){return Vs=Vs||new pi({"hillshade-illumination-direction":new oi(q.paint_hillshade["hillshade-illumination-direction"]),"hillshade-illumination-anchor":new oi(q.paint_hillshade["hillshade-illumination-anchor"]),"hillshade-exaggeration":new oi(q.paint_hillshade["hillshade-exaggeration"]),"hillshade-shadow-color":new oi(q.paint_hillshade["hillshade-shadow-color"]),"hillshade-highlight-color":new oi(q.paint_hillshade["hillshade-highlight-color"]),"hillshade-accent-color":new oi(q.paint_hillshade["hillshade-accent-color"])})}};class Fs extends di{constructor(t){super(t,Es);}hasOffscreenPass(){return 0!==this.paint.get("hillshade-exaggeration")&&"none"!==this.visibility}}const Ts=xi([{name:"a_pos",components:2,type:"Int16"}],4),{members:Ls}=Ts;var $s={exports:{}};function Ds(t,e,r){r=r||2;var n,i,a,s,o,l,u,c=e&&e.length,h=c?e[0]*r:t.length,p=Os(t,0,h,r,!0),f=[];if(!p||p.next===p.prev)return f;if(c&&(p=function(t,e,r,n){var i,a,s,o=[];for(i=0,a=e.length;i<a;i++)(s=Os(t,e[i]*n,i<a-1?e[i+1]*n:t.length,n,!1))===s.next&&(s.steiner=!0),o.push(Ys(s));for(o.sort(Ks),i=0;i<o.length;i++)r=Gs(o[i],r);return r}(t,e,p,r)),t.length>80*r){n=a=t[0],i=s=t[1];for(var d=r;d<h;d+=r)(o=t[d])<n&&(n=o),(l=t[d+1])<i&&(i=l),o>a&&(a=o),l>s&&(s=l);u=0!==(u=Math.max(a-n,s-i))?32767/u:0;}return Rs(p,f,r,n,i,u,0),f}function Os(t,e,r,n,i){var a,s;if(i===uo(t,e,r,n)>0)for(a=e;a<r;a+=n)s=so(a,t[a],t[a+1],s);else for(a=r-n;a>=e;a-=n)s=so(a,t[a],t[a+1],s);return s&&to(s,s.next)&&(oo(s),s=s.next),s}function Us(t,e){if(!t)return t;e||(e=t);var r,n=t;do{if(r=!1,n.steiner||!to(n,n.next)&&0!==Qs(n.prev,n,n.next))n=n.next;else {if(oo(n),(n=e=n.prev)===n.next)break;r=!0;}}while(r||n!==e);return e}function Rs(t,e,r,n,i,a,s){if(t){!s&&a&&function(t,e,r,n){var i=t;do{0===i.z&&(i.z=Xs(i.x,i.y,e,r,n)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;}while(i!==t);i.prevZ.nextZ=null,i.prevZ=null,function(t){var e,r,n,i,a,s,o,l,u=1;do{for(r=t,t=null,a=null,s=0;r;){for(s++,n=r,o=0,e=0;e<u&&(o++,n=n.nextZ);e++);for(l=u;o>0||l>0&&n;)0!==o&&(0===l||!n||r.z<=n.z)?(i=r,r=r.nextZ,o--):(i=n,n=n.nextZ,l--),a?a.nextZ=i:t=i,i.prevZ=a,a=i;r=n;}a.nextZ=null,u*=2;}while(s>1)}(i);}(t,n,i,a);for(var o,l,u=t;t.prev!==t.next;)if(o=t.prev,l=t.next,a?js(t,n,i,a):qs(t))e.push(o.i/r|0),e.push(t.i/r|0),e.push(l.i/r|0),oo(t),t=l.next,u=l.next;else if((t=l)===u){s?1===s?Rs(t=Ns(Us(t),e,r),e,r,n,i,a,2):2===s&&Zs(t,e,r,n,i,a):Rs(Us(t),e,r,n,i,a,1);break}}}function qs(t){var e=t.prev,r=t,n=t.next;if(Qs(e,r,n)>=0)return !1;for(var i=e.x,a=r.x,s=n.x,o=e.y,l=r.y,u=n.y,c=i<a?i<s?i:s:a<s?a:s,h=o<l?o<u?o:u:l<u?l:u,p=i>a?i>s?i:s:a>s?a:s,f=o>l?o>u?o:u:l>u?l:u,d=n.next;d!==e;){if(d.x>=c&&d.x<=p&&d.y>=h&&d.y<=f&&Hs(i,o,a,l,s,u,d.x,d.y)&&Qs(d.prev,d,d.next)>=0)return !1;d=d.next;}return !0}function js(t,e,r,n){var i=t.prev,a=t,s=t.next;if(Qs(i,a,s)>=0)return !1;for(var o=i.x,l=a.x,u=s.x,c=i.y,h=a.y,p=s.y,f=o<l?o<u?o:u:l<u?l:u,d=c<h?c<p?c:p:h<p?h:p,y=o>l?o>u?o:u:l>u?l:u,m=c>h?c>p?c:p:h>p?h:p,g=Xs(f,d,e,r,n),x=Xs(y,m,e,r,n),v=t.prevZ,b=t.nextZ;v&&v.z>=g&&b&&b.z<=x;){if(v.x>=f&&v.x<=y&&v.y>=d&&v.y<=m&&v!==i&&v!==s&&Hs(o,c,l,h,u,p,v.x,v.y)&&Qs(v.prev,v,v.next)>=0)return !1;if(v=v.prevZ,b.x>=f&&b.x<=y&&b.y>=d&&b.y<=m&&b!==i&&b!==s&&Hs(o,c,l,h,u,p,b.x,b.y)&&Qs(b.prev,b,b.next)>=0)return !1;b=b.nextZ;}for(;v&&v.z>=g;){if(v.x>=f&&v.x<=y&&v.y>=d&&v.y<=m&&v!==i&&v!==s&&Hs(o,c,l,h,u,p,v.x,v.y)&&Qs(v.prev,v,v.next)>=0)return !1;v=v.prevZ;}for(;b&&b.z<=x;){if(b.x>=f&&b.x<=y&&b.y>=d&&b.y<=m&&b!==i&&b!==s&&Hs(o,c,l,h,u,p,b.x,b.y)&&Qs(b.prev,b,b.next)>=0)return !1;b=b.nextZ;}return !0}function Ns(t,e,r){var n=t;do{var i=n.prev,a=n.next.next;!to(i,a)&&eo(i,n,n.next,a)&&io(i,a)&&io(a,i)&&(e.push(i.i/r|0),e.push(n.i/r|0),e.push(a.i/r|0),oo(n),oo(n.next),n=t=a),n=n.next;}while(n!==t);return Us(n)}function Zs(t,e,r,n,i,a){var s=t;do{for(var o=s.next.next;o!==s.prev;){if(s.i!==o.i&&Ws(s,o)){var l=ao(s,o);return s=Us(s,s.next),l=Us(l,l.next),Rs(s,e,r,n,i,a,0),void Rs(l,e,r,n,i,a,0)}o=o.next;}s=s.next;}while(s!==t)}function Ks(t,e){return t.x-e.x}function Gs(t,e){var r=function(t,e){var r,n=e,i=t.x,a=t.y,s=-1/0;do{if(a<=n.y&&a>=n.next.y&&n.next.y!==n.y){var o=n.x+(a-n.y)*(n.next.x-n.x)/(n.next.y-n.y);if(o<=i&&o>s&&(s=o,r=n.x<n.next.x?n:n.next,o===i))return r}n=n.next;}while(n!==e);if(!r)return null;var l,u=r,c=r.x,h=r.y,p=1/0;n=r;do{i>=n.x&&n.x>=c&&i!==n.x&&Hs(a<h?i:s,a,c,h,a<h?s:i,a,n.x,n.y)&&(l=Math.abs(a-n.y)/(i-n.x),io(n,t)&&(l<p||l===p&&(n.x>r.x||n.x===r.x&&Js(r,n)))&&(r=n,p=l)),n=n.next;}while(n!==u);return r}(t,e);if(!r)return e;var n=ao(r,t);return Us(n,n.next),Us(r,r.next)}function Js(t,e){return Qs(t.prev,t,e.prev)<0&&Qs(e.next,t,t.next)<0}function Xs(t,e,r,n,i){return (t=1431655765&((t=858993459&((t=252645135&((t=16711935&((t=(t-r)*i|0)|t<<8))|t<<4))|t<<2))|t<<1))|(e=1431655765&((e=858993459&((e=252645135&((e=16711935&((e=(e-n)*i|0)|e<<8))|e<<4))|e<<2))|e<<1))<<1}function Ys(t){var e=t,r=t;do{(e.x<r.x||e.x===r.x&&e.y<r.y)&&(r=e),e=e.next;}while(e!==t);return r}function Hs(t,e,r,n,i,a,s,o){return (i-s)*(e-o)>=(t-s)*(a-o)&&(t-s)*(n-o)>=(r-s)*(e-o)&&(r-s)*(a-o)>=(i-s)*(n-o)}function Ws(t,e){return t.next.i!==e.i&&t.prev.i!==e.i&&!function(t,e){var r=t;do{if(r.i!==t.i&&r.next.i!==t.i&&r.i!==e.i&&r.next.i!==e.i&&eo(r,r.next,t,e))return !0;r=r.next;}while(r!==t);return !1}(t,e)&&(io(t,e)&&io(e,t)&&function(t,e){var r=t,n=!1,i=(t.x+e.x)/2,a=(t.y+e.y)/2;do{r.y>a!=r.next.y>a&&r.next.y!==r.y&&i<(r.next.x-r.x)*(a-r.y)/(r.next.y-r.y)+r.x&&(n=!n),r=r.next;}while(r!==t);return n}(t,e)&&(Qs(t.prev,t,e.prev)||Qs(t,e.prev,e))||to(t,e)&&Qs(t.prev,t,t.next)>0&&Qs(e.prev,e,e.next)>0)}function Qs(t,e,r){return (e.y-t.y)*(r.x-e.x)-(e.x-t.x)*(r.y-e.y)}function to(t,e){return t.x===e.x&&t.y===e.y}function eo(t,e,r,n){var i=no(Qs(t,e,r)),a=no(Qs(t,e,n)),s=no(Qs(r,n,t)),o=no(Qs(r,n,e));return i!==a&&s!==o||!(0!==i||!ro(t,r,e))||!(0!==a||!ro(t,n,e))||!(0!==s||!ro(r,t,n))||!(0!==o||!ro(r,e,n))}function ro(t,e,r){return e.x<=Math.max(t.x,r.x)&&e.x>=Math.min(t.x,r.x)&&e.y<=Math.max(t.y,r.y)&&e.y>=Math.min(t.y,r.y)}function no(t){return t>0?1:t<0?-1:0}function io(t,e){return Qs(t.prev,t,t.next)<0?Qs(t,e,t.next)>=0&&Qs(t,t.prev,e)>=0:Qs(t,e,t.prev)<0||Qs(t,t.next,e)<0}function ao(t,e){var r=new lo(t.i,t.x,t.y),n=new lo(e.i,e.x,e.y),i=t.next,a=e.prev;return t.next=e,e.prev=t,r.next=i,i.prev=r,n.next=r,r.prev=n,a.next=n,n.prev=a,n}function so(t,e,r,n){var i=new lo(t,e,r);return n?(i.next=n.next,i.prev=n,n.next.prev=i,n.next=i):(i.prev=i,i.next=i),i}function oo(t){t.next.prev=t.prev,t.prev.next=t.next,t.prevZ&&(t.prevZ.nextZ=t.nextZ),t.nextZ&&(t.nextZ.prevZ=t.prevZ);}function lo(t,e,r){this.i=t,this.x=e,this.y=r,this.prev=null,this.next=null,this.z=0,this.prevZ=null,this.nextZ=null,this.steiner=!1;}function uo(t,e,r,n){for(var i=0,a=e,s=r-n;a<r;a+=n)i+=(t[s]-t[a])*(t[a+1]+t[s+1]),s=a;return i}$s.exports=Ds,$s.exports.default=Ds,Ds.deviation=function(t,e,r,n){var i=e&&e.length,a=Math.abs(uo(t,0,i?e[0]*r:t.length,r));if(i)for(var s=0,o=e.length;s<o;s++)a-=Math.abs(uo(t,e[s]*r,s<o-1?e[s+1]*r:t.length,r));var l=0;for(s=0;s<n.length;s+=3){var u=n[s]*r,c=n[s+1]*r,h=n[s+2]*r;l+=Math.abs((t[u]-t[h])*(t[c+1]-t[u+1])-(t[u]-t[c])*(t[h+1]-t[u+1]));}return 0===a&&0===l?0:Math.abs((l-a)/a)},Ds.flatten=function(t){for(var e=t[0][0].length,r={vertices:[],holes:[],dimensions:e},n=0,i=0;i<t.length;i++){for(var a=0;a<t[i].length;a++)for(var s=0;s<e;s++)r.vertices.push(t[i][a][s]);i>0&&r.holes.push(n+=t[i-1].length);}return r};var co=e($s.exports);function ho(t,e,r,n,i){po(t,e,r||0,n||t.length-1,i||yo);}function po(t,e,r,n,i){for(;n>r;){if(n-r>600){var a=n-r+1,s=e-r+1,o=Math.log(a),l=.5*Math.exp(2*o/3),u=.5*Math.sqrt(o*l*(a-l)/a)*(s-a/2<0?-1:1);po(t,e,Math.max(r,Math.floor(e-s*l/a+u)),Math.min(n,Math.floor(e+(a-s)*l/a+u)),i);}var c=t[e],h=r,p=n;for(fo(t,r,e),i(t[n],c)>0&&fo(t,r,n);h<p;){for(fo(t,h,p),h++,p--;i(t[h],c)<0;)h++;for(;i(t[p],c)>0;)p--;}0===i(t[r],c)?fo(t,r,p):fo(t,++p,n),p<=e&&(r=p+1),e<=p&&(n=p-1);}}function fo(t,e,r){var n=t[e];t[e]=t[r],t[r]=n;}function yo(t,e){return t<e?-1:t>e?1:0}function mo(t,e){const r=t.length;if(r<=1)return [t];const n=[];let i,a;for(let e=0;e<r;e++){const r=b(t[e]);0!==r&&(t[e].area=Math.abs(r),void 0===a&&(a=r<0),a===r<0?(i&&n.push(i),i=[t[e]]):i.push(t[e]));}if(i&&n.push(i),e>1)for(let t=0;t<n.length;t++)n[t].length<=e||(ho(n[t],e,1,n[t].length-1,go),n[t]=n[t].slice(0,e));return n}function go(t,e){return e.area-t.area}function xo(t,e,r){const n=r.patternDependencies;let i=!1;for(const r of e){const e=r.paint.get(`${t}-pattern`);e.isConstant()||(i=!0);const a=e.constantOr(null);a&&(i=!0,n[a.to]=!0,n[a.from]=!0);}return i}function vo(t,e,r,n,i){const a=i.patternDependencies;for(const s of e){const e=s.paint.get(`${t}-pattern`).value;if("constant"!==e.kind){let t=e.evaluate({zoom:n-1},r,{},i.availableImages),o=e.evaluate({zoom:n},r,{},i.availableImages),l=e.evaluate({zoom:n+1},r,{},i.availableImages);t=t&&t.name?t.name:t,o=o&&o.name?o.name:o,l=l&&l.name?l.name:l,a[t]=!0,a[o]=!0,a[l]=!0,r.patterns[s.id]={min:t,mid:o,max:l};}}return r}class bo{constructor(t){this.zoom=t.zoom,this.overscaling=t.overscaling,this.layers=t.layers,this.layerIds=this.layers.map((t=>t.id)),this.index=t.index,this.hasPattern=!1,this.patternFeatures=[],this.layoutVertexArray=new ta,this.indexArray=new ca,this.indexArray2=new ha,this.programConfigurations=new Ua(t.layers,t.zoom),this.segments=new da,this.segments2=new da,this.stateDependentLayerIds=this.layers.filter((t=>t.isStateDependent())).map((t=>t.id));}populate(t,e,r){this.hasPattern=xo("fill",this.layers,e);const n=this.layers[0].layout.get("fill-sort-key"),i=!n.isConstant(),a=[];for(const{feature:s,id:o,index:l,sourceLayerIndex:u}of t){const t=this.layers[0]._featureFilter.needGeometry,c=Ga(s,t);if(!this.layers[0]._featureFilter.filter(new Wn(this.zoom),c,r))continue;const h=i?n.evaluate(c,{},r,e.availableImages):void 0,p={id:o,properties:s.properties,type:s.type,sourceLayerIndex:u,index:l,geometry:t?c.geometry:Ka(s),patterns:{},sortKey:h};a.push(p);}i&&a.sort(((t,e)=>t.sortKey-e.sortKey));for(const n of a){const{geometry:i,index:a,sourceLayerIndex:s}=n;if(this.hasPattern){const t=vo("fill",this.layers,n,this.zoom,e);this.patternFeatures.push(t);}else this.addFeature(n,i,a,r,{});e.featureIndex.insert(t[a].feature,i,a,s,this.index);}}update(t,e,r){this.stateDependentLayers.length&&this.programConfigurations.updatePaintArrays(t,e,this.stateDependentLayers,r);}addFeatures(t,e,r){for(const t of this.patternFeatures)this.addFeature(t,t.geometry,t.index,e,r);}isEmpty(){return 0===this.layoutVertexArray.length}uploadPending(){return !this.uploaded||this.programConfigurations.needsUpload}upload(t){this.uploaded||(this.layoutVertexBuffer=t.createVertexBuffer(this.layoutVertexArray,Ls),this.indexBuffer=t.createIndexBuffer(this.indexArray),this.indexBuffer2=t.createIndexBuffer(this.indexArray2)),this.programConfigurations.upload(t),this.uploaded=!0;}destroy(){this.layoutVertexBuffer&&(this.layoutVertexBuffer.destroy(),this.indexBuffer.destroy(),this.indexBuffer2.destroy(),this.programConfigurations.destroy(),this.segments.destroy(),this.segments2.destroy());}addFeature(t,e,r,n,i){for(const t of mo(e,500)){let e=0;for(const r of t)e+=r.length;const r=this.segments.prepareSegment(e,this.layoutVertexArray,this.indexArray),n=r.vertexLength,i=[],a=[];for(const e of t){if(0===e.length)continue;e!==t[0]&&a.push(i.length/2);const r=this.segments2.prepareSegment(e.length,this.layoutVertexArray,this.indexArray2),n=r.vertexLength;this.layoutVertexArray.emplaceBack(e[0].x,e[0].y),this.indexArray2.emplaceBack(n+e.length-1,n),i.push(e[0].x),i.push(e[0].y);for(let t=1;t<e.length;t++)this.layoutVertexArray.emplaceBack(e[t].x,e[t].y),this.indexArray2.emplaceBack(n+t-1,n+t),i.push(e[t].x),i.push(e[t].y);r.vertexLength+=e.length,r.primitiveLength+=e.length;}const s=co(i,a);for(let t=0;t<s.length;t+=3)this.indexArray.emplaceBack(n+s[t],n+s[t+1],n+s[t+2]);r.vertexLength+=e,r.primitiveLength+=s.length/3;}this.programConfigurations.populatePaintArrays(this.layoutVertexArray.length,t,r,i,n);}}let wo,_o;In("FillBucket",bo,{omit:["layers","patternFeatures"]});var Ao={get paint(){return _o=_o||new pi({"fill-antialias":new oi(q.paint_fill["fill-antialias"]),"fill-opacity":new li(q.paint_fill["fill-opacity"]),"fill-color":new li(q.paint_fill["fill-color"]),"fill-outline-color":new li(q.paint_fill["fill-outline-color"]),"fill-translate":new oi(q.paint_fill["fill-translate"]),"fill-translate-anchor":new oi(q.paint_fill["fill-translate-anchor"]),"fill-pattern":new ui(q.paint_fill["fill-pattern"])})},get layout(){return wo=wo||new pi({"fill-sort-key":new li(q.layout_fill["fill-sort-key"])})}};class ko extends di{constructor(t){super(t,Ao);}recalculate(t,e){super.recalculate(t,e);const r=this.paint._values["fill-outline-color"];"constant"===r.value.kind&&void 0===r.value.value&&(this.paint._values["fill-outline-color"]=this.paint._values["fill-color"]);}createBucket(t){return new bo(t)}queryRadius(){return ls(this.paint.get("fill-translate"))}queryIntersectsFeature(t,e,r,n,i,a,s){return Wa(us(t,this.paint.get("fill-translate"),this.paint.get("fill-translate-anchor"),a.angle,s),n)}isTileClipped(){return !0}}const So=xi([{name:"a_pos",components:2,type:"Int16"},{name:"a_normal_ed",components:4,type:"Int16"}],4),Io=xi([{name:"a_centroid",components:2,type:"Int16"}],4),{members:zo}=So;var Mo={},Po=r,Bo=Co;function Co(t,e,r,n,i){this.properties={},this.extent=r,this.type=0,this._pbf=t,this._geometry=-1,this._keys=n,this._values=i,t.readFields(Vo,this,e);}function Vo(t,e,r){1==t?e.id=r.readVarint():2==t?function(t,e){for(var r=t.readVarint()+t.pos;t.pos<r;){var n=e._keys[t.readVarint()],i=e._values[t.readVarint()];e.properties[n]=i;}}(r,e):3==t?e.type=r.readVarint():4==t&&(e._geometry=r.pos);}function Eo(t){for(var e,r,n=0,i=0,a=t.length,s=a-1;i<a;s=i++)n+=((r=t[s]).x-(e=t[i]).x)*(e.y+r.y);return n}Co.types=["Unknown","Point","LineString","Polygon"],Co.prototype.loadGeometry=function(){var t=this._pbf;t.pos=this._geometry;for(var e,r=t.readVarint()+t.pos,n=1,i=0,a=0,s=0,o=[];t.pos<r;){if(i<=0){var l=t.readVarint();n=7&l,i=l>>3;}if(i--,1===n||2===n)a+=t.readSVarint(),s+=t.readSVarint(),1===n&&(e&&o.push(e),e=[]),e.push(new Po(a,s));else {if(7!==n)throw new Error("unknown command "+n);e&&e.push(e[0].clone());}}return e&&o.push(e),o},Co.prototype.bbox=function(){var t=this._pbf;t.pos=this._geometry;for(var e=t.readVarint()+t.pos,r=1,n=0,i=0,a=0,s=1/0,o=-1/0,l=1/0,u=-1/0;t.pos<e;){if(n<=0){var c=t.readVarint();r=7&c,n=c>>3;}if(n--,1===r||2===r)(i+=t.readSVarint())<s&&(s=i),i>o&&(o=i),(a+=t.readSVarint())<l&&(l=a),a>u&&(u=a);else if(7!==r)throw new Error("unknown command "+r)}return [s,l,o,u]},Co.prototype.toGeoJSON=function(t,e,r){var n,i,a=this.extent*Math.pow(2,r),s=this.extent*t,o=this.extent*e,l=this.loadGeometry(),u=Co.types[this.type];function c(t){for(var e=0;e<t.length;e++){var r=t[e];t[e]=[360*(r.x+s)/a-180,360/Math.PI*Math.atan(Math.exp((180-360*(r.y+o)/a)*Math.PI/180))-90];}}switch(this.type){case 1:var h=[];for(n=0;n<l.length;n++)h[n]=l[n][0];c(l=h);break;case 2:for(n=0;n<l.length;n++)c(l[n]);break;case 3:for(l=function(t){var e=t.length;if(e<=1)return [t];for(var r,n,i=[],a=0;a<e;a++){var s=Eo(t[a]);0!==s&&(void 0===n&&(n=s<0),n===s<0?(r&&i.push(r),r=[t[a]]):r.push(t[a]));}return r&&i.push(r),i}(l),n=0;n<l.length;n++)for(i=0;i<l[n].length;i++)c(l[n][i]);}1===l.length?l=l[0]:u="Multi"+u;var p={type:"Feature",geometry:{type:u,coordinates:l},properties:this.properties};return "id"in this&&(p.id=this.id),p};var Fo=Bo,To=Lo;function Lo(t,e){this.version=1,this.name=null,this.extent=4096,this.length=0,this._pbf=t,this._keys=[],this._values=[],this._features=[],t.readFields($o,this,e),this.length=this._features.length;}function $o(t,e,r){15===t?e.version=r.readVarint():1===t?e.name=r.readString():5===t?e.extent=r.readVarint():2===t?e._features.push(r.pos):3===t?e._keys.push(r.readString()):4===t&&e._values.push(function(t){for(var e=null,r=t.readVarint()+t.pos;t.pos<r;){var n=t.readVarint()>>3;e=1===n?t.readString():2===n?t.readFloat():3===n?t.readDouble():4===n?t.readVarint64():5===n?t.readVarint():6===n?t.readSVarint():7===n?t.readBoolean():null;}return e}(r));}Lo.prototype.feature=function(t){if(t<0||t>=this._features.length)throw new Error("feature index out of bounds");this._pbf.pos=this._features[t];var e=this._pbf.readVarint()+this._pbf.pos;return new Fo(this._pbf,e,this.extent,this._keys,this._values)};var Do=To;function Oo(t,e,r){if(3===t){var n=new Do(r,r.readVarint()+r.pos);n.length&&(e[n.name]=n);}}Mo.VectorTile=function(t,e){this.layers=t.readFields(Oo,{},e);},Mo.VectorTileFeature=Bo,Mo.VectorTileLayer=To;const Uo=Mo.VectorTileFeature.types,Ro=Math.pow(2,13);function qo(t,e,r,n,i,a,s,o){t.emplaceBack(e,r,2*Math.floor(n*Ro)+s,i*Ro*2,a*Ro*2,Math.round(o));}class jo{constructor(t){this.zoom=t.zoom,this.overscaling=t.overscaling,this.layers=t.layers,this.layerIds=this.layers.map((t=>t.id)),this.index=t.index,this.hasPattern=!1,this.layoutVertexArray=new ea,this.centroidVertexArray=new Wi,this.indexArray=new ca,this.programConfigurations=new Ua(t.layers,t.zoom),this.segments=new da,this.stateDependentLayerIds=this.layers.filter((t=>t.isStateDependent())).map((t=>t.id));}populate(t,e,r){this.features=[],this.hasPattern=xo("fill-extrusion",this.layers,e);for(const{feature:n,id:i,index:a,sourceLayerIndex:s}of t){const t=this.layers[0]._featureFilter.needGeometry,o=Ga(n,t);if(!this.layers[0]._featureFilter.filter(new Wn(this.zoom),o,r))continue;const l={id:i,sourceLayerIndex:s,index:a,geometry:t?o.geometry:Ka(n),properties:n.properties,type:n.type,patterns:{}};this.hasPattern?this.features.push(vo("fill-extrusion",this.layers,l,this.zoom,e)):this.addFeature(l,l.geometry,a,r,{}),e.featureIndex.insert(n,l.geometry,a,s,this.index,!0);}}addFeatures(t,e,r){for(const t of this.features){const{geometry:n}=t;this.addFeature(t,n,t.index,e,r);}}update(t,e,r){this.stateDependentLayers.length&&this.programConfigurations.updatePaintArrays(t,e,this.stateDependentLayers,r);}isEmpty(){return 0===this.layoutVertexArray.length&&0===this.centroidVertexArray.length}uploadPending(){return !this.uploaded||this.programConfigurations.needsUpload}upload(t){this.uploaded||(this.layoutVertexBuffer=t.createVertexBuffer(this.layoutVertexArray,zo),this.centroidVertexBuffer=t.createVertexBuffer(this.centroidVertexArray,Io.members,!0),this.indexBuffer=t.createIndexBuffer(this.indexArray)),this.programConfigurations.upload(t),this.uploaded=!0;}destroy(){this.layoutVertexBuffer&&(this.layoutVertexBuffer.destroy(),this.indexBuffer.destroy(),this.programConfigurations.destroy(),this.segments.destroy(),this.centroidVertexBuffer.destroy());}addFeature(t,e,r,n,i){const a={x:0,y:0,vertexCount:0};for(const r of mo(e,500)){let e=0;for(const t of r)e+=t.length;let n=this.segments.prepareSegment(4,this.layoutVertexArray,this.indexArray);for(const t of r){if(0===t.length)continue;if(Zo(t))continue;let e=0;for(let r=0;r<t.length;r++){const i=t[r];if(r>=1){const s=t[r-1];if(!No(i,s)){n.vertexLength+4>da.MAX_VERTEX_ARRAY_LENGTH&&(n=this.segments.prepareSegment(4,this.layoutVertexArray,this.indexArray));const t=i.sub(s)._perp()._unit(),r=s.dist(i);e+r>32768&&(e=0),qo(this.layoutVertexArray,i.x,i.y,t.x,t.y,0,0,e),qo(this.layoutVertexArray,i.x,i.y,t.x,t.y,0,1,e),a.x+=2*i.x,a.y+=2*i.y,a.vertexCount+=2,e+=r,qo(this.layoutVertexArray,s.x,s.y,t.x,t.y,0,0,e),qo(this.layoutVertexArray,s.x,s.y,t.x,t.y,0,1,e),a.x+=2*s.x,a.y+=2*s.y,a.vertexCount+=2;const o=n.vertexLength;this.indexArray.emplaceBack(o,o+2,o+1),this.indexArray.emplaceBack(o+1,o+2,o+3),n.vertexLength+=4,n.primitiveLength+=2;}}}}if(n.vertexLength+e>da.MAX_VERTEX_ARRAY_LENGTH&&(n=this.segments.prepareSegment(e,this.layoutVertexArray,this.indexArray)),"Polygon"!==Uo[t.type])continue;const i=[],s=[],o=n.vertexLength;for(const t of r)if(0!==t.length){t!==r[0]&&s.push(i.length/2);for(let e=0;e<t.length;e++){const r=t[e];qo(this.layoutVertexArray,r.x,r.y,0,0,1,1,0),a.x+=r.x,a.y+=r.y,a.vertexCount+=1,i.push(r.x),i.push(r.y);}}const l=co(i,s);for(let t=0;t<l.length;t+=3)this.indexArray.emplaceBack(o+l[t],o+l[t+2],o+l[t+1]);n.primitiveLength+=l.length/3,n.vertexLength+=e;}for(let t=0;t<a.vertexCount;t++)this.centroidVertexArray.emplaceBack(Math.floor(a.x/a.vertexCount),Math.floor(a.y/a.vertexCount));this.programConfigurations.populatePaintArrays(this.layoutVertexArray.length,t,r,i,n);}}function No(t,e){return t.x===e.x&&(t.x<0||t.x>ja)||t.y===e.y&&(t.y<0||t.y>ja)}function Zo(t){return t.every((t=>t.x<0))||t.every((t=>t.x>ja))||t.every((t=>t.y<0))||t.every((t=>t.y>ja))}let Ko;In("FillExtrusionBucket",jo,{omit:["layers","features"]});var Go={get paint(){return Ko=Ko||new pi({"fill-extrusion-opacity":new oi(q["paint_fill-extrusion"]["fill-extrusion-opacity"]),"fill-extrusion-color":new li(q["paint_fill-extrusion"]["fill-extrusion-color"]),"fill-extrusion-translate":new oi(q["paint_fill-extrusion"]["fill-extrusion-translate"]),"fill-extrusion-translate-anchor":new oi(q["paint_fill-extrusion"]["fill-extrusion-translate-anchor"]),"fill-extrusion-pattern":new ui(q["paint_fill-extrusion"]["fill-extrusion-pattern"]),"fill-extrusion-height":new li(q["paint_fill-extrusion"]["fill-extrusion-height"]),"fill-extrusion-base":new li(q["paint_fill-extrusion"]["fill-extrusion-base"]),"fill-extrusion-vertical-gradient":new oi(q["paint_fill-extrusion"]["fill-extrusion-vertical-gradient"])})}};class Jo extends di{constructor(t){super(t,Go);}createBucket(t){return new jo(t)}queryRadius(){return ls(this.paint.get("fill-extrusion-translate"))}is3D(){return !0}queryIntersectsFeature(t,e,r,n,a,s,o,l){const u=us(t,this.paint.get("fill-extrusion-translate"),this.paint.get("fill-extrusion-translate-anchor"),s.angle,o),c=this.paint.get("fill-extrusion-height").evaluate(e,r),h=this.paint.get("fill-extrusion-base").evaluate(e,r),p=function(t,e,r,n){const a=[];for(const r of t){const t=[r.x,r.y,0,1];vs(t,t,e),a.push(new i(t[0]/t[3],t[1]/t[3]));}return a}(u,l),f=function(t,e,r,n){const a=[],s=[],o=n[8]*e,l=n[9]*e,u=n[10]*e,c=n[11]*e,h=n[8]*r,p=n[9]*r,f=n[10]*r,d=n[11]*r;for(const e of t){const t=[],r=[];for(const a of e){const e=a.x,s=a.y,y=n[0]*e+n[4]*s+n[12],m=n[1]*e+n[5]*s+n[13],g=n[2]*e+n[6]*s+n[14],x=n[3]*e+n[7]*s+n[15],v=g+u,b=x+c,w=y+h,_=m+p,A=g+f,k=x+d,S=new i((y+o)/b,(m+l)/b);S.z=v/b,t.push(S);const I=new i(w/k,_/k);I.z=A/k,r.push(I);}a.push(t),s.push(r);}return [a,s]}(n,h,c,l);return function(t,e,r){let n=1/0;Wa(r,e)&&(n=Yo(r,e[0]));for(let i=0;i<e.length;i++){const a=e[i],s=t[i];for(let t=0;t<a.length-1;t++){const e=a[t],i=[e,a[t+1],s[t+1],s[t],e];Ya(r,i)&&(n=Math.min(n,Yo(r,i)));}}return n!==1/0&&n}(f[0],f[1],p)}}function Xo(t,e){return t.x*e.x+t.y*e.y}function Yo(t,e){if(1===t.length){let r=0;const n=e[r++];let i;for(;!i||n.equals(i);)if(i=e[r++],!i)return 1/0;for(;r<e.length;r++){const a=e[r],s=t[0],o=i.sub(n),l=a.sub(n),u=s.sub(n),c=Xo(o,o),h=Xo(o,l),p=Xo(l,l),f=Xo(u,o),d=Xo(u,l),y=c*p-h*h,m=(p*f-h*d)/y,g=(c*d-h*f)/y,x=n.z*(1-m-g)+i.z*m+a.z*g;if(isFinite(x))return x}return 1/0}{let t=1/0;for(const r of e)t=Math.min(t,r.z);return t}}const Ho=xi([{name:"a_pos_normal",components:2,type:"Int16"},{name:"a_data",components:4,type:"Uint8"}],4),{members:Wo}=Ho,Qo=xi([{name:"a_uv_x",components:1,type:"Float32"},{name:"a_split_index",components:1,type:"Float32"}]),{members:tl}=Qo,el=Mo.VectorTileFeature.types,rl=Math.cos(Math.PI/180*37.5),nl=Math.pow(2,14)/.5;class il{constructor(t){this.zoom=t.zoom,this.overscaling=t.overscaling,this.layers=t.layers,this.layerIds=this.layers.map((t=>t.id)),this.index=t.index,this.hasPattern=!1,this.patternFeatures=[],this.lineClipsArray=[],this.gradients={},this.layers.forEach((t=>{this.gradients[t.id]={};})),this.layoutVertexArray=new ra,this.layoutVertexArray2=new na,this.indexArray=new ca,this.programConfigurations=new Ua(t.layers,t.zoom),this.segments=new da,this.maxLineLength=0,this.stateDependentLayerIds=this.layers.filter((t=>t.isStateDependent())).map((t=>t.id));}populate(t,e,r){this.hasPattern=xo("line",this.layers,e);const n=this.layers[0].layout.get("line-sort-key"),i=!n.isConstant(),a=[];for(const{feature:e,id:s,index:o,sourceLayerIndex:l}of t){const t=this.layers[0]._featureFilter.needGeometry,u=Ga(e,t);if(!this.layers[0]._featureFilter.filter(new Wn(this.zoom),u,r))continue;const c=i?n.evaluate(u,{},r):void 0,h={id:s,properties:e.properties,type:e.type,sourceLayerIndex:l,index:o,geometry:t?u.geometry:Ka(e),patterns:{},sortKey:c};a.push(h);}i&&a.sort(((t,e)=>t.sortKey-e.sortKey));for(const n of a){const{geometry:i,index:a,sourceLayerIndex:s}=n;if(this.hasPattern){const t=vo("line",this.layers,n,this.zoom,e);this.patternFeatures.push(t);}else this.addFeature(n,i,a,r,{});e.featureIndex.insert(t[a].feature,i,a,s,this.index);}}update(t,e,r){this.stateDependentLayers.length&&this.programConfigurations.updatePaintArrays(t,e,this.stateDependentLayers,r);}addFeatures(t,e,r){for(const t of this.patternFeatures)this.addFeature(t,t.geometry,t.index,e,r);}isEmpty(){return 0===this.layoutVertexArray.length}uploadPending(){return !this.uploaded||this.programConfigurations.needsUpload}upload(t){this.uploaded||(0!==this.layoutVertexArray2.length&&(this.layoutVertexBuffer2=t.createVertexBuffer(this.layoutVertexArray2,tl)),this.layoutVertexBuffer=t.createVertexBuffer(this.layoutVertexArray,Wo),this.indexBuffer=t.createIndexBuffer(this.indexArray)),this.programConfigurations.upload(t),this.uploaded=!0;}destroy(){this.layoutVertexBuffer&&(this.layoutVertexBuffer.destroy(),this.indexBuffer.destroy(),this.programConfigurations.destroy(),this.segments.destroy());}lineFeatureClips(t){if(t.properties&&Object.prototype.hasOwnProperty.call(t.properties,"mapbox_clip_start")&&Object.prototype.hasOwnProperty.call(t.properties,"mapbox_clip_end"))return {start:+t.properties.mapbox_clip_start,end:+t.properties.mapbox_clip_end}}addFeature(t,e,r,n,i){const a=this.layers[0].layout,s=a.get("line-join").evaluate(t,{}),o=a.get("line-cap"),l=a.get("line-miter-limit"),u=a.get("line-round-limit");this.lineClips=this.lineFeatureClips(t);for(const r of e)this.addLine(r,t,s,o,l,u);this.programConfigurations.populatePaintArrays(this.layoutVertexArray.length,t,r,i,n);}addLine(t,e,r,n,i,a){if(this.distance=0,this.scaledDistance=0,this.totalDistance=0,this.lineClips){this.lineClipsArray.push(this.lineClips);for(let e=0;e<t.length-1;e++)this.totalDistance+=t[e].dist(t[e+1]);this.updateScaledDistance(),this.maxLineLength=Math.max(this.maxLineLength,this.totalDistance);}const s="Polygon"===el[e.type];let o=t.length;for(;o>=2&&t[o-1].equals(t[o-2]);)o--;let l=0;for(;l<o-1&&t[l].equals(t[l+1]);)l++;if(o<(s?3:2))return;"bevel"===r&&(i=1.05);const u=this.overscaling<=16?15*ja/(512*this.overscaling):0,c=this.segments.prepareSegment(10*o,this.layoutVertexArray,this.indexArray);let h,p,f,d,y;this.e1=this.e2=-1,s&&(h=t[o-2],y=t[l].sub(h)._unit()._perp());for(let e=l;e<o;e++){if(f=e===o-1?s?t[l+1]:void 0:t[e+1],f&&t[e].equals(f))continue;y&&(d=y),h&&(p=h),h=t[e],y=f?f.sub(h)._unit()._perp():d,d=d||y;let m=d.add(y);0===m.x&&0===m.y||m._unit();const g=d.x*y.x+d.y*y.y,x=m.x*y.x+m.y*y.y,v=0!==x?1/x:1/0,b=2*Math.sqrt(2-2*x),w=x<rl&&p&&f,_=d.x*y.y-d.y*y.x>0;if(w&&e>l){const t=h.dist(p);if(t>2*u){const e=h.sub(h.sub(p)._mult(u/t)._round());this.updateDistance(p,e),this.addCurrentVertex(e,d,0,0,c),p=e;}}const A=p&&f;let k=A?r:s?"butt":n;if(A&&"round"===k&&(v<a?k="miter":v<=2&&(k="fakeround")),"miter"===k&&v>i&&(k="bevel"),"bevel"===k&&(v>2&&(k="flipbevel"),v<i&&(k="miter")),p&&this.updateDistance(p,h),"miter"===k)m._mult(v),this.addCurrentVertex(h,m,0,0,c);else if("flipbevel"===k){if(v>100)m=y.mult(-1);else {const t=v*d.add(y).mag()/d.sub(y).mag();m._perp()._mult(t*(_?-1:1));}this.addCurrentVertex(h,m,0,0,c),this.addCurrentVertex(h,m.mult(-1),0,0,c);}else if("bevel"===k||"fakeround"===k){const t=-Math.sqrt(v*v-1),e=_?t:0,r=_?0:t;if(p&&this.addCurrentVertex(h,d,e,r,c),"fakeround"===k){const t=Math.round(180*b/Math.PI/20);for(let e=1;e<t;e++){let r=e/t;if(.5!==r){const t=r-.5;r+=r*t*(r-1)*((1.0904+g*(g*(3.55645-1.43519*g)-3.2452))*t*t+(.848013+g*(.215638*g-1.06021)));}const n=y.sub(d)._mult(r)._add(d)._unit()._mult(_?-1:1);this.addHalfVertex(h,n.x,n.y,!1,_,0,c);}}f&&this.addCurrentVertex(h,y,-e,-r,c);}else if("butt"===k)this.addCurrentVertex(h,m,0,0,c);else if("square"===k){const t=p?1:-1;this.addCurrentVertex(h,m,t,t,c);}else "round"===k&&(p&&(this.addCurrentVertex(h,d,0,0,c),this.addCurrentVertex(h,d,1,1,c,!0)),f&&(this.addCurrentVertex(h,y,-1,-1,c,!0),this.addCurrentVertex(h,y,0,0,c)));if(w&&e<o-1){const t=h.dist(f);if(t>2*u){const e=h.add(f.sub(h)._mult(u/t)._round());this.updateDistance(h,e),this.addCurrentVertex(e,y,0,0,c),h=e;}}}}addCurrentVertex(t,e,r,n,i,a=!1){const s=e.y*n-e.x,o=-e.y-e.x*n;this.addHalfVertex(t,e.x+e.y*r,e.y-e.x*r,a,!1,r,i),this.addHalfVertex(t,s,o,a,!0,-n,i),this.distance>nl/2&&0===this.totalDistance&&(this.distance=0,this.updateScaledDistance(),this.addCurrentVertex(t,e,r,n,i,a));}addHalfVertex({x:t,y:e},r,n,i,a,s,o){const l=.5*(this.lineClips?this.scaledDistance*(nl-1):this.scaledDistance);this.layoutVertexArray.emplaceBack((t<<1)+(i?1:0),(e<<1)+(a?1:0),Math.round(63*r)+128,Math.round(63*n)+128,1+(0===s?0:s<0?-1:1)|(63&l)<<2,l>>6),this.lineClips&&this.layoutVertexArray2.emplaceBack((this.scaledDistance-this.lineClips.start)/(this.lineClips.end-this.lineClips.start),this.lineClipsArray.length);const u=o.vertexLength++;this.e1>=0&&this.e2>=0&&(this.indexArray.emplaceBack(this.e1,this.e2,u),o.primitiveLength++),a?this.e2=u:this.e1=u;}updateScaledDistance(){this.scaledDistance=this.lineClips?this.lineClips.start+(this.lineClips.end-this.lineClips.start)*this.distance/this.totalDistance:this.distance;}updateDistance(t,e){this.distance+=t.dist(e),this.updateScaledDistance();}}let al,sl;In("LineBucket",il,{omit:["layers","patternFeatures"]});var ol={get paint(){return sl=sl||new pi({"line-opacity":new li(q.paint_line["line-opacity"]),"line-color":new li(q.paint_line["line-color"]),"line-translate":new oi(q.paint_line["line-translate"]),"line-translate-anchor":new oi(q.paint_line["line-translate-anchor"]),"line-width":new li(q.paint_line["line-width"]),"line-gap-width":new li(q.paint_line["line-gap-width"]),"line-offset":new li(q.paint_line["line-offset"]),"line-blur":new li(q.paint_line["line-blur"]),"line-dasharray":new ci(q.paint_line["line-dasharray"]),"line-pattern":new ui(q.paint_line["line-pattern"]),"line-gradient":new hi(q.paint_line["line-gradient"])})},get layout(){return al=al||new pi({"line-cap":new oi(q.layout_line["line-cap"]),"line-join":new li(q.layout_line["line-join"]),"line-miter-limit":new oi(q.layout_line["line-miter-limit"]),"line-round-limit":new oi(q.layout_line["line-round-limit"]),"line-sort-key":new li(q.layout_line["line-sort-key"])})}};class ll extends li{possiblyEvaluate(t,e){return e=new Wn(Math.floor(e.zoom),{now:e.now,fadeDuration:e.fadeDuration,zoomHistory:e.zoomHistory,transition:e.transition}),super.possiblyEvaluate(t,e)}evaluate(t,e,r,n){return e=p({},e,{zoom:Math.floor(e.zoom)}),super.evaluate(t,e,r,n)}}let ul;class cl extends di{constructor(t){super(t,ol),this.gradientVersion=0,ul||(ul=new ll(ol.paint.properties["line-width"].specification),ul.useIntegerZoom=!0);}_handleSpecialPaintPropertyUpdate(t){"line-gradient"===t&&(this.stepInterpolant=this._transitionablePaint._values["line-gradient"].value.expression._styleExpression.expression instanceof Ve,this.gradientVersion=(this.gradientVersion+1)%Number.MAX_SAFE_INTEGER);}gradientExpression(){return this._transitionablePaint._values["line-gradient"].value.expression}recalculate(t,e){super.recalculate(t,e),this.paint._values["line-floorwidth"]=ul.possiblyEvaluate(this._transitioningPaint._values["line-width"].value,t);}createBucket(t){return new il(t)}queryRadius(t){const e=t,r=hl(os("line-width",this,e),os("line-gap-width",this,e)),n=os("line-offset",this,e);return r/2+Math.abs(n)+ls(this.paint.get("line-translate"))}queryIntersectsFeature(t,e,r,n,a,s,o){const l=us(t,this.paint.get("line-translate"),this.paint.get("line-translate-anchor"),s.angle,o),u=o/2*hl(this.paint.get("line-width").evaluate(e,r),this.paint.get("line-gap-width").evaluate(e,r)),c=this.paint.get("line-offset").evaluate(e,r);return c&&(n=function(t,e){const r=[];for(let n=0;n<t.length;n++){const a=t[n],s=[];for(let t=0;t<a.length;t++){const r=a[t-1],n=a[t],o=a[t+1],l=0===t?new i(0,0):n.sub(r)._unit()._perp(),u=t===a.length-1?new i(0,0):o.sub(n)._unit()._perp(),c=l._add(u)._unit(),h=c.x*u.x+c.y*u.y;0!==h&&c._mult(1/h),s.push(c._mult(e)._add(n));}r.push(s);}return r}(n,c*o)),function(t,e,r){for(let n=0;n<e.length;n++){const i=e[n];if(t.length>=3)for(let e=0;e<i.length;e++)if(as(t,i[e]))return !0;if(Qa(t,i,r))return !0}return !1}(l,n,u)}isTileClipped(){return !0}}function hl(t,e){return e>0?e+2*t:t}const pl=xi([{name:"a_pos_offset",components:4,type:"Int16"},{name:"a_data",components:4,type:"Uint16"},{name:"a_pixeloffset",components:4,type:"Int16"}],4),fl=xi([{name:"a_projected_pos",components:3,type:"Float32"}],4);xi([{name:"a_fade_opacity",components:1,type:"Uint32"}],4);const dl=xi([{name:"a_placed",components:2,type:"Uint8"},{name:"a_shift",components:2,type:"Float32"}]);xi([{type:"Int16",name:"anchorPointX"},{type:"Int16",name:"anchorPointY"},{type:"Int16",name:"x1"},{type:"Int16",name:"y1"},{type:"Int16",name:"x2"},{type:"Int16",name:"y2"},{type:"Uint32",name:"featureIndex"},{type:"Uint16",name:"sourceLayerIndex"},{type:"Uint16",name:"bucketIndex"}]);const yl=xi([{name:"a_pos",components:2,type:"Int16"},{name:"a_anchor_pos",components:2,type:"Int16"},{name:"a_extrude",components:2,type:"Int16"}],4),ml=xi([{name:"a_pos",components:2,type:"Float32"},{name:"a_radius",components:1,type:"Float32"},{name:"a_flags",components:2,type:"Int16"}],4);function gl(t,e,r){return t.sections.forEach((t=>{t.text=function(t,e,r){const n=e.layout.get("text-transform").evaluate(r,{});return "uppercase"===n?t=t.toLocaleUpperCase():"lowercase"===n&&(t=t.toLocaleLowerCase()),Hn.applyArabicShaping&&(t=Hn.applyArabicShaping(t)),t}(t.text,e,r);})),t}xi([{name:"triangle",components:3,type:"Uint16"}]),xi([{type:"Int16",name:"anchorX"},{type:"Int16",name:"anchorY"},{type:"Uint16",name:"glyphStartIndex"},{type:"Uint16",name:"numGlyphs"},{type:"Uint32",name:"vertexStartIndex"},{type:"Uint32",name:"lineStartIndex"},{type:"Uint32",name:"lineLength"},{type:"Uint16",name:"segment"},{type:"Uint16",name:"lowerSize"},{type:"Uint16",name:"upperSize"},{type:"Float32",name:"lineOffsetX"},{type:"Float32",name:"lineOffsetY"},{type:"Uint8",name:"writingMode"},{type:"Uint8",name:"placedOrientation"},{type:"Uint8",name:"hidden"},{type:"Uint32",name:"crossTileID"},{type:"Int16",name:"associatedIconIndex"}]),xi([{type:"Int16",name:"anchorX"},{type:"Int16",name:"anchorY"},{type:"Int16",name:"rightJustifiedTextSymbolIndex"},{type:"Int16",name:"centerJustifiedTextSymbolIndex"},{type:"Int16",name:"leftJustifiedTextSymbolIndex"},{type:"Int16",name:"verticalPlacedTextSymbolIndex"},{type:"Int16",name:"placedIconSymbolIndex"},{type:"Int16",name:"verticalPlacedIconSymbolIndex"},{type:"Uint16",name:"key"},{type:"Uint16",name:"textBoxStartIndex"},{type:"Uint16",name:"textBoxEndIndex"},{type:"Uint16",name:"verticalTextBoxStartIndex"},{type:"Uint16",name:"verticalTextBoxEndIndex"},{type:"Uint16",name:"iconBoxStartIndex"},{type:"Uint16",name:"iconBoxEndIndex"},{type:"Uint16",name:"verticalIconBoxStartIndex"},{type:"Uint16",name:"verticalIconBoxEndIndex"},{type:"Uint16",name:"featureIndex"},{type:"Uint16",name:"numHorizontalGlyphVertices"},{type:"Uint16",name:"numVerticalGlyphVertices"},{type:"Uint16",name:"numIconVertices"},{type:"Uint16",name:"numVerticalIconVertices"},{type:"Uint16",name:"useRuntimeCollisionCircles"},{type:"Uint32",name:"crossTileID"},{type:"Float32",name:"textBoxScale"},{type:"Float32",components:2,name:"textOffset"},{type:"Float32",name:"collisionCircleDiameter"}]),xi([{type:"Float32",name:"offsetX"}]),xi([{type:"Int16",name:"x"},{type:"Int16",name:"y"},{type:"Int16",name:"tileUnitDistanceFromAnchor"}]);const xl={"!":"︕","#":"＃",$:"＄","%":"％","&":"＆","(":"︵",")":"︶","*":"＊","+":"＋",",":"︐","-":"︲",".":"・","/":"／",":":"︓",";":"︔","<":"︿","=":"＝",">":"﹀","?":"︖","@":"＠","[":"﹇","\\":"＼","]":"﹈","^":"＾",_:"︳","`":"｀","{":"︷","|":"―","}":"︸","~":"～","¢":"￠","£":"￡","¥":"￥","¦":"￤","¬":"￢","¯":"￣","–":"︲","—":"︱","‘":"﹃","’":"﹄","“":"﹁","”":"﹂","…":"︙","‧":"・","₩":"￦","、":"︑","。":"︒","〈":"︿","〉":"﹀","《":"︽","》":"︾","「":"﹁","」":"﹂","『":"﹃","』":"﹄","【":"︻","】":"︼","〔":"︹","〕":"︺","〖":"︗","〗":"︘","！":"︕","（":"︵","）":"︶","，":"︐","－":"︲","．":"・","：":"︓","；":"︔","＜":"︿","＞":"﹀","？":"︖","［":"﹇","］":"﹈","＿":"︳","｛":"︷","｜":"―","｝":"︸","｟":"︵","｠":"︶","｡":"︒","｢":"﹁","｣":"﹂"};var vl=24,bl=Al,wl=function(t,e,r,n,i){var a,s,o=8*i-n-1,l=(1<<o)-1,u=l>>1,c=-7,h=r?i-1:0,p=r?-1:1,f=t[e+h];for(h+=p,a=f&(1<<-c)-1,f>>=-c,c+=o;c>0;a=256*a+t[e+h],h+=p,c-=8);for(s=a&(1<<-c)-1,a>>=-c,c+=n;c>0;s=256*s+t[e+h],h+=p,c-=8);if(0===a)a=1-u;else {if(a===l)return s?NaN:1/0*(f?-1:1);s+=Math.pow(2,n),a-=u;}return (f?-1:1)*s*Math.pow(2,a-n)},_l=function(t,e,r,n,i,a){var s,o,l,u=8*a-i-1,c=(1<<u)-1,h=c>>1,p=23===i?Math.pow(2,-24)-Math.pow(2,-77):0,f=n?0:a-1,d=n?1:-1,y=e<0||0===e&&1/e<0?1:0;for(e=Math.abs(e),isNaN(e)||e===1/0?(o=isNaN(e)?1:0,s=c):(s=Math.floor(Math.log(e)/Math.LN2),e*(l=Math.pow(2,-s))<1&&(s--,l*=2),(e+=s+h>=1?p/l:p*Math.pow(2,1-h))*l>=2&&(s++,l/=2),s+h>=c?(o=0,s=c):s+h>=1?(o=(e*l-1)*Math.pow(2,i),s+=h):(o=e*Math.pow(2,h-1)*Math.pow(2,i),s=0));i>=8;t[r+f]=255&o,f+=d,o/=256,i-=8);for(s=s<<i|o,u+=i;u>0;t[r+f]=255&s,f+=d,s/=256,u-=8);t[r+f-d]|=128*y;};function Al(t){this.buf=ArrayBuffer.isView&&ArrayBuffer.isView(t)?t:new Uint8Array(t||0),this.pos=0,this.type=0,this.length=this.buf.length;}Al.Varint=0,Al.Fixed64=1,Al.Bytes=2,Al.Fixed32=5;var kl=4294967296,Sl=1/kl,Il="undefined"==typeof TextDecoder?null:new TextDecoder("utf8");function zl(t){return t.type===Al.Bytes?t.readVarint()+t.pos:t.pos+1}function Ml(t,e,r){return r?4294967296*e+(t>>>0):4294967296*(e>>>0)+(t>>>0)}function Pl(t,e,r){var n=e<=16383?1:e<=2097151?2:e<=268435455?3:Math.floor(Math.log(e)/(7*Math.LN2));r.realloc(n);for(var i=r.pos-1;i>=t;i--)r.buf[i+n]=r.buf[i];}function Bl(t,e){for(var r=0;r<t.length;r++)e.writeVarint(t[r]);}function Cl(t,e){for(var r=0;r<t.length;r++)e.writeSVarint(t[r]);}function Vl(t,e){for(var r=0;r<t.length;r++)e.writeFloat(t[r]);}function El(t,e){for(var r=0;r<t.length;r++)e.writeDouble(t[r]);}function Fl(t,e){for(var r=0;r<t.length;r++)e.writeBoolean(t[r]);}function Tl(t,e){for(var r=0;r<t.length;r++)e.writeFixed32(t[r]);}function Ll(t,e){for(var r=0;r<t.length;r++)e.writeSFixed32(t[r]);}function $l(t,e){for(var r=0;r<t.length;r++)e.writeFixed64(t[r]);}function Dl(t,e){for(var r=0;r<t.length;r++)e.writeSFixed64(t[r]);}function Ol(t,e){return (t[e]|t[e+1]<<8|t[e+2]<<16)+16777216*t[e+3]}function Ul(t,e,r){t[r]=e,t[r+1]=e>>>8,t[r+2]=e>>>16,t[r+3]=e>>>24;}function Rl(t,e){return (t[e]|t[e+1]<<8|t[e+2]<<16)+(t[e+3]<<24)}Al.prototype={destroy:function(){this.buf=null;},readFields:function(t,e,r){for(r=r||this.length;this.pos<r;){var n=this.readVarint(),i=n>>3,a=this.pos;this.type=7&n,t(i,e,this),this.pos===a&&this.skip(n);}return e},readMessage:function(t,e){return this.readFields(t,e,this.readVarint()+this.pos)},readFixed32:function(){var t=Ol(this.buf,this.pos);return this.pos+=4,t},readSFixed32:function(){var t=Rl(this.buf,this.pos);return this.pos+=4,t},readFixed64:function(){var t=Ol(this.buf,this.pos)+Ol(this.buf,this.pos+4)*kl;return this.pos+=8,t},readSFixed64:function(){var t=Ol(this.buf,this.pos)+Rl(this.buf,this.pos+4)*kl;return this.pos+=8,t},readFloat:function(){var t=wl(this.buf,this.pos,!0,23,4);return this.pos+=4,t},readDouble:function(){var t=wl(this.buf,this.pos,!0,52,8);return this.pos+=8,t},readVarint:function(t){var e,r,n=this.buf;return e=127&(r=n[this.pos++]),r<128?e:(e|=(127&(r=n[this.pos++]))<<7,r<128?e:(e|=(127&(r=n[this.pos++]))<<14,r<128?e:(e|=(127&(r=n[this.pos++]))<<21,r<128?e:function(t,e,r){var n,i,a=r.buf;if(n=(112&(i=a[r.pos++]))>>4,i<128)return Ml(t,n,e);if(n|=(127&(i=a[r.pos++]))<<3,i<128)return Ml(t,n,e);if(n|=(127&(i=a[r.pos++]))<<10,i<128)return Ml(t,n,e);if(n|=(127&(i=a[r.pos++]))<<17,i<128)return Ml(t,n,e);if(n|=(127&(i=a[r.pos++]))<<24,i<128)return Ml(t,n,e);if(n|=(1&(i=a[r.pos++]))<<31,i<128)return Ml(t,n,e);throw new Error("Expected varint not more than 10 bytes")}(e|=(15&(r=n[this.pos]))<<28,t,this))))},readVarint64:function(){return this.readVarint(!0)},readSVarint:function(){var t=this.readVarint();return t%2==1?(t+1)/-2:t/2},readBoolean:function(){return Boolean(this.readVarint())},readString:function(){var t=this.readVarint()+this.pos,e=this.pos;return this.pos=t,t-e>=12&&Il?function(t,e,r){return Il.decode(t.subarray(e,r))}(this.buf,e,t):function(t,e,r){for(var n="",i=e;i<r;){var a,s,o,l=t[i],u=null,c=l>239?4:l>223?3:l>191?2:1;if(i+c>r)break;1===c?l<128&&(u=l):2===c?128==(192&(a=t[i+1]))&&(u=(31&l)<<6|63&a)<=127&&(u=null):3===c?(s=t[i+2],128==(192&(a=t[i+1]))&&128==(192&s)&&((u=(15&l)<<12|(63&a)<<6|63&s)<=2047||u>=55296&&u<=57343)&&(u=null)):4===c&&(s=t[i+2],o=t[i+3],128==(192&(a=t[i+1]))&&128==(192&s)&&128==(192&o)&&((u=(15&l)<<18|(63&a)<<12|(63&s)<<6|63&o)<=65535||u>=1114112)&&(u=null)),null===u?(u=65533,c=1):u>65535&&(u-=65536,n+=String.fromCharCode(u>>>10&1023|55296),u=56320|1023&u),n+=String.fromCharCode(u),i+=c;}return n}(this.buf,e,t)},readBytes:function(){var t=this.readVarint()+this.pos,e=this.buf.subarray(this.pos,t);return this.pos=t,e},readPackedVarint:function(t,e){if(this.type!==Al.Bytes)return t.push(this.readVarint(e));var r=zl(this);for(t=t||[];this.pos<r;)t.push(this.readVarint(e));return t},readPackedSVarint:function(t){if(this.type!==Al.Bytes)return t.push(this.readSVarint());var e=zl(this);for(t=t||[];this.pos<e;)t.push(this.readSVarint());return t},readPackedBoolean:function(t){if(this.type!==Al.Bytes)return t.push(this.readBoolean());var e=zl(this);for(t=t||[];this.pos<e;)t.push(this.readBoolean());return t},readPackedFloat:function(t){if(this.type!==Al.Bytes)return t.push(this.readFloat());var e=zl(this);for(t=t||[];this.pos<e;)t.push(this.readFloat());return t},readPackedDouble:function(t){if(this.type!==Al.Bytes)return t.push(this.readDouble());var e=zl(this);for(t=t||[];this.pos<e;)t.push(this.readDouble());return t},readPackedFixed32:function(t){if(this.type!==Al.Bytes)return t.push(this.readFixed32());var e=zl(this);for(t=t||[];this.pos<e;)t.push(this.readFixed32());return t},readPackedSFixed32:function(t){if(this.type!==Al.Bytes)return t.push(this.readSFixed32());var e=zl(this);for(t=t||[];this.pos<e;)t.push(this.readSFixed32());return t},readPackedFixed64:function(t){if(this.type!==Al.Bytes)return t.push(this.readFixed64());var e=zl(this);for(t=t||[];this.pos<e;)t.push(this.readFixed64());return t},readPackedSFixed64:function(t){if(this.type!==Al.Bytes)return t.push(this.readSFixed64());var e=zl(this);for(t=t||[];this.pos<e;)t.push(this.readSFixed64());return t},skip:function(t){var e=7&t;if(e===Al.Varint)for(;this.buf[this.pos++]>127;);else if(e===Al.Bytes)this.pos=this.readVarint()+this.pos;else if(e===Al.Fixed32)this.pos+=4;else {if(e!==Al.Fixed64)throw new Error("Unimplemented type: "+e);this.pos+=8;}},writeTag:function(t,e){this.writeVarint(t<<3|e);},realloc:function(t){for(var e=this.length||16;e<this.pos+t;)e*=2;if(e!==this.length){var r=new Uint8Array(e);r.set(this.buf),this.buf=r,this.length=e;}},finish:function(){return this.length=this.pos,this.pos=0,this.buf.subarray(0,this.length)},writeFixed32:function(t){this.realloc(4),Ul(this.buf,t,this.pos),this.pos+=4;},writeSFixed32:function(t){this.realloc(4),Ul(this.buf,t,this.pos),this.pos+=4;},writeFixed64:function(t){this.realloc(8),Ul(this.buf,-1&t,this.pos),Ul(this.buf,Math.floor(t*Sl),this.pos+4),this.pos+=8;},writeSFixed64:function(t){this.realloc(8),Ul(this.buf,-1&t,this.pos),Ul(this.buf,Math.floor(t*Sl),this.pos+4),this.pos+=8;},writeVarint:function(t){(t=+t||0)>268435455||t<0?function(t,e){var r,n;if(t>=0?(r=t%4294967296|0,n=t/4294967296|0):(n=~(-t/4294967296),4294967295^(r=~(-t%4294967296))?r=r+1|0:(r=0,n=n+1|0)),t>=0x10000000000000000||t<-0x10000000000000000)throw new Error("Given varint doesn't fit into 10 bytes");e.realloc(10),function(t,e,r){r.buf[r.pos++]=127&t|128,t>>>=7,r.buf[r.pos++]=127&t|128,t>>>=7,r.buf[r.pos++]=127&t|128,t>>>=7,r.buf[r.pos++]=127&t|128,r.buf[r.pos]=127&(t>>>=7);}(r,0,e),function(t,e){var r=(7&t)<<4;e.buf[e.pos++]|=r|((t>>>=3)?128:0),t&&(e.buf[e.pos++]=127&t|((t>>>=7)?128:0),t&&(e.buf[e.pos++]=127&t|((t>>>=7)?128:0),t&&(e.buf[e.pos++]=127&t|((t>>>=7)?128:0),t&&(e.buf[e.pos++]=127&t|((t>>>=7)?128:0),t&&(e.buf[e.pos++]=127&t)))));}(n,e);}(t,this):(this.realloc(4),this.buf[this.pos++]=127&t|(t>127?128:0),t<=127||(this.buf[this.pos++]=127&(t>>>=7)|(t>127?128:0),t<=127||(this.buf[this.pos++]=127&(t>>>=7)|(t>127?128:0),t<=127||(this.buf[this.pos++]=t>>>7&127))));},writeSVarint:function(t){this.writeVarint(t<0?2*-t-1:2*t);},writeBoolean:function(t){this.writeVarint(Boolean(t));},writeString:function(t){t=String(t),this.realloc(4*t.length),this.pos++;var e=this.pos;this.pos=function(t,e,r){for(var n,i,a=0;a<e.length;a++){if((n=e.charCodeAt(a))>55295&&n<57344){if(!i){n>56319||a+1===e.length?(t[r++]=239,t[r++]=191,t[r++]=189):i=n;continue}if(n<56320){t[r++]=239,t[r++]=191,t[r++]=189,i=n;continue}n=i-55296<<10|n-56320|65536,i=null;}else i&&(t[r++]=239,t[r++]=191,t[r++]=189,i=null);n<128?t[r++]=n:(n<2048?t[r++]=n>>6|192:(n<65536?t[r++]=n>>12|224:(t[r++]=n>>18|240,t[r++]=n>>12&63|128),t[r++]=n>>6&63|128),t[r++]=63&n|128);}return r}(this.buf,t,this.pos);var r=this.pos-e;r>=128&&Pl(e,r,this),this.pos=e-1,this.writeVarint(r),this.pos+=r;},writeFloat:function(t){this.realloc(4),_l(this.buf,t,this.pos,!0,23,4),this.pos+=4;},writeDouble:function(t){this.realloc(8),_l(this.buf,t,this.pos,!0,52,8),this.pos+=8;},writeBytes:function(t){var e=t.length;this.writeVarint(e),this.realloc(e);for(var r=0;r<e;r++)this.buf[this.pos++]=t[r];},writeRawMessage:function(t,e){this.pos++;var r=this.pos;t(e,this);var n=this.pos-r;n>=128&&Pl(r,n,this),this.pos=r-1,this.writeVarint(n),this.pos+=n;},writeMessage:function(t,e,r){this.writeTag(t,Al.Bytes),this.writeRawMessage(e,r);},writePackedVarint:function(t,e){e.length&&this.writeMessage(t,Bl,e);},writePackedSVarint:function(t,e){e.length&&this.writeMessage(t,Cl,e);},writePackedBoolean:function(t,e){e.length&&this.writeMessage(t,Fl,e);},writePackedFloat:function(t,e){e.length&&this.writeMessage(t,Vl,e);},writePackedDouble:function(t,e){e.length&&this.writeMessage(t,El,e);},writePackedFixed32:function(t,e){e.length&&this.writeMessage(t,Tl,e);},writePackedSFixed32:function(t,e){e.length&&this.writeMessage(t,Ll,e);},writePackedFixed64:function(t,e){e.length&&this.writeMessage(t,$l,e);},writePackedSFixed64:function(t,e){e.length&&this.writeMessage(t,Dl,e);},writeBytesField:function(t,e){this.writeTag(t,Al.Bytes),this.writeBytes(e);},writeFixed32Field:function(t,e){this.writeTag(t,Al.Fixed32),this.writeFixed32(e);},writeSFixed32Field:function(t,e){this.writeTag(t,Al.Fixed32),this.writeSFixed32(e);},writeFixed64Field:function(t,e){this.writeTag(t,Al.Fixed64),this.writeFixed64(e);},writeSFixed64Field:function(t,e){this.writeTag(t,Al.Fixed64),this.writeSFixed64(e);},writeVarintField:function(t,e){this.writeTag(t,Al.Varint),this.writeVarint(e);},writeSVarintField:function(t,e){this.writeTag(t,Al.Varint),this.writeSVarint(e);},writeStringField:function(t,e){this.writeTag(t,Al.Bytes),this.writeString(e);},writeFloatField:function(t,e){this.writeTag(t,Al.Fixed32),this.writeFloat(e);},writeDoubleField:function(t,e){this.writeTag(t,Al.Fixed64),this.writeDouble(e);},writeBooleanField:function(t,e){this.writeVarintField(t,Boolean(e));}};var ql=e(bl);const jl=3;function Nl(t,e,r){1===t&&r.readMessage(Zl,e);}function Zl(t,e,r){if(3===t){const{id:t,bitmap:n,width:i,height:a,left:s,top:o,advance:l}=r.readMessage(Kl,{});e.push({id:t,bitmap:new Ms({width:i+2*jl,height:a+2*jl},n),metrics:{width:i,height:a,left:s,top:o,advance:l}});}}function Kl(t,e,r){1===t?e.id=r.readVarint():2===t?e.bitmap=r.readBytes():3===t?e.width=r.readVarint():4===t?e.height=r.readVarint():5===t?e.left=r.readSVarint():6===t?e.top=r.readSVarint():7===t&&(e.advance=r.readVarint());}const Gl=jl;function Jl(t){let e=0,r=0;for(const n of t)e+=n.w*n.h,r=Math.max(r,n.w);t.sort(((t,e)=>e.h-t.h));const n=[{x:0,y:0,w:Math.max(Math.ceil(Math.sqrt(e/.95)),r),h:1/0}];let i=0,a=0;for(const e of t)for(let t=n.length-1;t>=0;t--){const r=n[t];if(!(e.w>r.w||e.h>r.h)){if(e.x=r.x,e.y=r.y,a=Math.max(a,e.y+e.h),i=Math.max(i,e.x+e.w),e.w===r.w&&e.h===r.h){const e=n.pop();t<n.length&&(n[t]=e);}else e.h===r.h?(r.x+=e.w,r.w-=e.w):e.w===r.w?(r.y+=e.h,r.h-=e.h):(n.push({x:r.x+e.w,y:r.y,w:r.w-e.w,h:e.h}),r.y+=e.h,r.h-=e.h);break}}return {w:i,h:a,fill:e/(i*a)||0}}const Xl=1;class Yl{constructor(t,{pixelRatio:e,version:r,stretchX:n,stretchY:i,content:a}){this.paddedRect=t,this.pixelRatio=e,this.stretchX=n,this.stretchY=i,this.content=a,this.version=r;}get tl(){return [this.paddedRect.x+Xl,this.paddedRect.y+Xl]}get br(){return [this.paddedRect.x+this.paddedRect.w-Xl,this.paddedRect.y+this.paddedRect.h-Xl]}get tlbr(){return this.tl.concat(this.br)}get displaySize(){return [(this.paddedRect.w-2*Xl)/this.pixelRatio,(this.paddedRect.h-2*Xl)/this.pixelRatio]}}class Hl{constructor(t,e){const r={},n={};this.haveRenderCallbacks=[];const i=[];this.addImages(t,r,i),this.addImages(e,n,i);const{w:a,h:s}=Jl(i),o=new Ps({width:a||1,height:s||1});for(const e in t){const n=t[e],i=r[e].paddedRect;Ps.copy(n.data,o,{x:0,y:0},{x:i.x+Xl,y:i.y+Xl},n.data);}for(const t in e){const r=e[t],i=n[t].paddedRect,a=i.x+Xl,s=i.y+Xl,l=r.data.width,u=r.data.height;Ps.copy(r.data,o,{x:0,y:0},{x:a,y:s},r.data),Ps.copy(r.data,o,{x:0,y:u-1},{x:a,y:s-1},{width:l,height:1}),Ps.copy(r.data,o,{x:0,y:0},{x:a,y:s+u},{width:l,height:1}),Ps.copy(r.data,o,{x:l-1,y:0},{x:a-1,y:s},{width:1,height:u}),Ps.copy(r.data,o,{x:0,y:0},{x:a+l,y:s},{width:1,height:u});}this.image=o,this.iconPositions=r,this.patternPositions=n;}addImages(t,e,r){for(const n in t){const i=t[n],a={x:0,y:0,w:i.data.width+2*Xl,h:i.data.height+2*Xl};r.push(a),e[n]=new Yl(a,i),i.hasRenderCallback&&this.haveRenderCallbacks.push(n);}}patchUpdatedImages(t,e){t.dispatchRenderCallbacks(this.haveRenderCallbacks);for(const r in t.updatedImages)this.patchUpdatedImage(this.iconPositions[r],t.getImage(r),e),this.patchUpdatedImage(this.patternPositions[r],t.getImage(r),e);}patchUpdatedImage(t,e,r){if(!t||!e)return;if(t.version===e.version)return;t.version=e.version;const[n,i]=t.tl;r.update(e.data,void 0,{x:n,y:i});}}var Wl;In("ImagePosition",Yl),In("ImageAtlas",Hl),t.WritingMode=void 0,(Wl=t.WritingMode||(t.WritingMode={}))[Wl.none=0]="none",Wl[Wl.horizontal=1]="horizontal",Wl[Wl.vertical=2]="vertical",Wl[Wl.horizontalOnly=3]="horizontalOnly";const Ql=-17;class tu{constructor(){this.scale=1,this.fontStack="",this.imageName=null;}static forText(t,e){const r=new tu;return r.scale=t||1,r.fontStack=e,r}static forImage(t){const e=new tu;return e.imageName=t,e}}class eu{constructor(){this.text="",this.sectionIndex=[],this.sections=[],this.imageSectionID=null;}static fromFeature(t,e){const r=new eu;for(let n=0;n<t.sections.length;n++){const i=t.sections[n];i.image?r.addImageSection(i):r.addTextSection(i,e);}return r}length(){return this.text.length}getSection(t){return this.sections[this.sectionIndex[t]]}getSectionIndex(t){return this.sectionIndex[t]}getCharCode(t){return this.text.charCodeAt(t)}verticalizePunctuation(){this.text=function(t){let e="";for(let r=0;r<t.length;r++){const n=t.charCodeAt(r+1)||null,i=t.charCodeAt(r-1)||null;e+=n&&Ln(n)&&!xl[t[r+1]]||i&&Ln(i)&&!xl[t[r-1]]||!xl[t[r]]?t[r]:xl[t[r]];}return e}(this.text);}trim(){let t=0;for(let e=0;e<this.text.length&&nu[this.text.charCodeAt(e)];e++)t++;let e=this.text.length;for(let r=this.text.length-1;r>=0&&r>=t&&nu[this.text.charCodeAt(r)];r--)e--;this.text=this.text.substring(t,e),this.sectionIndex=this.sectionIndex.slice(t,e);}substring(t,e){const r=new eu;return r.text=this.text.substring(t,e),r.sectionIndex=this.sectionIndex.slice(t,e),r.sections=this.sections,r}toString(){return this.text}getMaxScale(){return this.sectionIndex.reduce(((t,e)=>Math.max(t,this.sections[e].scale)),0)}addTextSection(t,e){this.text+=t.text,this.sections.push(tu.forText(t.scale,t.fontStack||e));const r=this.sections.length-1;for(let e=0;e<t.text.length;++e)this.sectionIndex.push(r);}addImageSection(t){const e=t.image?t.image.name:"";if(0===e.length)return void x("Can't add FormattedSection with an empty image.");const r=this.getNextImageSectionCharCode();r?(this.text+=String.fromCharCode(r),this.sections.push(tu.forImage(e)),this.sectionIndex.push(this.sections.length-1)):x("Reached maximum number of images 6401");}getNextImageSectionCharCode(){return this.imageSectionID?this.imageSectionID>=63743?null:++this.imageSectionID:(this.imageSectionID=57344,this.imageSectionID)}}function ru(e,r,n,i,a,s,o,l,u,c,h,p,f,d,y,m){const g=eu.fromFeature(e,a);let x;p===t.WritingMode.vertical&&g.verticalizePunctuation();const{processBidirectionalText:v,processStyledBidirectionalText:b}=Hn;if(v&&1===g.sections.length){x=[];const t=v(g.toString(),cu(g,c,s,r,i,d,y));for(const e of t){const t=new eu;t.text=e,t.sections=g.sections;for(let r=0;r<e.length;r++)t.sectionIndex.push(0);x.push(t);}}else if(b){x=[];const t=b(g.text,g.sectionIndex,cu(g,c,s,r,i,d,y));for(const e of t){const t=new eu;t.text=e[0],t.sectionIndex=e[1],t.sections=g.sections,x.push(t);}}else x=function(t,e){const r=[],n=t.text;let i=0;for(const n of e)r.push(t.substring(i,n)),i=n;return i<n.length&&r.push(t.substring(i,n.length)),r}(g,cu(g,c,s,r,i,d,y));const w=[],_={positionedLines:w,text:g.toString(),top:h[1],bottom:h[1],left:h[0],right:h[0],writingMode:p,iconsInText:!1,verticalizable:!1};return function(e,r,n,i,a,s,o,l,u,c,h,p){let f=0,d=Ql,y=0,m=0;const g="right"===l?1:"left"===l?0:.5;let x=0;for(const o of a){o.trim();const a=o.getMaxScale(),l=(a-1)*vl,b={positionedGlyphs:[],lineOffset:0};e.positionedLines[x]=b;const w=b.positionedGlyphs;let _=0;if(!o.length()){d+=s,++x;continue}for(let s=0;s<o.length();s++){const y=o.getSection(s),m=o.getSectionIndex(s),g=o.getCharCode(s);let x=0,b=null,A=null,k=null,S=vl;const I=!(u===t.WritingMode.horizontal||!h&&!Tn(g)||h&&(nu[g]||(v=g,Cn.Arabic(v)||Cn["Arabic Supplement"](v)||Cn["Arabic Extended-A"](v)||Cn["Arabic Presentation Forms-A"](v)||Cn["Arabic Presentation Forms-B"](v))));if(y.imageName){const t=i[y.imageName];if(!t)continue;k=y.imageName,e.iconsInText=e.iconsInText||!0,A=t.paddedRect;const r=t.displaySize;y.scale=y.scale*vl/p,b={width:r[0],height:r[1],left:Xl,top:-Gl,advance:I?r[1]:r[0]},x=l+(vl-r[1]*y.scale),S=b.advance;const n=I?r[0]*y.scale-vl*a:r[1]*y.scale-vl*a;n>0&&n>_&&(_=n);}else {const t=n[y.fontStack],e=t&&t[g];if(e&&e.rect)A=e.rect,b=e.metrics;else {const t=r[y.fontStack],e=t&&t[g];if(!e)continue;b=e.metrics;}x=(a-y.scale)*vl;}I?(e.verticalizable=!0,w.push({glyph:g,imageName:k,x:f,y:d+x,vertical:I,scale:y.scale,fontStack:y.fontStack,sectionIndex:m,metrics:b,rect:A}),f+=S*y.scale+c):(w.push({glyph:g,imageName:k,x:f,y:d+x,vertical:I,scale:y.scale,fontStack:y.fontStack,sectionIndex:m,metrics:b,rect:A}),f+=b.advance*y.scale+c);}0!==w.length&&(y=Math.max(f-c,y),pu(w,0,w.length-1,g,_)),f=0;const A=s*a+_;b.lineOffset=Math.max(_,l),d+=A,m=Math.max(A,m),++x;}var v;const b=d-Ql,{horizontalAlign:w,verticalAlign:_}=hu(o);((function(t,e,r,n,i,a,s,o,l){const u=(e-r)*i;let c=0;c=a!==s?-o*n-Ql:(-n*l+.5)*s;for(const e of t)for(const t of e.positionedGlyphs)t.x+=u,t.y+=c;}))(e.positionedLines,g,w,_,y,m,s,b,a.length),e.top+=-_*b,e.bottom=e.top+b,e.left+=-w*y,e.right=e.left+y;}(_,r,n,i,x,o,l,u,p,c,f,m),!function(t){for(const e of t)if(0!==e.positionedGlyphs.length)return !1;return !0}(w)&&_}const nu={9:!0,10:!0,11:!0,12:!0,13:!0,32:!0},iu={10:!0,32:!0,38:!0,40:!0,41:!0,43:!0,45:!0,47:!0,173:!0,183:!0,8203:!0,8208:!0,8211:!0,8231:!0};function au(t,e,r,n,i,a){if(e.imageName){const t=n[e.imageName];return t?t.displaySize[0]*e.scale*vl/a+i:0}{const n=r[e.fontStack],a=n&&n[t];return a?a.metrics.advance*e.scale+i:0}}function su(t,e,r,n){const i=Math.pow(t-e,2);return n?t<e?i/2:2*i:i+Math.abs(r)*r}function ou(t,e,r){let n=0;return 10===t&&(n-=1e4),r&&(n+=150),40!==t&&65288!==t||(n+=50),41!==e&&65289!==e||(n+=50),n}function lu(t,e,r,n,i,a){let s=null,o=su(e,r,i,a);for(const t of n){const n=su(e-t.x,r,i,a)+t.badness;n<=o&&(s=t,o=n);}return {index:t,x:e,priorBreak:s,badness:o}}function uu(t){return t?uu(t.priorBreak).concat(t.index):[]}function cu(t,e,r,n,i,a,s){if("point"!==a)return [];if(!t)return [];const o=[],l=function(t,e,r,n,i,a){let s=0;for(let r=0;r<t.length();r++){const o=t.getSection(r);s+=au(t.getCharCode(r),o,n,i,e,a);}return s/Math.max(1,Math.ceil(s/r))}(t,e,r,n,i,s),u=t.text.indexOf("​")>=0;let c=0;for(let r=0;r<t.length();r++){const a=t.getSection(r),p=t.getCharCode(r);if(nu[p]||(c+=au(p,a,n,i,e,s)),r<t.length()-1){const e=!((h=p)<11904||!(Cn["Bopomofo Extended"](h)||Cn.Bopomofo(h)||Cn["CJK Compatibility Forms"](h)||Cn["CJK Compatibility Ideographs"](h)||Cn["CJK Compatibility"](h)||Cn["CJK Radicals Supplement"](h)||Cn["CJK Strokes"](h)||Cn["CJK Symbols and Punctuation"](h)||Cn["CJK Unified Ideographs Extension A"](h)||Cn["CJK Unified Ideographs"](h)||Cn["Enclosed CJK Letters and Months"](h)||Cn["Halfwidth and Fullwidth Forms"](h)||Cn.Hiragana(h)||Cn["Ideographic Description Characters"](h)||Cn["Kangxi Radicals"](h)||Cn["Katakana Phonetic Extensions"](h)||Cn.Katakana(h)||Cn["Vertical Forms"](h)||Cn["Yi Radicals"](h)||Cn["Yi Syllables"](h)));(iu[p]||e||a.imageName)&&o.push(lu(r+1,c,l,o,ou(p,t.getCharCode(r+1),e&&u),!1));}}var h;return uu(lu(t.length(),c,l,o,0,!0))}function hu(t){let e=.5,r=.5;switch(t){case"right":case"top-right":case"bottom-right":e=1;break;case"left":case"top-left":case"bottom-left":e=0;}switch(t){case"bottom":case"bottom-right":case"bottom-left":r=1;break;case"top":case"top-right":case"top-left":r=0;}return {horizontalAlign:e,verticalAlign:r}}function pu(t,e,r,n,i){if(!n&&!i)return;const a=t[r],s=(t[r].x+a.metrics.advance*a.scale)*n;for(let n=e;n<=r;n++)t[n].x-=s,t[n].y+=i;}function fu(t,e,r){const{horizontalAlign:n,verticalAlign:i}=hu(r),a=e[0]-t.displaySize[0]*n,s=e[1]-t.displaySize[1]*i;return {image:t,top:s,bottom:s+t.displaySize[1],left:a,right:a+t.displaySize[0]}}function du(t,e,r,n,i,a){const s=t.image;let o;if(s.content){const t=s.content,e=s.pixelRatio||1;o=[t[0]/e,t[1]/e,s.displaySize[0]-t[2]/e,s.displaySize[1]-t[3]/e];}const l=e.left*a,u=e.right*a;let c,h,p,f;"width"===r||"both"===r?(f=i[0]+l-n[3],h=i[0]+u+n[1]):(f=i[0]+(l+u-s.displaySize[0])/2,h=f+s.displaySize[0]);const d=e.top*a,y=e.bottom*a;return "height"===r||"both"===r?(c=i[1]+d-n[0],p=i[1]+y+n[2]):(c=i[1]+(d+y-s.displaySize[1])/2,p=c+s.displaySize[1]),{image:s,top:c,right:h,bottom:p,left:f,collisionPadding:o}}const yu=255,mu=128,gu=yu*mu;function xu(t,e){const{expression:r}=e;if("constant"===r.kind)return {kind:"constant",layoutSize:r.evaluate(new Wn(t+1))};if("source"===r.kind)return {kind:"source"};{const{zoomStops:e,interpolationType:n}=r;let i=0;for(;i<e.length&&e[i]<=t;)i++;i=Math.max(0,i-1);let a=i;for(;a<e.length&&e[a]<t+1;)a++;a=Math.min(e.length-1,a);const s=e[i],o=e[a];return "composite"===r.kind?{kind:"composite",minZoom:s,maxZoom:o,interpolationType:n}:{kind:"camera",minZoom:s,maxZoom:o,minSize:r.evaluate(new Wn(s)),maxSize:r.evaluate(new Wn(o)),interpolationType:n}}}function vu(t,e,r){let n="never";const i=t.get(e);return i?n=i:t.get(r)&&(n="always"),n}const bu=Mo.VectorTileFeature.types,wu=[{name:"a_fade_opacity",components:1,type:"Uint8",offset:0}];function _u(t,e,r,n,i,a,s,o,l,u,c,h,p){const f=o?Math.min(gu,Math.round(o[0])):0,d=o?Math.min(gu,Math.round(o[1])):0;t.emplaceBack(e,r,Math.round(32*n),Math.round(32*i),a,s,(f<<1)+(l?1:0),d,16*u,16*c,256*h,256*p);}function Au(t,e,r){t.emplaceBack(e.x,e.y,r),t.emplaceBack(e.x,e.y,r),t.emplaceBack(e.x,e.y,r),t.emplaceBack(e.x,e.y,r);}function ku(t){for(const e of t.sections)if(On(e.text))return !0;return !1}class Su{constructor(t){this.layoutVertexArray=new aa,this.indexArray=new ca,this.programConfigurations=t,this.segments=new da,this.dynamicLayoutVertexArray=new sa,this.opacityVertexArray=new oa,this.hasVisibleVertices=!1,this.placedSymbolArray=new Zi;}isEmpty(){return 0===this.layoutVertexArray.length&&0===this.indexArray.length&&0===this.dynamicLayoutVertexArray.length&&0===this.opacityVertexArray.length}upload(t,e,r,n){this.isEmpty()||(r&&(this.layoutVertexBuffer=t.createVertexBuffer(this.layoutVertexArray,pl.members),this.indexBuffer=t.createIndexBuffer(this.indexArray,e),this.dynamicLayoutVertexBuffer=t.createVertexBuffer(this.dynamicLayoutVertexArray,fl.members,!0),this.opacityVertexBuffer=t.createVertexBuffer(this.opacityVertexArray,wu,!0),this.opacityVertexBuffer.itemSize=1),(r||n)&&this.programConfigurations.upload(t));}destroy(){this.layoutVertexBuffer&&(this.layoutVertexBuffer.destroy(),this.indexBuffer.destroy(),this.programConfigurations.destroy(),this.segments.destroy(),this.dynamicLayoutVertexBuffer.destroy(),this.opacityVertexBuffer.destroy());}}In("SymbolBuffers",Su);class Iu{constructor(t,e,r){this.layoutVertexArray=new t,this.layoutAttributes=e,this.indexArray=new r,this.segments=new da,this.collisionVertexArray=new ua;}upload(t){this.layoutVertexBuffer=t.createVertexBuffer(this.layoutVertexArray,this.layoutAttributes),this.indexBuffer=t.createIndexBuffer(this.indexArray),this.collisionVertexBuffer=t.createVertexBuffer(this.collisionVertexArray,dl.members,!0);}destroy(){this.layoutVertexBuffer&&(this.layoutVertexBuffer.destroy(),this.indexBuffer.destroy(),this.segments.destroy(),this.collisionVertexBuffer.destroy());}}In("CollisionBuffers",Iu);class zu{constructor(e){this.collisionBoxArray=e.collisionBoxArray,this.zoom=e.zoom,this.overscaling=e.overscaling,this.layers=e.layers,this.layerIds=this.layers.map((t=>t.id)),this.index=e.index,this.pixelRatio=e.pixelRatio,this.sourceLayerIndex=e.sourceLayerIndex,this.hasPattern=!1,this.hasRTLText=!1,this.sortKeyRanges=[],this.collisionCircleArray=[],this.placementInvProjMatrix=ys([]),this.placementViewportMatrix=ys([]);const r=this.layers[0]._unevaluatedLayout._values;this.textSizeData=xu(this.zoom,r["text-size"]),this.iconSizeData=xu(this.zoom,r["icon-size"]);const n=this.layers[0].layout,i=n.get("symbol-sort-key"),a=n.get("symbol-z-order");this.canOverlap="never"!==vu(n,"text-overlap","text-allow-overlap")||"never"!==vu(n,"icon-overlap","icon-allow-overlap")||n.get("text-ignore-placement")||n.get("icon-ignore-placement"),this.sortFeaturesByKey="viewport-y"!==a&&!i.isConstant(),this.sortFeaturesByY=("viewport-y"===a||"auto"===a&&!this.sortFeaturesByKey)&&this.canOverlap,"point"===n.get("symbol-placement")&&(this.writingModes=n.get("text-writing-mode").map((e=>t.WritingMode[e]))),this.stateDependentLayerIds=this.layers.filter((t=>t.isStateDependent())).map((t=>t.id)),this.sourceID=e.sourceID;}createArrays(){this.text=new Su(new Ua(this.layers,this.zoom,(t=>/^text/.test(t)))),this.icon=new Su(new Ua(this.layers,this.zoom,(t=>/^icon/.test(t)))),this.glyphOffsetArray=new Ji,this.lineVertexArray=new Xi,this.symbolInstances=new Gi;}calculateGlyphDependencies(t,e,r,n,i){for(let a=0;a<t.length;a++)if(e[t.charCodeAt(a)]=!0,(r||n)&&i){const r=xl[t.charAt(a)];r&&(e[r.charCodeAt(0)]=!0);}}populate(e,r,n){const i=this.layers[0],a=i.layout,s=a.get("text-font"),o=a.get("text-field"),l=a.get("icon-image"),u=("constant"!==o.value.kind||o.value.value instanceof Zt&&!o.value.value.isEmpty()||o.value.value.toString().length>0)&&("constant"!==s.value.kind||s.value.value.length>0),c="constant"!==l.value.kind||!!l.value.value||Object.keys(l.parameters).length>0,h=a.get("symbol-sort-key");if(this.features=[],!u&&!c)return;const p=r.iconDependencies,f=r.glyphDependencies,d=r.availableImages,y=new Wn(this.zoom);for(const{feature:r,id:o,index:l,sourceLayerIndex:m}of e){const e=i._featureFilter.needGeometry,g=Ga(r,e);if(!i._featureFilter.filter(y,g,n))continue;let x,v;if(e||(g.geometry=Ka(r)),u){const t=i.getValueAndResolveTokens("text-field",g,n,d),e=Zt.factory(t);ku(e)&&(this.hasRTLText=!0),(!this.hasRTLText||"unavailable"===Xn()||this.hasRTLText&&Hn.isParsed())&&(x=gl(e,i,g));}if(c){const t=i.getValueAndResolveTokens("icon-image",g,n,d);v=t instanceof Gt?t:Gt.fromString(t);}if(!x&&!v)continue;const b=this.sortFeaturesByKey?h.evaluate(g,{},n):void 0;if(this.features.push({id:o,text:x,icon:v,index:l,sourceLayerIndex:m,geometry:g.geometry,properties:r.properties,type:bu[r.type],sortKey:b}),v&&(p[v.name]=!0),x){const e=s.evaluate(g,{},n).join(","),r="viewport"!==a.get("text-rotation-alignment")&&"point"!==a.get("symbol-placement");this.allowVerticalPlacement=this.writingModes&&this.writingModes.indexOf(t.WritingMode.vertical)>=0;for(const t of x.sections)if(t.image)p[t.image.name]=!0;else {const n=Vn(x.toString()),i=t.fontStack||e,a=f[i]=f[i]||{};this.calculateGlyphDependencies(t.text,a,r,this.allowVerticalPlacement,n);}}}"line"===a.get("symbol-placement")&&(this.features=function(t){const e={},r={},n=[];let i=0;function a(e){n.push(t[e]),i++;}function s(t,e,i){const a=r[t];return delete r[t],r[e]=a,n[a].geometry[0].pop(),n[a].geometry[0]=n[a].geometry[0].concat(i[0]),a}function o(t,r,i){const a=e[r];return delete e[r],e[t]=a,n[a].geometry[0].shift(),n[a].geometry[0]=i[0].concat(n[a].geometry[0]),a}function l(t,e,r){const n=r?e[0][e[0].length-1]:e[0][0];return `${t}:${n.x}:${n.y}`}for(let u=0;u<t.length;u++){const c=t[u],h=c.geometry,p=c.text?c.text.toString():null;if(!p){a(u);continue}const f=l(p,h),d=l(p,h,!0);if(f in r&&d in e&&r[f]!==e[d]){const t=o(f,d,h),i=s(f,d,n[t].geometry);delete e[f],delete r[d],r[l(p,n[i].geometry,!0)]=i,n[t].geometry=null;}else f in r?s(f,d,h):d in e?o(f,d,h):(a(u),e[f]=i-1,r[d]=i-1);}return n.filter((t=>t.geometry))}(this.features)),this.sortFeaturesByKey&&this.features.sort(((t,e)=>t.sortKey-e.sortKey));}update(t,e,r){this.stateDependentLayers.length&&(this.text.programConfigurations.updatePaintArrays(t,e,this.layers,r),this.icon.programConfigurations.updatePaintArrays(t,e,this.layers,r));}isEmpty(){return 0===this.symbolInstances.length&&!this.hasRTLText}uploadPending(){return !this.uploaded||this.text.programConfigurations.needsUpload||this.icon.programConfigurations.needsUpload}upload(t){!this.uploaded&&this.hasDebugData()&&(this.textCollisionBox.upload(t),this.iconCollisionBox.upload(t)),this.text.upload(t,this.sortFeaturesByY,!this.uploaded,this.text.programConfigurations.needsUpload),this.icon.upload(t,this.sortFeaturesByY,!this.uploaded,this.icon.programConfigurations.needsUpload),this.uploaded=!0;}destroyDebugData(){this.textCollisionBox.destroy(),this.iconCollisionBox.destroy();}destroy(){this.text.destroy(),this.icon.destroy(),this.hasDebugData()&&this.destroyDebugData();}addToLineVertexArray(t,e){const r=this.lineVertexArray.length;if(void 0!==t.segment){let r=t.dist(e[t.segment+1]),n=t.dist(e[t.segment]);const i={};for(let n=t.segment+1;n<e.length;n++)i[n]={x:e[n].x,y:e[n].y,tileUnitDistanceFromAnchor:r},n<e.length-1&&(r+=e[n+1].dist(e[n]));for(let r=t.segment||0;r>=0;r--)i[r]={x:e[r].x,y:e[r].y,tileUnitDistanceFromAnchor:n},r>0&&(n+=e[r-1].dist(e[r]));for(let t=0;t<e.length;t++){const e=i[t];this.lineVertexArray.emplaceBack(e.x,e.y,e.tileUnitDistanceFromAnchor);}}return {lineStartIndex:r,lineLength:this.lineVertexArray.length-r}}addSymbols(e,r,n,i,a,s,o,l,u,c,h,p){const f=e.indexArray,d=e.layoutVertexArray,y=e.segments.prepareSegment(4*r.length,d,f,this.canOverlap?s.sortKey:void 0),m=this.glyphOffsetArray.length,g=y.vertexLength,x=this.allowVerticalPlacement&&o===t.WritingMode.vertical?Math.PI/2:0,v=s.text&&s.text.sections;for(let t=0;t<r.length;t++){const{tl:i,tr:a,bl:o,br:u,tex:c,pixelOffsetTL:h,pixelOffsetBR:m,minFontScaleX:g,minFontScaleY:b,glyphOffset:w,isSDF:_,sectionIndex:A}=r[t],k=y.vertexLength,S=w[1];_u(d,l.x,l.y,i.x,S+i.y,c.x,c.y,n,_,h.x,h.y,g,b),_u(d,l.x,l.y,a.x,S+a.y,c.x+c.w,c.y,n,_,m.x,h.y,g,b),_u(d,l.x,l.y,o.x,S+o.y,c.x,c.y+c.h,n,_,h.x,m.y,g,b),_u(d,l.x,l.y,u.x,S+u.y,c.x+c.w,c.y+c.h,n,_,m.x,m.y,g,b),Au(e.dynamicLayoutVertexArray,l,x),f.emplaceBack(k,k+1,k+2),f.emplaceBack(k+1,k+2,k+3),y.vertexLength+=4,y.primitiveLength+=2,this.glyphOffsetArray.emplaceBack(w[0]),t!==r.length-1&&A===r[t+1].sectionIndex||e.programConfigurations.populatePaintArrays(d.length,s,s.index,{},p,v&&v[A]);}e.placedSymbolArray.emplaceBack(l.x,l.y,m,this.glyphOffsetArray.length-m,g,u,c,l.segment,n?n[0]:0,n?n[1]:0,i[0],i[1],o,0,!1,0,h);}_addCollisionDebugVertex(t,e,r,n,i,a){return e.emplaceBack(0,0),t.emplaceBack(r.x,r.y,n,i,Math.round(a.x),Math.round(a.y))}addCollisionDebugVertices(t,e,r,n,a,s,o){const l=a.segments.prepareSegment(4,a.layoutVertexArray,a.indexArray),u=l.vertexLength,c=a.layoutVertexArray,h=a.collisionVertexArray,p=o.anchorX,f=o.anchorY;this._addCollisionDebugVertex(c,h,s,p,f,new i(t,e)),this._addCollisionDebugVertex(c,h,s,p,f,new i(r,e)),this._addCollisionDebugVertex(c,h,s,p,f,new i(r,n)),this._addCollisionDebugVertex(c,h,s,p,f,new i(t,n)),l.vertexLength+=4;const d=a.indexArray;d.emplaceBack(u,u+1),d.emplaceBack(u+1,u+2),d.emplaceBack(u+2,u+3),d.emplaceBack(u+3,u),l.primitiveLength+=4;}addDebugCollisionBoxes(t,e,r,n){for(let i=t;i<e;i++){const t=this.collisionBoxArray.get(i);this.addCollisionDebugVertices(t.x1,t.y1,t.x2,t.y2,n?this.textCollisionBox:this.iconCollisionBox,t.anchorPoint,r);}}generateCollisionDebugBuffers(){this.hasDebugData()&&this.destroyDebugData(),this.textCollisionBox=new Iu(la,yl.members,ha),this.iconCollisionBox=new Iu(la,yl.members,ha);for(let t=0;t<this.symbolInstances.length;t++){const e=this.symbolInstances.get(t);this.addDebugCollisionBoxes(e.textBoxStartIndex,e.textBoxEndIndex,e,!0),this.addDebugCollisionBoxes(e.verticalTextBoxStartIndex,e.verticalTextBoxEndIndex,e,!0),this.addDebugCollisionBoxes(e.iconBoxStartIndex,e.iconBoxEndIndex,e,!1),this.addDebugCollisionBoxes(e.verticalIconBoxStartIndex,e.verticalIconBoxEndIndex,e,!1);}}_deserializeCollisionBoxesForSymbol(t,e,r,n,i,a,s,o,l){const u={};for(let n=e;n<r;n++){const e=t.get(n);u.textBox={x1:e.x1,y1:e.y1,x2:e.x2,y2:e.y2,anchorPointX:e.anchorPointX,anchorPointY:e.anchorPointY},u.textFeatureIndex=e.featureIndex;break}for(let e=n;e<i;e++){const r=t.get(e);u.verticalTextBox={x1:r.x1,y1:r.y1,x2:r.x2,y2:r.y2,anchorPointX:r.anchorPointX,anchorPointY:r.anchorPointY},u.verticalTextFeatureIndex=r.featureIndex;break}for(let e=a;e<s;e++){const r=t.get(e);u.iconBox={x1:r.x1,y1:r.y1,x2:r.x2,y2:r.y2,anchorPointX:r.anchorPointX,anchorPointY:r.anchorPointY},u.iconFeatureIndex=r.featureIndex;break}for(let e=o;e<l;e++){const r=t.get(e);u.verticalIconBox={x1:r.x1,y1:r.y1,x2:r.x2,y2:r.y2,anchorPointX:r.anchorPointX,anchorPointY:r.anchorPointY},u.verticalIconFeatureIndex=r.featureIndex;break}return u}deserializeCollisionBoxes(t){this.collisionArrays=[];for(let e=0;e<this.symbolInstances.length;e++){const r=this.symbolInstances.get(e);this.collisionArrays.push(this._deserializeCollisionBoxesForSymbol(t,r.textBoxStartIndex,r.textBoxEndIndex,r.verticalTextBoxStartIndex,r.verticalTextBoxEndIndex,r.iconBoxStartIndex,r.iconBoxEndIndex,r.verticalIconBoxStartIndex,r.verticalIconBoxEndIndex));}}hasTextData(){return this.text.segments.get().length>0}hasIconData(){return this.icon.segments.get().length>0}hasDebugData(){return this.textCollisionBox&&this.iconCollisionBox}hasTextCollisionBoxData(){return this.hasDebugData()&&this.textCollisionBox.segments.get().length>0}hasIconCollisionBoxData(){return this.hasDebugData()&&this.iconCollisionBox.segments.get().length>0}addIndicesForPlacedSymbol(t,e){const r=t.placedSymbolArray.get(e),n=r.vertexStartIndex+4*r.numGlyphs;for(let e=r.vertexStartIndex;e<n;e+=4)t.indexArray.emplaceBack(e,e+1,e+2),t.indexArray.emplaceBack(e+1,e+2,e+3);}getSortedSymbolIndexes(t){if(this.sortedAngle===t&&void 0!==this.symbolInstanceIndexes)return this.symbolInstanceIndexes;const e=Math.sin(t),r=Math.cos(t),n=[],i=[],a=[];for(let t=0;t<this.symbolInstances.length;++t){a.push(t);const s=this.symbolInstances.get(t);n.push(0|Math.round(e*s.anchorX+r*s.anchorY)),i.push(s.featureIndex);}return a.sort(((t,e)=>n[t]-n[e]||i[e]-i[t])),a}addToSortKeyRanges(t,e){const r=this.sortKeyRanges[this.sortKeyRanges.length-1];r&&r.sortKey===e?r.symbolInstanceEnd=t+1:this.sortKeyRanges.push({sortKey:e,symbolInstanceStart:t,symbolInstanceEnd:t+1});}sortFeatures(t){if(this.sortFeaturesByY&&this.sortedAngle!==t&&!(this.text.segments.get().length>1||this.icon.segments.get().length>1)){this.symbolInstanceIndexes=this.getSortedSymbolIndexes(t),this.sortedAngle=t,this.text.indexArray.clear(),this.icon.indexArray.clear(),this.featureSortOrder=[];for(const t of this.symbolInstanceIndexes){const e=this.symbolInstances.get(t);this.featureSortOrder.push(e.featureIndex),[e.rightJustifiedTextSymbolIndex,e.centerJustifiedTextSymbolIndex,e.leftJustifiedTextSymbolIndex].forEach(((t,e,r)=>{t>=0&&r.indexOf(t)===e&&this.addIndicesForPlacedSymbol(this.text,t);})),e.verticalPlacedTextSymbolIndex>=0&&this.addIndicesForPlacedSymbol(this.text,e.verticalPlacedTextSymbolIndex),e.placedIconSymbolIndex>=0&&this.addIndicesForPlacedSymbol(this.icon,e.placedIconSymbolIndex),e.verticalPlacedIconSymbolIndex>=0&&this.addIndicesForPlacedSymbol(this.icon,e.verticalPlacedIconSymbolIndex);}this.text.indexBuffer&&this.text.indexBuffer.updateData(this.text.indexArray),this.icon.indexBuffer&&this.icon.indexBuffer.updateData(this.icon.indexArray);}}}let Mu,Pu;In("SymbolBucket",zu,{omit:["layers","collisionBoxArray","features","compareText"]}),zu.MAX_GLYPHS=65535,zu.addDynamicAttributes=Au;var Bu={get paint(){return Pu=Pu||new pi({"icon-opacity":new li(q.paint_symbol["icon-opacity"]),"icon-color":new li(q.paint_symbol["icon-color"]),"icon-halo-color":new li(q.paint_symbol["icon-halo-color"]),"icon-halo-width":new li(q.paint_symbol["icon-halo-width"]),"icon-halo-blur":new li(q.paint_symbol["icon-halo-blur"]),"icon-translate":new oi(q.paint_symbol["icon-translate"]),"icon-translate-anchor":new oi(q.paint_symbol["icon-translate-anchor"]),"text-opacity":new li(q.paint_symbol["text-opacity"]),"text-color":new li(q.paint_symbol["text-color"],{runtimeType:lt,getOverride:t=>t.textColor,hasOverride:t=>!!t.textColor}),"text-halo-color":new li(q.paint_symbol["text-halo-color"]),"text-halo-width":new li(q.paint_symbol["text-halo-width"]),"text-halo-blur":new li(q.paint_symbol["text-halo-blur"]),"text-translate":new oi(q.paint_symbol["text-translate"]),"text-translate-anchor":new oi(q.paint_symbol["text-translate-anchor"])})},get layout(){return Mu=Mu||new pi({"symbol-placement":new oi(q.layout_symbol["symbol-placement"]),"symbol-spacing":new oi(q.layout_symbol["symbol-spacing"]),"symbol-avoid-edges":new oi(q.layout_symbol["symbol-avoid-edges"]),"symbol-sort-key":new li(q.layout_symbol["symbol-sort-key"]),"symbol-z-order":new oi(q.layout_symbol["symbol-z-order"]),"icon-allow-overlap":new oi(q.layout_symbol["icon-allow-overlap"]),"icon-overlap":new oi(q.layout_symbol["icon-overlap"]),"icon-ignore-placement":new oi(q.layout_symbol["icon-ignore-placement"]),"icon-optional":new oi(q.layout_symbol["icon-optional"]),"icon-rotation-alignment":new oi(q.layout_symbol["icon-rotation-alignment"]),"icon-size":new li(q.layout_symbol["icon-size"]),"icon-text-fit":new oi(q.layout_symbol["icon-text-fit"]),"icon-text-fit-padding":new oi(q.layout_symbol["icon-text-fit-padding"]),"icon-image":new li(q.layout_symbol["icon-image"]),"icon-rotate":new li(q.layout_symbol["icon-rotate"]),"icon-padding":new li(q.layout_symbol["icon-padding"]),"icon-keep-upright":new oi(q.layout_symbol["icon-keep-upright"]),"icon-offset":new li(q.layout_symbol["icon-offset"]),"icon-anchor":new li(q.layout_symbol["icon-anchor"]),"icon-pitch-alignment":new oi(q.layout_symbol["icon-pitch-alignment"]),"text-pitch-alignment":new oi(q.layout_symbol["text-pitch-alignment"]),"text-rotation-alignment":new oi(q.layout_symbol["text-rotation-alignment"]),"text-field":new li(q.layout_symbol["text-field"]),"text-font":new li(q.layout_symbol["text-font"]),"text-size":new li(q.layout_symbol["text-size"]),"text-max-width":new li(q.layout_symbol["text-max-width"]),"text-line-height":new oi(q.layout_symbol["text-line-height"]),"text-letter-spacing":new li(q.layout_symbol["text-letter-spacing"]),"text-justify":new li(q.layout_symbol["text-justify"]),"text-radial-offset":new li(q.layout_symbol["text-radial-offset"]),"text-variable-anchor":new oi(q.layout_symbol["text-variable-anchor"]),"text-anchor":new li(q.layout_symbol["text-anchor"]),"text-max-angle":new oi(q.layout_symbol["text-max-angle"]),"text-writing-mode":new oi(q.layout_symbol["text-writing-mode"]),"text-rotate":new li(q.layout_symbol["text-rotate"]),"text-padding":new oi(q.layout_symbol["text-padding"]),"text-keep-upright":new oi(q.layout_symbol["text-keep-upright"]),"text-transform":new li(q.layout_symbol["text-transform"]),"text-offset":new li(q.layout_symbol["text-offset"]),"text-allow-overlap":new oi(q.layout_symbol["text-allow-overlap"]),"text-overlap":new oi(q.layout_symbol["text-overlap"]),"text-ignore-placement":new oi(q.layout_symbol["text-ignore-placement"]),"text-optional":new oi(q.layout_symbol["text-optional"])})}};class Cu{constructor(t){if(void 0===t.property.overrides)throw new Error("overrides must be provided to instantiate FormatSectionOverride class");this.type=t.property.overrides?t.property.overrides.runtimeType:it,this.defaultValue=t;}evaluate(t){if(t.formattedSection){const e=this.defaultValue.property.overrides;if(e&&e.hasOverride(t.formattedSection))return e.getOverride(t.formattedSection)}return t.feature&&t.featureState?this.defaultValue.evaluate(t.feature,t.featureState):this.defaultValue.property.specification.default}eachChild(t){this.defaultValue.isConstant()||t(this.defaultValue.value._styleExpression.expression);}outputDefined(){return !1}serialize(){return null}}In("FormatSectionOverride",Cu,{omit:["defaultValue"]});class Vu extends di{constructor(t){super(t,Bu);}recalculate(t,e){if(super.recalculate(t,e),"auto"===this.layout.get("icon-rotation-alignment")&&(this.layout._values["icon-rotation-alignment"]="point"!==this.layout.get("symbol-placement")?"map":"viewport"),"auto"===this.layout.get("text-rotation-alignment")&&(this.layout._values["text-rotation-alignment"]="point"!==this.layout.get("symbol-placement")?"map":"viewport"),"auto"===this.layout.get("text-pitch-alignment")&&(this.layout._values["text-pitch-alignment"]="map"===this.layout.get("text-rotation-alignment")?"map":"viewport"),"auto"===this.layout.get("icon-pitch-alignment")&&(this.layout._values["icon-pitch-alignment"]=this.layout.get("icon-rotation-alignment")),"point"===this.layout.get("symbol-placement")){const t=this.layout.get("text-writing-mode");if(t){const e=[];for(const r of t)e.indexOf(r)<0&&e.push(r);this.layout._values["text-writing-mode"]=e;}else this.layout._values["text-writing-mode"]=["horizontal"];}this._setPaintOverrides();}getValueAndResolveTokens(t,e,r,n){const i=this.layout.get(t).evaluate(e,{},r,n),a=this._unevaluatedLayout._values[t];return a.isDataDriven()||Sr(a.value)||!i?i:function(t,e){return e.replace(/{([^{}]+)}/g,((e,r)=>r in t?String(t[r]):""))}(e.properties,i)}createBucket(t){return new zu(t)}queryRadius(){return 0}queryIntersectsFeature(){throw new Error("Should take a different path in FeatureIndex")}_setPaintOverrides(){for(const t of Bu.paint.overridableProperties){if(!Vu.hasPaintOverride(this.layout,t))continue;const e=this.paint.get(t),r=new Cu(e),n=new kr(r,e.property.specification);let i=null;i="constant"===e.value.kind||"source"===e.value.kind?new zr("source",n):new Mr("composite",n,e.value.zoomStops),this.paint._values[t]=new ai(e.property,i,e.parameters);}}_handleOverridablePaintPropertyUpdate(t,e,r){return !(!this.layout||e.isDataDriven()||r.isDataDriven())&&Vu.hasPaintOverride(this.layout,t)}static hasPaintOverride(t,e){const r=t.get("text-field"),n=Bu.paint.properties[e];let i=!1;const a=t=>{for(const e of t)if(n.overrides&&n.overrides.hasOverride(e))return void(i=!0)};if("constant"===r.value.kind&&r.value.value instanceof Zt)a(r.value.value.sections);else if("source"===r.value.kind){const t=e=>{i||(e instanceof Wt&&Yt(e.value)===pt?a(e.value.sections):e instanceof rr?a(e.sections):e.eachChild(t));},e=r.value;e._styleExpression&&t(e._styleExpression.expression);}return i}}let Eu;var Fu={get paint(){return Eu=Eu||new pi({"background-color":new oi(q.paint_background["background-color"]),"background-pattern":new ci(q.paint_background["background-pattern"]),"background-opacity":new oi(q.paint_background["background-opacity"])})}};class Tu extends di{constructor(t){super(t,Fu);}}let Lu;var $u={get paint(){return Lu=Lu||new pi({"raster-opacity":new oi(q.paint_raster["raster-opacity"]),"raster-hue-rotate":new oi(q.paint_raster["raster-hue-rotate"]),"raster-brightness-min":new oi(q.paint_raster["raster-brightness-min"]),"raster-brightness-max":new oi(q.paint_raster["raster-brightness-max"]),"raster-saturation":new oi(q.paint_raster["raster-saturation"]),"raster-contrast":new oi(q.paint_raster["raster-contrast"]),"raster-resampling":new oi(q.paint_raster["raster-resampling"]),"raster-fade-duration":new oi(q.paint_raster["raster-fade-duration"])})}};class Du extends di{constructor(t){super(t,$u);}}class Ou extends di{constructor(t){super(t,{}),this.onAdd=t=>{this.implementation.onAdd&&this.implementation.onAdd(t,t.painter.context.gl);},this.onRemove=t=>{this.implementation.onRemove&&this.implementation.onRemove(t,t.painter.context.gl);},this.implementation=t;}is3D(){return "3d"===this.implementation.renderingMode}hasOffscreenPass(){return void 0!==this.implementation.prerender}recalculate(){}updateTransitions(){}hasTransition(){return !1}serialize(){throw new Error("Custom layers cannot be serialized")}}class Uu{constructor(t){this._callback=t,this._triggered=!1,"undefined"!=typeof MessageChannel&&(this._channel=new MessageChannel,this._channel.port2.onmessage=()=>{this._triggered=!1,this._callback();});}trigger(){this._triggered||(this._triggered=!0,this._channel?this._channel.port1.postMessage(!0):setTimeout((()=>{this._triggered=!1,this._callback();}),0));}remove(){delete this._channel,this._callback=()=>{};}}const Ru=6371008.8;class qu{constructor(t,e){if(isNaN(t)||isNaN(e))throw new Error(`Invalid LngLat object: (${t}, ${e})`);if(this.lng=+t,this.lat=+e,this.lat>90||this.lat<-90)throw new Error("Invalid LngLat latitude value: must be between -90 and 90")}wrap(){return new qu(h(this.lng,-180,180),this.lat)}toArray(){return [this.lng,this.lat]}toString(){return `LngLat(${this.lng}, ${this.lat})`}distanceTo(t){const e=Math.PI/180,r=this.lat*e,n=t.lat*e,i=Math.sin(r)*Math.sin(n)+Math.cos(r)*Math.cos(n)*Math.cos((t.lng-this.lng)*e);return Ru*Math.acos(Math.min(i,1))}static convert(t){if(t instanceof qu)return t;if(Array.isArray(t)&&(2===t.length||3===t.length))return new qu(Number(t[0]),Number(t[1]));if(!Array.isArray(t)&&"object"==typeof t&&null!==t)return new qu(Number("lng"in t?t.lng:t.lon),Number(t.lat));throw new Error("`LngLatLike` argument must be specified as a LngLat instance, an object {lng: <lng>, lat: <lat>}, an object {lon: <lng>, lat: <lat>}, or an array of [<lng>, <lat>]")}}const ju=2*Math.PI*Ru;function Nu(t){return ju*Math.cos(t*Math.PI/180)}function Zu(t){return (180+t)/360}function Ku(t){return (180-180/Math.PI*Math.log(Math.tan(Math.PI/4+t*Math.PI/360)))/360}function Gu(t,e){return t/Nu(e)}function Ju(t){return 360/Math.PI*Math.atan(Math.exp((180-360*t)*Math.PI/180))-90}class Xu{constructor(t,e,r=0){this.x=+t,this.y=+e,this.z=+r;}static fromLngLat(t,e=0){const r=qu.convert(t);return new Xu(Zu(r.lng),Ku(r.lat),Gu(e,r.lat))}toLngLat(){return new qu(360*this.x-180,Ju(this.y))}toAltitude(){return this.z*Nu(Ju(this.y))}meterInMercatorCoordinateUnits(){return 1/ju*(t=Ju(this.y),1/Math.cos(t*Math.PI/180));var t;}}function Yu(t,e,r){var n=2*Math.PI*6378137/256/Math.pow(2,r);return [t*n-2*Math.PI*6378137/2,e*n-2*Math.PI*6378137/2]}class Hu{constructor(t,e,r){if(t<0||t>25||r<0||r>=Math.pow(2,t)||e<0||e>=Math.pow(2,t))throw new Error(`x=${e}, y=${r}, z=${t} outside of bounds. 0<=x<${Math.pow(2,t)}, 0<=y<${Math.pow(2,t)} 0<=z<=25 `);this.z=t,this.x=e,this.y=r,this.key=tc(0,t,t,e,r);}equals(t){return this.z===t.z&&this.x===t.x&&this.y===t.y}url(t,e,r){const n=(a=this.y,s=this.z,o=Yu(256*(i=this.x),256*(a=Math.pow(2,s)-a-1),s),l=Yu(256*(i+1),256*(a+1),s),o[0]+","+o[1]+","+l[0]+","+l[1]);var i,a,s,o,l;const u=function(t,e,r){let n,i="";for(let a=t;a>0;a--)n=1<<a-1,i+=(e&n?1:0)+(r&n?2:0);return i}(this.z,this.x,this.y);return t[(this.x+this.y)%t.length].replace(/{prefix}/g,(this.x%16).toString(16)+(this.y%16).toString(16)).replace(/{z}/g,String(this.z)).replace(/{x}/g,String(this.x)).replace(/{y}/g,String("tms"===r?Math.pow(2,this.z)-this.y-1:this.y)).replace(/{ratio}/g,e>1?"@2x":"").replace(/{quadkey}/g,u).replace(/{bbox-epsg-3857}/g,n)}isChildOf(t){const e=this.z-t.z;return e>0&&t.x===this.x>>e&&t.y===this.y>>e}getTilePoint(t){const e=Math.pow(2,this.z);return new i((t.x*e-this.x)*ja,(t.y*e-this.y)*ja)}toString(){return `${this.z}/${this.x}/${this.y}`}}class Wu{constructor(t,e){this.wrap=t,this.canonical=e,this.key=tc(t,e.z,e.z,e.x,e.y);}}class Qu{constructor(t,e,r,n,i){if(t<r)throw new Error(`overscaledZ should be >= z; overscaledZ = ${t}; z = ${r}`);this.overscaledZ=t,this.wrap=e,this.canonical=new Hu(r,+n,+i),this.key=tc(e,t,r,n,i);}clone(){return new Qu(this.overscaledZ,this.wrap,this.canonical.z,this.canonical.x,this.canonical.y)}equals(t){return this.overscaledZ===t.overscaledZ&&this.wrap===t.wrap&&this.canonical.equals(t.canonical)}scaledTo(t){if(t>this.overscaledZ)throw new Error(`targetZ > this.overscaledZ; targetZ = ${t}; overscaledZ = ${this.overscaledZ}`);const e=this.canonical.z-t;return t>this.canonical.z?new Qu(t,this.wrap,this.canonical.z,this.canonical.x,this.canonical.y):new Qu(t,this.wrap,t,this.canonical.x>>e,this.canonical.y>>e)}calculateScaledKey(t,e){if(t>this.overscaledZ)throw new Error(`targetZ > this.overscaledZ; targetZ = ${t}; overscaledZ = ${this.overscaledZ}`);const r=this.canonical.z-t;return t>this.canonical.z?tc(this.wrap*+e,t,this.canonical.z,this.canonical.x,this.canonical.y):tc(this.wrap*+e,t,t,this.canonical.x>>r,this.canonical.y>>r)}isChildOf(t){if(t.wrap!==this.wrap)return !1;const e=this.canonical.z-t.canonical.z;return 0===t.overscaledZ||t.overscaledZ<this.overscaledZ&&t.canonical.x===this.canonical.x>>e&&t.canonical.y===this.canonical.y>>e}children(t){if(this.overscaledZ>=t)return [new Qu(this.overscaledZ+1,this.wrap,this.canonical.z,this.canonical.x,this.canonical.y)];const e=this.canonical.z+1,r=2*this.canonical.x,n=2*this.canonical.y;return [new Qu(e,this.wrap,e,r,n),new Qu(e,this.wrap,e,r+1,n),new Qu(e,this.wrap,e,r,n+1),new Qu(e,this.wrap,e,r+1,n+1)]}isLessThan(t){return this.wrap<t.wrap||!(this.wrap>t.wrap)&&(this.overscaledZ<t.overscaledZ||!(this.overscaledZ>t.overscaledZ)&&(this.canonical.x<t.canonical.x||!(this.canonical.x>t.canonical.x)&&this.canonical.y<t.canonical.y))}wrapped(){return new Qu(this.overscaledZ,0,this.canonical.z,this.canonical.x,this.canonical.y)}unwrapTo(t){return new Qu(this.overscaledZ,t,this.canonical.z,this.canonical.x,this.canonical.y)}overscaleFactor(){return Math.pow(2,this.overscaledZ-this.canonical.z)}toUnwrapped(){return new Wu(this.wrap,this.canonical)}toString(){return `${this.overscaledZ}/${this.canonical.x}/${this.canonical.y}`}getTilePoint(t){return this.canonical.getTilePoint(new Xu(t.x-this.wrap,t.y))}}function tc(t,e,r,n,i){(t*=2)<0&&(t=-1*t-1);const a=1<<r;return (a*a*t+a*i+n).toString(36)+r.toString(36)+e.toString(36)}In("CanonicalTileID",Hu),In("OverscaledTileID",Qu,{omit:["posMatrix"]});class ec{constructor(t,e,r){if(this.uid=t,e.height!==e.width)throw new RangeError("DEM tiles must be square");if(r&&"mapbox"!==r&&"terrarium"!==r)return void x(`"${r}" is not a valid encoding type. Valid types include "mapbox" and "terrarium".`);this.stride=e.height;const n=this.dim=e.height-2;this.data=new Uint32Array(e.data.buffer),this.encoding=r||"mapbox";for(let t=0;t<n;t++)this.data[this._idx(-1,t)]=this.data[this._idx(0,t)],this.data[this._idx(n,t)]=this.data[this._idx(n-1,t)],this.data[this._idx(t,-1)]=this.data[this._idx(t,0)],this.data[this._idx(t,n)]=this.data[this._idx(t,n-1)];this.data[this._idx(-1,-1)]=this.data[this._idx(0,0)],this.data[this._idx(n,-1)]=this.data[this._idx(n-1,0)],this.data[this._idx(-1,n)]=this.data[this._idx(0,n-1)],this.data[this._idx(n,n)]=this.data[this._idx(n-1,n-1)],this.min=Number.MAX_SAFE_INTEGER,this.max=Number.MIN_SAFE_INTEGER;for(let t=0;t<n;t++)for(let e=0;e<n;e++){const r=this.get(t,e);r>this.max&&(this.max=r),r<this.min&&(this.min=r);}}get(t,e){const r=new Uint8Array(this.data.buffer),n=4*this._idx(t,e);return ("terrarium"===this.encoding?this._unpackTerrarium:this._unpackMapbox)(r[n],r[n+1],r[n+2])}getUnpackVector(){return "terrarium"===this.encoding?[256,1,1/256,32768]:[6553.6,25.6,.1,1e4]}_idx(t,e){if(t<-1||t>=this.dim+1||e<-1||e>=this.dim+1)throw new RangeError("out of range source coordinates for DEM data");return (e+1)*this.stride+(t+1)}_unpackMapbox(t,e,r){return (256*t*256+256*e+r)/10-1e4}_unpackTerrarium(t,e,r){return 256*t+e+r/256-32768}getPixels(){return new Ps({width:this.stride,height:this.stride},new Uint8Array(this.data.buffer))}backfillBorder(t,e,r){if(this.dim!==t.dim)throw new Error("dem dimension mismatch");let n=e*this.dim,i=e*this.dim+this.dim,a=r*this.dim,s=r*this.dim+this.dim;switch(e){case-1:n=i-1;break;case 1:i=n+1;}switch(r){case-1:a=s-1;break;case 1:s=a+1;}const o=-e*this.dim,l=-r*this.dim;for(let e=a;e<s;e++)for(let r=n;r<i;r++)this.data[this._idx(r,e)]=t.data[this._idx(r+o,e+l)];}}In("DEMData",ec);class rc{constructor(t){this._stringToNumber={},this._numberToString=[];for(let e=0;e<t.length;e++){const r=t[e];this._stringToNumber[r]=e,this._numberToString[e]=r;}}encode(t){return this._stringToNumber[t]}decode(t){if(t>=this._numberToString.length)throw new Error(`Out of bounds. Index requested n=${t} can't be >= this._numberToString.length ${this._numberToString.length}`);return this._numberToString[t]}}class nc{constructor(t,e,r,n,i){this.type="Feature",this._vectorTileFeature=t,t._z=e,t._x=r,t._y=n,this.properties=t.properties,this.id=i;}get geometry(){return void 0===this._geometry&&(this._geometry=this._vectorTileFeature.toGeoJSON(this._vectorTileFeature._x,this._vectorTileFeature._y,this._vectorTileFeature._z).geometry),this._geometry}set geometry(t){this._geometry=t;}toJSON(){const t={geometry:this.geometry};for(const e in this)"_geometry"!==e&&"_vectorTileFeature"!==e&&(t[e]=this[e]);return t}}class ic{constructor(t,e){this.tileID=t,this.x=t.canonical.x,this.y=t.canonical.y,this.z=t.canonical.z,this.grid=new kn(ja,16,0),this.grid3D=new kn(ja,16,0),this.featureIndexArray=new Hi,this.promoteId=e;}insert(t,e,r,n,i,a){const s=this.featureIndexArray.length;this.featureIndexArray.emplaceBack(r,n,i);const o=a?this.grid3D:this.grid;for(let t=0;t<e.length;t++){const r=e[t],n=[1/0,1/0,-1/0,-1/0];for(let t=0;t<r.length;t++){const e=r[t];n[0]=Math.min(n[0],e.x),n[1]=Math.min(n[1],e.y),n[2]=Math.max(n[2],e.x),n[3]=Math.max(n[3],e.y);}n[0]<ja&&n[1]<ja&&n[2]>=0&&n[3]>=0&&o.insert(s,n[0],n[1],n[2],n[3]);}}loadVTLayers(){return this.vtLayers||(this.vtLayers=new Mo.VectorTile(new ql(this.rawTileData)).layers,this.sourceLayerCoder=new rc(this.vtLayers?Object.keys(this.vtLayers).sort():["_geojsonTileLayer"])),this.vtLayers}query(t,e,r,n){this.loadVTLayers();const a=t.params||{},s=ja/t.tileSize/t.scale,o=Fr(a.filter),l=t.queryGeometry,u=t.queryPadding*s,c=sc(l),h=this.grid.query(c.minX-u,c.minY-u,c.maxX+u,c.maxY+u),p=sc(t.cameraQueryGeometry),f=this.grid3D.query(p.minX-u,p.minY-u,p.maxX+u,p.maxY+u,((e,r,n,a)=>function(t,e,r,n,a){for(const i of t)if(e<=i.x&&r<=i.y&&n>=i.x&&a>=i.y)return !0;const s=[new i(e,r),new i(e,a),new i(n,a),new i(n,r)];if(t.length>2)for(const e of s)if(as(t,e))return !0;for(let e=0;e<t.length-1;e++)if(ss(t[e],t[e+1],s))return !0;return !1}(t.cameraQueryGeometry,e-u,r-u,n+u,a+u)));for(const t of f)h.push(t);h.sort(oc);const d={};let y;for(let i=0;i<h.length;i++){const u=h[i];if(u===y)continue;y=u;const c=this.featureIndexArray.get(u);let p=null;this.loadMatchingFeature(d,c.bucketIndex,c.sourceLayerIndex,c.featureIndex,o,a.layers,a.availableImages,e,r,n,((e,r,n)=>(p||(p=Ka(e)),r.queryIntersectsFeature(l,e,n,p,this.z,t.transform,s,t.pixelPosMatrix))));}return d}loadMatchingFeature(t,e,r,n,i,a,s,o,l,u,c){const h=this.bucketLayerIDs[e];if(a&&!function(t,e){for(let r=0;r<t.length;r++)if(e.indexOf(t[r])>=0)return !0;return !1}(a,h))return;const f=this.sourceLayerCoder.decode(r),d=this.vtLayers[f].feature(n);if(i.needGeometry){const t=Ga(d,!0);if(!i.filter(new Wn(this.tileID.overscaledZ),t,this.tileID.canonical))return}else if(!i.filter(new Wn(this.tileID.overscaledZ),d))return;const y=this.getId(d,f);for(let e=0;e<h.length;e++){const r=h[e];if(a&&a.indexOf(r)<0)continue;const i=o[r];if(!i)continue;let f={};y&&u&&(f=u.getState(i.sourceLayer||"_geojsonTileLayer",y));const m=p({},l[r]);m.paint=ac(m.paint,i.paint,d,f,s),m.layout=ac(m.layout,i.layout,d,f,s);const g=!c||c(d,i,f);if(!g)continue;const x=new nc(d,this.z,this.x,this.y,y);x.layer=m;let v=t[r];void 0===v&&(v=t[r]=[]),v.push({featureIndex:n,feature:x,intersectionZ:g});}}lookupSymbolFeatures(t,e,r,n,i,a,s,o){const l={};this.loadVTLayers();const u=Fr(i);for(const i of t)this.loadMatchingFeature(l,r,n,i,u,a,s,o,e);return l}hasLayer(t){for(const e of this.bucketLayerIDs)for(const r of e)if(t===r)return !0;return !1}getId(t,e){let r=t.id;return this.promoteId&&(r=t.properties["string"==typeof this.promoteId?this.promoteId:this.promoteId[e]],"boolean"==typeof r&&(r=Number(r))),r}}function ac(t,e,r,n,i){return d(t,((t,a)=>{const s=e instanceof si?e.get(a):null;return s&&s.evaluate?s.evaluate(r,n,i):s}))}function sc(t){let e=1/0,r=1/0,n=-1/0,i=-1/0;for(const a of t)e=Math.min(e,a.x),r=Math.min(r,a.y),n=Math.max(n,a.x),i=Math.max(i,a.y);return {minX:e,minY:r,maxX:n,maxY:i}}function oc(t,e){return e-t}function lc(t,e,r,n,a){const s=[];for(let o=0;o<t.length;o++){const l=t[o];let u;for(let t=0;t<l.length-1;t++){let o=l[t],c=l[t+1];o.x<e&&c.x<e||(o.x<e?o=new i(e,o.y+(e-o.x)/(c.x-o.x)*(c.y-o.y))._round():c.x<e&&(c=new i(e,o.y+(e-o.x)/(c.x-o.x)*(c.y-o.y))._round()),o.y<r&&c.y<r||(o.y<r?o=new i(o.x+(r-o.y)/(c.y-o.y)*(c.x-o.x),r)._round():c.y<r&&(c=new i(o.x+(r-o.y)/(c.y-o.y)*(c.x-o.x),r)._round()),o.x>=n&&c.x>=n||(o.x>=n?o=new i(n,o.y+(n-o.x)/(c.x-o.x)*(c.y-o.y))._round():c.x>=n&&(c=new i(n,o.y+(n-o.x)/(c.x-o.x)*(c.y-o.y))._round()),o.y>=a&&c.y>=a||(o.y>=a?o=new i(o.x+(a-o.y)/(c.y-o.y)*(c.x-o.x),a)._round():c.y>=a&&(c=new i(o.x+(a-o.y)/(c.y-o.y)*(c.x-o.x),a)._round()),u&&o.equals(u[u.length-1])||(u=[o],s.push(u)),u.push(c)))));}}return s}In("FeatureIndex",ic,{omit:["rawTileData","sourceLayerCoder"]});class uc extends i{constructor(t,e,r,n){super(t,e),this.angle=r,void 0!==n&&(this.segment=n);}clone(){return new uc(this.x,this.y,this.angle,this.segment)}}function cc(t,e,r,n,i){if(void 0===e.segment||0===r)return !0;let a=e,s=e.segment+1,o=0;for(;o>-r/2;){if(s--,s<0)return !1;o-=t[s].dist(a),a=t[s];}o+=t[s].dist(t[s+1]),s++;const l=[];let u=0;for(;o<r/2;){const e=t[s],r=t[s+1];if(!r)return !1;let a=t[s-1].angleTo(e)-e.angleTo(r);for(a=Math.abs((a+3*Math.PI)%(2*Math.PI)-Math.PI),l.push({distance:o,angleDelta:a}),u+=a;o-l[0].distance>n;)u-=l.shift().angleDelta;if(u>i)return !1;s++,o+=e.dist(r);}return !0}function hc(t){let e=0;for(let r=0;r<t.length-1;r++)e+=t[r].dist(t[r+1]);return e}function pc(t,e,r){return t?.6*e*r:0}function fc(t,e){return Math.max(t?t.right-t.left:0,e?e.right-e.left:0)}function dc(t,e,r,n,i,a){const s=pc(r,i,a),o=fc(r,n)*a;let l=0;const u=hc(t)/2;for(let r=0;r<t.length-1;r++){const n=t[r],i=t[r+1],a=n.dist(i);if(l+a>u){const c=(u-l)/a,h=Te.number(n.x,i.x,c),p=Te.number(n.y,i.y,c),f=new uc(h,p,i.angleTo(n),r);return f._round(),!s||cc(t,f,o,s,e)?f:void 0}l+=a;}}function yc(t,e,r,n,i,a,s,o,l){const u=pc(n,a,s),c=fc(n,i),h=c*s,p=0===t[0].x||t[0].x===l||0===t[0].y||t[0].y===l;return e-h<e/4&&(e=h+e/4),mc(t,p?e/2*o%e:(c/2+2*a)*s*o%e,e,u,r,h,p,!1,l)}function mc(t,e,r,n,i,a,s,o,l){const u=a/2,c=hc(t);let h=0,p=e-r,f=[];for(let e=0;e<t.length-1;e++){const s=t[e],o=t[e+1],d=s.dist(o),y=o.angleTo(s);for(;p+r<h+d;){p+=r;const m=(p-h)/d,g=Te.number(s.x,o.x,m),x=Te.number(s.y,o.y,m);if(g>=0&&g<l&&x>=0&&x<l&&p-u>=0&&p+u<=c){const r=new uc(g,x,y,e);r._round(),n&&!cc(t,r,a,n,i)||f.push(r);}}h+=d;}return o||f.length||s||(f=mc(t,h/2,r,n,i,a,s,!0,l)),f}In("Anchor",uc);const gc=Xl;function xc(t,e,r,n){const a=[],s=t.image,o=s.pixelRatio,l=s.paddedRect.w-2*gc,u=s.paddedRect.h-2*gc,c=t.right-t.left,h=t.bottom-t.top,p=s.stretchX||[[0,l]],f=s.stretchY||[[0,u]],d=(t,e)=>t+e[1]-e[0],y=p.reduce(d,0),m=f.reduce(d,0),g=l-y,x=u-m;let v=0,b=y,w=0,_=m,A=0,k=g,S=0,I=x;if(s.content&&n){const t=s.content;v=vc(p,0,t[0]),w=vc(f,0,t[1]),b=vc(p,t[0],t[2]),_=vc(f,t[1],t[3]),A=t[0]-v,S=t[1]-w,k=t[2]-t[0]-b,I=t[3]-t[1]-_;}const z=(n,a,l,u)=>{const p=wc(n.stretch-v,b,c,t.left),f=_c(n.fixed-A,k,n.stretch,y),d=wc(a.stretch-w,_,h,t.top),g=_c(a.fixed-S,I,a.stretch,m),x=wc(l.stretch-v,b,c,t.left),z=_c(l.fixed-A,k,l.stretch,y),M=wc(u.stretch-w,_,h,t.top),P=_c(u.fixed-S,I,u.stretch,m),B=new i(p,d),C=new i(x,d),V=new i(x,M),E=new i(p,M),F=new i(f/o,g/o),T=new i(z/o,P/o),L=e*Math.PI/180;if(L){const t=Math.sin(L),e=Math.cos(L),r=[e,-t,t,e];B._matMult(r),C._matMult(r),E._matMult(r),V._matMult(r);}const $=n.stretch+n.fixed,D=a.stretch+a.fixed;return {tl:B,tr:C,bl:E,br:V,tex:{x:s.paddedRect.x+gc+$,y:s.paddedRect.y+gc+D,w:l.stretch+l.fixed-$,h:u.stretch+u.fixed-D},writingMode:void 0,glyphOffset:[0,0],sectionIndex:0,pixelOffsetTL:F,pixelOffsetBR:T,minFontScaleX:k/o/c,minFontScaleY:I/o/h,isSDF:r}};if(n&&(s.stretchX||s.stretchY)){const t=bc(p,g,y),e=bc(f,x,m);for(let r=0;r<t.length-1;r++){const n=t[r],i=t[r+1];for(let t=0;t<e.length-1;t++)a.push(z(n,e[t],i,e[t+1]));}}else a.push(z({fixed:0,stretch:-1},{fixed:0,stretch:-1},{fixed:0,stretch:l+1},{fixed:0,stretch:u+1}));return a}function vc(t,e,r){let n=0;for(const i of t)n+=Math.max(e,Math.min(r,i[1]))-Math.max(e,Math.min(r,i[0]));return n}function bc(t,e,r){const n=[{fixed:-gc,stretch:0}];for(const[e,r]of t){const t=n[n.length-1];n.push({fixed:e-t.stretch,stretch:t.stretch}),n.push({fixed:e-t.stretch,stretch:t.stretch+(r-e)});}return n.push({fixed:e+gc,stretch:r}),n}function wc(t,e,r,n){return t/e*r+n}function _c(t,e,r,n){return t-e*r/n}class Ac{constructor(t,e,r,n,a,s,o,l,u,c){if(this.boxStartIndex=t.length,u){let t=s.top,e=s.bottom;const r=s.collisionPadding;r&&(t-=r[1],e+=r[3]);let n=e-t;n>0&&(n=Math.max(10,n),this.circleDiameter=n);}else {let u=s.top*o-l[0],h=s.bottom*o+l[2],p=s.left*o-l[3],f=s.right*o+l[1];const d=s.collisionPadding;if(d&&(p-=d[0]*o,u-=d[1]*o,f+=d[2]*o,h+=d[3]*o),c){const t=new i(p,u),e=new i(f,u),r=new i(p,h),n=new i(f,h),a=c*Math.PI/180;t._rotate(a),e._rotate(a),r._rotate(a),n._rotate(a),p=Math.min(t.x,e.x,r.x,n.x),f=Math.max(t.x,e.x,r.x,n.x),u=Math.min(t.y,e.y,r.y,n.y),h=Math.max(t.y,e.y,r.y,n.y);}t.emplaceBack(e.x,e.y,p,u,f,h,r,n,a);}this.boxEndIndex=t.length;}}class kc{constructor(t=[],e=Sc){if(this.data=t,this.length=this.data.length,this.compare=e,this.length>0)for(let t=(this.length>>1)-1;t>=0;t--)this._down(t);}push(t){this.data.push(t),this.length++,this._up(this.length-1);}pop(){if(0===this.length)return;const t=this.data[0],e=this.data.pop();return this.length--,this.length>0&&(this.data[0]=e,this._down(0)),t}peek(){return this.data[0]}_up(t){const{data:e,compare:r}=this,n=e[t];for(;t>0;){const i=t-1>>1,a=e[i];if(r(n,a)>=0)break;e[t]=a,t=i;}e[t]=n;}_down(t){const{data:e,compare:r}=this,n=this.length>>1,i=e[t];for(;t<n;){let n=1+(t<<1),a=e[n];const s=n+1;if(s<this.length&&r(e[s],a)<0&&(n=s,a=e[s]),r(a,i)>=0)break;e[t]=a,t=n;}e[t]=i;}}function Sc(t,e){return t<e?-1:t>e?1:0}function Ic(t,e=1,r=!1){let n=1/0,a=1/0,s=-1/0,o=-1/0;const l=t[0];for(let t=0;t<l.length;t++){const e=l[t];(!t||e.x<n)&&(n=e.x),(!t||e.y<a)&&(a=e.y),(!t||e.x>s)&&(s=e.x),(!t||e.y>o)&&(o=e.y);}const u=Math.min(s-n,o-a);let c=u/2;const h=new kc([],zc);if(0===u)return new i(n,a);for(let e=n;e<s;e+=u)for(let r=a;r<o;r+=u)h.push(new Mc(e+c,r+c,c,t));let p=function(t){let e=0,r=0,n=0;const i=t[0];for(let t=0,a=i.length,s=a-1;t<a;s=t++){const a=i[t],o=i[s],l=a.x*o.y-o.x*a.y;r+=(a.x+o.x)*l,n+=(a.y+o.y)*l,e+=3*l;}return new Mc(r/e,n/e,0,t)}(t),f=h.length;for(;h.length;){const n=h.pop();(n.d>p.d||!p.d)&&(p=n,r&&console.log("found best %d after %d probes",Math.round(1e4*n.d)/1e4,f)),n.max-p.d<=e||(c=n.h/2,h.push(new Mc(n.p.x-c,n.p.y-c,c,t)),h.push(new Mc(n.p.x+c,n.p.y-c,c,t)),h.push(new Mc(n.p.x-c,n.p.y+c,c,t)),h.push(new Mc(n.p.x+c,n.p.y+c,c,t)),f+=4);}return r&&(console.log(`num probes: ${f}`),console.log(`best distance: ${p.d}`)),p.p}function zc(t,e){return e.max-t.max}function Mc(t,e,r,n){this.p=new i(t,e),this.h=r,this.d=function(t,e){let r=!1,n=1/0;for(let i=0;i<e.length;i++){const a=e[i];for(let e=0,i=a.length,s=i-1;e<i;s=e++){const i=a[e],o=a[s];i.y>t.y!=o.y>t.y&&t.x<(o.x-i.x)*(t.y-i.y)/(o.y-i.y)+i.x&&(r=!r),n=Math.min(n,ns(t,i,o));}}return (r?1:-1)*Math.sqrt(n)}(this.p,n),this.max=this.d+this.h*Math.SQRT2;}const Pc=Number.POSITIVE_INFINITY;function Bc(t,e){return e[1]!==Pc?function(t,e,r){let n=0,i=0;switch(e=Math.abs(e),r=Math.abs(r),t){case"top-right":case"top-left":case"top":i=r-7;break;case"bottom-right":case"bottom-left":case"bottom":i=7-r;}switch(t){case"top-right":case"bottom-right":case"right":n=-e;break;case"top-left":case"bottom-left":case"left":n=e;}return [n,i]}(t,e[0],e[1]):function(t,e){let r=0,n=0;e<0&&(e=0);const i=e/Math.sqrt(2);switch(t){case"top-right":case"top-left":n=i-7;break;case"bottom-right":case"bottom-left":n=7-i;break;case"bottom":n=7-e;break;case"top":n=e-7;}switch(t){case"top-right":case"bottom-right":r=-i;break;case"top-left":case"bottom-left":r=i;break;case"left":r=e;break;case"right":r=-e;}return [r,n]}(t,e[0])}function Cc(t){switch(t){case"right":case"top-right":case"bottom-right":return "right";case"left":case"top-left":case"bottom-left":return "left"}return "center"}function Vc(e,r,n,i,a,s,o,l,u,c,h){let p=s.textMaxSize.evaluate(r,{});void 0===p&&(p=o);const f=e.layers[0].layout,d=f.get("icon-offset").evaluate(r,{},h),y=Fc(n.horizontal),m=o/24,g=e.tilePixelRatio*m,v=e.tilePixelRatio*p/24,b=e.tilePixelRatio*l,w=e.tilePixelRatio*f.get("symbol-spacing"),_=f.get("text-padding")*e.tilePixelRatio,A=function(t,e,r,n=1){const i=t.get("icon-padding").evaluate(e,{},r),a=i&&i.values;return [a[0]*n,a[1]*n,a[2]*n,a[3]*n]}(f,r,h,e.tilePixelRatio),k=f.get("text-max-angle")/180*Math.PI,S="viewport"!==f.get("text-rotation-alignment")&&"point"!==f.get("symbol-placement"),I="map"===f.get("icon-rotation-alignment")&&"point"!==f.get("symbol-placement"),z=f.get("symbol-placement"),M=w/2,P=f.get("icon-text-fit");let B;i&&"none"!==P&&(e.allowVerticalPlacement&&n.vertical&&(B=du(i,n.vertical,P,f.get("icon-text-fit-padding"),d,m)),y&&(i=du(i,y,P,f.get("icon-text-fit-padding"),d,m)));const C=(l,p)=>{p.x<0||p.x>=ja||p.y<0||p.y>=ja||function(e,r,n,i,a,s,o,l,u,c,h,p,f,d,y,m,g,v,b,w,_,A,k,S,I){const z=e.addToLineVertexArray(r,n);let M,P,B,C,V=0,E=0,F=0,T=0,L=-1,$=-1;const D={};let O=Aa(""),U=0,R=0;if(void 0===l._unevaluatedLayout.getValue("text-radial-offset")?[U,R]=l.layout.get("text-offset").evaluate(_,{},S).map((t=>t*vl)):(U=l.layout.get("text-radial-offset").evaluate(_,{},S)*vl,R=Pc),e.allowVerticalPlacement&&i.vertical){const t=l.layout.get("text-rotate").evaluate(_,{},S)+90;B=new Ac(u,r,c,h,p,i.vertical,f,d,y,t),o&&(C=new Ac(u,r,c,h,p,o,g,v,y,t));}if(a){const n=l.layout.get("icon-rotate").evaluate(_,{}),i="none"!==l.layout.get("icon-text-fit"),s=xc(a,n,k,i),f=o?xc(o,n,k,i):void 0;P=new Ac(u,r,c,h,p,a,g,v,!1,n),V=4*s.length;const d=e.iconSizeData;let y=null;"source"===d.kind?(y=[mu*l.layout.get("icon-size").evaluate(_,{})],y[0]>gu&&x(`${e.layerIds[0]}: Value for "icon-size" is >= ${yu}. Reduce your "icon-size".`)):"composite"===d.kind&&(y=[mu*A.compositeIconSizes[0].evaluate(_,{},S),mu*A.compositeIconSizes[1].evaluate(_,{},S)],(y[0]>gu||y[1]>gu)&&x(`${e.layerIds[0]}: Value for "icon-size" is >= ${yu}. Reduce your "icon-size".`)),e.addSymbols(e.icon,s,y,w,b,_,t.WritingMode.none,r,z.lineStartIndex,z.lineLength,-1,S),L=e.icon.placedSymbolArray.length-1,f&&(E=4*f.length,e.addSymbols(e.icon,f,y,w,b,_,t.WritingMode.vertical,r,z.lineStartIndex,z.lineLength,-1,S),$=e.icon.placedSymbolArray.length-1);}const q=Object.keys(i.horizontal);for(const n of q){const a=i.horizontal[n];if(!M){O=Aa(a.text);const t=l.layout.get("text-rotate").evaluate(_,{},S);M=new Ac(u,r,c,h,p,a,f,d,y,t);}const o=1===a.positionedLines.length;if(F+=Ec(e,r,a,s,l,y,_,m,z,i.vertical?t.WritingMode.horizontal:t.WritingMode.horizontalOnly,o?q:[n],D,L,A,S),o)break}i.vertical&&(T+=Ec(e,r,i.vertical,s,l,y,_,m,z,t.WritingMode.vertical,["vertical"],D,$,A,S));const j=M?M.boxStartIndex:e.collisionBoxArray.length,N=M?M.boxEndIndex:e.collisionBoxArray.length,Z=B?B.boxStartIndex:e.collisionBoxArray.length,K=B?B.boxEndIndex:e.collisionBoxArray.length,G=P?P.boxStartIndex:e.collisionBoxArray.length,J=P?P.boxEndIndex:e.collisionBoxArray.length,X=C?C.boxStartIndex:e.collisionBoxArray.length,Y=C?C.boxEndIndex:e.collisionBoxArray.length;let H=-1;const W=(t,e)=>t&&t.circleDiameter?Math.max(t.circleDiameter,e):e;H=W(M,H),H=W(B,H),H=W(P,H),H=W(C,H);const Q=H>-1?1:0;Q&&(H*=I/vl),e.glyphOffsetArray.length>=zu.MAX_GLYPHS&&x("Too many glyphs being rendered in a tile. See https://github.com/mapbox/mapbox-gl-js/issues/2907"),void 0!==_.sortKey&&e.addToSortKeyRanges(e.symbolInstances.length,_.sortKey),e.symbolInstances.emplaceBack(r.x,r.y,D.right>=0?D.right:-1,D.center>=0?D.center:-1,D.left>=0?D.left:-1,D.vertical||-1,L,$,O,j,N,Z,K,G,J,X,Y,c,F,T,V,E,Q,0,f,U,R,H);}(e,p,l,n,i,a,B,e.layers[0],e.collisionBoxArray,r.index,r.sourceLayerIndex,e.index,g,[_,_,_,_],S,u,b,A,I,d,r,s,c,h,o);};if("line"===z)for(const t of lc(r.geometry,0,0,ja,ja)){const r=yc(t,w,k,n.vertical||y,i,24,v,e.overscaling,ja);for(const n of r)y&&Tc(e,y.text,M,n)||C(t,n);}else if("line-center"===z){for(const t of r.geometry)if(t.length>1){const e=dc(t,k,n.vertical||y,i,24,v);e&&C(t,e);}}else if("Polygon"===r.type)for(const t of mo(r.geometry,0)){const e=Ic(t,16);C(t[0],new uc(e.x,e.y,0));}else if("LineString"===r.type)for(const t of r.geometry)C(t,new uc(t[0].x,t[0].y,0));else if("Point"===r.type)for(const t of r.geometry)for(const e of t)C([e],new uc(e.x,e.y,0));}function Ec(t,e,r,n,a,s,o,l,u,c,h,p,f,d,y){const m=function(t,e,r,n,a,s,o,l){const u=n.layout.get("text-rotate").evaluate(s,{})*Math.PI/180,c=[];for(const t of e.positionedLines)for(const n of t.positionedGlyphs){if(!n.rect)continue;const s=n.rect||{};let h=Gl+1,p=!0,f=1,d=0;const y=(a||l)&&n.vertical,m=n.metrics.advance*n.scale/2;if(l&&e.verticalizable&&(d=t.lineOffset/2-(n.imageName?-(vl-n.metrics.width*n.scale)/2:(n.scale-1)*vl)),n.imageName){const t=o[n.imageName];p=t.sdf,f=t.pixelRatio,h=Xl/f;}const g=a?[n.x+m,n.y]:[0,0];let x=a?[0,0]:[n.x+m+r[0],n.y+r[1]-d],v=[0,0];y&&(v=x,x=[0,0]);const b=(n.metrics.left-h)*n.scale-m+x[0],w=(-n.metrics.top-h)*n.scale+x[1],_=b+s.w*n.scale/f,A=w+s.h*n.scale/f,k=new i(b,w),S=new i(_,w),I=new i(b,A),z=new i(_,A);if(y){const t=new i(-m,m-Ql),e=-Math.PI/2,r=vl/2-m,a=new i(5-Ql-r,-(n.imageName?r:0)),s=new i(...v);k._rotateAround(e,t)._add(a)._add(s),S._rotateAround(e,t)._add(a)._add(s),I._rotateAround(e,t)._add(a)._add(s),z._rotateAround(e,t)._add(a)._add(s);}if(u){const t=Math.sin(u),e=Math.cos(u),r=[e,-t,t,e];k._matMult(r),S._matMult(r),I._matMult(r),z._matMult(r);}const M=new i(0,0),P=new i(0,0);c.push({tl:k,tr:S,bl:I,br:z,tex:s,writingMode:e.writingMode,glyphOffset:g,sectionIndex:n.sectionIndex,isSDF:p,pixelOffsetTL:M,pixelOffsetBR:P,minFontScaleX:0,minFontScaleY:0});}return c}(0,r,l,a,s,o,n,t.allowVerticalPlacement),g=t.textSizeData;let v=null;"source"===g.kind?(v=[mu*a.layout.get("text-size").evaluate(o,{})],v[0]>gu&&x(`${t.layerIds[0]}: Value for "text-size" is >= ${yu}. Reduce your "text-size".`)):"composite"===g.kind&&(v=[mu*d.compositeTextSizes[0].evaluate(o,{},y),mu*d.compositeTextSizes[1].evaluate(o,{},y)],(v[0]>gu||v[1]>gu)&&x(`${t.layerIds[0]}: Value for "text-size" is >= ${yu}. Reduce your "text-size".`)),t.addSymbols(t.text,m,v,l,s,o,c,e,u.lineStartIndex,u.lineLength,f,y);for(const e of h)p[e]=t.text.placedSymbolArray.length-1;return 4*m.length}function Fc(t){for(const e in t)return t[e];return null}function Tc(t,e,r,n){const i=t.compareText;if(e in i){const t=i[e];for(let e=t.length-1;e>=0;e--)if(n.dist(t[e])<r)return !0}else i[e]=[];return i[e].push(n),!1}const Lc=[Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array];class $c{static from(t){if(!(t instanceof ArrayBuffer))throw new Error("Data must be an instance of ArrayBuffer.");const[e,r]=new Uint8Array(t,0,2);if(219!==e)throw new Error("Data does not appear to be in a KDBush format.");const n=r>>4;if(1!==n)throw new Error(`Got v${n} data when expected v1.`);const i=Lc[15&r];if(!i)throw new Error("Unrecognized array type.");const[a]=new Uint16Array(t,2,1),[s]=new Uint32Array(t,4,1);return new $c(s,a,i,t)}constructor(t,e=64,r=Float64Array,n){if(isNaN(t)||t<0)throw new Error(`Unpexpected numItems value: ${t}.`);this.numItems=+t,this.nodeSize=Math.min(Math.max(+e,2),65535),this.ArrayType=r,this.IndexArrayType=t<65536?Uint16Array:Uint32Array;const i=Lc.indexOf(this.ArrayType),a=2*t*this.ArrayType.BYTES_PER_ELEMENT,s=t*this.IndexArrayType.BYTES_PER_ELEMENT,o=(8-s%8)%8;if(i<0)throw new Error(`Unexpected typed array class: ${r}.`);n&&n instanceof ArrayBuffer?(this.data=n,this.ids=new this.IndexArrayType(this.data,8,t),this.coords=new this.ArrayType(this.data,8+s+o,2*t),this._pos=2*t,this._finished=!0):(this.data=new ArrayBuffer(8+a+s+o),this.ids=new this.IndexArrayType(this.data,8,t),this.coords=new this.ArrayType(this.data,8+s+o,2*t),this._pos=0,this._finished=!1,new Uint8Array(this.data,0,2).set([219,16+i]),new Uint16Array(this.data,2,1)[0]=e,new Uint32Array(this.data,4,1)[0]=t);}add(t,e){const r=this._pos>>1;return this.ids[r]=r,this.coords[this._pos++]=t,this.coords[this._pos++]=e,r}finish(){const t=this._pos>>1;if(t!==this.numItems)throw new Error(`Added ${t} items when expected ${this.numItems}.`);return Dc(this.ids,this.coords,this.nodeSize,0,this.numItems-1,0),this._finished=!0,this}range(t,e,r,n){if(!this._finished)throw new Error("Data not yet indexed - call index.finish().");const{ids:i,coords:a,nodeSize:s}=this,o=[0,i.length-1,0],l=[];for(;o.length;){const u=o.pop()||0,c=o.pop()||0,h=o.pop()||0;if(c-h<=s){for(let s=h;s<=c;s++){const o=a[2*s],u=a[2*s+1];o>=t&&o<=r&&u>=e&&u<=n&&l.push(i[s]);}continue}const p=h+c>>1,f=a[2*p],d=a[2*p+1];f>=t&&f<=r&&d>=e&&d<=n&&l.push(i[p]),(0===u?t<=f:e<=d)&&(o.push(h),o.push(p-1),o.push(1-u)),(0===u?r>=f:n>=d)&&(o.push(p+1),o.push(c),o.push(1-u));}return l}within(t,e,r){if(!this._finished)throw new Error("Data not yet indexed - call index.finish().");const{ids:n,coords:i,nodeSize:a}=this,s=[0,n.length-1,0],o=[],l=r*r;for(;s.length;){const u=s.pop()||0,c=s.pop()||0,h=s.pop()||0;if(c-h<=a){for(let r=h;r<=c;r++)qc(i[2*r],i[2*r+1],t,e)<=l&&o.push(n[r]);continue}const p=h+c>>1,f=i[2*p],d=i[2*p+1];qc(f,d,t,e)<=l&&o.push(n[p]),(0===u?t-r<=f:e-r<=d)&&(s.push(h),s.push(p-1),s.push(1-u)),(0===u?t+r>=f:e+r>=d)&&(s.push(p+1),s.push(c),s.push(1-u));}return o}}function Dc(t,e,r,n,i,a){if(i-n<=r)return;const s=n+i>>1;Oc(t,e,s,n,i,a),Dc(t,e,r,n,s-1,1-a),Dc(t,e,r,s+1,i,1-a);}function Oc(t,e,r,n,i,a){for(;i>n;){if(i-n>600){const s=i-n+1,o=r-n+1,l=Math.log(s),u=.5*Math.exp(2*l/3),c=.5*Math.sqrt(l*u*(s-u)/s)*(o-s/2<0?-1:1);Oc(t,e,r,Math.max(n,Math.floor(r-o*u/s+c)),Math.min(i,Math.floor(r+(s-o)*u/s+c)),a);}const s=e[2*r+a];let o=n,l=i;for(Uc(t,e,n,r),e[2*i+a]>s&&Uc(t,e,n,i);o<l;){for(Uc(t,e,o,l),o++,l--;e[2*o+a]<s;)o++;for(;e[2*l+a]>s;)l--;}e[2*n+a]===s?Uc(t,e,n,l):(l++,Uc(t,e,l,i)),l<=r&&(n=l+1),r<=l&&(i=l-1);}}function Uc(t,e,r,n){Rc(t,r,n),Rc(e,2*r,2*n),Rc(e,2*r+1,2*n+1);}function Rc(t,e,r){const n=t[e];t[e]=t[r],t[r]=n;}function qc(t,e,r,n){const i=t-r,a=e-n;return i*i+a*a}var jc;t.PerformanceMarkers=void 0,(jc=t.PerformanceMarkers||(t.PerformanceMarkers={})).create="create",jc.load="load",jc.fullLoad="fullLoad";let Nc=null,Zc=[];const Kc=1e3/60,Gc="loadTime",Jc="fullLoadTime",Xc={mark(t){performance.mark(t);},frame(t){const e=t;null!=Nc&&Zc.push(e-Nc),Nc=e;},clearMetrics(){Nc=null,Zc=[],performance.clearMeasures(Gc),performance.clearMeasures(Jc);for(const e in t.PerformanceMarkers)performance.clearMarks(t.PerformanceMarkers[e]);},getPerformanceMetrics(){performance.measure(Gc,t.PerformanceMarkers.create,t.PerformanceMarkers.load),performance.measure(Jc,t.PerformanceMarkers.create,t.PerformanceMarkers.fullLoad);const e=performance.getEntriesByName(Gc)[0].duration,r=performance.getEntriesByName(Jc)[0].duration,n=Zc.length,i=1/(Zc.reduce(((t,e)=>t+e),0)/n/1e3),a=Zc.filter((t=>t>Kc)).reduce(((t,e)=>t+(e-Kc)/Kc),0);return {loadTime:e,fullLoadTime:r,fps:i,percentDroppedFrames:a/(n+a)*100,totalFrames:n}}};t.AJAXError=B,t.ARRAY_TYPE=ds,t.Actor=class{constructor(t,e,r){this.receive=t=>{const e=t.data,r=e.id;if(r&&(!e.targetMapId||this.mapId===e.targetMapId))if("<cancel>"===e.type){delete this.tasks[r];const t=this.cancelCallbacks[r];delete this.cancelCallbacks[r],t&&t();}else w()||e.mustQueue?(this.tasks[r]=e,this.taskQueue.push(r),this.invoker.trigger()):this.processTask(r,e);},this.process=()=>{if(!this.taskQueue.length)return;const t=this.taskQueue.shift(),e=this.tasks[t];delete this.tasks[t],this.taskQueue.length&&this.invoker.trigger(),e&&this.processTask(t,e);},this.target=t,this.parent=e,this.mapId=r,this.callbacks={},this.tasks={},this.taskQueue=[],this.cancelCallbacks={},this.invoker=new Uu(this.process),this.target.addEventListener("message",this.receive,!1),this.globalScope=w()?t:window;}send(t,e,r,n,i=!1){const a=Math.round(1e18*Math.random()).toString(36).substring(0,10);r&&(this.callbacks[a]=r);const s=A(this.globalScope)?void 0:[];return this.target.postMessage({id:a,type:t,hasCallback:!!r,targetMapId:n,mustQueue:i,sourceMapId:this.mapId,data:Mn(e,s)},s),{cancel:()=>{r&&delete this.callbacks[a],this.target.postMessage({id:a,type:"<cancel>",targetMapId:n,sourceMapId:this.mapId});}}}processTask(t,e){if("<response>"===e.type){const r=this.callbacks[t];delete this.callbacks[t],r&&(e.error?r(Pn(e.error)):r(null,Pn(e.data)));}else {let r=!1;const n=A(this.globalScope)?void 0:[],i=e.hasCallback?(e,i)=>{r=!0,delete this.cancelCallbacks[t],this.target.postMessage({id:t,type:"<response>",sourceMapId:this.mapId,error:e?Mn(e):null,data:Mn(i,n)},n);}:t=>{r=!0;};let a=null;const s=Pn(e.data);if(this.parent[e.type])a=this.parent[e.type](e.sourceMapId,s,i);else if(this.parent.getWorkerSource){const t=e.type.split(".");a=this.parent.getWorkerSource(e.sourceMapId,t[0],s.source)[t[1]](s,i);}else i(new Error(`Could not find function ${e.type}`));!r&&a&&a.cancel&&(this.cancelCallbacks[t]=a.cancel);}}remove(){this.invoker.remove(),this.target.removeEventListener("message",this.receive,!1);}},t.AlphaImage=Ms,t.CanonicalTileID=Hu,t.CollisionBoxArray=ji,t.CollisionCircleLayoutArray=class extends Vi{},t.Color=qt,t.DEMData=ec,t.DataConstantProperty=oi,t.DictionaryCoder=rc,t.EXTENT=ja,t.ErrorEvent=U,t.EvaluationParameters=Wn,t.Event=O,t.Evented=R,t.FeatureIndex=ic,t.FillBucket=bo,t.FillExtrusionBucket=jo,t.GeoJSONFeature=nc,t.ImageAtlas=Hl,t.ImagePosition=Yl,t.KDBush=$c,t.LineBucket=il,t.LineStripIndexArray=class extends Ui{},t.LngLat=qu,t.MercatorCoordinate=Xu,t.ONE_EM=vl,t.OverscaledTileID=Qu,t.PerformanceUtils=Xc,t.Point=i,t.Pos3dArray=class extends wi{},t.PosArray=Wi,t.Properties=pi,t.Protobuf=ql,t.QuadTriangleArray=class extends Fi{},t.RGBAImage=Ps,t.RasterBoundsArray=class extends _i{},t.RequestPerformance=class{constructor(t){this._marks={start:[t.url,"start"].join("#"),end:[t.url,"end"].join("#"),measure:t.url.toString()},performance.mark(this._marks.start);}finish(){performance.mark(this._marks.end);let t=performance.getEntriesByName(this._marks.measure);return 0===t.length&&(performance.measure(this._marks.measure,this._marks.start,this._marks.end),t=performance.getEntriesByName(this._marks.measure),performance.clearMarks(this._marks.start),performance.clearMarks(this._marks.end),performance.clearMeasures(this._marks.measure)),t}},t.SegmentVector=da,t.SymbolBucket=zu,t.Transitionable=ei,t.TriangleIndexArray=ca,t.Uniform1f=Pa,t.Uniform1i=class extends Ma{constructor(t,e){super(t,e),this.current=0;}set(t){this.current!==t&&(this.current=t,this.gl.uniform1i(this.location,t));}},t.Uniform2f=class extends Ma{constructor(t,e){super(t,e),this.current=[0,0];}set(t){t[0]===this.current[0]&&t[1]===this.current[1]||(this.current=t,this.gl.uniform2f(this.location,t[0],t[1]));}},t.Uniform3f=class extends Ma{constructor(t,e){super(t,e),this.current=[0,0,0];}set(t){t[0]===this.current[0]&&t[1]===this.current[1]&&t[2]===this.current[2]||(this.current=t,this.gl.uniform3f(this.location,t[0],t[1],t[2]));}},t.Uniform4f=Ba,t.UniformColor=Ca,t.UniformMatrix4f=class extends Ma{constructor(t,e){super(t,e),this.current=Va;}set(t){if(t[12]!==this.current[12]||t[0]!==this.current[0])return this.current=t,void this.gl.uniformMatrix4fv(this.location,!1,t);for(let e=1;e<16;e++)if(t[e]!==this.current[e]){this.current=t,this.gl.uniformMatrix4fv(this.location,!1,t);break}}},t.UnwrappedTileID=Wu,t.ValidationError=tt,t.ZoomHistory=Bn,t.addDynamicAttributes=Au,t.arrayBufferToImage=function(t,e){const r=new Image;r.onload=()=>{e(null,r),URL.revokeObjectURL(r.src),r.onload=null,window.requestAnimationFrame((()=>{r.src=S;}));},r.onerror=()=>e(new Error("Could not load image. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported."));const n=new Blob([new Uint8Array(t)],{type:"image/png"});r.src=t.byteLength?URL.createObjectURL(n):S;},t.arrayBufferToImageBitmap=function(t,e){const r=new Blob([new Uint8Array(t)],{type:"image/png"});createImageBitmap(r).then((t=>{e(null,t);})).catch((t=>{e(new Error(`Could not load image because of ${t.message}. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.`));}));},t.asyncAll=function(t,e,r){if(!t.length)return r(null,[]);let n=t.length;const i=new Array(t.length);let a=null;t.forEach(((t,s)=>{e(t,((t,e)=>{t&&(a=t),i[s]=e,0==--n&&r(a,i);}));}));},t.bezier=l,t.browser=M,t.clamp=c,t.clipLine=lc,t.clone=function(t){var e=new ds(16);return e[0]=t[0],e[1]=t[1],e[2]=t[2],e[3]=t[3],e[4]=t[4],e[5]=t[5],e[6]=t[6],e[7]=t[7],e[8]=t[8],e[9]=t[9],e[10]=t[10],e[11]=t[11],e[12]=t[12],e[13]=t[13],e[14]=t[14],e[15]=t[15],e},t.clone$1=m,t.collisionCircleLayout=ml,t.config=P,t.copy=function(t,e){return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[4]=e[4],t[5]=e[5],t[6]=e[6],t[7]=e[7],t[8]=e[8],t[9]=e[9],t[10]=e[10],t[11]=e[11],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15],t},t.create=function(){var t=new ds(16);return ds!=Float32Array&&(t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0),t[0]=1,t[5]=1,t[10]=1,t[15]=1,t},t.createExpression=Ir,t.createFilter=Fr,t.createLayout=xi,t.createStyleLayer=function(t){if("custom"===t.type)return new Ou(t);switch(t.type){case"background":return new Tu(t);case"circle":return new bs(t);case"fill":return new ko(t);case"fill-extrusion":return new Jo(t);case"heatmap":return new Cs(t);case"hillshade":return new Fs(t);case"line":return new cl(t);case"raster":return new Du(t);case"symbol":return new Vu(t)}},t.deepEqual=function t(e,r){if(Array.isArray(e)){if(!Array.isArray(r)||e.length!==r.length)return !1;for(let n=0;n<e.length;n++)if(!t(e[n],r[n]))return !1;return !0}if("object"==typeof e&&null!==e&&null!==r){if("object"!=typeof r)return !1;if(Object.keys(e).length!==Object.keys(r).length)return !1;for(const n in e)if(!t(e[n],r[n]))return !1;return !0}return e===r},t.defaultEasing=u,t.derefLayers=function(t){t=t.slice();const e=Object.create(null);for(let r=0;r<t.length;r++)e[t[r].id]=t[r];for(let r=0;r<t.length;r++)"ref"in t[r]&&(t[r]=N(t[r],e[t[r].ref]));return t},t.diffStyles=function(t,e){if(!t)return [{command:K.setStyle,args:[e]}];let r=[];try{if(!Z(t.version,e.version))return [{command:K.setStyle,args:[e]}];Z(t.center,e.center)||r.push({command:K.setCenter,args:[e.center]}),Z(t.zoom,e.zoom)||r.push({command:K.setZoom,args:[e.zoom]}),Z(t.bearing,e.bearing)||r.push({command:K.setBearing,args:[e.bearing]}),Z(t.pitch,e.pitch)||r.push({command:K.setPitch,args:[e.pitch]}),Z(t.sprite,e.sprite)||r.push({command:K.setSprite,args:[e.sprite]}),Z(t.glyphs,e.glyphs)||r.push({command:K.setGlyphs,args:[e.glyphs]}),Z(t.transition,e.transition)||r.push({command:K.setTransition,args:[e.transition]}),Z(t.light,e.light)||r.push({command:K.setLight,args:[e.light]});const n={},i=[];!function(t,e,r,n){let i;for(i in e=e||{},t=t||{})Object.prototype.hasOwnProperty.call(t,i)&&(Object.prototype.hasOwnProperty.call(e,i)||J(i,r,n));for(i in e)Object.prototype.hasOwnProperty.call(e,i)&&(Object.prototype.hasOwnProperty.call(t,i)?Z(t[i],e[i])||("geojson"===t[i].type&&"geojson"===e[i].type&&Y(t,e,i)?r.push({command:K.setGeoJSONSourceData,args:[i,e[i].data]}):X(i,e,r,n)):G(i,e,r));}(t.sources,e.sources,i,n);const a=[];t.layers&&t.layers.forEach((t=>{n[t.source]?r.push({command:K.removeLayer,args:[t.id]}):a.push(t);})),r=r.concat(i),function(t,e,r){e=e||[];const n=(t=t||[]).map(W),i=e.map(W),a=t.reduce(Q,{}),s=e.reduce(Q,{}),o=n.slice(),l=Object.create(null);let u,c,h,p,f,d,y;for(u=0,c=0;u<n.length;u++)h=n[u],Object.prototype.hasOwnProperty.call(s,h)?c++:(r.push({command:K.removeLayer,args:[h]}),o.splice(o.indexOf(h,c),1));for(u=0,c=0;u<i.length;u++)h=i[i.length-1-u],o[o.length-1-u]!==h&&(Object.prototype.hasOwnProperty.call(a,h)?(r.push({command:K.removeLayer,args:[h]}),o.splice(o.lastIndexOf(h,o.length-c),1)):c++,d=o[o.length-u],r.push({command:K.addLayer,args:[s[h],d]}),o.splice(o.length-u,0,h),l[h]=!0);for(u=0;u<i.length;u++)if(h=i[u],p=a[h],f=s[h],!l[h]&&!Z(p,f))if(Z(p.source,f.source)&&Z(p["source-layer"],f["source-layer"])&&Z(p.type,f.type)){for(y in H(p.layout,f.layout,r,h,null,K.setLayoutProperty),H(p.paint,f.paint,r,h,null,K.setPaintProperty),Z(p.filter,f.filter)||r.push({command:K.setFilter,args:[h,f.filter]}),Z(p.minzoom,f.minzoom)&&Z(p.maxzoom,f.maxzoom)||r.push({command:K.setLayerZoomRange,args:[h,f.minzoom,f.maxzoom]}),p)Object.prototype.hasOwnProperty.call(p,y)&&"layout"!==y&&"paint"!==y&&"filter"!==y&&"metadata"!==y&&"minzoom"!==y&&"maxzoom"!==y&&(0===y.indexOf("paint.")?H(p[y],f[y],r,h,y.slice(6),K.setPaintProperty):Z(p[y],f[y])||r.push({command:K.setLayerProperty,args:[h,y,f[y]]}));for(y in f)Object.prototype.hasOwnProperty.call(f,y)&&!Object.prototype.hasOwnProperty.call(p,y)&&"layout"!==y&&"paint"!==y&&"filter"!==y&&"metadata"!==y&&"minzoom"!==y&&"maxzoom"!==y&&(0===y.indexOf("paint.")?H(p[y],f[y],r,h,y.slice(6),K.setPaintProperty):Z(p[y],f[y])||r.push({command:K.setLayerProperty,args:[h,y,f[y]]}));}else r.push({command:K.removeLayer,args:[h]}),d=o[o.lastIndexOf(h)+1],r.push({command:K.addLayer,args:[f,d]});}(a,e.layers,r);}catch(t){console.warn("Unable to compute style diff:",t),r=[{command:K.setStyle,args:[e]}];}return r},t.dot=function(t,e){return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]+t[3]*e[3]},t.earthRadius=Ru,t.emitValidationErrors=An,t.emptyStyle=function(){const t={},e=q.$version;for(const r in q.$root){const n=q.$root[r];if(n.required){let i=null;i="version"===r?e:"array"===n.type?[]:{},null!=i&&(t[r]=i);}}return t},t.equals=function(t,e){var r=t[0],n=t[1],i=t[2],a=t[3],s=t[4],o=t[5],l=t[6],u=t[7],c=t[8],h=t[9],p=t[10],f=t[11],d=t[12],y=t[13],m=t[14],g=t[15],x=e[0],v=e[1],b=e[2],w=e[3],_=e[4],A=e[5],k=e[6],S=e[7],I=e[8],z=e[9],M=e[10],P=e[11],B=e[12],C=e[13],V=e[14],E=e[15];return Math.abs(r-x)<=fs*Math.max(1,Math.abs(r),Math.abs(x))&&Math.abs(n-v)<=fs*Math.max(1,Math.abs(n),Math.abs(v))&&Math.abs(i-b)<=fs*Math.max(1,Math.abs(i),Math.abs(b))&&Math.abs(a-w)<=fs*Math.max(1,Math.abs(a),Math.abs(w))&&Math.abs(s-_)<=fs*Math.max(1,Math.abs(s),Math.abs(_))&&Math.abs(o-A)<=fs*Math.max(1,Math.abs(o),Math.abs(A))&&Math.abs(l-k)<=fs*Math.max(1,Math.abs(l),Math.abs(k))&&Math.abs(u-S)<=fs*Math.max(1,Math.abs(u),Math.abs(S))&&Math.abs(c-I)<=fs*Math.max(1,Math.abs(c),Math.abs(I))&&Math.abs(h-z)<=fs*Math.max(1,Math.abs(h),Math.abs(z))&&Math.abs(p-M)<=fs*Math.max(1,Math.abs(p),Math.abs(M))&&Math.abs(f-P)<=fs*Math.max(1,Math.abs(f),Math.abs(P))&&Math.abs(d-B)<=fs*Math.max(1,Math.abs(d),Math.abs(B))&&Math.abs(y-C)<=fs*Math.max(1,Math.abs(y),Math.abs(C))&&Math.abs(m-V)<=fs*Math.max(1,Math.abs(m),Math.abs(V))&&Math.abs(g-E)<=fs*Math.max(1,Math.abs(g),Math.abs(E))},t.evaluateSizeForFeature=function(t,{uSize:e,uSizeT:r},{lowerSize:n,upperSize:i}){return "source"===t.kind?n/mu:"composite"===t.kind?Te.number(n/mu,i/mu,r):e},t.evaluateSizeForZoom=function(t,e){let r=0,n=0;if("constant"===t.kind)n=t.layoutSize;else if("source"!==t.kind){const{interpolationType:i,minZoom:a,maxZoom:s}=t,o=i?c(Le.interpolationFactor(i,e,a,s),0,1):0;"camera"===t.kind?n=Te.number(t.minSize,t.maxSize,o):r=o;}return {uSizeT:r,uSize:n}},t.evaluateVariableOffset=Bc,t.evented=Jn,t.extend=p,t.filterObject=y,t.findLineIntersection=function(t,e,r,n){const a=e.y-t.y,s=e.x-t.x,o=n.y-r.y,l=n.x-r.x,u=o*s-l*a;if(0===u)return null;const c=(l*(t.y-r.y)-o*(t.x-r.x))/u;return new i(t.x+c*s,t.y+c*a)},t.fromScaling=function(t,e){return t[0]=e[0],t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=e[1],t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=e[2],t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t},t.getAnchorAlignment=hu,t.getAnchorJustification=Cc,t.getArrayBuffer=T,t.getDefaultExportFromCjs=e,t.getJSON=function(t,e){return F(p(t,{type:"json"}),e)},t.getOverlapMode=vu,t.getProtocolAction=V,t.getRTLTextPluginStatus=Xn,t.getReferrer=C,t.getVideo=function(t,e){const r=window.document.createElement("video");r.muted=!0,r.onloadstart=function(){e(null,r);};for(let e=0;e<t.length;e++){const n=window.document.createElement("source");L(t[e])||(r.crossOrigin="Anonymous"),n.src=t[e],r.appendChild(n);}return {cancel:()=>{}}},t.groupByLayout=function(t,e){const r={};for(let n=0;n<t.length;n++){const i=e&&e[t[n].id]||jr(t[n]);e&&(e[t[n].id]=i);let a=r[i];a||(a=r[i]=[]),a.push(t[n]);}const n=[];for(const t in r)n.push(r[t]);return n},t.identity=ys,t.interpolate=Te,t.invert=function(t,e){var r=e[0],n=e[1],i=e[2],a=e[3],s=e[4],o=e[5],l=e[6],u=e[7],c=e[8],h=e[9],p=e[10],f=e[11],d=e[12],y=e[13],m=e[14],g=e[15],x=r*o-n*s,v=r*l-i*s,b=r*u-a*s,w=n*l-i*o,_=n*u-a*o,A=i*u-a*l,k=c*y-h*d,S=c*m-p*d,I=c*g-f*d,z=h*m-p*y,M=h*g-f*y,P=p*g-f*m,B=x*P-v*M+b*z+w*I-_*S+A*k;return B?(t[0]=(o*P-l*M+u*z)*(B=1/B),t[1]=(i*M-n*P-a*z)*B,t[2]=(y*A-m*_+g*w)*B,t[3]=(p*_-h*A-f*w)*B,t[4]=(l*I-s*P-u*S)*B,t[5]=(r*P-i*I+a*S)*B,t[6]=(m*b-d*A-g*v)*B,t[7]=(c*A-p*b+f*v)*B,t[8]=(s*M-o*I+u*k)*B,t[9]=(n*I-r*M-a*k)*B,t[10]=(d*_-y*b+g*x)*B,t[11]=(h*b-c*_-f*x)*B,t[12]=(o*S-s*z-l*k)*B,t[13]=(r*z-n*S+i*k)*B,t[14]=(y*v-d*w-m*x)*B,t[15]=(c*w-h*v+p*x)*B,t):null},t.isImageBitmap=k,t.isSafari=A,t.isWorker=w,t.keysDifference=function(t,e){const r=[];for(const n in t)n in e||r.push(n);return r},t.lazyLoadRTLTextPlugin=function(){Hn.isLoading()||Hn.isLoaded()||"deferred"!==Xn()||Yn();},t.makeRequest=F,t.mapObject=d,t.mercatorXfromLng=Zu,t.mercatorYfromLat=Ku,t.mercatorZfromAltitude=Gu,t.mul=xs,t.mul$1=function(t,e,r){return t[0]=e[0]*r[0],t[1]=e[1]*r[1],t[2]=e[2]*r[2],t[3]=e[3]*r[3],t},t.multiply=ms,t.nextPowerOfTwo=function(t){return t<=1?1:Math.pow(2,Math.ceil(Math.log(t)/Math.LN2))},t.operations=K,t.ortho=function(t,e,r,n,i,a,s){var o=1/(e-r),l=1/(n-i),u=1/(a-s);return t[0]=-2*o,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=-2*l,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=2*u,t[11]=0,t[12]=(e+r)*o,t[13]=(i+n)*l,t[14]=(s+a)*u,t[15]=1,t},t.parseCacheControl=function(t){const e={};if(t.replace(/(?:^|(?:\s*\,\s*))([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)(?:\=(?:([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)|(?:\"((?:[^"\\]|\\.)*)\")))?/g,((t,r,n,i)=>{const a=n||i;return e[r]=!a||a.toLowerCase(),""})),e["max-age"]){const t=parseInt(e["max-age"],10);isNaN(t)?delete e["max-age"]:e["max-age"]=t;}return e},t.parseGlyphPbf=function(t){return new ql(t).readFields(Nl,[])},t.pbf=bl,t.performSymbolLayout=function(e){e.bucket.createArrays(),e.bucket.tilePixelRatio=ja/(512*e.bucket.overscaling),e.bucket.compareText={},e.bucket.iconsNeedLinear=!1;const r=e.bucket.layers[0].layout,n=e.bucket.layers[0]._unevaluatedLayout._values,i={layoutIconSize:n["icon-size"].possiblyEvaluate(new Wn(e.bucket.zoom+1),e.canonical),layoutTextSize:n["text-size"].possiblyEvaluate(new Wn(e.bucket.zoom+1),e.canonical),textMaxSize:n["text-size"].possiblyEvaluate(new Wn(18))};if("composite"===e.bucket.textSizeData.kind){const{minZoom:t,maxZoom:r}=e.bucket.textSizeData;i.compositeTextSizes=[n["text-size"].possiblyEvaluate(new Wn(t),e.canonical),n["text-size"].possiblyEvaluate(new Wn(r),e.canonical)];}if("composite"===e.bucket.iconSizeData.kind){const{minZoom:t,maxZoom:r}=e.bucket.iconSizeData;i.compositeIconSizes=[n["icon-size"].possiblyEvaluate(new Wn(t),e.canonical),n["icon-size"].possiblyEvaluate(new Wn(r),e.canonical)];}const a=r.get("text-line-height")*vl,s="viewport"!==r.get("text-rotation-alignment")&&"point"!==r.get("symbol-placement"),o=r.get("text-keep-upright"),l=r.get("text-size");for(const n of e.bucket.features){const u=r.get("text-font").evaluate(n,{},e.canonical).join(","),c=l.evaluate(n,{},e.canonical),h=i.layoutTextSize.evaluate(n,{},e.canonical),p=i.layoutIconSize.evaluate(n,{},e.canonical),f={horizontal:{},vertical:void 0},d=n.text;let y,m=[0,0];if(d){const i=d.toString(),l=r.get("text-letter-spacing").evaluate(n,{},e.canonical)*vl,p=En(i)?l:0,y=r.get("text-anchor").evaluate(n,{},e.canonical),g=r.get("text-variable-anchor");if(!g){const t=r.get("text-radial-offset").evaluate(n,{},e.canonical);m=t?Bc(y,[t*vl,Pc]):r.get("text-offset").evaluate(n,{},e.canonical).map((t=>t*vl));}let x=s?"center":r.get("text-justify").evaluate(n,{},e.canonical);const v=r.get("symbol-placement"),b="point"===v?r.get("text-max-width").evaluate(n,{},e.canonical)*vl:0,w=()=>{e.bucket.allowVerticalPlacement&&Vn(i)&&(f.vertical=ru(d,e.glyphMap,e.glyphPositions,e.imagePositions,u,b,a,y,"left",p,m,t.WritingMode.vertical,!0,v,h,c));};if(!s&&g){const r="auto"===x?g.map((t=>Cc(t))):[x];let n=!1;for(let i=0;i<r.length;i++){const s=r[i];if(!f.horizontal[s])if(n)f.horizontal[s]=f.horizontal[0];else {const r=ru(d,e.glyphMap,e.glyphPositions,e.imagePositions,u,b,a,"center",s,p,m,t.WritingMode.horizontal,!1,v,h,c);r&&(f.horizontal[s]=r,n=1===r.positionedLines.length);}}w();}else {"auto"===x&&(x=Cc(y));const r=ru(d,e.glyphMap,e.glyphPositions,e.imagePositions,u,b,a,y,x,p,m,t.WritingMode.horizontal,!1,v,h,c);r&&(f.horizontal[x]=r),w(),Vn(i)&&s&&o&&(f.vertical=ru(d,e.glyphMap,e.glyphPositions,e.imagePositions,u,b,a,y,x,p,m,t.WritingMode.vertical,!1,v,h,c));}}let g=!1;if(n.icon&&n.icon.name){const t=e.imageMap[n.icon.name];t&&(y=fu(e.imagePositions[n.icon.name],r.get("icon-offset").evaluate(n,{},e.canonical),r.get("icon-anchor").evaluate(n,{},e.canonical)),g=!!t.sdf,void 0===e.bucket.sdfIcons?e.bucket.sdfIcons=g:e.bucket.sdfIcons!==g&&x("Style sheet warning: Cannot mix SDF and non-SDF icons in one buffer"),(t.pixelRatio!==e.bucket.pixelRatio||0!==r.get("icon-rotate").constantOr(1))&&(e.bucket.iconsNeedLinear=!0));}const v=Fc(f.horizontal)||f.vertical;e.bucket.iconsInText=!!v&&v.iconsInText,(v||y)&&Vc(e.bucket,n,f,y,e.imageMap,i,h,p,m,g,e.canonical);}e.showCollisionBoxes&&e.bucket.generateCollisionDebugBuffers();},t.perspective=function(t,e,r,n,i){var a,s=1/Math.tan(e/2);return t[0]=s/r,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=s,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=-1,t[12]=0,t[13]=0,t[15]=0,null!=i&&i!==1/0?(t[10]=(i+n)*(a=1/(n-i)),t[14]=2*i*n*a):(t[10]=-1,t[14]=-2*n),t},t.pick=function(t,e){const r={};for(let n=0;n<e.length;n++){const i=e[n];i in t&&(r[i]=t[i]);}return r},t.plugin=Hn,t.pointGeometry=r,t.polygonIntersectsPolygon=Ya,t.potpack=Jl,t.register=In,t.registerForPluginStateChange=function(t){return t({pluginStatus:Nn,pluginURL:Zn}),Jn.on("pluginStateChange",t),t},t.renderColorRamp=Bs,t.rotateX=function(t,e,r){var n=Math.sin(r),i=Math.cos(r),a=e[4],s=e[5],o=e[6],l=e[7],u=e[8],c=e[9],h=e[10],p=e[11];return e!==t&&(t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t[4]=a*i+u*n,t[5]=s*i+c*n,t[6]=o*i+h*n,t[7]=l*i+p*n,t[8]=u*i-a*n,t[9]=c*i-s*n,t[10]=h*i-o*n,t[11]=p*i-l*n,t},t.rotateZ=function(t,e,r){var n=Math.sin(r),i=Math.cos(r),a=e[0],s=e[1],o=e[2],l=e[3],u=e[4],c=e[5],h=e[6],p=e[7];return e!==t&&(t[8]=e[8],t[9]=e[9],t[10]=e[10],t[11]=e[11],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t[0]=a*i+u*n,t[1]=s*i+c*n,t[2]=o*i+h*n,t[3]=l*i+p*n,t[4]=u*i-a*n,t[5]=c*i-s*n,t[6]=h*i-o*n,t[7]=p*i-l*n,t},t.sameOrigin=L,t.scale=function(t,e,r){var n=r[0],i=r[1],a=r[2];return t[0]=e[0]*n,t[1]=e[1]*n,t[2]=e[2]*n,t[3]=e[3]*n,t[4]=e[4]*i,t[5]=e[5]*i,t[6]=e[6]*i,t[7]=e[7]*i,t[8]=e[8]*a,t[9]=e[9]*a,t[10]=e[10]*a,t[11]=e[11]*a,t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15],t},t.setRTLTextPlugin=function(t,e,r=!1){if(Nn===Un||Nn===Rn||Nn===qn)throw new Error("setRTLTextPlugin cannot be called multiple times.");Zn=M.resolveURL(t),Nn=Un,jn=e,Gn(),r||Yn();},t.sphericalToCartesian=function([t,e,r]){return e+=90,e*=Math.PI/180,r*=Math.PI/180,{x:t*Math.cos(e)*Math.sin(r),y:t*Math.sin(e)*Math.sin(r),z:t*Math.cos(r)}},t.toEvaluationFeature=Ga,t.transformMat4=vs,t.translate=function(t,e,r){var n,i,a,s,o,l,u,c,h,p,f,d,y=r[0],m=r[1],g=r[2];return e===t?(t[12]=e[0]*y+e[4]*m+e[8]*g+e[12],t[13]=e[1]*y+e[5]*m+e[9]*g+e[13],t[14]=e[2]*y+e[6]*m+e[10]*g+e[14],t[15]=e[3]*y+e[7]*m+e[11]*g+e[15]):(i=e[1],a=e[2],s=e[3],o=e[4],l=e[5],u=e[6],c=e[7],h=e[8],p=e[9],f=e[10],d=e[11],t[0]=n=e[0],t[1]=i,t[2]=a,t[3]=s,t[4]=o,t[5]=l,t[6]=u,t[7]=c,t[8]=h,t[9]=p,t[10]=f,t[11]=d,t[12]=n*y+o*m+h*g+e[12],t[13]=i*y+l*m+p*g+e[13],t[14]=a*y+u*m+f*g+e[14],t[15]=s*y+c*m+d*g+e[15]),t},t.triggerPluginCompletionEvent=Kn,t.unicodeBlockLookup=Cn,t.uniqueId=function(){return f++},t.v8Spec=q,t.validateCustomStyleLayer=function(t){const e=[],r=t.id;return void 0===r&&e.push({message:`layers.${r}: missing required property "id"`}),void 0===t.render&&e.push({message:`layers.${r}: missing required method "render"`}),t.renderingMode&&"2d"!==t.renderingMode&&"3d"!==t.renderingMode&&e.push({message:`layers.${r}: property "renderingMode" must be either "2d" or "3d"`}),e},t.validateLight=bn,t.validateStyle=vn,t.vectorTile=Mo,t.warnOnce=x,t.wrap=h;}));

define(["./shared"],(function(e){"use strict";class t{constructor(e){this.keyCache={},e&&this.replace(e);}replace(e){this._layerConfigs={},this._layers={},this.update(e,[]);}update(t,i){for(const i of t){this._layerConfigs[i.id]=i;const t=this._layers[i.id]=e.createStyleLayer(i);t._featureFilter=e.createFilter(t.filter),this.keyCache[i.id]&&delete this.keyCache[i.id];}for(const e of i)delete this.keyCache[e],delete this._layerConfigs[e],delete this._layers[e];this.familiesBySource={};const o=e.groupByLayout(Object.values(this._layerConfigs),this.keyCache);for(const e of o){const t=e.map((e=>this._layers[e.id])),i=t[0];if("none"===i.visibility)continue;const o=i.source||"";let r=this.familiesBySource[o];r||(r=this.familiesBySource[o]={});const s=i.sourceLayer||"_geojsonTileLayer";let n=r[s];n||(n=r[s]=[]),n.push(t);}}}class i{constructor(t){const i={},o=[];for(const e in t){const r=t[e],s=i[e]={};for(const e in r){const t=r[+e];if(!t||0===t.bitmap.width||0===t.bitmap.height)continue;const i={x:0,y:0,w:t.bitmap.width+2,h:t.bitmap.height+2};o.push(i),s[e]={rect:i,metrics:t.metrics};}}const{w:r,h:s}=e.potpack(o),n=new e.AlphaImage({width:r||1,height:s||1});for(const o in t){const r=t[o];for(const t in r){const s=r[+t];if(!s||0===s.bitmap.width||0===s.bitmap.height)continue;const a=i[o][t].rect;e.AlphaImage.copy(s.bitmap,n,{x:0,y:0},{x:a.x+1,y:a.y+1},s.bitmap);}}this.image=n,this.positions=i;}}e.register("GlyphAtlas",i);class o{constructor(t){this.tileID=new e.OverscaledTileID(t.tileID.overscaledZ,t.tileID.wrap,t.tileID.canonical.z,t.tileID.canonical.x,t.tileID.canonical.y),this.uid=t.uid,this.zoom=t.zoom,this.pixelRatio=t.pixelRatio,this.tileSize=t.tileSize,this.source=t.source,this.overscaling=this.tileID.overscaleFactor(),this.showCollisionBoxes=t.showCollisionBoxes,this.collectResourceTiming=!!t.collectResourceTiming,this.returnDependencies=!!t.returnDependencies,this.promoteId=t.promoteId,this.inFlightDependencies=[],this.dependencySentinel=-1;}parse(t,o,s,n,a){this.status="parsing",this.data=t,this.collisionBoxArray=new e.CollisionBoxArray;const l=new e.DictionaryCoder(Object.keys(t.layers).sort()),c=new e.FeatureIndex(this.tileID,this.promoteId);c.bucketLayerIDs=[];const h={},u={featureIndex:c,iconDependencies:{},patternDependencies:{},glyphDependencies:{},availableImages:s},d=o.familiesBySource[this.source];for(const i in d){const o=t.layers[i];if(!o)continue;1===o.version&&e.warnOnce(`Vector tile source "${this.source}" layer "${i}" does not use vector tile spec v2 and therefore may have some rendering errors.`);const n=l.encode(i),a=[];for(let e=0;e<o.length;e++){const t=o.feature(e),r=c.getId(t,i);a.push({feature:t,id:r,index:e,sourceLayerIndex:n});}for(const t of d[i]){const i=t[0];i.source!==this.source&&e.warnOnce(`layer.source = ${i.source} does not equal this.source = ${this.source}`),i.minzoom&&this.zoom<Math.floor(i.minzoom)||i.maxzoom&&this.zoom>=i.maxzoom||"none"!==i.visibility&&(r(t,this.zoom,s),(h[i.id]=i.createBucket({index:c.bucketLayerIDs.length,layers:t,zoom:this.zoom,pixelRatio:this.pixelRatio,overscaling:this.overscaling,collisionBoxArray:this.collisionBoxArray,sourceLayerIndex:n,sourceID:this.source})).populate(a,u,this.tileID.canonical),c.bucketLayerIDs.push(t.map((e=>e.id))));}}let p,f,g,m;const y=e.mapObject(u.glyphDependencies,(e=>Object.keys(e).map(Number)));this.inFlightDependencies.forEach((e=>null==e?void 0:e.cancel())),this.inFlightDependencies=[];const v=++this.dependencySentinel;Object.keys(y).length?this.inFlightDependencies.push(n.send("getGlyphs",{uid:this.uid,stacks:y,source:this.source,tileID:this.tileID,type:"glyphs"},((e,t)=>{v===this.dependencySentinel&&(p||(p=e,f=t,S.call(this)));}))):f={};const x=Object.keys(u.iconDependencies);x.length?this.inFlightDependencies.push(n.send("getImages",{icons:x,source:this.source,tileID:this.tileID,type:"icons"},((e,t)=>{v===this.dependencySentinel&&(p||(p=e,g=t,S.call(this)));}))):g={};const w=Object.keys(u.patternDependencies);function S(){if(p)return a(p);if(f&&g&&m){const t=new i(f),o=new e.ImageAtlas(g,m);for(const i in h){const n=h[i];n instanceof e.SymbolBucket?(r(n.layers,this.zoom,s),e.performSymbolLayout({bucket:n,glyphMap:f,glyphPositions:t.positions,imageMap:g,imagePositions:o.iconPositions,showCollisionBoxes:this.showCollisionBoxes,canonical:this.tileID.canonical})):n.hasPattern&&(n instanceof e.LineBucket||n instanceof e.FillBucket||n instanceof e.FillExtrusionBucket)&&(r(n.layers,this.zoom,s),n.addFeatures(u,this.tileID.canonical,o.patternPositions));}this.status="done",a(null,{buckets:Object.values(h).filter((e=>!e.isEmpty())),featureIndex:c,collisionBoxArray:this.collisionBoxArray,glyphAtlasImage:t.image,imageAtlas:o,glyphMap:this.returnDependencies?f:null,iconMap:this.returnDependencies?g:null,glyphPositions:this.returnDependencies?t.positions:null});}}w.length?this.inFlightDependencies.push(n.send("getImages",{icons:w,source:this.source,tileID:this.tileID,type:"patterns"},((e,t)=>{v===this.dependencySentinel&&(p||(p=e,m=t,S.call(this)));}))):m={},S.call(this);}}function r(t,i,o){const r=new e.EvaluationParameters(i);for(const e of t)e.recalculate(r,o);}function s(t,i){const o=e.getArrayBuffer(t.request,((t,o,r,s)=>{t?i(t):o&&i(null,{vectorTile:new e.vectorTile.VectorTile(new e.Protobuf(o)),rawData:o,cacheControl:r,expires:s});}));return ()=>{o.cancel(),i();}}class n{constructor(e,t,i,o){this.actor=e,this.layerIndex=t,this.availableImages=i,this.loadVectorData=o||s,this.fetching={},this.loading={},this.loaded={};}loadTile(t,i){const r=t.uid;this.loading||(this.loading={});const s=!!(t&&t.request&&t.request.collectResourceTiming)&&new e.RequestPerformance(t.request),n=this.loading[r]=new o(t);n.abort=this.loadVectorData(t,((t,o)=>{if(delete this.loading[r],t||!o)return n.status="done",this.loaded[r]=n,i(t);const a=o.rawData,l={};o.expires&&(l.expires=o.expires),o.cacheControl&&(l.cacheControl=o.cacheControl);const c={};if(s){const e=s.finish();e&&(c.resourceTiming=JSON.parse(JSON.stringify(e)));}n.vectorTile=o.vectorTile,n.parse(o.vectorTile,this.layerIndex,this.availableImages,this.actor,((t,o)=>{if(delete this.fetching[r],t||!o)return i(t);i(null,e.extend({rawTileData:a.slice(0)},o,l,c));})),this.loaded=this.loaded||{},this.loaded[r]=n,this.fetching[r]={rawTileData:a,cacheControl:l,resourceTiming:c};}));}reloadTile(t,i){const o=this.loaded,r=t.uid;if(o&&o[r]){const s=o[r];s.showCollisionBoxes=t.showCollisionBoxes,"parsing"===s.status?s.parse(s.vectorTile,this.layerIndex,this.availableImages,this.actor,((t,o)=>{if(t||!o)return i(t,o);let s;if(this.fetching[r]){const{rawTileData:t,cacheControl:i,resourceTiming:n}=this.fetching[r];delete this.fetching[r],s=e.extend({rawTileData:t.slice(0)},o,i,n);}else s=o;i(null,s);})):"done"===s.status&&(s.vectorTile?s.parse(s.vectorTile,this.layerIndex,this.availableImages,this.actor,i):i());}}abortTile(e,t){const i=this.loading,o=e.uid;i&&i[o]&&i[o].abort&&(i[o].abort(),delete i[o]),t();}removeTile(e,t){const i=this.loaded,o=e.uid;i&&i[o]&&delete i[o],t();}}class a{constructor(){this.loaded={};}loadTile(t,i){const{uid:o,encoding:r,rawImageData:s}=t,n=e.isImageBitmap(s)?this.getImageData(s):s,a=new e.DEMData(o,n,r);this.loaded=this.loaded||{},this.loaded[o]=a,i(null,a);}getImageData(t){this.offscreenCanvas&&this.offscreenCanvasContext||(this.offscreenCanvas=new OffscreenCanvas(t.width,t.height),this.offscreenCanvasContext=this.offscreenCanvas.getContext("2d",{willReadFrequently:!0})),this.offscreenCanvas.width=t.width,this.offscreenCanvas.height=t.height,this.offscreenCanvasContext.drawImage(t,0,0,t.width,t.height);const i=this.offscreenCanvasContext.getImageData(-1,-1,t.width+2,t.height+2);return this.offscreenCanvasContext.clearRect(0,0,this.offscreenCanvas.width,this.offscreenCanvas.height),new e.RGBAImage({width:i.width,height:i.height},i.data)}removeTile(e){const t=this.loaded,i=e.uid;t&&t[i]&&delete t[i];}}function l(e,t){if(0!==e.length){c(e[0],t);for(var i=1;i<e.length;i++)c(e[i],!t);}}function c(e,t){for(var i=0,o=0,r=0,s=e.length,n=s-1;r<s;n=r++){var a=(e[r][0]-e[n][0])*(e[n][1]+e[r][1]),l=i+a;o+=Math.abs(i)>=Math.abs(a)?i-l+a:a-l+i,i=l;}i+o>=0!=!!t&&e.reverse();}var h=e.getDefaultExportFromCjs((function e(t,i){var o,r=t&&t.type;if("FeatureCollection"===r)for(o=0;o<t.features.length;o++)e(t.features[o],i);else if("GeometryCollection"===r)for(o=0;o<t.geometries.length;o++)e(t.geometries[o],i);else if("Feature"===r)e(t.geometry,i);else if("Polygon"===r)l(t.coordinates,i);else if("MultiPolygon"===r)for(o=0;o<t.coordinates.length;o++)l(t.coordinates[o],i);return t}));const u=e.vectorTile.VectorTileFeature.prototype.toGeoJSON;var d={exports:{}},p=e.pointGeometry,f=e.vectorTile.VectorTileFeature,g=m;function m(e,t){this.options=t||{},this.features=e,this.length=e.length;}function y(e,t){this.id="number"==typeof e.id?e.id:void 0,this.type=e.type,this.rawGeometry=1===e.type?[e.geometry]:e.geometry,this.properties=e.tags,this.extent=t||4096;}m.prototype.feature=function(e){return new y(this.features[e],this.options.extent)},y.prototype.loadGeometry=function(){var e=this.rawGeometry;this.geometry=[];for(var t=0;t<e.length;t++){for(var i=e[t],o=[],r=0;r<i.length;r++)o.push(new p(i[r][0],i[r][1]));this.geometry.push(o);}return this.geometry},y.prototype.bbox=function(){this.geometry||this.loadGeometry();for(var e=this.geometry,t=1/0,i=-1/0,o=1/0,r=-1/0,s=0;s<e.length;s++)for(var n=e[s],a=0;a<n.length;a++){var l=n[a];t=Math.min(t,l.x),i=Math.max(i,l.x),o=Math.min(o,l.y),r=Math.max(r,l.y);}return [t,o,i,r]},y.prototype.toGeoJSON=f.prototype.toGeoJSON;var v=e.pbf,x=g;function w(e){var t=new v;return function(e,t){for(var i in e.layers)t.writeMessage(3,S,e.layers[i]);}(e,t),t.finish()}function S(e,t){var i;t.writeVarintField(15,e.version||1),t.writeStringField(1,e.name||""),t.writeVarintField(5,e.extent||4096);var o={keys:[],values:[],keycache:{},valuecache:{}};for(i=0;i<e.length;i++)o.feature=e.feature(i),t.writeMessage(2,b,o);var r=o.keys;for(i=0;i<r.length;i++)t.writeStringField(3,r[i]);var s=o.values;for(i=0;i<s.length;i++)t.writeMessage(4,k,s[i]);}function b(e,t){var i=e.feature;void 0!==i.id&&t.writeVarintField(1,i.id),t.writeMessage(2,I,e),t.writeVarintField(3,i.type),t.writeMessage(4,T,i);}function I(e,t){var i=e.feature,o=e.keys,r=e.values,s=e.keycache,n=e.valuecache;for(var a in i.properties){var l=i.properties[a],c=s[a];if(null!==l){void 0===c&&(o.push(a),s[a]=c=o.length-1),t.writeVarint(c);var h=typeof l;"string"!==h&&"boolean"!==h&&"number"!==h&&(l=JSON.stringify(l));var u=h+":"+l,d=n[u];void 0===d&&(r.push(l),n[u]=d=r.length-1),t.writeVarint(d);}}}function M(e,t){return (t<<3)+(7&e)}function P(e){return e<<1^e>>31}function T(e,t){for(var i=e.loadGeometry(),o=e.type,r=0,s=0,n=i.length,a=0;a<n;a++){var l=i[a],c=1;1===o&&(c=l.length),t.writeVarint(M(1,c));for(var h=3===o?l.length-1:l.length,u=0;u<h;u++){1===u&&1!==o&&t.writeVarint(M(2,h-1));var d=l[u].x-r,p=l[u].y-s;t.writeVarint(P(d)),t.writeVarint(P(p)),r+=d,s+=p;}3===o&&t.writeVarint(M(7,1));}}function k(e,t){var i=typeof e;"string"===i?t.writeStringField(1,e):"boolean"===i?t.writeBooleanField(7,e):"number"===i&&(e%1!=0?t.writeDoubleField(3,e):e<0?t.writeSVarintField(6,e):t.writeVarintField(5,e));}d.exports=w,d.exports.fromVectorTileJs=w,d.exports.fromGeojsonVt=function(e,t){t=t||{};var i={};for(var o in e)i[o]=new x(e[o].features,t),i[o].name=o,i[o].version=t.version,i[o].extent=t.extent;return w({layers:i})},d.exports.GeoJSONWrapper=x;var _=e.getDefaultExportFromCjs(d.exports);const C={minZoom:0,maxZoom:16,minPoints:2,radius:40,extent:512,nodeSize:64,log:!1,generateId:!1,reduce:null,map:e=>e},D=Math.fround||(O=new Float32Array(1),e=>(O[0]=+e,O[0]));var O;const L=3,F=5,E=6;class z{constructor(e){this.options=Object.assign(Object.create(C),e),this.trees=new Array(this.options.maxZoom+1),this.stride=this.options.reduce?7:6,this.clusterProps=[];}load(e){const{log:t,minZoom:i,maxZoom:o}=this.options;t&&console.time("total time");const r=`prepare ${e.length} points`;t&&console.time(r),this.points=e;const s=[];for(let t=0;t<e.length;t++){const i=e[t];if(!i.geometry)continue;const[o,r]=i.geometry.coordinates,n=D(B(o)),a=D(Z(r));s.push(n,a,1/0,t,-1,1),this.options.reduce&&s.push(0);}let n=this.trees[o+1]=this._createTree(s);t&&console.timeEnd(r);for(let e=o;e>=i;e--){const i=+Date.now();n=this.trees[e]=this._createTree(this._cluster(n,e)),t&&console.log("z%d: %d clusters in %dms",e,n.numItems,+Date.now()-i);}return t&&console.timeEnd("total time"),this}getClusters(e,t){let i=((e[0]+180)%360+360)%360-180;const o=Math.max(-90,Math.min(90,e[1]));let r=180===e[2]?180:((e[2]+180)%360+360)%360-180;const s=Math.max(-90,Math.min(90,e[3]));if(e[2]-e[0]>=360)i=-180,r=180;else if(i>r){const e=this.getClusters([i,o,180,s],t),n=this.getClusters([-180,o,r,s],t);return e.concat(n)}const n=this.trees[this._limitZoom(t)],a=n.range(B(i),Z(s),B(r),Z(o)),l=n.data,c=[];for(const e of a){const t=this.stride*e;c.push(l[t+F]>1?j(l,t,this.clusterProps):this.points[l[t+L]]);}return c}getChildren(e){const t=this._getOriginId(e),i=this._getOriginZoom(e),o="No cluster with the specified id.",r=this.trees[i];if(!r)throw new Error(o);const s=r.data;if(t*this.stride>=s.length)throw new Error(o);const n=this.options.radius/(this.options.extent*Math.pow(2,i-1)),a=r.within(s[t*this.stride],s[t*this.stride+1],n),l=[];for(const t of a){const i=t*this.stride;s[i+4]===e&&l.push(s[i+F]>1?j(s,i,this.clusterProps):this.points[s[i+L]]);}if(0===l.length)throw new Error(o);return l}getLeaves(e,t,i){const o=[];return this._appendLeaves(o,e,t=t||10,i=i||0,0),o}getTile(e,t,i){const o=this.trees[this._limitZoom(e)],r=Math.pow(2,e),{extent:s,radius:n}=this.options,a=n/s,l=(i-a)/r,c=(i+1+a)/r,h={features:[]};return this._addTileFeatures(o.range((t-a)/r,l,(t+1+a)/r,c),o.data,t,i,r,h),0===t&&this._addTileFeatures(o.range(1-a/r,l,1,c),o.data,r,i,r,h),t===r-1&&this._addTileFeatures(o.range(0,l,a/r,c),o.data,-1,i,r,h),h.features.length?h:null}getClusterExpansionZoom(e){let t=this._getOriginZoom(e)-1;for(;t<=this.options.maxZoom;){const i=this.getChildren(e);if(t++,1!==i.length)break;e=i[0].properties.cluster_id;}return t}_appendLeaves(e,t,i,o,r){const s=this.getChildren(t);for(const t of s){const s=t.properties;if(s&&s.cluster?r+s.point_count<=o?r+=s.point_count:r=this._appendLeaves(e,s.cluster_id,i,o,r):r<o?r++:e.push(t),e.length===i)break}return r}_createTree(t){const i=new e.KDBush(t.length/this.stride|0,this.options.nodeSize,Float32Array);for(let e=0;e<t.length;e+=this.stride)i.add(t[e],t[e+1]);return i.finish(),i.data=t,i}_addTileFeatures(e,t,i,o,r,s){for(const n of e){const e=n*this.stride,a=t[e+F]>1;let l,c,h;if(a)l=N(t,e,this.clusterProps),c=t[e],h=t[e+1];else {const i=this.points[t[e+L]];l=i.properties;const[o,r]=i.geometry.coordinates;c=B(o),h=Z(r);}const u={type:1,geometry:[[Math.round(this.options.extent*(c*r-i)),Math.round(this.options.extent*(h*r-o))]],tags:l};let d;d=a||this.options.generateId?t[e+L]:this.points[t[e+L]].id,void 0!==d&&(u.id=d),s.features.push(u);}}_limitZoom(e){return Math.max(this.options.minZoom,Math.min(Math.floor(+e),this.options.maxZoom+1))}_cluster(e,t){const{radius:i,extent:o,reduce:r,minPoints:s}=this.options,n=i/(o*Math.pow(2,t)),a=e.data,l=[],c=this.stride;for(let i=0;i<a.length;i+=c){if(a[i+2]<=t)continue;a[i+2]=t;const o=a[i],h=a[i+1],u=e.within(a[i],a[i+1],n),d=a[i+F];let p=d;for(const e of u){const i=e*c;a[i+2]>t&&(p+=a[i+F]);}if(p>d&&p>=s){let e,s=o*d,n=h*d,f=-1;const g=((i/c|0)<<5)+(t+1)+this.points.length;for(const o of u){const l=o*c;if(a[l+2]<=t)continue;a[l+2]=t;const h=a[l+F];s+=a[l]*h,n+=a[l+1]*h,a[l+4]=g,r&&(e||(e=this._map(a,i,!0),f=this.clusterProps.length,this.clusterProps.push(e)),r(e,this._map(a,l)));}a[i+4]=g,l.push(s/p,n/p,1/0,g,-1,p),r&&l.push(f);}else {for(let e=0;e<c;e++)l.push(a[i+e]);if(p>1)for(const e of u){const i=e*c;if(!(a[i+2]<=t)){a[i+2]=t;for(let e=0;e<c;e++)l.push(a[i+e]);}}}}return l}_getOriginId(e){return e-this.points.length>>5}_getOriginZoom(e){return (e-this.points.length)%32}_map(e,t,i){if(e[t+F]>1){const o=this.clusterProps[e[t+E]];return i?Object.assign({},o):o}const o=this.points[e[t+L]].properties,r=this.options.map(o);return i&&r===o?Object.assign({},r):r}}function j(e,t,i){return {type:"Feature",id:e[t+L],properties:N(e,t,i),geometry:{type:"Point",coordinates:[(o=e[t],360*(o-.5)),A(e[t+1])]}};var o;}function N(e,t,i){const o=e[t+F],r=o>=1e4?`${Math.round(o/1e3)}k`:o>=1e3?Math.round(o/100)/10+"k":o,s=e[t+E],n=-1===s?{}:Object.assign({},i[s]);return Object.assign(n,{cluster:!0,cluster_id:e[t+L],point_count:o,point_count_abbreviated:r})}function B(e){return e/360+.5}function Z(e){const t=Math.sin(e*Math.PI/180),i=.5-.25*Math.log((1+t)/(1-t))/Math.PI;return i<0?0:i>1?1:i}function A(e){const t=(180-360*e)*Math.PI/180;return 360*Math.atan(Math.exp(t))/Math.PI-90}function G(e,t,i,o){for(var r,s=o,n=i-t>>1,a=i-t,l=e[t],c=e[t+1],h=e[i],u=e[i+1],d=t+3;d<i;d+=3){var p=J(e[d],e[d+1],l,c,h,u);if(p>s)r=d,s=p;else if(p===s){var f=Math.abs(d-n);f<a&&(r=d,a=f);}}s>o&&(r-t>3&&G(e,t,r,o),e[r+2]=s,i-r>3&&G(e,r,i,o));}function J(e,t,i,o,r,s){var n=r-i,a=s-o;if(0!==n||0!==a){var l=((e-i)*n+(t-o)*a)/(n*n+a*a);l>1?(i=r,o=s):l>0&&(i+=n*l,o+=a*l);}return (n=e-i)*n+(a=t-o)*a}function Y(e,t,i,o){var r={id:void 0===e?null:e,type:t,geometry:i,tags:o,minX:1/0,minY:1/0,maxX:-1/0,maxY:-1/0};return function(e){var t=e.geometry,i=e.type;if("Point"===i||"MultiPoint"===i||"LineString"===i)R(e,t);else if("Polygon"===i||"MultiLineString"===i)for(var o=0;o<t.length;o++)R(e,t[o]);else if("MultiPolygon"===i)for(o=0;o<t.length;o++)for(var r=0;r<t[o].length;r++)R(e,t[o][r]);}(r),r}function R(e,t){for(var i=0;i<t.length;i+=3)e.minX=Math.min(e.minX,t[i]),e.minY=Math.min(e.minY,t[i+1]),e.maxX=Math.max(e.maxX,t[i]),e.maxY=Math.max(e.maxY,t[i+1]);}function V(e,t,i,o){if(t.geometry){var r=t.geometry.coordinates,s=t.geometry.type,n=Math.pow(i.tolerance/((1<<i.maxZoom)*i.extent),2),a=[],l=t.id;if(i.promoteId?l=t.properties[i.promoteId]:i.generateId&&(l=o||0),"Point"===s)X(r,a);else if("MultiPoint"===s)for(var c=0;c<r.length;c++)X(r[c],a);else if("LineString"===s)W(r,a,n,!1);else if("MultiLineString"===s){if(i.lineMetrics){for(c=0;c<r.length;c++)W(r[c],a=[],n,!1),e.push(Y(l,"LineString",a,t.properties));return}q(r,a,n,!1);}else if("Polygon"===s)q(r,a,n,!0);else {if("MultiPolygon"!==s){if("GeometryCollection"===s){for(c=0;c<t.geometry.geometries.length;c++)V(e,{id:l,geometry:t.geometry.geometries[c],properties:t.properties},i,o);return}throw new Error("Input data is not a valid GeoJSON object.")}for(c=0;c<r.length;c++){var h=[];q(r[c],h,n,!0),a.push(h);}}e.push(Y(l,s,a,t.properties));}}function X(e,t){t.push($(e[0])),t.push(U(e[1])),t.push(0);}function W(e,t,i,o){for(var r,s,n=0,a=0;a<e.length;a++){var l=$(e[a][0]),c=U(e[a][1]);t.push(l),t.push(c),t.push(0),a>0&&(n+=o?(r*c-l*s)/2:Math.sqrt(Math.pow(l-r,2)+Math.pow(c-s,2))),r=l,s=c;}var h=t.length-3;t[2]=1,G(t,0,h,i),t[h+2]=1,t.size=Math.abs(n),t.start=0,t.end=t.size;}function q(e,t,i,o){for(var r=0;r<e.length;r++){var s=[];W(e[r],s,i,o),t.push(s);}}function $(e){return e/360+.5}function U(e){var t=Math.sin(e*Math.PI/180),i=.5-.25*Math.log((1+t)/(1-t))/Math.PI;return i<0?0:i>1?1:i}function K(e,t,i,o,r,s,n,a){if(o/=t,s>=(i/=t)&&n<o)return e;if(n<i||s>=o)return null;for(var l=[],c=0;c<e.length;c++){var h=e[c],u=h.geometry,d=h.type,p=0===r?h.minX:h.minY,f=0===r?h.maxX:h.maxY;if(p>=i&&f<o)l.push(h);else if(!(f<i||p>=o)){var g=[];if("Point"===d||"MultiPoint"===d)H(u,g,i,o,r);else if("LineString"===d)Q(u,g,i,o,r,!1,a.lineMetrics);else if("MultiLineString"===d)te(u,g,i,o,r,!1);else if("Polygon"===d)te(u,g,i,o,r,!0);else if("MultiPolygon"===d)for(var m=0;m<u.length;m++){var y=[];te(u[m],y,i,o,r,!0),y.length&&g.push(y);}if(g.length){if(a.lineMetrics&&"LineString"===d){for(m=0;m<g.length;m++)l.push(Y(h.id,d,g[m],h.tags));continue}"LineString"!==d&&"MultiLineString"!==d||(1===g.length?(d="LineString",g=g[0]):d="MultiLineString"),"Point"!==d&&"MultiPoint"!==d||(d=3===g.length?"Point":"MultiPoint"),l.push(Y(h.id,d,g,h.tags));}}}return l.length?l:null}function H(e,t,i,o,r){for(var s=0;s<e.length;s+=3){var n=e[s+r];n>=i&&n<=o&&(t.push(e[s]),t.push(e[s+1]),t.push(e[s+2]));}}function Q(e,t,i,o,r,s,n){for(var a,l,c=ee(e),h=0===r?oe:re,u=e.start,d=0;d<e.length-3;d+=3){var p=e[d],f=e[d+1],g=e[d+2],m=e[d+3],y=e[d+4],v=0===r?p:f,x=0===r?m:y,w=!1;n&&(a=Math.sqrt(Math.pow(p-m,2)+Math.pow(f-y,2))),v<i?x>i&&(l=h(c,p,f,m,y,i),n&&(c.start=u+a*l)):v>o?x<o&&(l=h(c,p,f,m,y,o),n&&(c.start=u+a*l)):ie(c,p,f,g),x<i&&v>=i&&(l=h(c,p,f,m,y,i),w=!0),x>o&&v<=o&&(l=h(c,p,f,m,y,o),w=!0),!s&&w&&(n&&(c.end=u+a*l),t.push(c),c=ee(e)),n&&(u+=a);}var S=e.length-3;p=e[S],f=e[S+1],g=e[S+2],(v=0===r?p:f)>=i&&v<=o&&ie(c,p,f,g),S=c.length-3,s&&S>=3&&(c[S]!==c[0]||c[S+1]!==c[1])&&ie(c,c[0],c[1],c[2]),c.length&&t.push(c);}function ee(e){var t=[];return t.size=e.size,t.start=e.start,t.end=e.end,t}function te(e,t,i,o,r,s){for(var n=0;n<e.length;n++)Q(e[n],t,i,o,r,s,!1);}function ie(e,t,i,o){e.push(t),e.push(i),e.push(o);}function oe(e,t,i,o,r,s){var n=(s-t)/(o-t);return e.push(s),e.push(i+(r-i)*n),e.push(1),n}function re(e,t,i,o,r,s){var n=(s-i)/(r-i);return e.push(t+(o-t)*n),e.push(s),e.push(1),n}function se(e,t){for(var i=[],o=0;o<e.length;o++){var r,s=e[o],n=s.type;if("Point"===n||"MultiPoint"===n||"LineString"===n)r=ne(s.geometry,t);else if("MultiLineString"===n||"Polygon"===n){r=[];for(var a=0;a<s.geometry.length;a++)r.push(ne(s.geometry[a],t));}else if("MultiPolygon"===n)for(r=[],a=0;a<s.geometry.length;a++){for(var l=[],c=0;c<s.geometry[a].length;c++)l.push(ne(s.geometry[a][c],t));r.push(l);}i.push(Y(s.id,n,r,s.tags));}return i}function ne(e,t){var i=[];i.size=e.size,void 0!==e.start&&(i.start=e.start,i.end=e.end);for(var o=0;o<e.length;o+=3)i.push(e[o]+t,e[o+1],e[o+2]);return i}function ae(e,t){if(e.transformed)return e;var i,o,r,s=1<<e.z,n=e.x,a=e.y;for(i=0;i<e.features.length;i++){var l=e.features[i],c=l.geometry,h=l.type;if(l.geometry=[],1===h)for(o=0;o<c.length;o+=2)l.geometry.push(le(c[o],c[o+1],t,s,n,a));else for(o=0;o<c.length;o++){var u=[];for(r=0;r<c[o].length;r+=2)u.push(le(c[o][r],c[o][r+1],t,s,n,a));l.geometry.push(u);}}return e.transformed=!0,e}function le(e,t,i,o,r,s){return [Math.round(i*(e*o-r)),Math.round(i*(t*o-s))]}function ce(e,t,i,o,r){for(var s=t===r.maxZoom?0:r.tolerance/((1<<t)*r.extent),n={features:[],numPoints:0,numSimplified:0,numFeatures:0,source:null,x:i,y:o,z:t,transformed:!1,minX:2,minY:1,maxX:-1,maxY:0},a=0;a<e.length;a++){n.numFeatures++,he(n,e[a],s,r);var l=e[a].minX,c=e[a].minY,h=e[a].maxX,u=e[a].maxY;l<n.minX&&(n.minX=l),c<n.minY&&(n.minY=c),h>n.maxX&&(n.maxX=h),u>n.maxY&&(n.maxY=u);}return n}function he(e,t,i,o){var r=t.geometry,s=t.type,n=[];if("Point"===s||"MultiPoint"===s)for(var a=0;a<r.length;a+=3)n.push(r[a]),n.push(r[a+1]),e.numPoints++,e.numSimplified++;else if("LineString"===s)ue(n,r,e,i,!1,!1);else if("MultiLineString"===s||"Polygon"===s)for(a=0;a<r.length;a++)ue(n,r[a],e,i,"Polygon"===s,0===a);else if("MultiPolygon"===s)for(var l=0;l<r.length;l++){var c=r[l];for(a=0;a<c.length;a++)ue(n,c[a],e,i,!0,0===a);}if(n.length){var h=t.tags||null;if("LineString"===s&&o.lineMetrics){for(var u in h={},t.tags)h[u]=t.tags[u];h.mapbox_clip_start=r.start/r.size,h.mapbox_clip_end=r.end/r.size;}var d={geometry:n,type:"Polygon"===s||"MultiPolygon"===s?3:"LineString"===s||"MultiLineString"===s?2:1,tags:h};null!==t.id&&(d.id=t.id),e.features.push(d);}}function ue(e,t,i,o,r,s){var n=o*o;if(o>0&&t.size<(r?n:o))i.numPoints+=t.length/3;else {for(var a=[],l=0;l<t.length;l+=3)(0===o||t[l+2]>n)&&(i.numSimplified++,a.push(t[l]),a.push(t[l+1])),i.numPoints++;r&&function(e,t){for(var i=0,o=0,r=e.length,s=r-2;o<r;s=o,o+=2)i+=(e[o]-e[s])*(e[o+1]+e[s+1]);if(i>0===t)for(o=0,r=e.length;o<r/2;o+=2){var n=e[o],a=e[o+1];e[o]=e[r-2-o],e[o+1]=e[r-1-o],e[r-2-o]=n,e[r-1-o]=a;}}(a,s),e.push(a);}}function de(e,t){var i=(t=this.options=function(e,t){for(var i in t)e[i]=t[i];return e}(Object.create(this.options),t)).debug;if(i&&console.time("preprocess data"),t.maxZoom<0||t.maxZoom>24)throw new Error("maxZoom should be in the 0-24 range");if(t.promoteId&&t.generateId)throw new Error("promoteId and generateId cannot be used together.");var o=function(e,t){var i=[];if("FeatureCollection"===e.type)for(var o=0;o<e.features.length;o++)V(i,e.features[o],t,o);else V(i,"Feature"===e.type?e:{geometry:e},t);return i}(e,t);this.tiles={},this.tileCoords=[],i&&(console.timeEnd("preprocess data"),console.log("index: maxZoom: %d, maxPoints: %d",t.indexMaxZoom,t.indexMaxPoints),console.time("generate tiles"),this.stats={},this.total=0),o=function(e,t){var i=t.buffer/t.extent,o=e,r=K(e,1,-1-i,i,0,-1,2,t),s=K(e,1,1-i,2+i,0,-1,2,t);return (r||s)&&(o=K(e,1,-i,1+i,0,-1,2,t)||[],r&&(o=se(r,1).concat(o)),s&&(o=o.concat(se(s,-1)))),o}(o,t),o.length&&this.splitTile(o,0,0,0),i&&(o.length&&console.log("features: %d, points: %d",this.tiles[0].numFeatures,this.tiles[0].numPoints),console.timeEnd("generate tiles"),console.log("tiles generated:",this.total,JSON.stringify(this.stats)));}function pe(e,t,i){return 32*((1<<e)*i+t)+e}function fe(e,t){return t?e.properties[t]:e.id}function ge(e,t){if(null==e)return !0;if("Feature"===e.type)return null!=fe(e,t);if("FeatureCollection"===e.type){const i=new Set;for(const o of e.features){const e=fe(o,t);if(null==e)return !1;if(i.has(e))return !1;i.add(e);}return !0}return !1}function me(e,t){const i=new Map;if(null==e);else if("Feature"===e.type)i.set(fe(e,t),e);else for(const o of e.features)i.set(fe(o,t),o);return i}function ye(t,i){const o=t.tileID.canonical;if(!this._geoJSONIndex)return i(null,null);const r=this._geoJSONIndex.getTile(o.z,o.x,o.y);if(!r)return i(null,null);const s=new class{constructor(t){this.layers={_geojsonTileLayer:this},this.name="_geojsonTileLayer",this.extent=e.EXTENT,this.length=t.length,this._features=t;}feature(t){return new class{constructor(t){this._feature=t,this.extent=e.EXTENT,this.type=t.type,this.properties=t.tags,"id"in t&&!isNaN(t.id)&&(this.id=parseInt(t.id,10));}loadGeometry(){if(1===this._feature.type){const t=[];for(const i of this._feature.geometry)t.push([new e.Point(i[0],i[1])]);return t}{const t=[];for(const i of this._feature.geometry){const o=[];for(const t of i)o.push(new e.Point(t[0],t[1]));t.push(o);}return t}}toGeoJSON(e,t,i){return u.call(this,e,t,i)}}(this._features[t])}}(r.features);let n=_(s);0===n.byteOffset&&n.byteLength===n.buffer.byteLength||(n=new Uint8Array(n)),i(null,{vectorTile:s,rawData:n.buffer});}de.prototype.options={maxZoom:14,indexMaxZoom:5,indexMaxPoints:1e5,tolerance:3,extent:4096,buffer:64,lineMetrics:!1,promoteId:null,generateId:!1,debug:0},de.prototype.splitTile=function(e,t,i,o,r,s,n){for(var a=[e,t,i,o],l=this.options,c=l.debug;a.length;){o=a.pop(),i=a.pop(),t=a.pop(),e=a.pop();var h=1<<t,u=pe(t,i,o),d=this.tiles[u];if(!d&&(c>1&&console.time("creation"),d=this.tiles[u]=ce(e,t,i,o,l),this.tileCoords.push({z:t,x:i,y:o}),c)){c>1&&(console.log("tile z%d-%d-%d (features: %d, points: %d, simplified: %d)",t,i,o,d.numFeatures,d.numPoints,d.numSimplified),console.timeEnd("creation"));var p="z"+t;this.stats[p]=(this.stats[p]||0)+1,this.total++;}if(d.source=e,r){if(t===l.maxZoom||t===r)continue;var f=1<<r-t;if(i!==Math.floor(s/f)||o!==Math.floor(n/f))continue}else if(t===l.indexMaxZoom||d.numPoints<=l.indexMaxPoints)continue;if(d.source=null,0!==e.length){c>1&&console.time("clipping");var g,m,y,v,x,w,S=.5*l.buffer/l.extent,b=.5-S,I=.5+S,M=1+S;g=m=y=v=null,x=K(e,h,i-S,i+I,0,d.minX,d.maxX,l),w=K(e,h,i+b,i+M,0,d.minX,d.maxX,l),e=null,x&&(g=K(x,h,o-S,o+I,1,d.minY,d.maxY,l),m=K(x,h,o+b,o+M,1,d.minY,d.maxY,l),x=null),w&&(y=K(w,h,o-S,o+I,1,d.minY,d.maxY,l),v=K(w,h,o+b,o+M,1,d.minY,d.maxY,l),w=null),c>1&&console.timeEnd("clipping"),a.push(g||[],t+1,2*i,2*o),a.push(m||[],t+1,2*i,2*o+1),a.push(y||[],t+1,2*i+1,2*o),a.push(v||[],t+1,2*i+1,2*o+1);}}},de.prototype.getTile=function(e,t,i){var o=this.options,r=o.extent,s=o.debug;if(e<0||e>24)return null;var n=1<<e,a=pe(e,t=(t%n+n)%n,i);if(this.tiles[a])return ae(this.tiles[a],r);s>1&&console.log("drilling down to z%d-%d-%d",e,t,i);for(var l,c=e,h=t,u=i;!l&&c>0;)c--,h=Math.floor(h/2),u=Math.floor(u/2),l=this.tiles[pe(c,h,u)];return l&&l.source?(s>1&&console.log("found parent tile z%d-%d-%d",c,h,u),s>1&&console.time("drilling down"),this.splitTile(l.source,c,h,u,e,t,i),s>1&&console.timeEnd("drilling down"),this.tiles[a]?ae(this.tiles[a],r):null):null};class ve extends n{constructor(t,i,o,r){super(t,i,o,ye),this._dataUpdateable=new Map,this.loadGeoJSON=(t,i)=>{const{promoteId:o}=t;if(t.request)return e.getJSON(t.request,((e,t,r,s)=>{this._dataUpdateable=ge(t,o)?me(t,o):void 0,i(e,t,r,s);}));if("string"==typeof t.data)try{const e=JSON.parse(t.data);this._dataUpdateable=ge(e,o)?me(e,o):void 0,i(null,e);}catch(e){i(new Error(`Input data given to '${t.source}' is not a valid GeoJSON object.`));}else t.dataDiff?this._dataUpdateable?(function(e,t,i){var o,r,s,n;if(t.removeAll&&e.clear(),t.remove)for(const i of t.remove)e.delete(i);if(t.add)for(const o of t.add){const t=fe(o,i);null!=t&&e.set(t,o);}if(t.update)for(const i of t.update){let t=e.get(i.id);if(null==t)continue;const a=!i.removeAllProperties&&((null===(o=i.removeProperties)||void 0===o?void 0:o.length)>0||(null===(r=i.addOrUpdateProperties)||void 0===r?void 0:r.length)>0);if((i.newGeometry||i.removeAllProperties||a)&&(t={...t},e.set(i.id,t),a&&(t.properties={...t.properties})),i.newGeometry&&(t.geometry=i.newGeometry),i.removeAllProperties)t.properties={};else if((null===(s=i.removeProperties)||void 0===s?void 0:s.length)>0)for(const e of i.removeProperties)Object.prototype.hasOwnProperty.call(t.properties,e)&&delete t.properties[e];if((null===(n=i.addOrUpdateProperties)||void 0===n?void 0:n.length)>0)for(const{key:e,value:o}of i.addOrUpdateProperties)t.properties[e]=o;}}(this._dataUpdateable,t.dataDiff,o),i(null,{type:"FeatureCollection",features:Array.from(this._dataUpdateable.values())})):i(new Error(`Cannot update existing geojson data in ${t.source}`)):i(new Error(`Input data given to '${t.source}' is not a valid GeoJSON object.`));return {cancel:()=>{}}},r&&(this.loadGeoJSON=r);}loadData(t,i){var o;null===(o=this._pendingRequest)||void 0===o||o.cancel(),this._pendingCallback&&this._pendingCallback(null,{abandoned:!0});const r=!!(t&&t.request&&t.request.collectResourceTiming)&&new e.RequestPerformance(t.request);this._pendingCallback=i,this._pendingRequest=this.loadGeoJSON(t,((o,s)=>{if(delete this._pendingCallback,delete this._pendingRequest,o||!s)return i(o);if("object"!=typeof s)return i(new Error(`Input data given to '${t.source}' is not a valid GeoJSON object.`));{h(s,!0);try{if(t.filter){const i=e.createExpression(t.filter,{type:"boolean","property-type":"data-driven",overridable:!1,transition:!1});if("error"===i.result)throw new Error(i.value.map((e=>`${e.key}: ${e.message}`)).join(", "));const o=s.features.filter((e=>i.value.evaluate({zoom:0},e)));s={type:"FeatureCollection",features:o};}this._geoJSONIndex=t.cluster?new z(function({superclusterOptions:t,clusterProperties:i}){if(!i||!t)return t;const o={},r={},s={accumulated:null,zoom:0},n={properties:null},a=Object.keys(i);for(const t of a){const[s,n]=i[t],a=e.createExpression(n),l=e.createExpression("string"==typeof s?[s,["accumulated"],["get",t]]:s);o[t]=a.value,r[t]=l.value;}return t.map=e=>{n.properties=e;const t={};for(const e of a)t[e]=o[e].evaluate(s,n);return t},t.reduce=(e,t)=>{n.properties=t;for(const t of a)s.accumulated=e[t],e[t]=r[t].evaluate(s,n);},t}(t)).load(s.features):function(e,t){return new de(e,t)}(s,t.geojsonVtOptions);}catch(o){return i(o)}this.loaded={};const n={};if(r){const e=r.finish();e&&(n.resourceTiming={},n.resourceTiming[t.source]=JSON.parse(JSON.stringify(e)));}i(null,n);}}));}reloadTile(e,t){const i=this.loaded;return i&&i[e.uid]?super.reloadTile(e,t):this.loadTile(e,t)}removeSource(e,t){this._pendingCallback&&this._pendingCallback(null,{abandoned:!0}),t();}getClusterExpansionZoom(e,t){try{t(null,this._geoJSONIndex.getClusterExpansionZoom(e.clusterId));}catch(e){t(e);}}getClusterChildren(e,t){try{t(null,this._geoJSONIndex.getChildren(e.clusterId));}catch(e){t(e);}}getClusterLeaves(e,t){try{t(null,this._geoJSONIndex.getLeaves(e.clusterId,e.limit,e.offset));}catch(e){t(e);}}}class xe{constructor(t){this.self=t,this.actor=new e.Actor(t,this),this.layerIndexes={},this.availableImages={},this.workerSourceTypes={vector:n,geojson:ve},this.workerSources={},this.demWorkerSources={},this.self.registerWorkerSource=(e,t)=>{if(this.workerSourceTypes[e])throw new Error(`Worker source with name "${e}" already registered.`);this.workerSourceTypes[e]=t;},this.self.registerRTLTextPlugin=t=>{if(e.plugin.isParsed())throw new Error("RTL text plugin already registered.");e.plugin.applyArabicShaping=t.applyArabicShaping,e.plugin.processBidirectionalText=t.processBidirectionalText,e.plugin.processStyledBidirectionalText=t.processStyledBidirectionalText;};}setReferrer(e,t){this.referrer=t;}setImages(e,t,i){this.availableImages[e]=t;for(const i in this.workerSources[e]){const o=this.workerSources[e][i];for(const e in o)o[e].availableImages=t;}i();}setLayers(e,t,i){this.getLayerIndex(e).replace(t),i();}updateLayers(e,t,i){this.getLayerIndex(e).update(t.layers,t.removedIds),i();}loadTile(e,t,i){this.getWorkerSource(e,t.type,t.source).loadTile(t,i);}loadDEMTile(e,t,i){this.getDEMWorkerSource(e,t.source).loadTile(t,i);}reloadTile(e,t,i){this.getWorkerSource(e,t.type,t.source).reloadTile(t,i);}abortTile(e,t,i){this.getWorkerSource(e,t.type,t.source).abortTile(t,i);}removeTile(e,t,i){this.getWorkerSource(e,t.type,t.source).removeTile(t,i);}removeDEMTile(e,t){this.getDEMWorkerSource(e,t.source).removeTile(t);}removeSource(e,t,i){if(!this.workerSources[e]||!this.workerSources[e][t.type]||!this.workerSources[e][t.type][t.source])return;const o=this.workerSources[e][t.type][t.source];delete this.workerSources[e][t.type][t.source],void 0!==o.removeSource?o.removeSource(t,i):i();}loadWorkerSource(e,t,i){try{this.self.importScripts(t.url),i();}catch(e){i(e.toString());}}syncRTLPluginState(t,i,o){try{e.plugin.setState(i);const t=e.plugin.getPluginURL();if(e.plugin.isLoaded()&&!e.plugin.isParsed()&&null!=t){this.self.importScripts(t);const i=e.plugin.isParsed();o(i?void 0:new Error(`RTL Text Plugin failed to import scripts from ${t}`),i);}}catch(e){o(e.toString());}}getAvailableImages(e){let t=this.availableImages[e];return t||(t=[]),t}getLayerIndex(e){let i=this.layerIndexes[e];return i||(i=this.layerIndexes[e]=new t),i}getWorkerSource(e,t,i){if(this.workerSources[e]||(this.workerSources[e]={}),this.workerSources[e][t]||(this.workerSources[e][t]={}),!this.workerSources[e][t][i]){const o={send:(t,i,o)=>{this.actor.send(t,i,o,e);}};this.workerSources[e][t][i]=new this.workerSourceTypes[t](o,this.getLayerIndex(e),this.getAvailableImages(e));}return this.workerSources[e][t][i]}getDEMWorkerSource(e,t){return this.demWorkerSources[e]||(this.demWorkerSources[e]={}),this.demWorkerSources[e][t]||(this.demWorkerSources[e][t]=new a),this.demWorkerSources[e][t]}}return e.isWorker()&&(self.worker=new xe(self)),xe}));


//
// Our custom intro provides a specialized "define()" function, called by the
// AMD modules below, that sets up the worker blob URL and then executes the
// main module, storing its exported value as 'maplibregl'


var maplibregl$1 = maplibregl;

return maplibregl$1;

}));


},{}],52:[function(require,module,exports){
'use strict'

module.exports = class ModuleError extends Error {
  /**
   * @param {string} message Error message
   * @param {{ code?: string, cause?: Error, expected?: boolean, transient?: boolean }} [options]
   */
  constructor (message, options) {
    super(message || '')

    if (typeof options === 'object' && options !== null) {
      if (options.code) this.code = String(options.code)
      if (options.expected) this.expected = true
      if (options.transient) this.transient = true
      if (options.cause) this.cause = options.cause
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

},{}],53:[function(require,module,exports){
assert.notEqual = notEqual
assert.notOk = notOk
assert.equal = equal
assert.ok = assert

module.exports = assert

function equal (a, b, m) {
  assert(a == b, m) // eslint-disable-line eqeqeq
}

function notEqual (a, b, m) {
  assert(a != b, m) // eslint-disable-line eqeqeq
}

function notOk (t, m) {
  assert(!t, m)
}

function assert (t, m) {
  if (!t) throw new Error(m || 'AssertionError')
}

},{}],54:[function(require,module,exports){
var splice = require('remove-array-items')
var nanotiming = require('nanotiming')
var assert = require('assert')

module.exports = Nanobus

function Nanobus (name) {
  if (!(this instanceof Nanobus)) return new Nanobus(name)

  this._name = name || 'nanobus'
  this._starListeners = []
  this._listeners = {}
}

Nanobus.prototype.emit = function (eventName) {
  assert.ok(typeof eventName === 'string' || typeof eventName === 'symbol', 'nanobus.emit: eventName should be type string or symbol')

  var data = []
  for (var i = 1, len = arguments.length; i < len; i++) {
    data.push(arguments[i])
  }

  var emitTiming = nanotiming(this._name + "('" + eventName.toString() + "')")
  var listeners = this._listeners[eventName]
  if (listeners && listeners.length > 0) {
    this._emit(this._listeners[eventName], data)
  }

  if (this._starListeners.length > 0) {
    this._emit(this._starListeners, eventName, data, emitTiming.uuid)
  }
  emitTiming()

  return this
}

Nanobus.prototype.on = Nanobus.prototype.addListener = function (eventName, listener) {
  assert.ok(typeof eventName === 'string' || typeof eventName === 'symbol', 'nanobus.on: eventName should be type string or symbol')
  assert.equal(typeof listener, 'function', 'nanobus.on: listener should be type function')

  if (eventName === '*') {
    this._starListeners.push(listener)
  } else {
    if (!this._listeners[eventName]) this._listeners[eventName] = []
    this._listeners[eventName].push(listener)
  }
  return this
}

Nanobus.prototype.prependListener = function (eventName, listener) {
  assert.ok(typeof eventName === 'string' || typeof eventName === 'symbol', 'nanobus.prependListener: eventName should be type string or symbol')
  assert.equal(typeof listener, 'function', 'nanobus.prependListener: listener should be type function')

  if (eventName === '*') {
    this._starListeners.unshift(listener)
  } else {
    if (!this._listeners[eventName]) this._listeners[eventName] = []
    this._listeners[eventName].unshift(listener)
  }
  return this
}

Nanobus.prototype.once = function (eventName, listener) {
  assert.ok(typeof eventName === 'string' || typeof eventName === 'symbol', 'nanobus.once: eventName should be type string or symbol')
  assert.equal(typeof listener, 'function', 'nanobus.once: listener should be type function')

  var self = this
  this.on(eventName, once)
  function once () {
    listener.apply(self, arguments)
    self.removeListener(eventName, once)
  }
  return this
}

Nanobus.prototype.prependOnceListener = function (eventName, listener) {
  assert.ok(typeof eventName === 'string' || typeof eventName === 'symbol', 'nanobus.prependOnceListener: eventName should be type string or symbol')
  assert.equal(typeof listener, 'function', 'nanobus.prependOnceListener: listener should be type function')

  var self = this
  this.prependListener(eventName, once)
  function once () {
    listener.apply(self, arguments)
    self.removeListener(eventName, once)
  }
  return this
}

Nanobus.prototype.removeListener = function (eventName, listener) {
  assert.ok(typeof eventName === 'string' || typeof eventName === 'symbol', 'nanobus.removeListener: eventName should be type string or symbol')
  assert.equal(typeof listener, 'function', 'nanobus.removeListener: listener should be type function')

  if (eventName === '*') {
    this._starListeners = this._starListeners.slice()
    return remove(this._starListeners, listener)
  } else {
    if (typeof this._listeners[eventName] !== 'undefined') {
      this._listeners[eventName] = this._listeners[eventName].slice()
    }

    return remove(this._listeners[eventName], listener)
  }

  function remove (arr, listener) {
    if (!arr) return
    var index = arr.indexOf(listener)
    if (index !== -1) {
      splice(arr, index, 1)
      return true
    }
  }
}

Nanobus.prototype.removeAllListeners = function (eventName) {
  if (eventName) {
    if (eventName === '*') {
      this._starListeners = []
    } else {
      this._listeners[eventName] = []
    }
  } else {
    this._starListeners = []
    this._listeners = {}
  }
  return this
}

Nanobus.prototype.listeners = function (eventName) {
  var listeners = eventName !== '*'
    ? this._listeners[eventName]
    : this._starListeners

  var ret = []
  if (listeners) {
    var ilength = listeners.length
    for (var i = 0; i < ilength; i++) ret.push(listeners[i])
  }
  return ret
}

Nanobus.prototype._emit = function (arr, eventName, data, uuid) {
  if (typeof arr === 'undefined') return
  if (arr.length === 0) return
  if (data === undefined) {
    data = eventName
    eventName = null
  }

  if (eventName) {
    if (uuid !== undefined) {
      data = [eventName].concat(data, uuid)
    } else {
      data = [eventName].concat(data)
    }
  }

  var length = arr.length
  for (var i = 0; i < length; i++) {
    var listener = arr[i]
    listener.apply(listener, data)
  }
}

},{"assert":53,"nanotiming":72,"remove-array-items":77}],55:[function(require,module,exports){
const document = require('global/document')
const nanotiming = require('nanotiming')
const morph = require('nanomorph')
const onload = require('on-load')
const assert = require('assert')

const OL_KEY_ID = onload.KEY_ID
const OL_ATTR_ID = onload.KEY_ATTR

module.exports = Nanocomponent

function makeID () {
  return 'ncid-' + Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)
}

Nanocomponent.makeID = makeID

function Nanocomponent (name) {
  this._hasWindow = typeof window !== 'undefined'
  this._id = null // represents the id of the root node
  this._ncID = null // internal nanocomponent id
  this._olID = null
  this._proxy = null
  this._loaded = false // Used to debounce on-load when child-reordering
  this._rootNodeName = null
  this._name = name || 'nanocomponent'
  this._rerender = false

  this._handleLoad = this._handleLoad.bind(this)
  this._handleUnload = this._handleUnload.bind(this)

  this._arguments = []

  const self = this

  Object.defineProperty(this, 'element', {
    get: function () {
      const el = document.getElementById(self._id)
      if (el) return el.dataset.nanocomponent === self._ncID ? el : undefined
    }
  })
}

Nanocomponent.prototype.render = function () {
  const renderTiming = nanotiming(this._name + '.render')
  const self = this
  const args = new Array(arguments.length)
  let el

  for (let i = 0; i < arguments.length; i++) args[i] = arguments[i]
  if (!this._hasWindow) {
    const createTiming = nanotiming(this._name + '.create')
    el = this.createElement.apply(this, args)
    createTiming()
    renderTiming()
    return el
  } else if (this.element) {
    el = this.element // retain reference, as the ID might change on render
    const updateTiming = nanotiming(this._name + '.update')
    const shouldUpdate = this._rerender || this.update.apply(this, args)
    updateTiming()
    if (this._rerender) this._rerender = false
    if (shouldUpdate) {
      const desiredHtml = this._handleRender(args)
      const morphTiming = nanotiming(this._name + '.morph')
      morph(el, desiredHtml)
      morphTiming()
      if (this.afterupdate) this.afterupdate(el)
    }
    if (!this._proxy) { this._proxy = this._createProxy() }
    renderTiming()
    return this._proxy
  } else {
    this._reset()
    el = this._handleRender(args)
    if (this.beforerender) this.beforerender(el)
    if (this.load || this.unload || this.afterreorder) {
      onload(el, self._handleLoad, self._handleUnload, self._ncID)
      this._olID = el.dataset[OL_KEY_ID]
    }
    renderTiming()
    return el
  }
}

Nanocomponent.prototype.rerender = function () {
  assert(this.element, 'nanocomponent: cant rerender on an unmounted dom node')
  this._rerender = true
  this.render.apply(this, this._arguments)
}

Nanocomponent.prototype._handleRender = function (args) {
  const createElementTiming = nanotiming(this._name + '.createElement')
  const el = this.createElement.apply(this, args)
  createElementTiming()
  if (!this._rootNodeName) this._rootNodeName = el.nodeName
  assert(el instanceof window.Element, 'nanocomponent: createElement should return a single DOM node')
  assert(this._rootNodeName === el.nodeName, 'nanocomponent: root node types cannot differ between re-renders')
  this._arguments = args
  return this._brandNode(this._ensureID(el))
}

Nanocomponent.prototype._createProxy = function () {
  const proxy = document.createElement(this._rootNodeName)
  const self = this
  this._brandNode(proxy)
  proxy.id = this._id
  proxy.setAttribute('data-proxy', '')
  proxy.isSameNode = function (el) {
    return (el && el.dataset.nanocomponent === self._ncID)
  }
  return proxy
}

Nanocomponent.prototype._reset = function () {
  this._ncID = Nanocomponent.makeID()
  this._olID = null
  this._id = null
  this._proxy = null
  this._rootNodeName = null
}

Nanocomponent.prototype._brandNode = function (node) {
  node.setAttribute('data-nanocomponent', this._ncID)
  if (this._olID) node.setAttribute(OL_ATTR_ID, this._olID)
  return node
}

Nanocomponent.prototype._ensureID = function (node) {
  if (node.id) this._id = node.id
  else node.id = this._id = this._ncID
  // Update proxy node ID if it changed
  if (this._proxy && this._proxy.id !== this._id) this._proxy.id = this._id
  return node
}

Nanocomponent.prototype._handleLoad = function (el) {
  if (this._loaded) {
    if (this.afterreorder) this.afterreorder(el)
    return // Debounce child-reorders
  }
  this._loaded = true
  if (this.load) this.load(el)
}

Nanocomponent.prototype._handleUnload = function (el) {
  if (this.element) return // Debounce child-reorders
  this._loaded = false
  if (this.unload) this.unload(el)
}

Nanocomponent.prototype.createElement = function () {
  throw new Error('nanocomponent: createElement should be implemented!')
}

Nanocomponent.prototype.update = function () {
  throw new Error('nanocomponent: update should be implemented!')
}

},{"assert":56,"global/document":39,"nanomorph":65,"nanotiming":72,"on-load":73}],56:[function(require,module,exports){
module.exports = assert

class AssertionError extends Error {}
AssertionError.prototype.name = 'AssertionError'

/**
 * Minimal assert function
 * @param  {any} t Value to check if falsy
 * @param  {string=} m Optional assertion error message
 * @throws {AssertionError}
 */
function assert (t, m) {
  if (!t) {
    var err = new AssertionError(m)
    if (Error.captureStackTrace) Error.captureStackTrace(err, assert)
    throw err
  }
}

},{}],57:[function(require,module,exports){
var assert = require('assert')

var safeExternalLink = /(noopener|noreferrer) (noopener|noreferrer)/
var protocolLink = /^[\w-_]+:/

module.exports = href

function href (cb, root) {
  assert.notEqual(typeof window, 'undefined', 'nanohref: expected window to exist')

  root = root || window.document

  assert.equal(typeof cb, 'function', 'nanohref: cb should be type function')
  assert.equal(typeof root, 'object', 'nanohref: root should be type object')

  window.addEventListener('click', function (e) {
    if ((e.button && e.button !== 0) ||
      e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ||
      e.defaultPrevented) return

    var anchor = (function traverse (node) {
      if (!node || node === root) return
      if (node.localName !== 'a' || node.href === undefined) {
        return traverse(node.parentNode)
      }
      return node
    })(e.target)

    if (!anchor) return

    if (window.location.protocol !== anchor.protocol ||
        window.location.hostname !== anchor.hostname ||
        window.location.port !== anchor.port ||
      anchor.hasAttribute('data-nanohref-ignore') ||
      anchor.hasAttribute('download') ||
      (anchor.getAttribute('target') === '_blank' &&
        safeExternalLink.test(anchor.getAttribute('rel'))) ||
      protocolLink.test(anchor.getAttribute('href'))) return

    e.preventDefault()
    cb(anchor)
  })
}

},{"assert":53}],58:[function(require,module,exports){
'use strict'

var trailingNewlineRegex = /\n[\s]+$/
var leadingNewlineRegex = /^\n[\s]+/
var trailingSpaceRegex = /[\s]+$/
var leadingSpaceRegex = /^[\s]+/
var multiSpaceRegex = /[\n\s]+/g

var TEXT_TAGS = [
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'data', 'dfn', 'em', 'i',
  'kbd', 'mark', 'q', 'rp', 'rt', 'rtc', 'ruby', 's', 'amp', 'small', 'span',
  'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
]

var VERBATIM_TAGS = [
  'code', 'pre', 'textarea'
]

module.exports = function appendChild (el, childs) {
  if (!Array.isArray(childs)) return

  var nodeName = el.nodeName.toLowerCase()

  var hadText = false
  var value, leader

  for (var i = 0, len = childs.length; i < len; i++) {
    var node = childs[i]
    if (Array.isArray(node)) {
      appendChild(el, node)
      continue
    }

    if (typeof node === 'number' ||
      typeof node === 'boolean' ||
      typeof node === 'function' ||
      node instanceof Date ||
      node instanceof RegExp) {
      node = node.toString()
    }

    var lastChild = el.childNodes[el.childNodes.length - 1]

    // Iterate over text nodes
    if (typeof node === 'string') {
      hadText = true

      // If we already had text, append to the existing text
      if (lastChild && lastChild.nodeName === '#text') {
        lastChild.nodeValue += node

      // We didn't have a text node yet, create one
      } else {
        node = el.ownerDocument.createTextNode(node)
        el.appendChild(node)
        lastChild = node
      }

      // If this is the last of the child nodes, make sure we close it out
      // right
      if (i === len - 1) {
        hadText = false
        // Trim the child text nodes if the current node isn't a
        // node where whitespace matters.
        if (TEXT_TAGS.indexOf(nodeName) === -1 &&
          VERBATIM_TAGS.indexOf(nodeName) === -1) {
          value = lastChild.nodeValue
            .replace(leadingNewlineRegex, '')
            .replace(trailingSpaceRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')
          if (value === '') {
            el.removeChild(lastChild)
          } else {
            lastChild.nodeValue = value
          }
        } else if (VERBATIM_TAGS.indexOf(nodeName) === -1) {
          // The very first node in the list should not have leading
          // whitespace. Sibling text nodes should have whitespace if there
          // was any.
          leader = i === 0 ? '' : ' '
          value = lastChild.nodeValue
            .replace(leadingNewlineRegex, leader)
            .replace(leadingSpaceRegex, ' ')
            .replace(trailingSpaceRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')
          lastChild.nodeValue = value
        }
      }

    // Iterate over DOM nodes
    } else if (node && node.nodeType) {
      // If the last node was a text node, make sure it is properly closed out
      if (hadText) {
        hadText = false

        // Trim the child text nodes if the current node isn't a
        // text node or a code node
        if (TEXT_TAGS.indexOf(nodeName) === -1 &&
          VERBATIM_TAGS.indexOf(nodeName) === -1) {
          value = lastChild.nodeValue
            .replace(leadingNewlineRegex, '')
            .replace(trailingNewlineRegex, ' ')
            .replace(multiSpaceRegex, ' ')

          // Remove empty text nodes, append otherwise
          if (value === '') {
            el.removeChild(lastChild)
          } else {
            lastChild.nodeValue = value
          }
        // Trim the child nodes but preserve the appropriate whitespace
        } else if (VERBATIM_TAGS.indexOf(nodeName) === -1) {
          value = lastChild.nodeValue
            .replace(leadingSpaceRegex, ' ')
            .replace(leadingNewlineRegex, '')
            .replace(trailingNewlineRegex, ' ')
            .replace(multiSpaceRegex, ' ')
          lastChild.nodeValue = value
        }
      }

      // Store the last nodename
      var _nodeName = node.nodeName
      if (_nodeName) nodeName = _nodeName.toLowerCase()

      // Append the node to the DOM
      el.appendChild(node)
    }
  }
}

},{}],59:[function(require,module,exports){
'use strict'

module.exports = [
  'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default',
  'defaultchecked', 'defer', 'disabled', 'formnovalidate', 'hidden',
  'ismap', 'loop', 'multiple', 'muted', 'novalidate', 'open', 'playsinline',
  'readonly', 'required', 'reversed', 'selected'
]

},{}],60:[function(require,module,exports){
module.exports = require('./dom')(document)

},{"./dom":62}],61:[function(require,module,exports){
'use strict'

module.exports = [
  'indeterminate'
]

},{}],62:[function(require,module,exports){
'use strict'

var hyperx = require('hyperx')
var appendChild = require('./append-child')
var SVG_TAGS = require('./svg-tags')
var BOOL_PROPS = require('./bool-props')
// Props that need to be set directly rather than with el.setAttribute()
var DIRECT_PROPS = require('./direct-props')

var SVGNS = 'http://www.w3.org/2000/svg'
var XLINKNS = 'http://www.w3.org/1999/xlink'

var COMMENT_TAG = '!--'

module.exports = function (document) {
  function nanoHtmlCreateElement (tag, props, children) {
    var el

    // If an svg tag, it needs a namespace
    if (SVG_TAGS.indexOf(tag) !== -1) {
      props.namespace = SVGNS
    }

    // If we are using a namespace
    var ns = false
    if (props.namespace) {
      ns = props.namespace
      delete props.namespace
    }

    // If we are extending a builtin element
    var isCustomElement = false
    if (props.is) {
      isCustomElement = props.is
      delete props.is
    }

    // Create the element
    if (ns) {
      if (isCustomElement) {
        el = document.createElementNS(ns, tag, { is: isCustomElement })
      } else {
        el = document.createElementNS(ns, tag)
      }
    } else if (tag === COMMENT_TAG) {
      return document.createComment(props.comment)
    } else if (isCustomElement) {
      el = document.createElement(tag, { is: isCustomElement })
    } else {
      el = document.createElement(tag)
    }

    // Create the properties
    for (var p in props) {
      if (props.hasOwnProperty(p)) {
        var key = p.toLowerCase()
        var val = props[p]
        // Normalize className
        if (key === 'classname') {
          key = 'class'
          p = 'class'
        }
        // The for attribute gets transformed to htmlFor, but we just set as for
        if (p === 'htmlFor') {
          p = 'for'
        }
        // If a property is boolean, set itself to the key
        if (BOOL_PROPS.indexOf(key) !== -1) {
          if (String(val) === 'true') val = key
          else if (String(val) === 'false') continue
        }
        // If a property prefers being set directly vs setAttribute
        if (key.slice(0, 2) === 'on' || DIRECT_PROPS.indexOf(key) !== -1) {
          el[p] = val
        } else {
          if (ns) {
            if (p === 'xlink:href') {
              el.setAttributeNS(XLINKNS, p, val)
            } else if (/^xmlns($|:)/i.test(p)) {
              // skip xmlns definitions
            } else {
              el.setAttributeNS(null, p, val)
            }
          } else {
            el.setAttribute(p, val)
          }
        }
      }
    }

    appendChild(el, children)
    return el
  }

  function createFragment (nodes) {
    var fragment = document.createDocumentFragment()
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] == null) continue
      if (Array.isArray(nodes[i])) {
        fragment.appendChild(createFragment(nodes[i]))
      } else {
        if (typeof nodes[i] === 'string') nodes[i] = document.createTextNode(nodes[i])
        fragment.appendChild(nodes[i])
      }
    }
    return fragment
  }

  var exports = hyperx(nanoHtmlCreateElement, {
    comments: true,
    createFragment: createFragment
  })
  exports.default = exports
  exports.createComment = nanoHtmlCreateElement
  return exports
}

},{"./append-child":58,"./bool-props":59,"./direct-props":61,"./svg-tags":63,"hyperx":42}],63:[function(require,module,exports){
'use strict'

module.exports = [
  'svg', 'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
  'animateMotion', 'animateTransform', 'circle', 'clipPath', 'color-profile',
  'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage',
  'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight',
  'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence', 'filter',
  'font', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src',
  'font-face-uri', 'foreignObject', 'g', 'glyph', 'glyphRef', 'hkern', 'image',
  'line', 'linearGradient', 'marker', 'mask', 'metadata', 'missing-glyph',
  'mpath', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'set', 'stop', 'switch', 'symbol', 'text', 'textPath', 'title', 'tref',
  'tspan', 'use', 'view', 'vkern'
]

},{}],64:[function(require,module,exports){
module.exports = LRU

function LRU (opts) {
  if (!(this instanceof LRU)) return new LRU(opts)
  if (typeof opts === 'number') opts = {max: opts}
  if (!opts) opts = {}
  this.cache = {}
  this.head = this.tail = null
  this.length = 0
  this.max = opts.max || 1000
  this.maxAge = opts.maxAge || 0
}

Object.defineProperty(LRU.prototype, 'keys', {
  get: function () { return Object.keys(this.cache) }
})

LRU.prototype.clear = function () {
  this.cache = {}
  this.head = this.tail = null
  this.length = 0
}

LRU.prototype.remove = function (key) {
  if (typeof key !== 'string') key = '' + key
  if (!this.cache.hasOwnProperty(key)) return

  var element = this.cache[key]
  delete this.cache[key]
  this._unlink(key, element.prev, element.next)
  return element.value
}

LRU.prototype._unlink = function (key, prev, next) {
  this.length--

  if (this.length === 0) {
    this.head = this.tail = null
  } else {
    if (this.head === key) {
      this.head = prev
      this.cache[this.head].next = null
    } else if (this.tail === key) {
      this.tail = next
      this.cache[this.tail].prev = null
    } else {
      this.cache[prev].next = next
      this.cache[next].prev = prev
    }
  }
}

LRU.prototype.peek = function (key) {
  if (!this.cache.hasOwnProperty(key)) return

  var element = this.cache[key]

  if (!this._checkAge(key, element)) return
  return element.value
}

LRU.prototype.set = function (key, value) {
  if (typeof key !== 'string') key = '' + key

  var element

  if (this.cache.hasOwnProperty(key)) {
    element = this.cache[key]
    element.value = value
    if (this.maxAge) element.modified = Date.now()

    // If it's already the head, there's nothing more to do:
    if (key === this.head) return value
    this._unlink(key, element.prev, element.next)
  } else {
    element = {value: value, modified: 0, next: null, prev: null}
    if (this.maxAge) element.modified = Date.now()
    this.cache[key] = element

    // Eviction is only possible if the key didn't already exist:
    if (this.length === this.max) this.evict()
  }

  this.length++
  element.next = null
  element.prev = this.head

  if (this.head) this.cache[this.head].next = key
  this.head = key

  if (!this.tail) this.tail = key
  return value
}

LRU.prototype._checkAge = function (key, element) {
  if (this.maxAge && (Date.now() - element.modified) > this.maxAge) {
    this.remove(key)
    return false
  }
  return true
}

LRU.prototype.get = function (key) {
  if (typeof key !== 'string') key = '' + key
  if (!this.cache.hasOwnProperty(key)) return

  var element = this.cache[key]

  if (!this._checkAge(key, element)) return

  if (this.head !== key) {
    if (key === this.tail) {
      this.tail = element.next
      this.cache[this.tail].prev = null
    } else {
      // Set prev.next -> element.next:
      this.cache[element.prev].next = element.next
    }

    // Set element.next.prev -> element.prev:
    this.cache[element.next].prev = element.prev

    // Element is the new head
    this.cache[this.head].next = key
    element.prev = this.head
    element.next = null
    this.head = key
  }

  return element.value
}

LRU.prototype.evict = function () {
  if (!this.tail) return
  this.remove(this.tail)
}

},{}],65:[function(require,module,exports){
var assert = require('nanoassert')
var morph = require('./lib/morph')

var TEXT_NODE = 3
// var DEBUG = false

module.exports = nanomorph

// Morph one tree into another tree
//
// no parent
//   -> same: diff and walk children
//   -> not same: replace and return
// old node doesn't exist
//   -> insert new node
// new node doesn't exist
//   -> delete old node
// nodes are not the same
//   -> diff nodes and apply patch to old node
// nodes are the same
//   -> walk all child nodes and append to old node
function nanomorph (oldTree, newTree, options) {
  // if (DEBUG) {
  //   console.log(
  //   'nanomorph\nold\n  %s\nnew\n  %s',
  //   oldTree && oldTree.outerHTML,
  //   newTree && newTree.outerHTML
  // )
  // }
  assert.equal(typeof oldTree, 'object', 'nanomorph: oldTree should be an object')
  assert.equal(typeof newTree, 'object', 'nanomorph: newTree should be an object')

  if (options && options.childrenOnly) {
    updateChildren(newTree, oldTree)
    return oldTree
  }

  assert.notEqual(
    newTree.nodeType,
    11,
    'nanomorph: newTree should have one root node (which is not a DocumentFragment)'
  )

  return walk(newTree, oldTree)
}

// Walk and morph a dom tree
function walk (newNode, oldNode) {
  // if (DEBUG) {
  //   console.log(
  //   'walk\nold\n  %s\nnew\n  %s',
  //   oldNode && oldNode.outerHTML,
  //   newNode && newNode.outerHTML
  // )
  // }
  if (!oldNode) {
    return newNode
  } else if (!newNode) {
    return null
  } else if (newNode.isSameNode && newNode.isSameNode(oldNode)) {
    return oldNode
  } else if (newNode.tagName !== oldNode.tagName || getComponentId(newNode) !== getComponentId(oldNode)) {
    return newNode
  } else {
    morph(newNode, oldNode)
    updateChildren(newNode, oldNode)
    return oldNode
  }
}

function getComponentId (node) {
  return node.dataset ? node.dataset.nanomorphComponentId : undefined
}

// Update the children of elements
// (obj, obj) -> null
function updateChildren (newNode, oldNode) {
  // if (DEBUG) {
  //   console.log(
  //   'updateChildren\nold\n  %s\nnew\n  %s',
  //   oldNode && oldNode.outerHTML,
  //   newNode && newNode.outerHTML
  // )
  // }
  var oldChild, newChild, morphed, oldMatch

  // The offset is only ever increased, and used for [i - offset] in the loop
  var offset = 0

  for (var i = 0; ; i++) {
    oldChild = oldNode.childNodes[i]
    newChild = newNode.childNodes[i - offset]
    // if (DEBUG) {
    //   console.log(
    //   '===\n- old\n  %s\n- new\n  %s',
    //   oldChild && oldChild.outerHTML,
    //   newChild && newChild.outerHTML
    // )
    // }
    // Both nodes are empty, do nothing
    if (!oldChild && !newChild) {
      break

    // There is no new child, remove old
    } else if (!newChild) {
      oldNode.removeChild(oldChild)
      i--

    // There is no old child, add new
    } else if (!oldChild) {
      oldNode.appendChild(newChild)
      offset++

    // Both nodes are the same, morph
    } else if (same(newChild, oldChild)) {
      morphed = walk(newChild, oldChild)
      if (morphed !== oldChild) {
        oldNode.replaceChild(morphed, oldChild)
        offset++
      }

    // Both nodes do not share an ID or a placeholder, try reorder
    } else {
      oldMatch = null

      // Try and find a similar node somewhere in the tree
      for (var j = i; j < oldNode.childNodes.length; j++) {
        if (same(oldNode.childNodes[j], newChild)) {
          oldMatch = oldNode.childNodes[j]
          break
        }
      }

      // If there was a node with the same ID or placeholder in the old list
      if (oldMatch) {
        morphed = walk(newChild, oldMatch)
        if (morphed !== oldMatch) offset++
        oldNode.insertBefore(morphed, oldChild)

      // It's safe to morph two nodes in-place if neither has an ID
      } else if (!newChild.id && !oldChild.id) {
        morphed = walk(newChild, oldChild)
        if (morphed !== oldChild) {
          oldNode.replaceChild(morphed, oldChild)
          offset++
        }

      // Insert the node at the index if we couldn't morph or find a matching node
      } else {
        oldNode.insertBefore(newChild, oldChild)
        offset++
      }
    }
  }
}

function same (a, b) {
  if (a.id) return a.id === b.id
  if (a.isSameNode) return a.isSameNode(b)
  if (a.tagName !== b.tagName) return false
  if (a.type === TEXT_NODE) return a.nodeValue === b.nodeValue
  return false
}

},{"./lib/morph":67,"nanoassert":53}],66:[function(require,module,exports){
module.exports = [
  // attribute events (can be set with attributes)
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'onmouseenter',
  'onmouseleave',
  'ontouchcancel',
  'ontouchend',
  'ontouchmove',
  'ontouchstart',
  'ondragstart',
  'ondrag',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondrop',
  'ondragend',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onunload',
  'onabort',
  'onerror',
  'onresize',
  'onscroll',
  'onselect',
  'onchange',
  'onsubmit',
  'onreset',
  'onfocus',
  'onblur',
  'oninput',
  'onanimationend',
  'onanimationiteration',
  'onanimationstart',
  // other common events
  'oncontextmenu',
  'onfocusin',
  'onfocusout'
]

},{}],67:[function(require,module,exports){
var events = require('./events')
var eventsLength = events.length

var ELEMENT_NODE = 1
var TEXT_NODE = 3
var COMMENT_NODE = 8

module.exports = morph

// diff elements and apply the resulting patch to the old node
// (obj, obj) -> null
function morph (newNode, oldNode) {
  var nodeType = newNode.nodeType
  var nodeName = newNode.nodeName

  if (nodeType === ELEMENT_NODE) {
    copyAttrs(newNode, oldNode)
  }

  if (nodeType === TEXT_NODE || nodeType === COMMENT_NODE) {
    if (oldNode.nodeValue !== newNode.nodeValue) {
      oldNode.nodeValue = newNode.nodeValue
    }
  }

  // Some DOM nodes are weird
  // https://github.com/patrick-steele-idem/morphdom/blob/master/src/specialElHandlers.js
  if (nodeName === 'INPUT') updateInput(newNode, oldNode)
  else if (nodeName === 'OPTION') updateOption(newNode, oldNode)
  else if (nodeName === 'TEXTAREA') updateTextarea(newNode, oldNode)

  copyEvents(newNode, oldNode)
}

function copyAttrs (newNode, oldNode) {
  var oldAttrs = oldNode.attributes
  var newAttrs = newNode.attributes
  var attrNamespaceURI = null
  var attrValue = null
  var fromValue = null
  var attrName = null
  var attr = null

  for (var i = newAttrs.length - 1; i >= 0; --i) {
    attr = newAttrs[i]
    attrName = attr.name
    attrNamespaceURI = attr.namespaceURI
    attrValue = attr.value
    if (attrNamespaceURI) {
      attrName = attr.localName || attrName
      fromValue = oldNode.getAttributeNS(attrNamespaceURI, attrName)
      if (fromValue !== attrValue) {
        oldNode.setAttributeNS(attrNamespaceURI, attrName, attrValue)
      }
    } else {
      if (!oldNode.hasAttribute(attrName)) {
        oldNode.setAttribute(attrName, attrValue)
      } else {
        fromValue = oldNode.getAttribute(attrName)
        if (fromValue !== attrValue) {
          // apparently values are always cast to strings, ah well
          if (attrValue === 'null' || attrValue === 'undefined') {
            oldNode.removeAttribute(attrName)
          } else {
            oldNode.setAttribute(attrName, attrValue)
          }
        }
      }
    }
  }

  // Remove any extra attributes found on the original DOM element that
  // weren't found on the target element.
  for (var j = oldAttrs.length - 1; j >= 0; --j) {
    attr = oldAttrs[j]
    if (attr.specified !== false) {
      attrName = attr.name
      attrNamespaceURI = attr.namespaceURI

      if (attrNamespaceURI) {
        attrName = attr.localName || attrName
        if (!newNode.hasAttributeNS(attrNamespaceURI, attrName)) {
          oldNode.removeAttributeNS(attrNamespaceURI, attrName)
        }
      } else {
        if (!newNode.hasAttributeNS(null, attrName)) {
          oldNode.removeAttribute(attrName)
        }
      }
    }
  }
}

function copyEvents (newNode, oldNode) {
  for (var i = 0; i < eventsLength; i++) {
    var ev = events[i]
    if (newNode[ev]) {           // if new element has a whitelisted attribute
      oldNode[ev] = newNode[ev]  // update existing element
    } else if (oldNode[ev]) {    // if existing element has it and new one doesnt
      oldNode[ev] = undefined    // remove it from existing element
    }
  }
}

function updateOption (newNode, oldNode) {
  updateAttribute(newNode, oldNode, 'selected')
}

// The "value" attribute is special for the <input> element since it sets the
// initial value. Changing the "value" attribute without changing the "value"
// property will have no effect since it is only used to the set the initial
// value. Similar for the "checked" attribute, and "disabled".
function updateInput (newNode, oldNode) {
  var newValue = newNode.value
  var oldValue = oldNode.value

  updateAttribute(newNode, oldNode, 'checked')
  updateAttribute(newNode, oldNode, 'disabled')

  // The "indeterminate" property can not be set using an HTML attribute.
  // See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/checkbox
  if (newNode.indeterminate !== oldNode.indeterminate) {
    oldNode.indeterminate = newNode.indeterminate
  }

  // Persist file value since file inputs can't be changed programatically
  if (oldNode.type === 'file') return

  if (newValue !== oldValue) {
    oldNode.setAttribute('value', newValue)
    oldNode.value = newValue
  }

  if (newValue === 'null') {
    oldNode.value = ''
    oldNode.removeAttribute('value')
  }

  if (!newNode.hasAttributeNS(null, 'value')) {
    oldNode.removeAttribute('value')
  } else if (oldNode.type === 'range') {
    // this is so elements like slider move their UI thingy
    oldNode.value = newValue
  }
}

function updateTextarea (newNode, oldNode) {
  var newValue = newNode.value
  if (newValue !== oldNode.value) {
    oldNode.value = newValue
  }

  if (oldNode.firstChild && oldNode.firstChild.nodeValue !== newValue) {
    // Needed for IE. Apparently IE sets the placeholder as the
    // node value and vise versa. This ignores an empty update.
    if (newValue === '' && oldNode.firstChild.nodeValue === oldNode.placeholder) {
      return
    }

    oldNode.firstChild.nodeValue = newValue
  }
}

function updateAttribute (newNode, oldNode, name) {
  if (newNode[name] !== oldNode[name]) {
    oldNode[name] = newNode[name]
    if (newNode[name]) {
      oldNode.setAttribute(name, '')
    } else {
      oldNode.removeAttribute(name)
    }
  }
}

},{"./events":66}],68:[function(require,module,exports){
var reg = /([^?=&]+)(=([^&]*))?/g
var assert = require('assert')

module.exports = qs

function qs (url) {
  assert.equal(typeof url, 'string', 'nanoquery: url should be type string')

  var obj = {}
  url.replace(/^.*\?/, '').replace(reg, function (a0, a1, a2, a3) {
    var value = decodeURIComponent(a3)
    var key = decodeURIComponent(a1)
    if (obj.hasOwnProperty(key)) {
      if (Array.isArray(obj[key])) obj[key].push(value)
      else obj[key] = [obj[key], value]
    } else {
      obj[key] = value
    }
  })

  return obj
}

},{"assert":53}],69:[function(require,module,exports){
'use strict'

var assert = require('assert')

module.exports = nanoraf

// Only call RAF when needed
// (fn, fn?) -> fn
function nanoraf (render, raf) {
  assert.equal(typeof render, 'function', 'nanoraf: render should be a function')
  assert.ok(typeof raf === 'function' || typeof raf === 'undefined', 'nanoraf: raf should be a function or undefined')

  if (!raf) raf = window.requestAnimationFrame
  var redrawScheduled = false
  var args = null

  return function frame () {
    if (args === null && !redrawScheduled) {
      redrawScheduled = true

      raf(function redraw () {
        redrawScheduled = false

        var length = args.length
        var _args = new Array(length)
        for (var i = 0; i < length; i++) _args[i] = args[i]

        render.apply(render, _args)
        args = null
      })
    }

    args = arguments
  }
}

},{"assert":53}],70:[function(require,module,exports){
var assert = require('assert')
var wayfarer = require('wayfarer')

// electron support
var isLocalFile = (/file:\/\//.test(
  typeof window === 'object' &&
  window.location &&
  window.location.origin
))

/* eslint-disable no-useless-escape */
var electron = '^(file:\/\/|\/)(.*\.html?\/?)?'
var protocol = '^(http(s)?(:\/\/))?(www\.)?'
var domain = '[a-zA-Z0-9-_\.]+(:[0-9]{1,5})?(\/{1})?'
var qs = '[\?].*$'
/* eslint-enable no-useless-escape */

var stripElectron = new RegExp(electron)
var prefix = new RegExp(protocol + domain)
var normalize = new RegExp('#')
var suffix = new RegExp(qs)

module.exports = Nanorouter

function Nanorouter (opts) {
  if (!(this instanceof Nanorouter)) return new Nanorouter(opts)
  opts = opts || {}
  this.router = wayfarer(opts.default || '/404')
}

Nanorouter.prototype.on = function (routename, listener) {
  assert.equal(typeof routename, 'string')
  routename = routename.replace(/^[#/]/, '')
  this.router.on(routename, listener)
}

Nanorouter.prototype.emit = function (routename) {
  assert.equal(typeof routename, 'string')
  routename = pathname(routename, isLocalFile)
  return this.router.emit(routename)
}

Nanorouter.prototype.match = function (routename) {
  assert.equal(typeof routename, 'string')
  routename = pathname(routename, isLocalFile)
  return this.router.match(routename)
}

// replace everything in a route but the pathname and hash
function pathname (routename, isElectron) {
  if (isElectron) routename = routename.replace(stripElectron, '')
  else routename = routename.replace(prefix, '')
  return decodeURI(routename.replace(suffix, '').replace(normalize, '/'))
}

},{"assert":53,"wayfarer":85}],71:[function(require,module,exports){
var assert = require('assert')

var hasWindow = typeof window !== 'undefined'

function createScheduler () {
  var scheduler
  if (hasWindow) {
    if (!window._nanoScheduler) window._nanoScheduler = new NanoScheduler(true)
    scheduler = window._nanoScheduler
  } else {
    scheduler = new NanoScheduler()
  }
  return scheduler
}

function NanoScheduler (hasWindow) {
  this.hasWindow = hasWindow
  this.hasIdle = this.hasWindow && window.requestIdleCallback
  this.method = this.hasIdle ? window.requestIdleCallback.bind(window) : this.setTimeout
  this.scheduled = false
  this.queue = []
}

NanoScheduler.prototype.push = function (cb) {
  assert.equal(typeof cb, 'function', 'nanoscheduler.push: cb should be type function')

  this.queue.push(cb)
  this.schedule()
}

NanoScheduler.prototype.schedule = function () {
  if (this.scheduled) return

  this.scheduled = true
  var self = this
  this.method(function (idleDeadline) {
    var cb
    while (self.queue.length && idleDeadline.timeRemaining() > 0) {
      cb = self.queue.shift()
      cb(idleDeadline)
    }
    self.scheduled = false
    if (self.queue.length) self.schedule()
  })
}

NanoScheduler.prototype.setTimeout = function (cb) {
  setTimeout(cb, 0, {
    timeRemaining: function () {
      return 1
    }
  })
}

module.exports = createScheduler

},{"assert":53}],72:[function(require,module,exports){
var scheduler = require('nanoscheduler')()
var assert = require('assert')

var perf
nanotiming.disabled = true
try {
  perf = window.performance
  nanotiming.disabled = window.localStorage.DISABLE_NANOTIMING === 'true' || !perf.mark
} catch (e) { }

module.exports = nanotiming

function nanotiming (name) {
  assert.equal(typeof name, 'string', 'nanotiming: name should be type string')

  if (nanotiming.disabled) return noop

  var uuid = (perf.now() * 10000).toFixed() % Number.MAX_SAFE_INTEGER
  var startName = 'start-' + uuid + '-' + name
  perf.mark(startName)

  function end (cb) {
    var endName = 'end-' + uuid + '-' + name
    perf.mark(endName)

    scheduler.push(function () {
      var err = null
      try {
        var measureName = name + ' [' + uuid + ']'
        perf.measure(measureName, startName, endName)
        perf.clearMarks(startName)
        perf.clearMarks(endName)
      } catch (e) { err = e }
      if (cb) cb(err, name)
    })
  }

  end.uuid = uuid
  return end
}

function noop (cb) {
  if (cb) {
    scheduler.push(function () {
      cb(new Error('nanotiming: performance API unavailable'))
    })
  }
}

},{"assert":53,"nanoscheduler":71}],73:[function(require,module,exports){
/* global MutationObserver */
var document = require('global/document')
var window = require('global/window')
var watch = Object.create(null)
var KEY_ID = 'onloadid' + Math.random().toString(36).slice(2)
var KEY_ATTR = 'data-' + KEY_ID
var INDEX = 0

if (window && window.MutationObserver) {
  var observer = new MutationObserver(function (mutations) {
    if (Object.keys(watch).length < 1) return
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === KEY_ATTR) {
        eachAttr(mutations[i], turnon, turnoff)
        continue
      }
      eachMutation(mutations[i].removedNodes, function (index, el) {
        if (!document.documentElement.contains(el)) turnoff(index, el)
      })
      eachMutation(mutations[i].addedNodes, function (index, el) {
        if (document.documentElement.contains(el)) turnon(index, el)
      })
    }
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [KEY_ATTR]
  })
}

module.exports = function onload (el, on, off, caller) {
  on = on || function () {}
  off = off || function () {}
  el.setAttribute(KEY_ATTR, 'o' + INDEX)
  watch['o' + INDEX] = [on, off, 0, caller || onload.caller]
  INDEX += 1
  return el
}

module.exports.KEY_ATTR = KEY_ATTR
module.exports.KEY_ID = KEY_ID

function turnon (index, el) {
  if (watch[index][0] && watch[index][2] === 0) {
    watch[index][0](el)
    watch[index][2] = 1
  }
}

function turnoff (index, el) {
  if (watch[index][1] && watch[index][2] === 1) {
    watch[index][1](el)
    watch[index][2] = 0
  }
}

function eachAttr (mutation, on, off) {
  var newValue = mutation.target.getAttribute(KEY_ATTR)
  if (sameOrigin(mutation.oldValue, newValue)) {
    watch[newValue] = watch[mutation.oldValue]
    return
  }
  if (watch[mutation.oldValue]) {
    off(mutation.oldValue, mutation.target)
  }
  if (watch[newValue]) {
    on(newValue, mutation.target)
  }
}

function sameOrigin (oldValue, newValue) {
  if (!oldValue || !newValue) return false
  return watch[oldValue][3] === watch[newValue][3]
}

function eachMutation (nodes, fn) {
  var keys = Object.keys(watch)
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].getAttribute && nodes[i].getAttribute(KEY_ATTR)) {
      var onloadid = nodes[i].getAttribute(KEY_ATTR)
      keys.forEach(function (k) {
        if (onloadid === k) {
          fn(k, nodes[i])
        }
      })
    }
    if (nodes[i] && nodes[i].childNodes.length > 0) {
      eachMutation(nodes[i].childNodes, fn)
    }
  }
}

},{"global/document":39,"global/window":40}],74:[function(require,module,exports){
/* @license
Papa Parse
v5.4.1
https://github.com/mholt/PapaParse
License: MIT
*/
!function(e,t){"function"==typeof define&&define.amd?define([],t):"object"==typeof module&&"undefined"!=typeof exports?module.exports=t():e.Papa=t()}(this,function s(){"use strict";var f="undefined"!=typeof self?self:"undefined"!=typeof window?window:void 0!==f?f:{};var n=!f.document&&!!f.postMessage,o=f.IS_PAPA_WORKER||!1,a={},u=0,b={parse:function(e,t){var r=(t=t||{}).dynamicTyping||!1;J(r)&&(t.dynamicTypingFunction=r,r={});if(t.dynamicTyping=r,t.transform=!!J(t.transform)&&t.transform,t.worker&&b.WORKERS_SUPPORTED){var i=function(){if(!b.WORKERS_SUPPORTED)return!1;var e=(r=f.URL||f.webkitURL||null,i=s.toString(),b.BLOB_URL||(b.BLOB_URL=r.createObjectURL(new Blob(["var global = (function() { if (typeof self !== 'undefined') { return self; } if (typeof window !== 'undefined') { return window; } if (typeof global !== 'undefined') { return global; } return {}; })(); global.IS_PAPA_WORKER=true; ","(",i,")();"],{type:"text/javascript"})))),t=new f.Worker(e);var r,i;return t.onmessage=_,t.id=u++,a[t.id]=t}();return i.userStep=t.step,i.userChunk=t.chunk,i.userComplete=t.complete,i.userError=t.error,t.step=J(t.step),t.chunk=J(t.chunk),t.complete=J(t.complete),t.error=J(t.error),delete t.worker,void i.postMessage({input:e,config:t,workerId:i.id})}var n=null;b.NODE_STREAM_INPUT,"string"==typeof e?(e=function(e){if(65279===e.charCodeAt(0))return e.slice(1);return e}(e),n=t.download?new l(t):new p(t)):!0===e.readable&&J(e.read)&&J(e.on)?n=new g(t):(f.File&&e instanceof File||e instanceof Object)&&(n=new c(t));return n.stream(e)},unparse:function(e,t){var n=!1,_=!0,m=",",y="\r\n",s='"',a=s+s,r=!1,i=null,o=!1;!function(){if("object"!=typeof t)return;"string"!=typeof t.delimiter||b.BAD_DELIMITERS.filter(function(e){return-1!==t.delimiter.indexOf(e)}).length||(m=t.delimiter);("boolean"==typeof t.quotes||"function"==typeof t.quotes||Array.isArray(t.quotes))&&(n=t.quotes);"boolean"!=typeof t.skipEmptyLines&&"string"!=typeof t.skipEmptyLines||(r=t.skipEmptyLines);"string"==typeof t.newline&&(y=t.newline);"string"==typeof t.quoteChar&&(s=t.quoteChar);"boolean"==typeof t.header&&(_=t.header);if(Array.isArray(t.columns)){if(0===t.columns.length)throw new Error("Option columns is empty");i=t.columns}void 0!==t.escapeChar&&(a=t.escapeChar+s);("boolean"==typeof t.escapeFormulae||t.escapeFormulae instanceof RegExp)&&(o=t.escapeFormulae instanceof RegExp?t.escapeFormulae:/^[=+\-@\t\r].*$/)}();var u=new RegExp(Q(s),"g");"string"==typeof e&&(e=JSON.parse(e));if(Array.isArray(e)){if(!e.length||Array.isArray(e[0]))return h(null,e,r);if("object"==typeof e[0])return h(i||Object.keys(e[0]),e,r)}else if("object"==typeof e)return"string"==typeof e.data&&(e.data=JSON.parse(e.data)),Array.isArray(e.data)&&(e.fields||(e.fields=e.meta&&e.meta.fields||i),e.fields||(e.fields=Array.isArray(e.data[0])?e.fields:"object"==typeof e.data[0]?Object.keys(e.data[0]):[]),Array.isArray(e.data[0])||"object"==typeof e.data[0]||(e.data=[e.data])),h(e.fields||[],e.data||[],r);throw new Error("Unable to serialize unrecognized input");function h(e,t,r){var i="";"string"==typeof e&&(e=JSON.parse(e)),"string"==typeof t&&(t=JSON.parse(t));var n=Array.isArray(e)&&0<e.length,s=!Array.isArray(t[0]);if(n&&_){for(var a=0;a<e.length;a++)0<a&&(i+=m),i+=v(e[a],a);0<t.length&&(i+=y)}for(var o=0;o<t.length;o++){var u=n?e.length:t[o].length,h=!1,f=n?0===Object.keys(t[o]).length:0===t[o].length;if(r&&!n&&(h="greedy"===r?""===t[o].join("").trim():1===t[o].length&&0===t[o][0].length),"greedy"===r&&n){for(var d=[],l=0;l<u;l++){var c=s?e[l]:l;d.push(t[o][c])}h=""===d.join("").trim()}if(!h){for(var p=0;p<u;p++){0<p&&!f&&(i+=m);var g=n&&s?e[p]:p;i+=v(t[o][g],p)}o<t.length-1&&(!r||0<u&&!f)&&(i+=y)}}return i}function v(e,t){if(null==e)return"";if(e.constructor===Date)return JSON.stringify(e).slice(1,25);var r=!1;o&&"string"==typeof e&&o.test(e)&&(e="'"+e,r=!0);var i=e.toString().replace(u,a);return(r=r||!0===n||"function"==typeof n&&n(e,t)||Array.isArray(n)&&n[t]||function(e,t){for(var r=0;r<t.length;r++)if(-1<e.indexOf(t[r]))return!0;return!1}(i,b.BAD_DELIMITERS)||-1<i.indexOf(m)||" "===i.charAt(0)||" "===i.charAt(i.length-1))?s+i+s:i}}};if(b.RECORD_SEP=String.fromCharCode(30),b.UNIT_SEP=String.fromCharCode(31),b.BYTE_ORDER_MARK="\ufeff",b.BAD_DELIMITERS=["\r","\n",'"',b.BYTE_ORDER_MARK],b.WORKERS_SUPPORTED=!n&&!!f.Worker,b.NODE_STREAM_INPUT=1,b.LocalChunkSize=10485760,b.RemoteChunkSize=5242880,b.DefaultDelimiter=",",b.Parser=E,b.ParserHandle=r,b.NetworkStreamer=l,b.FileStreamer=c,b.StringStreamer=p,b.ReadableStreamStreamer=g,f.jQuery){var d=f.jQuery;d.fn.parse=function(o){var r=o.config||{},u=[];return this.each(function(e){if(!("INPUT"===d(this).prop("tagName").toUpperCase()&&"file"===d(this).attr("type").toLowerCase()&&f.FileReader)||!this.files||0===this.files.length)return!0;for(var t=0;t<this.files.length;t++)u.push({file:this.files[t],inputElem:this,instanceConfig:d.extend({},r)})}),e(),this;function e(){if(0!==u.length){var e,t,r,i,n=u[0];if(J(o.before)){var s=o.before(n.file,n.inputElem);if("object"==typeof s){if("abort"===s.action)return e="AbortError",t=n.file,r=n.inputElem,i=s.reason,void(J(o.error)&&o.error({name:e},t,r,i));if("skip"===s.action)return void h();"object"==typeof s.config&&(n.instanceConfig=d.extend(n.instanceConfig,s.config))}else if("skip"===s)return void h()}var a=n.instanceConfig.complete;n.instanceConfig.complete=function(e){J(a)&&a(e,n.file,n.inputElem),h()},b.parse(n.file,n.instanceConfig)}else J(o.complete)&&o.complete()}function h(){u.splice(0,1),e()}}}function h(e){this._handle=null,this._finished=!1,this._completed=!1,this._halted=!1,this._input=null,this._baseIndex=0,this._partialLine="",this._rowCount=0,this._start=0,this._nextChunk=null,this.isFirstChunk=!0,this._completeResults={data:[],errors:[],meta:{}},function(e){var t=w(e);t.chunkSize=parseInt(t.chunkSize),e.step||e.chunk||(t.chunkSize=null);this._handle=new r(t),(this._handle.streamer=this)._config=t}.call(this,e),this.parseChunk=function(e,t){if(this.isFirstChunk&&J(this._config.beforeFirstChunk)){var r=this._config.beforeFirstChunk(e);void 0!==r&&(e=r)}this.isFirstChunk=!1,this._halted=!1;var i=this._partialLine+e;this._partialLine="";var n=this._handle.parse(i,this._baseIndex,!this._finished);if(!this._handle.paused()&&!this._handle.aborted()){var s=n.meta.cursor;this._finished||(this._partialLine=i.substring(s-this._baseIndex),this._baseIndex=s),n&&n.data&&(this._rowCount+=n.data.length);var a=this._finished||this._config.preview&&this._rowCount>=this._config.preview;if(o)f.postMessage({results:n,workerId:b.WORKER_ID,finished:a});else if(J(this._config.chunk)&&!t){if(this._config.chunk(n,this._handle),this._handle.paused()||this._handle.aborted())return void(this._halted=!0);n=void 0,this._completeResults=void 0}return this._config.step||this._config.chunk||(this._completeResults.data=this._completeResults.data.concat(n.data),this._completeResults.errors=this._completeResults.errors.concat(n.errors),this._completeResults.meta=n.meta),this._completed||!a||!J(this._config.complete)||n&&n.meta.aborted||(this._config.complete(this._completeResults,this._input),this._completed=!0),a||n&&n.meta.paused||this._nextChunk(),n}this._halted=!0},this._sendError=function(e){J(this._config.error)?this._config.error(e):o&&this._config.error&&f.postMessage({workerId:b.WORKER_ID,error:e,finished:!1})}}function l(e){var i;(e=e||{}).chunkSize||(e.chunkSize=b.RemoteChunkSize),h.call(this,e),this._nextChunk=n?function(){this._readChunk(),this._chunkLoaded()}:function(){this._readChunk()},this.stream=function(e){this._input=e,this._nextChunk()},this._readChunk=function(){if(this._finished)this._chunkLoaded();else{if(i=new XMLHttpRequest,this._config.withCredentials&&(i.withCredentials=this._config.withCredentials),n||(i.onload=v(this._chunkLoaded,this),i.onerror=v(this._chunkError,this)),i.open(this._config.downloadRequestBody?"POST":"GET",this._input,!n),this._config.downloadRequestHeaders){var e=this._config.downloadRequestHeaders;for(var t in e)i.setRequestHeader(t,e[t])}if(this._config.chunkSize){var r=this._start+this._config.chunkSize-1;i.setRequestHeader("Range","bytes="+this._start+"-"+r)}try{i.send(this._config.downloadRequestBody)}catch(e){this._chunkError(e.message)}n&&0===i.status&&this._chunkError()}},this._chunkLoaded=function(){4===i.readyState&&(i.status<200||400<=i.status?this._chunkError():(this._start+=this._config.chunkSize?this._config.chunkSize:i.responseText.length,this._finished=!this._config.chunkSize||this._start>=function(e){var t=e.getResponseHeader("Content-Range");if(null===t)return-1;return parseInt(t.substring(t.lastIndexOf("/")+1))}(i),this.parseChunk(i.responseText)))},this._chunkError=function(e){var t=i.statusText||e;this._sendError(new Error(t))}}function c(e){var i,n;(e=e||{}).chunkSize||(e.chunkSize=b.LocalChunkSize),h.call(this,e);var s="undefined"!=typeof FileReader;this.stream=function(e){this._input=e,n=e.slice||e.webkitSlice||e.mozSlice,s?((i=new FileReader).onload=v(this._chunkLoaded,this),i.onerror=v(this._chunkError,this)):i=new FileReaderSync,this._nextChunk()},this._nextChunk=function(){this._finished||this._config.preview&&!(this._rowCount<this._config.preview)||this._readChunk()},this._readChunk=function(){var e=this._input;if(this._config.chunkSize){var t=Math.min(this._start+this._config.chunkSize,this._input.size);e=n.call(e,this._start,t)}var r=i.readAsText(e,this._config.encoding);s||this._chunkLoaded({target:{result:r}})},this._chunkLoaded=function(e){this._start+=this._config.chunkSize,this._finished=!this._config.chunkSize||this._start>=this._input.size,this.parseChunk(e.target.result)},this._chunkError=function(){this._sendError(i.error)}}function p(e){var r;h.call(this,e=e||{}),this.stream=function(e){return r=e,this._nextChunk()},this._nextChunk=function(){if(!this._finished){var e,t=this._config.chunkSize;return t?(e=r.substring(0,t),r=r.substring(t)):(e=r,r=""),this._finished=!r,this.parseChunk(e)}}}function g(e){h.call(this,e=e||{});var t=[],r=!0,i=!1;this.pause=function(){h.prototype.pause.apply(this,arguments),this._input.pause()},this.resume=function(){h.prototype.resume.apply(this,arguments),this._input.resume()},this.stream=function(e){this._input=e,this._input.on("data",this._streamData),this._input.on("end",this._streamEnd),this._input.on("error",this._streamError)},this._checkIsFinished=function(){i&&1===t.length&&(this._finished=!0)},this._nextChunk=function(){this._checkIsFinished(),t.length?this.parseChunk(t.shift()):r=!0},this._streamData=v(function(e){try{t.push("string"==typeof e?e:e.toString(this._config.encoding)),r&&(r=!1,this._checkIsFinished(),this.parseChunk(t.shift()))}catch(e){this._streamError(e)}},this),this._streamError=v(function(e){this._streamCleanUp(),this._sendError(e)},this),this._streamEnd=v(function(){this._streamCleanUp(),i=!0,this._streamData("")},this),this._streamCleanUp=v(function(){this._input.removeListener("data",this._streamData),this._input.removeListener("end",this._streamEnd),this._input.removeListener("error",this._streamError)},this)}function r(m){var a,o,u,i=Math.pow(2,53),n=-i,s=/^\s*-?(\d+\.?|\.\d+|\d+\.\d+)([eE][-+]?\d+)?\s*$/,h=/^((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))$/,t=this,r=0,f=0,d=!1,e=!1,l=[],c={data:[],errors:[],meta:{}};if(J(m.step)){var p=m.step;m.step=function(e){if(c=e,_())g();else{if(g(),0===c.data.length)return;r+=e.data.length,m.preview&&r>m.preview?o.abort():(c.data=c.data[0],p(c,t))}}}function y(e){return"greedy"===m.skipEmptyLines?""===e.join("").trim():1===e.length&&0===e[0].length}function g(){return c&&u&&(k("Delimiter","UndetectableDelimiter","Unable to auto-detect delimiting character; defaulted to '"+b.DefaultDelimiter+"'"),u=!1),m.skipEmptyLines&&(c.data=c.data.filter(function(e){return!y(e)})),_()&&function(){if(!c)return;function e(e,t){J(m.transformHeader)&&(e=m.transformHeader(e,t)),l.push(e)}if(Array.isArray(c.data[0])){for(var t=0;_()&&t<c.data.length;t++)c.data[t].forEach(e);c.data.splice(0,1)}else c.data.forEach(e)}(),function(){if(!c||!m.header&&!m.dynamicTyping&&!m.transform)return c;function e(e,t){var r,i=m.header?{}:[];for(r=0;r<e.length;r++){var n=r,s=e[r];m.header&&(n=r>=l.length?"__parsed_extra":l[r]),m.transform&&(s=m.transform(s,n)),s=v(n,s),"__parsed_extra"===n?(i[n]=i[n]||[],i[n].push(s)):i[n]=s}return m.header&&(r>l.length?k("FieldMismatch","TooManyFields","Too many fields: expected "+l.length+" fields but parsed "+r,f+t):r<l.length&&k("FieldMismatch","TooFewFields","Too few fields: expected "+l.length+" fields but parsed "+r,f+t)),i}var t=1;!c.data.length||Array.isArray(c.data[0])?(c.data=c.data.map(e),t=c.data.length):c.data=e(c.data,0);m.header&&c.meta&&(c.meta.fields=l);return f+=t,c}()}function _(){return m.header&&0===l.length}function v(e,t){return r=e,m.dynamicTypingFunction&&void 0===m.dynamicTyping[r]&&(m.dynamicTyping[r]=m.dynamicTypingFunction(r)),!0===(m.dynamicTyping[r]||m.dynamicTyping)?"true"===t||"TRUE"===t||"false"!==t&&"FALSE"!==t&&(function(e){if(s.test(e)){var t=parseFloat(e);if(n<t&&t<i)return!0}return!1}(t)?parseFloat(t):h.test(t)?new Date(t):""===t?null:t):t;var r}function k(e,t,r,i){var n={type:e,code:t,message:r};void 0!==i&&(n.row=i),c.errors.push(n)}this.parse=function(e,t,r){var i=m.quoteChar||'"';if(m.newline||(m.newline=function(e,t){e=e.substring(0,1048576);var r=new RegExp(Q(t)+"([^]*?)"+Q(t),"gm"),i=(e=e.replace(r,"")).split("\r"),n=e.split("\n"),s=1<n.length&&n[0].length<i[0].length;if(1===i.length||s)return"\n";for(var a=0,o=0;o<i.length;o++)"\n"===i[o][0]&&a++;return a>=i.length/2?"\r\n":"\r"}(e,i)),u=!1,m.delimiter)J(m.delimiter)&&(m.delimiter=m.delimiter(e),c.meta.delimiter=m.delimiter);else{var n=function(e,t,r,i,n){var s,a,o,u;n=n||[",","\t","|",";",b.RECORD_SEP,b.UNIT_SEP];for(var h=0;h<n.length;h++){var f=n[h],d=0,l=0,c=0;o=void 0;for(var p=new E({comments:i,delimiter:f,newline:t,preview:10}).parse(e),g=0;g<p.data.length;g++)if(r&&y(p.data[g]))c++;else{var _=p.data[g].length;l+=_,void 0!==o?0<_&&(d+=Math.abs(_-o),o=_):o=_}0<p.data.length&&(l/=p.data.length-c),(void 0===a||d<=a)&&(void 0===u||u<l)&&1.99<l&&(a=d,s=f,u=l)}return{successful:!!(m.delimiter=s),bestDelimiter:s}}(e,m.newline,m.skipEmptyLines,m.comments,m.delimitersToGuess);n.successful?m.delimiter=n.bestDelimiter:(u=!0,m.delimiter=b.DefaultDelimiter),c.meta.delimiter=m.delimiter}var s=w(m);return m.preview&&m.header&&s.preview++,a=e,o=new E(s),c=o.parse(a,t,r),g(),d?{meta:{paused:!0}}:c||{meta:{paused:!1}}},this.paused=function(){return d},this.pause=function(){d=!0,o.abort(),a=J(m.chunk)?"":a.substring(o.getCharIndex())},this.resume=function(){t.streamer._halted?(d=!1,t.streamer.parseChunk(a,!0)):setTimeout(t.resume,3)},this.aborted=function(){return e},this.abort=function(){e=!0,o.abort(),c.meta.aborted=!0,J(m.complete)&&m.complete(c),a=""}}function Q(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function E(j){var z,M=(j=j||{}).delimiter,P=j.newline,U=j.comments,q=j.step,N=j.preview,B=j.fastMode,K=z=void 0===j.quoteChar||null===j.quoteChar?'"':j.quoteChar;if(void 0!==j.escapeChar&&(K=j.escapeChar),("string"!=typeof M||-1<b.BAD_DELIMITERS.indexOf(M))&&(M=","),U===M)throw new Error("Comment character same as delimiter");!0===U?U="#":("string"!=typeof U||-1<b.BAD_DELIMITERS.indexOf(U))&&(U=!1),"\n"!==P&&"\r"!==P&&"\r\n"!==P&&(P="\n");var W=0,H=!1;this.parse=function(i,t,r){if("string"!=typeof i)throw new Error("Input must be a string");var n=i.length,e=M.length,s=P.length,a=U.length,o=J(q),u=[],h=[],f=[],d=W=0;if(!i)return L();if(j.header&&!t){var l=i.split(P)[0].split(M),c=[],p={},g=!1;for(var _ in l){var m=l[_];J(j.transformHeader)&&(m=j.transformHeader(m,_));var y=m,v=p[m]||0;for(0<v&&(g=!0,y=m+"_"+v),p[m]=v+1;c.includes(y);)y=y+"_"+v;c.push(y)}if(g){var k=i.split(P);k[0]=c.join(M),i=k.join(P)}}if(B||!1!==B&&-1===i.indexOf(z)){for(var b=i.split(P),E=0;E<b.length;E++){if(f=b[E],W+=f.length,E!==b.length-1)W+=P.length;else if(r)return L();if(!U||f.substring(0,a)!==U){if(o){if(u=[],I(f.split(M)),F(),H)return L()}else I(f.split(M));if(N&&N<=E)return u=u.slice(0,N),L(!0)}}return L()}for(var w=i.indexOf(M,W),R=i.indexOf(P,W),C=new RegExp(Q(K)+Q(z),"g"),S=i.indexOf(z,W);;)if(i[W]!==z)if(U&&0===f.length&&i.substring(W,W+a)===U){if(-1===R)return L();W=R+s,R=i.indexOf(P,W),w=i.indexOf(M,W)}else if(-1!==w&&(w<R||-1===R))f.push(i.substring(W,w)),W=w+e,w=i.indexOf(M,W);else{if(-1===R)break;if(f.push(i.substring(W,R)),D(R+s),o&&(F(),H))return L();if(N&&u.length>=N)return L(!0)}else for(S=W,W++;;){if(-1===(S=i.indexOf(z,S+1)))return r||h.push({type:"Quotes",code:"MissingQuotes",message:"Quoted field unterminated",row:u.length,index:W}),T();if(S===n-1)return T(i.substring(W,S).replace(C,z));if(z!==K||i[S+1]!==K){if(z===K||0===S||i[S-1]!==K){-1!==w&&w<S+1&&(w=i.indexOf(M,S+1)),-1!==R&&R<S+1&&(R=i.indexOf(P,S+1));var O=A(-1===R?w:Math.min(w,R));if(i.substr(S+1+O,e)===M){f.push(i.substring(W,S).replace(C,z)),i[W=S+1+O+e]!==z&&(S=i.indexOf(z,W)),w=i.indexOf(M,W),R=i.indexOf(P,W);break}var x=A(R);if(i.substring(S+1+x,S+1+x+s)===P){if(f.push(i.substring(W,S).replace(C,z)),D(S+1+x+s),w=i.indexOf(M,W),S=i.indexOf(z,W),o&&(F(),H))return L();if(N&&u.length>=N)return L(!0);break}h.push({type:"Quotes",code:"InvalidQuotes",message:"Trailing quote on quoted field is malformed",row:u.length,index:W}),S++}}else S++}return T();function I(e){u.push(e),d=W}function A(e){var t=0;if(-1!==e){var r=i.substring(S+1,e);r&&""===r.trim()&&(t=r.length)}return t}function T(e){return r||(void 0===e&&(e=i.substring(W)),f.push(e),W=n,I(f),o&&F()),L()}function D(e){W=e,I(f),f=[],R=i.indexOf(P,W)}function L(e){return{data:u,errors:h,meta:{delimiter:M,linebreak:P,aborted:H,truncated:!!e,cursor:d+(t||0)}}}function F(){q(L()),u=[],h=[]}},this.abort=function(){H=!0},this.getCharIndex=function(){return W}}function _(e){var t=e.data,r=a[t.workerId],i=!1;if(t.error)r.userError(t.error,t.file);else if(t.results&&t.results.data){var n={abort:function(){i=!0,m(t.workerId,{data:[],errors:[],meta:{aborted:!0}})},pause:y,resume:y};if(J(r.userStep)){for(var s=0;s<t.results.data.length&&(r.userStep({data:t.results.data[s],errors:t.results.errors,meta:t.results.meta},n),!i);s++);delete t.results}else J(r.userChunk)&&(r.userChunk(t.results,n,t.file),delete t.results)}t.finished&&!i&&m(t.workerId,t.results)}function m(e,t){var r=a[e];J(r.userComplete)&&r.userComplete(t),r.terminate(),delete a[e]}function y(){throw new Error("Not implemented.")}function w(e){if("object"!=typeof e||null===e)return e;var t=Array.isArray(e)?[]:{};for(var r in e)t[r]=w(e[r]);return t}function v(e,t){return function(){e.apply(t,arguments)}}function J(e){return"function"==typeof e}return o&&(f.onmessage=function(e){var t=e.data;void 0===b.WORKER_ID&&t&&(b.WORKER_ID=t.workerId);if("string"==typeof t.input)f.postMessage({workerId:b.WORKER_ID,results:b.parse(t.input,t.config),finished:!0});else if(f.File&&t.input instanceof File||t.input instanceof Object){var r=b.parse(t.input,t.config);r&&f.postMessage({workerId:b.WORKER_ID,results:r,finished:!0})}}),(l.prototype=Object.create(h.prototype)).constructor=l,(c.prototype=Object.create(h.prototype)).constructor=c,(p.prototype=Object.create(p.prototype)).constructor=p,(g.prototype=Object.create(h.prototype)).constructor=g,b});
},{}],75:[function(require,module,exports){
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// index.ts
var js_exports = {};
__export(js_exports, {
  Compression: () => Compression,
  EtagMismatch: () => EtagMismatch,
  FetchSource: () => FetchSource,
  FileAPISource: () => FileAPISource,
  PMTiles: () => PMTiles,
  Protocol: () => Protocol,
  ResolvedValueCache: () => ResolvedValueCache,
  SharedPromiseCache: () => SharedPromiseCache,
  TileType: () => TileType,
  bytesToHeader: () => bytesToHeader,
  findTile: () => findTile,
  getUint64: () => getUint64,
  leafletRasterLayer: () => leafletRasterLayer,
  readVarint: () => readVarint,
  tileIdToZxy: () => tileIdToZxy,
  zxyToTileId: () => zxyToTileId
});
module.exports = __toCommonJS(js_exports);

// node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0]);
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
};
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  var n = new u8(e - s);
  n.set(v.subarray(s, e));
  return n;
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf || st.i != 2;
  var noSt = st.i;
  if (!buf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (noBuf)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (noBuf)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (noBuf)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift2 = dl - dt, dend = Math.min(dt, end);
          if (shift2 + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift2 + bt];
        }
        for (; bt < end; bt += 4) {
          buf[bt] = buf[bt - dt];
          buf[bt + 1] = buf[bt + 1 - dt];
          buf[bt + 2] = buf[bt + 2 - dt];
          buf[bt + 3] = buf[bt + 3 - dt];
        }
        bt = end;
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt == buf.length ? buf : slc(buf, 0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var gzs = function(d) {
  if (d[0] != 31 || d[1] != 139 || d[2] != 8)
    err(6, "invalid gzip data");
  var flg = d[3];
  var st = 10;
  if (flg & 4)
    st += (d[10] | d[11] << 8) + 2;
  for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++])
    ;
  return st + (flg & 2);
};
var gzl = function(d) {
  var l = d.length;
  return (d[l - 4] | d[l - 3] << 8 | d[l - 2] << 16 | d[l - 1] << 24) >>> 0;
};
var zls = function(d, dict) {
  if ((d[0] & 15) != 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31)
    err(6, "invalid zlib data");
  if ((d[1] >> 5 & 1) == +!dict)
    err(6, "invalid zlib data: " + (d[1] & 32 ? "need" : "unexpected") + " dictionary");
  return (d[1] >> 3 & 4) + 2;
};
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
function gunzipSync(data, opts) {
  var st = gzs(data);
  if (st + 8 > data.length)
    err(6, "invalid gzip data");
  return inflt(data.subarray(st, -8), { i: 2 }, opts && opts.out || new u8(gzl(data)), opts && opts.dictionary);
}
function unzlibSync(data, opts) {
  return inflt(data.subarray(zls(data, opts && opts.dictionary), -4), { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
function decompressSync(data, opts) {
  return data[0] == 31 && data[1] == 139 && data[2] == 8 ? gunzipSync(data, opts) : (data[0] & 15) != 8 || data[0] >> 4 > 7 || (data[0] << 8 | data[1]) % 31 ? inflateSync(data, opts) : unzlibSync(data, opts);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}

// v2.ts
var shift = (n, shift2) => {
  return n * Math.pow(2, shift2);
};
var unshift = (n, shift2) => {
  return Math.floor(n / Math.pow(2, shift2));
};
var getUint24 = (view, pos) => {
  return shift(view.getUint16(pos + 1, true), 8) + view.getUint8(pos);
};
var getUint48 = (view, pos) => {
  return shift(view.getUint32(pos + 2, true), 16) + view.getUint16(pos, true);
};
var compare = (tz, tx, ty, view, i) => {
  if (tz != view.getUint8(i))
    return tz - view.getUint8(i);
  const x = getUint24(view, i + 1);
  if (tx != x)
    return tx - x;
  const y = getUint24(view, i + 4);
  if (ty != y)
    return ty - y;
  return 0;
};
var queryLeafdir = (view, z, x, y) => {
  const offset_len = queryView(view, z | 128, x, y);
  if (offset_len) {
    return {
      z,
      x,
      y,
      offset: offset_len[0],
      length: offset_len[1],
      is_dir: true
    };
  }
  return null;
};
var queryTile = (view, z, x, y) => {
  const offset_len = queryView(view, z, x, y);
  if (offset_len) {
    return {
      z,
      x,
      y,
      offset: offset_len[0],
      length: offset_len[1],
      is_dir: false
    };
  }
  return null;
};
var queryView = (view, z, x, y) => {
  let m = 0;
  let n = view.byteLength / 17 - 1;
  while (m <= n) {
    const k = n + m >> 1;
    const cmp = compare(z, x, y, view, k * 17);
    if (cmp > 0) {
      m = k + 1;
    } else if (cmp < 0) {
      n = k - 1;
    } else {
      return [getUint48(view, k * 17 + 7), view.getUint32(k * 17 + 13, true)];
    }
  }
  return null;
};
var entrySort = (a, b) => {
  if (a.is_dir && !b.is_dir) {
    return 1;
  }
  if (!a.is_dir && b.is_dir) {
    return -1;
  }
  if (a.z !== b.z) {
    return a.z - b.z;
  }
  if (a.x !== b.x) {
    return a.x - b.x;
  }
  return a.y - b.y;
};
var parseEntry = (dataview, i) => {
  const z_raw = dataview.getUint8(i * 17);
  const z = z_raw & 127;
  return {
    z,
    x: getUint24(dataview, i * 17 + 1),
    y: getUint24(dataview, i * 17 + 4),
    offset: getUint48(dataview, i * 17 + 7),
    length: dataview.getUint32(i * 17 + 13, true),
    is_dir: z_raw >> 7 === 1
  };
};
var sortDir = (a) => {
  const entries = [];
  const view = new DataView(a);
  for (let i = 0; i < view.byteLength / 17; i++) {
    entries.push(parseEntry(view, i));
  }
  return createDirectory(entries);
};
var createDirectory = (entries) => {
  entries.sort(entrySort);
  const buffer = new ArrayBuffer(17 * entries.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    let z = entry.z;
    if (entry.is_dir)
      z = z | 128;
    arr[i * 17] = z;
    arr[i * 17 + 1] = entry.x & 255;
    arr[i * 17 + 2] = entry.x >> 8 & 255;
    arr[i * 17 + 3] = entry.x >> 16 & 255;
    arr[i * 17 + 4] = entry.y & 255;
    arr[i * 17 + 5] = entry.y >> 8 & 255;
    arr[i * 17 + 6] = entry.y >> 16 & 255;
    arr[i * 17 + 7] = entry.offset & 255;
    arr[i * 17 + 8] = unshift(entry.offset, 8) & 255;
    arr[i * 17 + 9] = unshift(entry.offset, 16) & 255;
    arr[i * 17 + 10] = unshift(entry.offset, 24) & 255;
    arr[i * 17 + 11] = unshift(entry.offset, 32) & 255;
    arr[i * 17 + 12] = unshift(entry.offset, 48) & 255;
    arr[i * 17 + 13] = entry.length & 255;
    arr[i * 17 + 14] = entry.length >> 8 & 255;
    arr[i * 17 + 15] = entry.length >> 16 & 255;
    arr[i * 17 + 16] = entry.length >> 24 & 255;
  }
  return buffer;
};
var deriveLeaf = (view, tile) => {
  if (view.byteLength < 17)
    return null;
  const numEntries = view.byteLength / 17;
  const entry = parseEntry(view, numEntries - 1);
  if (entry.is_dir) {
    const leaf_level = entry.z;
    const level_diff = tile.z - leaf_level;
    const leaf_x = Math.trunc(tile.x / (1 << level_diff));
    const leaf_y = Math.trunc(tile.y / (1 << level_diff));
    return { z: leaf_level, x: leaf_x, y: leaf_y };
  }
  return null;
};
function getHeader(source) {
  return __async(this, null, function* () {
    const resp = yield source.getBytes(0, 512e3);
    const dataview = new DataView(resp.data);
    const json_size = dataview.getUint32(4, true);
    const root_entries = dataview.getUint16(8, true);
    const dec = new TextDecoder("utf-8");
    const json_metadata = JSON.parse(
      dec.decode(new DataView(resp.data, 10, json_size))
    );
    let tile_compression = 0 /* Unknown */;
    if (json_metadata.compression === "gzip") {
      tile_compression = 2 /* Gzip */;
    }
    let minzoom = 0;
    if ("minzoom" in json_metadata) {
      minzoom = +json_metadata.minzoom;
    }
    let maxzoom = 0;
    if ("maxzoom" in json_metadata) {
      maxzoom = +json_metadata.maxzoom;
    }
    let center_lon = 0;
    let center_lat = 0;
    let center_zoom = 0;
    let min_lon = -180;
    let min_lat = -85;
    let max_lon = 180;
    let max_lat = 85;
    if (json_metadata.bounds) {
      const split = json_metadata.bounds.split(",");
      min_lon = +split[0];
      min_lat = +split[1];
      max_lon = +split[2];
      max_lat = +split[3];
    }
    if (json_metadata.center) {
      const split = json_metadata.center.split(",");
      center_lon = +split[0];
      center_lat = +split[1];
      center_zoom = +split[2];
    }
    const header = {
      specVersion: dataview.getUint16(2, true),
      rootDirectoryOffset: 10 + json_size,
      rootDirectoryLength: root_entries * 17,
      jsonMetadataOffset: 10,
      jsonMetadataLength: json_size,
      leafDirectoryOffset: 0,
      leafDirectoryLength: void 0,
      tileDataOffset: 0,
      tileDataLength: void 0,
      numAddressedTiles: 0,
      numTileEntries: 0,
      numTileContents: 0,
      clustered: false,
      internalCompression: 1 /* None */,
      tileCompression: tile_compression,
      tileType: 1 /* Mvt */,
      minZoom: minzoom,
      maxZoom: maxzoom,
      minLon: min_lon,
      minLat: min_lat,
      maxLon: max_lon,
      maxLat: max_lat,
      centerZoom: center_zoom,
      centerLon: center_lon,
      centerLat: center_lat,
      etag: resp.etag
    };
    return header;
  });
}
function getZxy(header, source, cache, z, x, y, signal) {
  return __async(this, null, function* () {
    let root_dir = yield cache.getArrayBuffer(
      source,
      header.rootDirectoryOffset,
      header.rootDirectoryLength,
      header
    );
    if (header.specVersion === 1) {
      root_dir = sortDir(root_dir);
    }
    const entry = queryTile(new DataView(root_dir), z, x, y);
    if (entry) {
      const resp = yield source.getBytes(entry.offset, entry.length, signal);
      let tile_data = resp.data;
      const view = new DataView(tile_data);
      if (view.getUint8(0) == 31 && view.getUint8(1) == 139) {
        tile_data = decompressSync(new Uint8Array(tile_data));
      }
      return {
        data: tile_data
      };
    }
    const leafcoords = deriveLeaf(new DataView(root_dir), { z, x, y });
    if (leafcoords) {
      const leafdir_entry = queryLeafdir(
        new DataView(root_dir),
        leafcoords.z,
        leafcoords.x,
        leafcoords.y
      );
      if (leafdir_entry) {
        let leaf_dir = yield cache.getArrayBuffer(
          source,
          leafdir_entry.offset,
          leafdir_entry.length,
          header
        );
        if (header.specVersion === 1) {
          leaf_dir = sortDir(leaf_dir);
        }
        const tile_entry = queryTile(new DataView(leaf_dir), z, x, y);
        if (tile_entry) {
          const resp = yield source.getBytes(
            tile_entry.offset,
            tile_entry.length,
            signal
          );
          let tile_data = resp.data;
          const view = new DataView(tile_data);
          if (view.getUint8(0) == 31 && view.getUint8(1) == 139) {
            tile_data = decompressSync(new Uint8Array(tile_data));
          }
          return {
            data: tile_data
          };
        }
      }
    }
    return void 0;
  });
}
var v2_default = {
  getHeader,
  getZxy
};

// adapters.ts
var leafletRasterLayer = (source, options) => {
  let loaded = false;
  let mimeType = "";
  const cls = L.GridLayer.extend({
    createTile: function(coord, done) {
      const el = document.createElement("img");
      const controller = new AbortController();
      const signal = controller.signal;
      el.cancel = () => {
        controller.abort();
      };
      if (!loaded) {
        source.getHeader().then((header) => {
          if (header.tileType == 1 /* Mvt */) {
            console.error(
              "Error: archive contains MVT vector tiles, but leafletRasterLayer is for displaying raster tiles. See https://github.com/protomaps/PMTiles/tree/main/js for details."
            );
          } else if (header.tileType == 2) {
            mimeType = "image/png";
          } else if (header.tileType == 3) {
            mimeType = "image/jpeg";
          } else if (header.tileType == 4) {
            mimeType = "image/webp";
          } else if (header.tileType == 5) {
            mimeType = "image/avif";
          }
        });
        loaded = true;
      }
      source.getZxy(coord.z, coord.x, coord.y, signal).then((arr) => {
        if (arr) {
          const blob = new Blob([arr.data], { type: mimeType });
          const imageUrl = window.URL.createObjectURL(blob);
          el.src = imageUrl;
          el.cancel = null;
          done(null, el);
        }
      }).catch((e) => {
        if (e.name !== "AbortError") {
          throw e;
        }
      });
      return el;
    },
    _removeTile: function(key) {
      const tile = this._tiles[key];
      if (!tile) {
        return;
      }
      if (tile.el.cancel)
        tile.el.cancel();
      tile.el.width = 0;
      tile.el.height = 0;
      tile.el.deleted = true;
      L.DomUtil.remove(tile.el);
      delete this._tiles[key];
      this.fire("tileunload", {
        tile: tile.el,
        coords: this._keyToTileCoords(key)
      });
    }
  });
  return new cls(options);
};
var Protocol = class {
  constructor() {
    this.tile = (params, callback) => {
      if (params.type == "json") {
        const pmtiles_url = params.url.substr(10);
        let instance = this.tiles.get(pmtiles_url);
        if (!instance) {
          instance = new PMTiles(pmtiles_url);
          this.tiles.set(pmtiles_url, instance);
        }
        instance.getHeader().then((h) => {
          const tilejson = {
            tiles: [params.url + "/{z}/{x}/{y}"],
            minzoom: h.minZoom,
            maxzoom: h.maxZoom,
            bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat]
          };
          callback(null, tilejson, null, null);
        }).catch((e) => {
          callback(e, null, null, null);
        });
        return {
          cancel: () => {
          }
        };
      } else {
        const re = new RegExp(/pmtiles:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)/);
        const result = params.url.match(re);
        if (!result) {
          throw new Error("Invalid PMTiles protocol URL");
          return {
            cancel: () => {
            }
          };
        }
        const pmtiles_url = result[1];
        let instance = this.tiles.get(pmtiles_url);
        if (!instance) {
          instance = new PMTiles(pmtiles_url);
          this.tiles.set(pmtiles_url, instance);
        }
        const z = result[2];
        const x = result[3];
        const y = result[4];
        const controller = new AbortController();
        const signal = controller.signal;
        let cancel = () => {
          controller.abort();
        };
        instance.getHeader().then((header) => {
          instance.getZxy(+z, +x, +y, signal).then((resp) => {
            if (resp) {
              callback(
                null,
                new Uint8Array(resp.data),
                resp.cacheControl,
                resp.expires
              );
            } else {
              if (header.tileType == 1 /* Mvt */) {
                callback(null, new Uint8Array(), null, null);
              } else {
                callback(null, null, null, null);
              }
            }
          }).catch((e) => {
            if (e.name !== "AbortError") {
              callback(e, null, null, null);
            }
          });
        });
        return {
          cancel
        };
      }
    };
    this.tiles = /* @__PURE__ */ new Map();
  }
  add(p) {
    this.tiles.set(p.source.getKey(), p);
  }
  get(url) {
    return this.tiles.get(url);
  }
};

// index.ts
function toNum(low, high) {
  return (high >>> 0) * 4294967296 + (low >>> 0);
}
function readVarintRemainder(l, p) {
  const buf = p.buf;
  let h, b;
  b = buf[p.pos++];
  h = (b & 112) >> 4;
  if (b < 128)
    return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 127) << 3;
  if (b < 128)
    return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 127) << 10;
  if (b < 128)
    return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 127) << 17;
  if (b < 128)
    return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 127) << 24;
  if (b < 128)
    return toNum(l, h);
  b = buf[p.pos++];
  h |= (b & 1) << 31;
  if (b < 128)
    return toNum(l, h);
  throw new Error("Expected varint not more than 10 bytes");
}
function readVarint(p) {
  const buf = p.buf;
  let val, b;
  b = buf[p.pos++];
  val = b & 127;
  if (b < 128)
    return val;
  b = buf[p.pos++];
  val |= (b & 127) << 7;
  if (b < 128)
    return val;
  b = buf[p.pos++];
  val |= (b & 127) << 14;
  if (b < 128)
    return val;
  b = buf[p.pos++];
  val |= (b & 127) << 21;
  if (b < 128)
    return val;
  b = buf[p.pos];
  val |= (b & 15) << 28;
  return readVarintRemainder(val, p);
}
function rotate(n, xy, rx, ry) {
  if (ry == 0) {
    if (rx == 1) {
      xy[0] = n - 1 - xy[0];
      xy[1] = n - 1 - xy[1];
    }
    const t = xy[0];
    xy[0] = xy[1];
    xy[1] = t;
  }
}
function idOnLevel(z, pos) {
  const n = Math.pow(2, z);
  let rx = pos;
  let ry = pos;
  let t = pos;
  const xy = [0, 0];
  let s = 1;
  while (s < n) {
    rx = 1 & t / 2;
    ry = 1 & (t ^ rx);
    rotate(s, xy, rx, ry);
    xy[0] += s * rx;
    xy[1] += s * ry;
    t = t / 4;
    s *= 2;
  }
  return [z, xy[0], xy[1]];
}
var tzValues = [
  0,
  1,
  5,
  21,
  85,
  341,
  1365,
  5461,
  21845,
  87381,
  349525,
  1398101,
  5592405,
  22369621,
  89478485,
  357913941,
  1431655765,
  5726623061,
  22906492245,
  91625968981,
  366503875925,
  1466015503701,
  5864062014805,
  23456248059221,
  93824992236885,
  375299968947541,
  1501199875790165
];
function zxyToTileId(z, x, y) {
  if (z > 26) {
    throw Error("Tile zoom level exceeds max safe number limit (26)");
  }
  if (x > Math.pow(2, z) - 1 || y > Math.pow(2, z) - 1) {
    throw Error("tile x/y outside zoom level bounds");
  }
  const acc = tzValues[z];
  const n = Math.pow(2, z);
  let rx = 0;
  let ry = 0;
  let d = 0;
  const xy = [x, y];
  let s = n / 2;
  while (s > 0) {
    rx = (xy[0] & s) > 0 ? 1 : 0;
    ry = (xy[1] & s) > 0 ? 1 : 0;
    d += s * s * (3 * rx ^ ry);
    rotate(s, xy, rx, ry);
    s = s / 2;
  }
  return acc + d;
}
function tileIdToZxy(i) {
  let acc = 0;
  let z = 0;
  for (let z2 = 0; z2 < 27; z2++) {
    const num_tiles = (1 << z2) * (1 << z2);
    if (acc + num_tiles > i) {
      return idOnLevel(z2, i - acc);
    }
    acc += num_tiles;
  }
  throw Error("Tile zoom level exceeds max safe number limit (26)");
}
var Compression = /* @__PURE__ */ ((Compression2) => {
  Compression2[Compression2["Unknown"] = 0] = "Unknown";
  Compression2[Compression2["None"] = 1] = "None";
  Compression2[Compression2["Gzip"] = 2] = "Gzip";
  Compression2[Compression2["Brotli"] = 3] = "Brotli";
  Compression2[Compression2["Zstd"] = 4] = "Zstd";
  return Compression2;
})(Compression || {});
function defaultDecompress(buf, compression) {
  return __async(this, null, function* () {
    if (compression === 1 /* None */ || compression === 0 /* Unknown */) {
      return buf;
    } else if (compression === 2 /* Gzip */) {
      if (typeof globalThis.DecompressionStream == "undefined") {
        return decompressSync(new Uint8Array(buf));
      } else {
        let stream = new Response(buf).body;
        let result = stream.pipeThrough(
          new globalThis.DecompressionStream("gzip")
        );
        return new Response(result).arrayBuffer();
      }
    } else {
      throw Error("Compression method not supported");
    }
  });
}
var TileType = /* @__PURE__ */ ((TileType2) => {
  TileType2[TileType2["Unknown"] = 0] = "Unknown";
  TileType2[TileType2["Mvt"] = 1] = "Mvt";
  TileType2[TileType2["Png"] = 2] = "Png";
  TileType2[TileType2["Jpeg"] = 3] = "Jpeg";
  TileType2[TileType2["Webp"] = 4] = "Webp";
  TileType2[TileType2["Avif"] = 5] = "Avif";
  return TileType2;
})(TileType || {});
var HEADER_SIZE_BYTES = 127;
function findTile(entries, tileId) {
  let m = 0;
  let n = entries.length - 1;
  while (m <= n) {
    const k = n + m >> 1;
    const cmp = tileId - entries[k].tileId;
    if (cmp > 0) {
      m = k + 1;
    } else if (cmp < 0) {
      n = k - 1;
    } else {
      return entries[k];
    }
  }
  if (n >= 0) {
    if (entries[n].runLength === 0) {
      return entries[n];
    }
    if (tileId - entries[n].tileId < entries[n].runLength) {
      return entries[n];
    }
  }
  return null;
}
var FileAPISource = class {
  constructor(file) {
    this.file = file;
  }
  getKey() {
    return this.file.name;
  }
  getBytes(offset, length) {
    return __async(this, null, function* () {
      const blob = this.file.slice(offset, offset + length);
      const a = yield blob.arrayBuffer();
      return { data: a };
    });
  }
};
var FetchSource = class {
  constructor(url) {
    this.url = url;
  }
  getKey() {
    return this.url;
  }
  getBytes(offset, length, signal) {
    return __async(this, null, function* () {
      let controller;
      if (!signal) {
        controller = new AbortController();
        signal = controller.signal;
      }
      let resp = yield fetch(this.url, {
        signal,
        headers: { Range: "bytes=" + offset + "-" + (offset + length - 1) }
      });
      if (resp.status === 416 && offset === 0) {
        const content_range = resp.headers.get("Content-Range");
        if (!content_range || !content_range.startsWith("bytes */")) {
          throw Error("Missing content-length on 416 response");
        }
        const actual_length = +content_range.substr(8);
        resp = yield fetch(this.url, {
          signal,
          headers: { Range: "bytes=0-" + (actual_length - 1) }
        });
      }
      if (resp.status >= 300) {
        throw Error("Bad response code: " + resp.status);
      }
      const content_length = resp.headers.get("Content-Length");
      if (resp.status === 200 && (!content_length || +content_length > length)) {
        if (controller)
          controller.abort();
        throw Error(
          "Server returned no content-length header or content-length exceeding request. Check that your storage backend supports HTTP Byte Serving."
        );
      }
      const a = yield resp.arrayBuffer();
      return {
        data: a,
        etag: resp.headers.get("ETag") || void 0,
        cacheControl: resp.headers.get("Cache-Control") || void 0,
        expires: resp.headers.get("Expires") || void 0
      };
    });
  }
};
function getUint64(v, offset) {
  const wh = v.getUint32(offset + 4, true);
  const wl = v.getUint32(offset + 0, true);
  return wh * Math.pow(2, 32) + wl;
}
function bytesToHeader(bytes, etag) {
  const v = new DataView(bytes);
  const spec_version = v.getUint8(7);
  if (spec_version > 3) {
    throw Error(
      `Archive is spec version ${spec_version} but this library supports up to spec version 3`
    );
  }
  return {
    specVersion: spec_version,
    rootDirectoryOffset: getUint64(v, 8),
    rootDirectoryLength: getUint64(v, 16),
    jsonMetadataOffset: getUint64(v, 24),
    jsonMetadataLength: getUint64(v, 32),
    leafDirectoryOffset: getUint64(v, 40),
    leafDirectoryLength: getUint64(v, 48),
    tileDataOffset: getUint64(v, 56),
    tileDataLength: getUint64(v, 64),
    numAddressedTiles: getUint64(v, 72),
    numTileEntries: getUint64(v, 80),
    numTileContents: getUint64(v, 88),
    clustered: v.getUint8(96) === 1,
    internalCompression: v.getUint8(97),
    tileCompression: v.getUint8(98),
    tileType: v.getUint8(99),
    minZoom: v.getUint8(100),
    maxZoom: v.getUint8(101),
    minLon: v.getInt32(102, true) / 1e7,
    minLat: v.getInt32(106, true) / 1e7,
    maxLon: v.getInt32(110, true) / 1e7,
    maxLat: v.getInt32(114, true) / 1e7,
    centerZoom: v.getUint8(118),
    centerLon: v.getInt32(119, true) / 1e7,
    centerLat: v.getInt32(123, true) / 1e7,
    etag
  };
}
function deserializeIndex(buffer) {
  const p = { buf: new Uint8Array(buffer), pos: 0 };
  const numEntries = readVarint(p);
  const entries = [];
  let lastId = 0;
  for (let i = 0; i < numEntries; i++) {
    const v = readVarint(p);
    entries.push({ tileId: lastId + v, offset: 0, length: 0, runLength: 1 });
    lastId += v;
  }
  for (let i = 0; i < numEntries; i++) {
    entries[i].runLength = readVarint(p);
  }
  for (let i = 0; i < numEntries; i++) {
    entries[i].length = readVarint(p);
  }
  for (let i = 0; i < numEntries; i++) {
    const v = readVarint(p);
    if (v === 0 && i > 0) {
      entries[i].offset = entries[i - 1].offset + entries[i - 1].length;
    } else {
      entries[i].offset = v - 1;
    }
  }
  return entries;
}
function detectVersion(a) {
  const v = new DataView(a);
  if (v.getUint16(2, true) === 2) {
    console.warn(
      "PMTiles spec version 2 has been deprecated; please see github.com/protomaps/PMTiles for tools to upgrade"
    );
    return 2;
  } else if (v.getUint16(2, true) === 1) {
    console.warn(
      "PMTiles spec version 1 has been deprecated; please see github.com/protomaps/PMTiles for tools to upgrade"
    );
    return 1;
  }
  return 3;
}
var EtagMismatch = class extends Error {
};
function getHeaderAndRoot(source, decompress, prefetch, current_etag) {
  return __async(this, null, function* () {
    const resp = yield source.getBytes(0, 16384);
    const v = new DataView(resp.data);
    if (v.getUint16(0, true) !== 19792) {
      throw new Error("Wrong magic number for PMTiles archive");
    }
    if (detectVersion(resp.data) < 3) {
      return [yield v2_default.getHeader(source)];
    }
    const headerData = resp.data.slice(0, HEADER_SIZE_BYTES);
    let resp_etag = resp.etag;
    if (current_etag && resp.etag != current_etag) {
      console.warn(
        "ETag conflict detected; your HTTP server might not support content-based ETag headers. ETags disabled for " + source.getKey()
      );
      resp_etag = void 0;
    }
    const header = bytesToHeader(headerData, resp_etag);
    if (prefetch) {
      const rootDirData = resp.data.slice(
        header.rootDirectoryOffset,
        header.rootDirectoryOffset + header.rootDirectoryLength
      );
      const dirKey = source.getKey() + "|" + (header.etag || "") + "|" + header.rootDirectoryOffset + "|" + header.rootDirectoryLength;
      const rootDir = deserializeIndex(
        yield decompress(rootDirData, header.internalCompression)
      );
      return [header, [dirKey, rootDir.length, rootDir]];
    }
    return [header, void 0];
  });
}
function getDirectory(source, decompress, offset, length, header) {
  return __async(this, null, function* () {
    const resp = yield source.getBytes(offset, length);
    if (header.etag && header.etag !== resp.etag) {
      throw new EtagMismatch(resp.etag);
    }
    const data = yield decompress(resp.data, header.internalCompression);
    const directory = deserializeIndex(data);
    if (directory.length === 0) {
      throw new Error("Empty directory is invalid");
    }
    return directory;
  });
}
var ResolvedValueCache = class {
  constructor(maxCacheEntries = 100, prefetch = true, decompress = defaultDecompress) {
    this.cache = /* @__PURE__ */ new Map();
    this.maxCacheEntries = maxCacheEntries;
    this.counter = 1;
    this.prefetch = prefetch;
    this.decompress = decompress;
  }
  getHeader(source, current_etag) {
    return __async(this, null, function* () {
      const cacheKey = source.getKey();
      if (this.cache.has(cacheKey)) {
        this.cache.get(cacheKey).lastUsed = this.counter++;
        const data = this.cache.get(cacheKey).data;
        return data;
      }
      const res = yield getHeaderAndRoot(
        source,
        this.decompress,
        this.prefetch,
        current_etag
      );
      if (res[1]) {
        this.cache.set(res[1][0], {
          lastUsed: this.counter++,
          data: res[1][2]
        });
      }
      this.cache.set(cacheKey, {
        lastUsed: this.counter++,
        data: res[0]
      });
      this.prune();
      return res[0];
    });
  }
  getDirectory(source, offset, length, header) {
    return __async(this, null, function* () {
      const cacheKey = source.getKey() + "|" + (header.etag || "") + "|" + offset + "|" + length;
      if (this.cache.has(cacheKey)) {
        this.cache.get(cacheKey).lastUsed = this.counter++;
        const data = this.cache.get(cacheKey).data;
        return data;
      }
      const directory = yield getDirectory(
        source,
        this.decompress,
        offset,
        length,
        header
      );
      this.cache.set(cacheKey, {
        lastUsed: this.counter++,
        data: directory
      });
      this.prune();
      return directory;
    });
  }
  getArrayBuffer(source, offset, length, header) {
    return __async(this, null, function* () {
      const cacheKey = source.getKey() + "|" + (header.etag || "") + "|" + offset + "|" + length;
      if (this.cache.has(cacheKey)) {
        this.cache.get(cacheKey).lastUsed = this.counter++;
        const data = yield this.cache.get(cacheKey).data;
        return data;
      }
      const resp = yield source.getBytes(offset, length);
      if (header.etag && header.etag !== resp.etag) {
        throw new EtagMismatch(header.etag);
      }
      this.cache.set(cacheKey, {
        lastUsed: this.counter++,
        data: resp.data
      });
      this.prune();
      return resp.data;
    });
  }
  prune() {
    if (this.cache.size > this.maxCacheEntries) {
      let minUsed = Infinity;
      let minKey = void 0;
      this.cache.forEach((cache_value, key) => {
        if (cache_value.lastUsed < minUsed) {
          minUsed = cache_value.lastUsed;
          minKey = key;
        }
      });
      if (minKey) {
        this.cache.delete(minKey);
      }
    }
  }
  invalidate(source, current_etag) {
    return __async(this, null, function* () {
      this.cache.delete(source.getKey());
      yield this.getHeader(source, current_etag);
    });
  }
};
var SharedPromiseCache = class {
  constructor(maxCacheEntries = 100, prefetch = true, decompress = defaultDecompress) {
    this.cache = /* @__PURE__ */ new Map();
    this.maxCacheEntries = maxCacheEntries;
    this.counter = 1;
    this.prefetch = prefetch;
    this.decompress = decompress;
  }
  getHeader(source, current_etag) {
    return __async(this, null, function* () {
      const cacheKey = source.getKey();
      if (this.cache.has(cacheKey)) {
        this.cache.get(cacheKey).lastUsed = this.counter++;
        const data = yield this.cache.get(cacheKey).data;
        return data;
      }
      const p = new Promise((resolve, reject) => {
        getHeaderAndRoot(source, this.decompress, this.prefetch, current_etag).then((res) => {
          if (res[1]) {
            this.cache.set(res[1][0], {
              lastUsed: this.counter++,
              data: Promise.resolve(res[1][2])
            });
          }
          resolve(res[0]);
          this.prune();
        }).catch((e) => {
          reject(e);
        });
      });
      this.cache.set(cacheKey, { lastUsed: this.counter++, data: p });
      return p;
    });
  }
  getDirectory(source, offset, length, header) {
    return __async(this, null, function* () {
      const cacheKey = source.getKey() + "|" + (header.etag || "") + "|" + offset + "|" + length;
      if (this.cache.has(cacheKey)) {
        this.cache.get(cacheKey).lastUsed = this.counter++;
        const data = yield this.cache.get(cacheKey).data;
        return data;
      }
      const p = new Promise((resolve, reject) => {
        getDirectory(source, this.decompress, offset, length, header).then((directory) => {
          resolve(directory);
          this.prune();
        }).catch((e) => {
          reject(e);
        });
      });
      this.cache.set(cacheKey, { lastUsed: this.counter++, data: p });
      return p;
    });
  }
  getArrayBuffer(source, offset, length, header) {
    return __async(this, null, function* () {
      const cacheKey = source.getKey() + "|" + (header.etag || "") + "|" + offset + "|" + length;
      if (this.cache.has(cacheKey)) {
        this.cache.get(cacheKey).lastUsed = this.counter++;
        const data = yield this.cache.get(cacheKey).data;
        return data;
      }
      const p = new Promise((resolve, reject) => {
        source.getBytes(offset, length).then((resp) => {
          if (header.etag && header.etag !== resp.etag) {
            throw new EtagMismatch(resp.etag);
          }
          resolve(resp.data);
          if (this.cache.has(cacheKey)) {
          }
          this.prune();
        }).catch((e) => {
          reject(e);
        });
      });
      this.cache.set(cacheKey, { lastUsed: this.counter++, data: p });
      return p;
    });
  }
  prune() {
    if (this.cache.size >= this.maxCacheEntries) {
      let minUsed = Infinity;
      let minKey = void 0;
      this.cache.forEach(
        (cache_value, key) => {
          if (cache_value.lastUsed < minUsed) {
            minUsed = cache_value.lastUsed;
            minKey = key;
          }
        }
      );
      if (minKey) {
        this.cache.delete(minKey);
      }
    }
  }
  invalidate(source, current_etag) {
    return __async(this, null, function* () {
      this.cache.delete(source.getKey());
      yield this.getHeader(source, current_etag);
    });
  }
};
var PMTiles = class {
  constructor(source, cache, decompress) {
    if (typeof source === "string") {
      this.source = new FetchSource(source);
    } else {
      this.source = source;
    }
    if (decompress) {
      this.decompress = decompress;
    } else {
      this.decompress = defaultDecompress;
    }
    if (cache) {
      this.cache = cache;
    } else {
      this.cache = new SharedPromiseCache();
    }
  }
  getHeader() {
    return __async(this, null, function* () {
      return yield this.cache.getHeader(this.source);
    });
  }
  getZxyAttempt(z, x, y, signal) {
    return __async(this, null, function* () {
      const tile_id = zxyToTileId(z, x, y);
      const header = yield this.cache.getHeader(this.source);
      if (header.specVersion < 3) {
        return v2_default.getZxy(header, this.source, this.cache, z, x, y, signal);
      }
      if (z < header.minZoom || z > header.maxZoom) {
        return void 0;
      }
      let d_o = header.rootDirectoryOffset;
      let d_l = header.rootDirectoryLength;
      for (let depth = 0; depth <= 3; depth++) {
        const directory = yield this.cache.getDirectory(
          this.source,
          d_o,
          d_l,
          header
        );
        const entry = findTile(directory, tile_id);
        if (entry) {
          if (entry.runLength > 0) {
            const resp = yield this.source.getBytes(
              header.tileDataOffset + entry.offset,
              entry.length,
              signal
            );
            if (header.etag && header.etag !== resp.etag) {
              throw new EtagMismatch(resp.etag);
            }
            return {
              data: yield this.decompress(resp.data, header.tileCompression),
              cacheControl: resp.cacheControl,
              expires: resp.expires
            };
          } else {
            d_o = header.leafDirectoryOffset + entry.offset;
            d_l = entry.length;
          }
        } else {
          return void 0;
        }
      }
      throw Error("Maximum directory depth exceeded");
    });
  }
  getZxy(z, x, y, signal) {
    return __async(this, null, function* () {
      try {
        return yield this.getZxyAttempt(z, x, y, signal);
      } catch (e) {
        if (e instanceof EtagMismatch) {
          this.cache.invalidate(this.source, e.message);
          return yield this.getZxyAttempt(z, x, y, signal);
        } else {
          throw e;
        }
      }
    });
  }
  getMetadataAttempt() {
    return __async(this, null, function* () {
      const header = yield this.cache.getHeader(this.source);
      const resp = yield this.source.getBytes(
        header.jsonMetadataOffset,
        header.jsonMetadataLength
      );
      if (header.etag && header.etag !== resp.etag) {
        throw new EtagMismatch(resp.etag);
      }
      const decompressed = yield this.decompress(
        resp.data,
        header.internalCompression
      );
      const dec = new TextDecoder("utf-8");
      return JSON.parse(dec.decode(decompressed));
    });
  }
  getMetadata() {
    return __async(this, null, function* () {
      try {
        return yield this.getMetadataAttempt();
      } catch (e) {
        if (e instanceof EtagMismatch) {
          this.cache.invalidate(this.source, e.message);
          return yield this.getMetadataAttempt();
        } else {
          throw e;
        }
      }
    });
  }
};

},{}],76:[function(require,module,exports){
(function (global){(function (){
/*! queue-microtask. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
let promise

module.exports = typeof queueMicrotask === 'function'
  ? queueMicrotask.bind(typeof window !== 'undefined' ? window : global)
  // reuse resolved promise, and allocate it lazily
  : cb => (promise || (promise = Promise.resolve()))
    .then(cb)
    .catch(err => setTimeout(() => { throw err }, 0))

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],77:[function(require,module,exports){
'use strict'

/**
 * Remove a range of items from an array
 *
 * @function removeItems
 * @param {Array<*>} arr The target array
 * @param {number} startIdx The index to begin removing from (inclusive)
 * @param {number} removeCount How many items to remove
 */
module.exports = function removeItems (arr, startIdx, removeCount) {
  var i, length = arr.length

  if (startIdx >= length || removeCount === 0) {
    return
  }

  removeCount = (startIdx + removeCount > length ? length - startIdx : removeCount)

  var len = length - removeCount

  for (i = startIdx; i < len; ++i) {
    arr[i] = arr[i + removeCount]
  }

  arr.length = len
}

},{}],78:[function(require,module,exports){
/*! run-parallel-limit. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
module.exports = runParallelLimit

const queueMicrotask = require('queue-microtask')

function runParallelLimit (tasks, limit, cb) {
  if (typeof limit !== 'number') throw new Error('second argument must be a Number')
  let results, len, pending, keys, isErrored
  let isSync = true
  let next

  if (Array.isArray(tasks)) {
    results = []
    pending = len = tasks.length
  } else {
    keys = Object.keys(tasks)
    results = {}
    pending = len = keys.length
  }

  function done (err) {
    function end () {
      if (cb) cb(err, results)
      cb = null
    }
    if (isSync) queueMicrotask(end)
    else end()
  }

  function each (i, err, result) {
    results[i] = result
    if (err) isErrored = true
    if (--pending === 0 || err) {
      done(err)
    } else if (!isErrored && next < len) {
      let key
      if (keys) {
        key = keys[next]
        next += 1
        tasks[key](function (err, result) { each(key, err, result) })
      } else {
        key = next
        next += 1
        tasks[key](function (err, result) { each(key, err, result) })
      }
    }
  }

  next = limit
  if (!pending) {
    // empty
    done(null)
  } else if (keys) {
    // object
    keys.some(function (key, i) {
      tasks[key](function (err, result) { each(key, err, result) })
      if (i === limit - 1) return true // early return
      return false
    })
  } else {
    // array
    tasks.some(function (task, i) {
      task(function (err, result) { each(i, err, result) })
      if (i === limit - 1) return true // early return
      return false
    })
  }

  isSync = false
}

},{"queue-microtask":76}],79:[function(require,module,exports){
module.exports = scrollToAnchor

function scrollToAnchor (anchor, options) {
  if (anchor) {
    try {
      var el = document.querySelector(anchor)
      if (el) el.scrollIntoView(options)
    } catch (e) {}
  }
}

},{}],80:[function(require,module,exports){
(function (Buffer){(function (){
var collation = require('./collation')

//
// base type system
//
var base = {}

//
// helper utilities
//

function _valueOf(instance) {
  return instance == null ? instance : instance.valueOf()
}

var _toString = Object.prototype.toString

function _isObject(instance) {
  return instance && _toString.call(instance) === '[object Object]'
}

//
// base typewise compare implementation
//
base.compare = function (a, b) {
  //
  // test for invalid values
  //
  if (base.invalid(a, b))
    return NaN

  //
  // short circuit for identical objects
  //
  if (a === b)
    return 0

  //
  // short circuit for base bound types
  //
  var result = base.bound.compare(a, b)
  if (result !== undefined)
    return result

  //
  // cache typeof and valueOf for both values
  //
  var aTypeOf = typeof a
  var bTypeOf = typeof b
  var aValueOf = _valueOf(a)
  var bValueOf = _valueOf(b)

  //
  // loop over type tags and attempt compare
  //
  var order = base.order
  var sorts = base.sorts
  var sort
  for (var i = 0, length = order.length; i < length; ++i) {
    sort = sorts[order[i]]

    //
    // if first arg is a member of this sort we have an answer
    //
    if (sort.is(a, aTypeOf))
      //
      // if b is the same as a then defer to sort's comparator, else a comes first
      //
      return sort.is(b, bTypeOf) ? sort.compare(aValueOf, bValueOf) : -1

    //
    // if b is this type but not a then b comes first
    //
    if (sort.is(b, bTypeOf))
      return 1
  }

  //
  // values are incomparable as they didn't match against any registered types
  //
  return NaN
}

//
// sort equality test
//
base.equal = function(a, b) {
  return base.compare(a, b) === 0
}

//
// test for top-level incomparability using invalid sort definitions
//
base.invalid = function (a, b) {
  var types = base.invalid
  for (var key in types) {
    var type = types[key]
    if (type && type.is && (type.is(a) || type.is(b)))
      return true
  }
  return false
}

//
// definitions for explicitly invalid/incomparable types
//

base.invalid.NAN = {
  is: function (instance) {
    var valueOf = _valueOf(instance)
    return valueOf !== valueOf
  }
}

base.invalid.ERROR = {
  is: function (instance) {
    return instance && instance instanceof Error
  }
}

//
// definitions for boundary types, unserializable as values
//

function BoundedKey(bound, upper, prefix) {
  this.bound = bound
  this.upper = !!upper
  this.prefix = prefix
}

function Boundary(sort) {
  this.sort = sort
}

Boundary.prototype.lower = function (prefix) {
  return new BoundedKey(this, false, prefix)
}

Boundary.prototype.upper = function (prefix) {
  return new BoundedKey(this, true, prefix)
}

Boundary.prototype.is = function (source) {
  return source instanceof BoundedKey && source.sort === this.sort
}

Boundary.add = function (sort) {
  sort.bound = new Boundary(sort)
}

Boundary.add(base)

base.bound.getBoundary = function (source) {
  return source instanceof BoundedKey && source.bound
}

//
// compare a values against top level bounds (assumes first arg is an instance)
//
base.bound.compare = function (a, b) {
  var aBound = base.bound.is(a)
  var bBound = base.bound.is(b)
  if (aBound) {
    if (bBound && !a.upper === !b.upper)
      return 0
    return a.upper ? 1 : -1
  }

  if (bBound)
    return -base.bound.compare(b, a)
}

//
// helper to register fixed (nullary) types
//
function fixed(value) {
  return {
    is: function (instance) {
      return instance === value
    },
    value: value
  }
}

//
// value types defined as ordered map of "sorts"
//
var sorts = base.sorts = {}

sorts.void = fixed(void 0)
sorts.void.compare = collation.inequality

sorts.null = fixed(null)
sorts.null.compare = collation.inequality

var BOOLEAN = sorts.boolean = {}
BOOLEAN.compare = collation.inequality
BOOLEAN.is = function (instance, typeOf) {
  return (typeOf || typeof instance) === 'boolean'
}

BOOLEAN.sorts = {}
BOOLEAN.sorts.true = fixed(true)
BOOLEAN.sorts.false = fixed(false)

Boundary.add(BOOLEAN)


var NUMBER = sorts.number = {}
NUMBER.compare = collation.difference
NUMBER.is = function (instance, typeOf) {
  return (typeOf || typeof instance) === 'number'
}

NUMBER.sorts = {}
NUMBER.sorts.max = fixed(Number.POSITIVE_INFINITY)
NUMBER.sorts.min = fixed(Number.NEGATIVE_INFINITY)

NUMBER.sorts.positive = {}
NUMBER.sorts.positive.is = function (instance) {
  return instance >= 0
}

NUMBER.sorts.negative = {}
NUMBER.sorts.negative.is = function (instance) {
  return instance < 0
}

Boundary.add(NUMBER)


var DATE = sorts.date = {}
DATE.compare = collation.difference
DATE.is = function (instance) {
  return instance instanceof Date && instance.valueOf() === instance.valueOf()
}

DATE.sorts = {}
DATE.sorts.positive = {}
DATE.sorts.positive.is = function (instance) {
  return instance.valueOf() >= 0
}

DATE.sorts.negative = {}
DATE.sorts.negative.is = function (instance) {
  return instance.valueOf() < 0
}

Boundary.add(DATE)


var BINARY = sorts.binary = {}
BINARY.empty = new Buffer([])
BINARY.compare = collation.bitwise
BINARY.is = Buffer.isBuffer

Boundary.add(BINARY)


var STRING = sorts.string = {}
STRING.empty = ''
STRING.compare = collation.inequality
STRING.is = function (instance, typeOf) {
  return (typeOf || typeof instance) === 'string'
}

Boundary.add(STRING)


var ARRAY = sorts.array = {}
ARRAY.empty = []
ARRAY.compare = collation.recursive.elementwise(base.compare)
ARRAY.is = Array.isArray

Boundary.add(ARRAY)


// var OBJECT = sorts.object = {}
// OBJECT.empty = {}
// OBJECT.compare = collation.recursive.fieldwise(base.compare)
// OBJECT.is = _isObject

// Boundary.add(OBJECT)

//
// default order for instance checking in compare operations
//
base.order = []
for (var key in sorts) {
  base.order.push(key)
}

module.exports = base

}).call(this)}).call(this,require("buffer").Buffer)
},{"./collation":81,"buffer":21}],81:[function(require,module,exports){
//
// generic comparator implementations our types can use
//
var collation = exports

//
// scalar comparisons
//
collation.inequality = function (a, b) {
  return a < b ? -1 : ( a > b ? 1 : 0 )
}

collation.difference = function (a, b) {
  return a - b
}

//
// recursive collations have to be provided a collation function to delegate to
//
collation.recursive = {}

//
// element by element (comparison for list-like structures
//
collation.recursive.elementwise = function (compare, shortlex) {
  return function (a, b) {
    var aLength = a.length
    var bLength = b.length
    var difference

    //
    // short-circuit on length difference for shortlex semantics
    //
    if (shortlex && aLength !== bLength)
        return aLength - bLength

    for (var i = 0, length = Math.min(aLength, bLength); i < length; ++i) {
      if (difference = compare(a[i], b[i]))
        return difference
    }

    return aLength - bLength
  }
}

//
// field by field comparison of record-like structures
//
collation.recursive.fieldwise = function (compare, shortlex) {
  return function (a, b) {
    var aKeys = Object.keys(a)
    var bKeys = Object.keys(b)
    var aLength = aKeys.length
    var bLength = bKeys.length
    var difference

    //
    // short-circuit on length difference for shortlex semantics
    //
    if (shortlex && aLength !== bLength)
        return aLength - bLength

    for (var i = 0, length = Math.min(aLength, bLength); i < length; ++i) {
      //
      // first compare keys
      //
      if (difference = compare(aKeys[i], bKeys[i]))
        return difference

      //
      // then compare values
      //
      if (difference = compare(a[aKeys[i]], b[bKeys[i]]))
        return difference
    }

    return aLength - bLength
  }
}

//
// elementwise compare with inequality can be used for binary equality
//
collation.bitwise = collation.recursive.elementwise(exports.inequality)


},{}],82:[function(require,module,exports){
//
// extend core typewise
//
require('./collation')

module.exports = require('typewise-core/base')

},{"./collation":83,"typewise-core/base":80}],83:[function(require,module,exports){
//
// extend core typewise collations
//
var collation = require('typewise-core/collation')

// TODO: set, map

module.exports = collation

},{"typewise-core/collation":81}],84:[function(require,module,exports){
module.exports = require('./base')

},{"./base":82}],85:[function(require,module,exports){
/* eslint-disable node/no-deprecated-api */
var assert = require('assert')
var trie = require('./trie')

module.exports = Wayfarer

// create a router
// str -> obj
function Wayfarer (dft) {
  if (!(this instanceof Wayfarer)) return new Wayfarer(dft)

  var _default = (dft || '').replace(/^\//, '')
  var _trie = trie()

  emit._trie = _trie
  emit.on = on
  emit.emit = emit
  emit.match = match
  emit._wayfarer = true

  return emit

  // define a route
  // (str, fn) -> obj
  function on (route, cb) {
    assert.equal(typeof route, 'string')
    assert.equal(typeof cb, 'function')

    route = route || '/'

    if (cb._wayfarer && cb._trie) {
      _trie.mount(route, cb._trie.trie)
    } else {
      var node = _trie.create(route)
      node.cb = cb
      node.route = route
    }

    return emit
  }

  // match and call a route
  // (str, obj?) -> null
  function emit (route) {
    var matched = match(route)

    var args = new Array(arguments.length)
    args[0] = matched.params
    for (var i = 1; i < args.length; i++) {
      args[i] = arguments[i]
    }

    return matched.cb.apply(matched.cb, args)
  }

  function match (route) {
    assert.notEqual(route, undefined, "'route' must be defined")

    var matched = _trie.match(route)
    if (matched && matched.cb) return new Route(matched)

    var dft = _trie.match(_default)
    if (dft && dft.cb) return new Route(dft)

    throw new Error("route '" + route + "' did not match")
  }

  function Route (matched) {
    this.cb = matched.cb
    this.route = matched.route
    this.params = matched.params
  }
}

},{"./trie":86,"assert":53}],86:[function(require,module,exports){
/* eslint-disable node/no-deprecated-api */
var assert = require('assert')

module.exports = Trie

// create a new trie
// null -> obj
function Trie () {
  if (!(this instanceof Trie)) return new Trie()
  this.trie = { nodes: {} }
}

// create a node on the trie at route
// and return a node
// str -> obj
Trie.prototype.create = function (route) {
  assert.equal(typeof route, 'string', 'route should be a string')
  // strip leading '/' and split routes
  var routes = route.replace(/^\//, '').split('/')

  function createNode (index, trie) {
    var thisRoute = (has(routes, index) && routes[index])
    if (thisRoute === false) return trie

    var node = null
    if (/^:|^\*/.test(thisRoute)) {
      // if node is a name match, set name and append to ':' node
      if (!has(trie.nodes, '$$')) {
        node = { nodes: {} }
        trie.nodes.$$ = node
      } else {
        node = trie.nodes.$$
      }

      if (thisRoute[0] === '*') {
        trie.wildcard = true
      }

      trie.name = thisRoute.replace(/^:|^\*/, '')
    } else if (!has(trie.nodes, thisRoute)) {
      node = { nodes: {} }
      trie.nodes[thisRoute] = node
    } else {
      node = trie.nodes[thisRoute]
    }

    // we must recurse deeper
    return createNode(index + 1, node)
  }

  return createNode(0, this.trie)
}

// match a route on the trie
// and return the node
// str -> obj
Trie.prototype.match = function (route) {
  assert.equal(typeof route, 'string', 'route should be a string')

  var routes = route.replace(/^\//, '').split('/')
  var params = {}

  function search (index, trie) {
    // either there's no match, or we're done searching
    if (trie === undefined) return undefined
    var thisRoute = routes[index]
    if (thisRoute === undefined) return trie

    if (has(trie.nodes, thisRoute)) {
      // match regular routes first
      return search(index + 1, trie.nodes[thisRoute])
    } else if (trie.name) {
      // match named routes
      try {
        params[trie.name] = decodeURIComponent(thisRoute)
      } catch (e) {
        return search(index, undefined)
      }
      return search(index + 1, trie.nodes.$$)
    } else if (trie.wildcard) {
      // match wildcards
      try {
        params.wildcard = decodeURIComponent(routes.slice(index).join('/'))
      } catch (e) {
        return search(index, undefined)
      }
      // return early, or else search may keep recursing through the wildcard
      return trie.nodes.$$
    } else {
      // no matches found
      return search(index + 1)
    }
  }

  var node = search(0, this.trie)

  if (!node) return undefined
  node = Object.assign({}, node)
  node.params = params
  return node
}

// mount a trie onto a node at route
// (str, obj) -> null
Trie.prototype.mount = function (route, trie) {
  assert.equal(typeof route, 'string', 'route should be a string')
  assert.equal(typeof trie, 'object', 'trie should be a object')

  var split = route.replace(/^\//, '').split('/')
  var node = null
  var key = null

  if (split.length === 1) {
    key = split[0]
    node = this.create(key)
  } else {
    var head = split.join('/')
    key = split[0]
    node = this.create(head)
  }

  Object.assign(node.nodes, trie.nodes)
  if (trie.name) node.name = trie.name

  // delegate properties from '/' to the new node
  // '/' cannot be reached once mounted
  if (node.nodes['']) {
    Object.keys(node.nodes['']).forEach(function (key) {
      if (key === 'nodes') return
      node[key] = node.nodes[''][key]
    })
    Object.assign(node.nodes, node.nodes[''].nodes)
    delete node.nodes[''].nodes
  }
}

function has (object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

},{"assert":53}],87:[function(require,module,exports){
const html = require('choo/html')
const classnames = require('classnames')

module.exports = function ({ loading }) {
  return html`
    <div class="${classnames({
      'aboslute': true,
      'w-full': true,
      'h-full': true,
      'hidden': !loading,
      'flex': true,
      'items-center': true,
      'justify-center': true,
    })}">
      <p>Loading...</p>
    </div>
  `
}

},{"choo/html":33,"classnames":36}],88:[function(require,module,exports){
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
},{"../loading.js":87,"./map.js":89,"choo/component":32,"choo/html":33,"classnames":36}],89:[function(require,module,exports){
const maplibregl = require('maplibre-gl')
const pmtiles = require('pmtiles')
const chroma = require('chroma-js')

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
const caseEqualWaterBody = caseEqual('WB_PERIOD_LABEL_NM')
const caseEqualWaterCourses = caseEqual('WC_PERIOD_LABEL_NM')

const periodicityColorsWaterBodyHighlight = periodicity.map((s) => {
    return [caseEqualWaterBody(s.key), s.hex]
  })
  .reduce((acc, curr) => {
    return acc.concat(curr)
  }, ['case'])
  .concat([themeColors.transparent])

const periodicityColorsWaterBodyMonotone = periodicity.map((s) => {
    return [caseEqualWaterBody(s.key), themeColors.monotone]
  })
  .reduce((acc, curr) => {
    return acc.concat(curr)
  }, ['case'])
  .concat([themeColors.transparent])

const periodicityColorsWaterCoursesHighlight = periodicity.map((s) => {
    return [caseEqualWaterCourses(s.key), s.hex]
  })
  .reduce((acc, curr) => {
    return acc.concat(curr)
  }, ['case'])
  .concat([themeColors.transparent])

const periodicityColorsWaterCoursesMonotone = periodicity.map((s) => {
    return [caseEqualWaterCourses(s.key), themeColors.monotone]
  })
  .reduce((acc, curr) => {
    return acc.concat(curr)
  }, ['case'])
  .concat([themeColors.transparent])

theme.highlightHydrography.mapStyle.push({
  key: 'waterh-bodies-fill',
  name: 'fill-color',
  value: periodicityColorsWaterBodyHighlight,
})

theme.highlightHydrography.mapStyle.push({
  key: 'water-courses-stroke',
  name: 'line-color',
  value: periodicityColorsWaterCoursesHighlight,
})

theme.highlightPoi.mapStyle.push({
  key: 'waterh-bodies-fill',
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
if ("development" === 'development') {
  host = '.'
}
else if ("development" === 'production') {
  host = 'https://rubonics-pmtiles.s3.amazonaws.com/wa-dnr'
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

const analysisSpecs = [
  {
    key: 'period-all',
    source: geojsonSource({ data: 'redcedar-poi-nearest-period-all-nconn-epsg-4326.geojson' }),
  },
  {
    key: 'period-min-eph',
    source: geojsonSource({ data: 'redcedar-poi-nearest-period-min-eph-nconn-epsg-4326.geojson' }),
  },
  {
    key: 'period-min-int',
    source: geojsonSource({ data: 'redcedar-poi-nearest-period-min-int-nconn-epsg-4326.geojson' }),
  },
  {
    key: 'period-per',
    source: geojsonSource({ data: 'redcedar-poi-nearest-period-per-nconn-epsg-4326.geojson' }),
  },
]

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
        id:"waterh-shed-fill",
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
        id:"waterh-bodies-fill",
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

},{"chroma-js":35,"maplibre-gl":51,"pmtiles":75}],90:[function(require,module,exports){
const html = require('choo/html')
const classnames = require('classnames')

function SplitPane ({ left, right, state, emit }) {
  const local = state.components.splitPane

  const isHorizontal = local.layout === 'horizontal'
  const isVertical = local.layout === 'vertical'

  return html`
    <div class="w-full h-full flex flex-col">
      <div class="grow-0">
        <div class="p-3 flex flex-start">
          <p class="font-bold">Explore</p>
          <div class="flex flex-start items-center ml-4">
            <label for="left">tabular</label>
            <input type="checkbox" id="left" checked=${local.left.open}
              class="ml-2"
              onclick=${toggleLeft}/>
          </div>
          <div class="flex flex-start items-center ml-4">
            <label for="right">map</label>
            <input type="checkbox" id="right" checked=${local.right.open}
              class="ml-2"
              onclick=${toggleRight}/>
          </div>
          <div class="flex flex-start items-center ml-8">
            <p class="font-bold">Layout</p>
            <div class="ml-4 flex flex-start items-center">
              <label for="horizontal">horizontal</label>
              <input type="radio" id="horizontal" name="layout" checked=${isHorizontal}
                class="ml-2"
                onclick=${setLayoutHorizontal}/>
            </div>
            <div class="ml-2 flex flex-start items-center">
              <label for="vertical">vertical</label>
              <input type="radio" id="vertical" name="layout" checked=${isVertical}
                class="ml-2"
                onclick=${setLayoutVertical}/>
            </div>
          </div>
        </div>
      </div>
      <div class="${classnames({
          'flex': true,
          'flex-col': isVertical,
          'overflow-hidden': true,
          'border-t-2': true,
          'border-black': true,
          'border-solid': true,
        })}">
        <div class="${classnames({
          'h-full': isHorizontal,
          'w-full': isHorizontal && local.left.open && !local.right.open,
          'w-1/2': isHorizontal && local.left.open && local.right.open,
          'w-0': isHorizontal && !local.left.open && local.right.open,
          'w-full': isVertical,
          'h-full': isVertical && local.left.open && !local.right.open,
          'h-1/2': isVertical && local.left.open && local.right.open,
          'h-0': isVertical && !local.left.open && local.right.open,
          'overflow-scroll': true,
          'border-r-2': isHorizontal && local.left.open && local.right.open,
          'border-b-2': isVertical && local.left.open && local.right.open,
          'border-black': true,
          'border-solid': true,
        })}">
          ${left}
        </div>
        <div class="${classnames({
          'h-full': isHorizontal,
          'w-full': isHorizontal && !local.left.open && local.right.open,
          'w-1/2': isHorizontal && local.left.open && local.right.open,
          'w-0': isHorizontal && local.left.open && !local.right.open,
          'w-full': isVertical,
          'h-full': isVertical && !local.left.open && local.right.open,
          'h-1/2': isVertical && local.left.open && local.right.open,
          'h-0': isVertical && local.left.open && !local.right.open,
          'overflow-scroll': true,
        })}">
          ${right}
        </div>
      </div>
      
    </div>
  `

  function toggleLeft () {
    emit('split-pane:toggle:left')
  }

  function toggleRight () {
    emit('split-pane:toggle:right')
  }

  function setLayoutHorizontal () {
    emit('split-pane:set-layout:horizontal')
  }

  function setLayoutVertical () {
    emit('split-pane:set-layout:vertical')
  }

}

module.exports = SplitPane
},{"choo/html":33,"classnames":36}],91:[function(require,module,exports){
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
              return html`<th class="sticky top-0 bg-white border-black border-solid border-x-2 border-b-2 px-3 whitespace-nowrap w-[150px] h-[30px] overflow-scroll">${key}</th>`
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
},{"./loading.js":87,"bytewise":28,"choo/component":32,"choo/html":33,"classnames":36,"level":50,"papaparse":74}]},{},[1]);