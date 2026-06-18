const fs = require('fs')
const path = require('path')

const packageJson = require('../package.json')
const appConfig = require('../app.config.js')

const projectRoot = path.resolve(__dirname, '..')
const buildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle')

if (!fs.existsSync(buildGradlePath)) {
  console.log('[sync-android-version] android/app/build.gradle not found, skipping.')
  process.exit(0)
}

const versionName = String(appConfig.version || packageJson.version || '').trim()
const versionCode = Number(appConfig.android?.versionCode || 0)

if (!versionName) {
  throw new Error('[sync-android-version] Missing app version in app.config.js or package.json.')
}

if (!Number.isInteger(versionCode) || versionCode <= 0) {
  throw new Error('[sync-android-version] android.versionCode must be a positive integer in app.config.js.')
}

const content = fs.readFileSync(buildGradlePath, 'utf8')

const nextContent = content
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`)

if (nextContent === content) {
  console.log(`[sync-android-version] android build.gradle already matches ${versionName} (${versionCode}).`)
  process.exit(0)
}

fs.writeFileSync(buildGradlePath, nextContent, 'utf8')
console.log(`[sync-android-version] Updated android build.gradle to ${versionName} (${versionCode}).`)
