const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const packageJsonPath = path.join(projectRoot, 'package.json')
const appConfigPath = path.join(projectRoot, 'app.config.js')

function parseArgs(argv = []) {
  const incrementArg = argv.find((item) => item.startsWith('--increment-version-code='))
  const incrementVersionCode = incrementArg
    ? Number.parseInt(incrementArg.split('=')[1], 10)
    : 0

  return {
    incrementVersionCode: Number.isInteger(incrementVersionCode) ? incrementVersionCode : 0,
  }
}

function buildUpdatedAppConfigContent(content, version, incrementVersionCode = 0) {
  let updatedContent = content.replace(
    /version:\s*'[^']*'/,
    `version: '${version}'`,
  )

  if (incrementVersionCode > 0) {
    updatedContent = updatedContent.replace(
      /versionCode:\s*(\d+)/,
      (_, currentValue) => `versionCode: ${Number.parseInt(currentValue, 10) + incrementVersionCode}`,
    )
  }

  return updatedContent
}

function syncMobileVersionFile({
  packagePath = packageJsonPath,
  targetPath = appConfigPath,
  incrementVersionCode = 0,
} = {}) {
  if (!fs.existsSync(targetPath)) {
    return {
      updated: false,
      version: null,
      message: '[sync-mobile-version] app.config.js not found, skipping.',
    }
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  const version = String(packageJson.version || '').trim()

  if (!version) {
    throw new Error('[sync-mobile-version] Missing version in package.json.')
  }

  const content = fs.readFileSync(targetPath, 'utf8')
  const updatedContent = buildUpdatedAppConfigContent(content, version, incrementVersionCode)

  if (updatedContent === content) {
    return {
      updated: false,
      version,
      message: `[sync-mobile-version] app.config.js already matches ${version}.`,
    }
  }

  fs.writeFileSync(targetPath, updatedContent)

  return {
    updated: true,
    version,
    message: incrementVersionCode > 0
      ? `[sync-mobile-version] Updated app.config.js to ${version} and incremented versionCode by ${incrementVersionCode}.`
      : `[sync-mobile-version] Updated app.config.js to ${version}.`,
  }
}

if (require.main === module) {
  const { incrementVersionCode } = parseArgs(process.argv.slice(2))
  const result = syncMobileVersionFile({ incrementVersionCode })
  console.log(result.message)
}

module.exports = {
  buildUpdatedAppConfigContent,
  parseArgs,
  syncMobileVersionFile,
}
