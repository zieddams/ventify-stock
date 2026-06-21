const { AndroidConfig, createRunOncePlugin, withAndroidManifest } = require('@expo/config-plugins')

const PLUGIN_NAME = 'with-apk-installer-support'
const PLUGIN_VERSION = '1.0.0'
const REQUEST_INSTALL_PACKAGES = 'android.permission.REQUEST_INSTALL_PACKAGES'
const APK_MIME_TYPE = 'application/vnd.android.package-archive'
const ACTION_INSTALL_PACKAGE = 'android.intent.action.INSTALL_PACKAGE'
const ACTION_VIEW = 'android.intent.action.VIEW'

function hasIntentAttribute(entries, attributeName, expectedValue) {
  return Array.isArray(entries) && entries.some((entry) => entry?.$?.[attributeName] === expectedValue)
}

function hasQueryIntent(query, actionName, mimeType) {
  return (query?.intent || []).some((intent) => {
    const actions = Array.isArray(intent.action) ? intent.action : []
    const data = Array.isArray(intent.data) ? intent.data : []

    return (
      hasIntentAttribute(actions, 'android:name', actionName) &&
      hasIntentAttribute(data, 'android:mimeType', mimeType)
    )
  })
}

function ensureQueryIntent(androidManifest, actionName, mimeType) {
  const queries = Array.isArray(androidManifest.manifest.queries) ? androidManifest.manifest.queries : []

  if (!queries.some((query) => hasQueryIntent(query, actionName, mimeType))) {
    queries.push({
      intent: [
        {
          action: [{ $: { 'android:name': actionName } }],
          data: [{ $: { 'android:mimeType': mimeType } }],
        },
      ],
    })
  }

  androidManifest.manifest.queries = queries
}

const withApkInstallerSupport = (config) =>
  withAndroidManifest(config, (config) => {
    AndroidConfig.Permissions.ensurePermission(config.modResults, REQUEST_INSTALL_PACKAGES)
    ensureQueryIntent(config.modResults, ACTION_INSTALL_PACKAGE, APK_MIME_TYPE)
    ensureQueryIntent(config.modResults, ACTION_VIEW, APK_MIME_TYPE)
    return config
  })

module.exports = createRunOncePlugin(withApkInstallerSupport, PLUGIN_NAME, PLUGIN_VERSION)
