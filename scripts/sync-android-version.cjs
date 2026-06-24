const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const buildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle')

function resolveVersionMetadata(packageJson, appConfig) {
  const versionName = String(appConfig.version || packageJson.version || '').trim()
  const versionCode = Number(appConfig.android?.versionCode || 0)

  if (!versionName) {
    throw new Error('[sync-android-version] Missing app version in app.config.js or package.json.')
  }

  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error('[sync-android-version] android.versionCode must be a positive integer in app.config.js.')
  }

  return { versionName, versionCode }
}

function buildUpdatedGradleContent(content, versionName, versionCode) {
  const nextContent = content
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`)

  return {
    changed: nextContent !== content,
    content: nextContent,
  }
}

function syncAndroidVersionFile({
  fsImpl = fs,
  targetPath = buildGradlePath,
  packageJson = require('../package.json'),
  appConfig = require('../app.config.js'),
} = {}) {
  if (!fsImpl.existsSync(targetPath)) {
    return {
      skipped: true,
      changed: false,
      message: '[sync-android-version] android/app/build.gradle not found, skipping.',
    }
  }

  const { versionName, versionCode } = resolveVersionMetadata(packageJson, appConfig)
  const content = fsImpl.readFileSync(targetPath, 'utf8')
  const result = buildUpdatedGradleContent(content, versionName, versionCode)

  if (!result.changed) {
    return {
      skipped: false,
      changed: false,
      versionName,
      versionCode,
      message: `[sync-android-version] android build.gradle already matches ${versionName} (${versionCode}).`,
    }
  }

  fsImpl.writeFileSync(targetPath, result.content, 'utf8')

  return {
    skipped: false,
    changed: true,
    versionName,
    versionCode,
    message: `[sync-android-version] Updated android build.gradle to ${versionName} (${versionCode}).`,
  }
}

function runCli() {
  const result = syncAndroidVersionFile()
  console.log(result.message)
}

if (require.main === module) {
  try {
    runCli()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

module.exports = {
  buildUpdatedGradleContent,
  resolveVersionMetadata,
  syncAndroidVersionFile,
}
