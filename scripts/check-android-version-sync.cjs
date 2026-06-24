const fs = require('fs')
const path = require('path')

const packageJson = require('../package.json')
const appConfig = require('../app.config.js')
const { buildUpdatedGradleContent, resolveVersionMetadata } = require('./sync-android-version.cjs')

const projectRoot = path.resolve(__dirname, '..')
const buildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle')

if (!fs.existsSync(buildGradlePath)) {
  console.log('[check-android-version] android/app/build.gradle not found, skipping.')
  process.exit(0)
}

try {
  const { versionName, versionCode } = resolveVersionMetadata(packageJson, appConfig)
  const content = fs.readFileSync(buildGradlePath, 'utf8')
  const result = buildUpdatedGradleContent(content, versionName, versionCode)

  if (result.changed) {
    console.error(`[check-android-version] android build.gradle is out of sync. Expected ${versionName} (${versionCode}). Run npm run sync:android-version.`)
    process.exit(1)
  }

  console.log(`[check-android-version] android build.gradle matches ${versionName} (${versionCode}).`)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
