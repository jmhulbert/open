const html = require('choo/html')
const classnames = require('classnames')

function SplitPane ({ left, right, state, emit }) {
  const local = state.components.splitPane

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
        </div>
      </div>
      <div class="flex overflow-hidden">
        <div class="${classnames({
          'h-full': true,
          'w-full': local.left.open && !local.right.open,
          'w-1/2': local.left.open && local.right.open,
          'w-0': !local.left.open && local.right.open,
          'overflow-scroll': true,
          'border-r-2': local.left.open && local.right.open,
          'border-black': true,
          'border-solid': true,
        })}">
          ${left}
        </div>
        <div class="${classnames({
          'h-full': true,
          'w-full': !local.left.open && local.right.open,
          'w-1/2': local.left.open && local.right.open,
          'w-0': local.left.open && !local.right.open,
          'overflow-scroll': true,
          'border-t-2': true,
          'border-black': true,
          'border-solid': true,
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

}

module.exports = SplitPane