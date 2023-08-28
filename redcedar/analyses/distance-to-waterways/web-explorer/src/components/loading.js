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
