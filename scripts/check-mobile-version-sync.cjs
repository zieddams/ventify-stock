const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const packageJsonPath = path.join(projectRoot, 'package.json')
const appConfigPath = path.join(projectRoot, 'app.config.js')

if (!fs.existsSync(appConfigPath)) {
  console.log('[check-mobile-version] app.config.js not found, skipping.')
  process.exit(0)
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const version = String(packageJson.version || '').trim()

if (!version) {
  throw new Error('[check-mobile-version] Missing version in package.json.')
}

const content = fs.readFileSync(appConfigPath, 'utf8')
const match = content.match(/version:\s*'([^']+)'/)

if (!match) {
  throw new Error('[check-mobile-version] Unable to locate version in app.config.js.')
}

if (match[1] !== version) {
  console.error(`[check-mobile-version] app.config.js is out of sync. Expected ${version}. Run npm run sync:mobile-version.`)
  process.exit(1)
}

console.log(`[check-mobile-version] app.config.js matches ${version}.`)
