import Constants from 'expo-constants'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'

const ANDROID_PACKAGE_NAME = Constants.expoConfig?.android?.package || 'com.ventify.stock'
const ACTION_INSTALL_PACKAGE = 'android.intent.action.INSTALL_PACKAGE'
const ACTION_VIEW = 'android.intent.action.VIEW'
const APK_PREFIX = 'el-irtiwaa-update-'
const APK_MIME_TYPE = 'application/vnd.android.package-archive'
const FLAG_GRANT_READ_URI_PERMISSION = 1
const FLAG_ACTIVITY_NEW_TASK = 268435456
const INSTALL_FLAGS = FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK

function sanitizeVersion(value) {
  return String(value || Date.now())
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
}

function getDownloadDirectory() {
  return FileSystem.cacheDirectory || FileSystem.documentDirectory || null
}

async function cleanupDownloadedApks(directory) {
  if (!directory) return

  try {
    const entries = await FileSystem.readDirectoryAsync(directory)
    const targets = entries.filter((entry) => entry.startsWith(APK_PREFIX) && entry.toLowerCase().endsWith('.apk'))

    await Promise.all(
      targets.map((entry) => FileSystem.deleteAsync(`${directory}${entry}`, { idempotent: true }))
    )
  } catch {
    // Best-effort cleanup only.
  }
}

async function openUnknownAppSourcesSettings() {
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
    data: `package:${ANDROID_PACKAGE_NAME}`,
    flags: FLAG_ACTIVITY_NEW_TASK,
  })
}

async function launchApkInstaller(contentUri) {
  const intentParams = {
    data: contentUri,
    type: APK_MIME_TYPE,
    flags: INSTALL_FLAGS,
  }

  try {
    await IntentLauncher.startActivityAsync(ACTION_INSTALL_PACKAGE, intentParams)
    return
  } catch (installError) {
    try {
      await IntentLauncher.startActivityAsync(ACTION_VIEW, intentParams)
      return
    } catch (viewError) {
      try {
        await openUnknownAppSourcesSettings()
      } catch {
        // Best-effort fallback only.
      }

      const rootMessage = viewError?.message || installError?.message || ''
      const suffix = rootMessage ? ` Detail: ${rootMessage}` : ''

      throw new Error(
        "Autorisez d'abord l'installation des applications inconnues pour El Irtiwaa, puis relancez la mise a jour." +
          suffix,
      )
    }
  }
}

export function isInAppUpdateSupported() {
  return Platform.OS === 'android'
}

export async function downloadAndLaunchApkUpdate({ url, version, expectedBytes, onProgress }) {
  if (!isInAppUpdateSupported()) {
    throw new Error("L'installation intégrée de mise à jour est disponible uniquement sur Android.")
  }

  if (!url) {
    throw new Error('Aucun fichier APK n’est disponible pour cette release.')
  }

  const directory = getDownloadDirectory()

  if (!directory) {
    throw new Error("Le stockage local de l'application est indisponible.")
  }

  await cleanupDownloadedApks(directory)

  const fileUri = `${directory}${APK_PREFIX}${sanitizeVersion(version)}.apk`

  const downloadTask = FileSystem.createDownloadResumable(
    url,
    fileUri,
    {},
    (progress) => {
      const expectedBytes = Number(progress.totalBytesExpectedToWrite || 0)
      const writtenBytes = Number(progress.totalBytesWritten || 0)
      const ratio = expectedBytes > 0 ? writtenBytes / expectedBytes : 0

      onProgress?.({
        ratio,
        writtenBytes,
        expectedBytes,
      })
    },
  )

  const result = await downloadTask.downloadAsync()

  if (!result?.uri) {
    throw new Error('Le téléchargement de la mise à jour a été interrompu.')
  }

  const fileInfo = await FileSystem.getInfoAsync(result.uri)

  if (!fileInfo?.exists) {
    throw new Error('Le fichier APK téléchargé est introuvable.')
  }

  if (Number.isFinite(expectedBytes) && expectedBytes > 0) {
    const downloadedBytes = Number(fileInfo.size || 0)
    const normalizedExpectedBytes = Number(expectedBytes)

    if (Math.abs(downloadedBytes - normalizedExpectedBytes) > 4096) {
      await FileSystem.deleteAsync(result.uri, { idempotent: true })
      throw new Error('Le fichier APK semble incomplet. Relancez le téléchargement.')
    }
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri)

  await launchApkInstaller(contentUri)

  return result.uri
}
