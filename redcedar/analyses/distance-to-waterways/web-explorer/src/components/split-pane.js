const html = require('choo/html')
const classnames = require('classnames')

function SplitPane ({ left, right, state, emit }) {
  const local = state.components.splitPane

  const isHorizontal = local.layout === 'horizontal'
  const isVertical = local.layout === 'vertical'

  return html`
    <div class="w-full h-full flex flex-col">
      <div class="grow-0">
        <div class="p-3 flex flex-start overflow-scroll">
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