// The external Node package deliberately loads a Node-API binary with require.
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path')
let binding
exports.analyze = async texts => {
  binding ??= require('./sudachi.node')
  return binding.analyze(texts, path.join(__dirname, 'resources'))
}
