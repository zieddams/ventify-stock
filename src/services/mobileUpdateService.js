import Constants from 'expo-constants'
import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import { File as ExpoFile } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import * as SecureStore from 'expo-secure-store'

const ANDROID_PACKAGE_NAME = Constants.expoConfig?.android?.package || 'com.ventify.stock'
const ACTION_INSTALL_PACKAGE = 'android.intent.action.INSTALL_PACKAGE'
const ACTION_VIEW = 'android.intent.action.VIEW'
const APK_PREFIX = 'el-irtiwaa-update-'
const APK_MIME_TYPE = 'application/vnd.android.package-archive'
const DOWNLOAD_DIRECTORY_NAME = 'updates/'
const PERSISTED_UPDATE_KEY = 'irtiwaa_mobile_update_download'
const FLAG_GRANT_READ_URI_PERMISSION = 1
const FLAG_ACTIVITY_NEW_TASK = 268435456
const INSTALL_FLAGS = FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
const FILE_SIZE_TOLERANCE_BYTES = 4096

function normalizeString(value) {
  return String(value || '').trim()
}

export function sanitizeVersion(value) {
  return normalizeString(value || Date.now()).replace(/[^a-z0-9._-]+/gi, '-')
}

function getDownloadDirectory() {
  const rootDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory || null

  if (!rootDirectory) {
    return null
  }

  return `${rootDirectory}${DOWNLOAD_DIRECTORY_NAME}`
}

async function ensureDownloadDirectory() {
  const directory = getDownloadDirectory()

  if (!directory) {
    throw new Error("Le stockage local de l'application est indisponible.")
  }

  await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  return directory
}

export function normalizeSha256Digest(value) {
  const digest = normalizeString(value)
    .toLowerCase()
    .replace(/^sha256:/, '')

  return /^[a-f0-9]{64}$/.test(digest) ? digest : null
}

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeExpectedBytes(value) {
  const normalized = Number(value || 0)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

function buildProgressPayload(progress = {}, fallbackExpectedBytes = 0) {
  const writtenBytes = Number(progress.totalBytesWritten ?? progress.writtenBytes ?? 0)
  const expectedBytes = Number(progress.totalBytesExpectedToWrite ?? progress.expectedBytes ?? fallbackExpectedBytes ?? 0)
  const normalizedExpectedBytes = Number.isFinite(expectedBytes) && expectedBytes > 0 ? expectedBytes : 0
  const ratio = normalizedExpectedBytes > 0
    ? writtenBytes / normalizedExpectedBytes
    : Number(progress.ratio || 0)

  return {
    writtenBytes: Number.isFinite(writtenBytes) && writtenBytes > 0 ? writtenBytes : 0,
    expectedBytes: normalizedExpectedBytes,
    ratio: Number.isFinite(ratio) && ratio > 0 ? Math.min(1, ratio) : 0,
  }
}

function normalizePersistedUpdateState(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const status = normalizeString(value.status)
  const version = normalizeString(value.version)
  const url = normalizeString(value.url)

  if (!status || !version || !url) {
    return null
  }

  return {
    status,
    version,
    url,
    fileUri: normalizeString(value.fileUri),
    expectedBytes: normalizeExpectedBytes(value.expectedBytes),
    expectedSha256: normalizeSha256Digest(value.expectedSha256),
    resumeData: normalizeString(value.resumeData) || null,
    autoResumeOnActive: value.autoResumeOnActive !== false,
    progress: buildProgressPayload(value.progress, value.expectedBytes),
    updatedAt: normalizeString(value.updatedAt) || new Date().toISOString(),
    errorMessage: normalizeString(value.errorMessage),
  }
}

export async function getPersistedUpdateState() {
  try {
    const raw = await SecureStore.getItemAsync(PERSISTED_UPDATE_KEY)
    return normalizePersistedUpdateState(raw ? JSON.parse(raw) : null)
  } catch {
    return null
  }
}

export async function persistUpdateState(state) {
  const normalized = normalizePersistedUpdateState(state)

  if (!normalized) {
    await SecureStore.deleteItemAsync(PERSISTED_UPDATE_KEY)
    return null
  }

  await SecureStore.setItemAsync(PERSISTED_UPDATE_KEY, JSON.stringify(normalized))
  return normalized
}

export async function clearPersistedUpdateState() {
  await SecureStore.deleteItemAsync(PERSISTED_UPDATE_KEY)
}

function isWithinExpectedByteRange(actualBytes, expectedBytes) {
  const normalizedExpectedBytes = normalizeExpectedBytes(expectedBytes)

  if (!normalizedExpectedBytes) {
    return true
  }

  return Math.abs(Number(actualBytes || 0) - normalizedExpectedBytes) <= FILE_SIZE_TOLERANCE_BYTES
}

async function verifyDownloadedApkSha256(fileUri, expectedSha256) {
  const normalizedExpectedSha256 = normalizeSha256Digest(expectedSha256)

  if (!normalizedExpectedSha256) {
    return
  }

  const file = new ExpoFile(fileUri)
  const bytes = await file.bytes()
  const digestBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)
  const actualSha256 = arrayBufferToHex(digestBuffer)

  if (actualSha256 !== normalizedExpectedSha256) {
    throw new Error("L'intégrité du fichier APK n'a pas pu être vérifiée. Relancez la mise à jour.")
  }
}

async function verifyDownloadedApk(fileUri, { expectedBytes, expectedSha256 } = {}) {
  const fileInfo = await FileSystem.getInfoAsync(fileUri)

  if (!fileInfo?.exists) {
    throw new Error('Le fichier APK téléchargé est introuvable.')
  }

  if (!isWithinExpectedByteRange(fileInfo.size, expectedBytes)) {
    throw new Error('Le fichier APK semble incomplet. Relancez le téléchargement.')
  }

  await verifyDownloadedApkSha256(fileUri, expectedSha256)

  return {
    fileUri,
    size: Number(fileInfo.size || 0),
  }
}

export async function getDownloadedApkUri(version) {
  const directory = await ensureDownloadDirectory()
  return `${directory}${APK_PREFIX}${sanitizeVersion(version)}.apk`
}

export async function deleteDownloadedApk(fileUri) {
  if (!fileUri) return
  await FileSystem.deleteAsync(fileUri, { idempotent: true })
}

export async function findExistingDownloadedApk({ version, fileUri, expectedBytes, expectedSha256 }) {
  const targetFileUri = normalizeString(fileUri) || await getDownloadedApkUri(version)

  try {
    return await verifyDownloadedApk(targetFileUri, { expectedBytes, expectedSha256 })
  } catch {
    await deleteDownloadedApk(targetFileUri)
    return null
  }
}

export async function cleanupDownloadedApks({ keepVersions = [] } = {}) {
  const directory = getDownloadDirectory()

  if (!directory) {
    return
  }

  const keepFileNames = new Set(
    keepVersions
      .map((version) => normalizeString(version))
      .filter(Boolean)
      .map((version) => `${APK_PREFIX}${sanitizeVersion(version)}.apk`)
  )

  try {
    const entries = await FileSystem.readDirectoryAsync(directory)
    const targets = entries.filter((entry) => entry.startsWith(APK_PREFIX) && entry.toLowerCase().endsWith('.apk'))

    await Promise.all(
      targets
        .filter((entry) => !keepFileNames.has(entry))
        .map((entry) => FileSystem.deleteAsync(`${directory}${entry}`, { idempotent: true }))
    )
  } catch {
    // Best-effort cleanup only.
  }
}

export function createApkDownloadResumable({ url, version, resumeData, onProgress }) {
  return getDownloadedApkUri(version).then((fileUri) => ({
    fileUri,
    task: FileSystem.createDownloadResumable(
      url,
      fileUri,
      {},
      (progress) => {
        onProgress?.(buildProgressPayload(progress))
      },
      resumeData || undefined,
    ),
  }))
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
      const suffix = rootMessage ? ` Détail: ${rootMessage}` : ''

      throw new Error(
        "Autorisez d'abord l'installation des applications inconnues pour El Irtiwaa, puis relancez la mise à jour." +
          suffix,
      )
    }
  }
}

export async function installDownloadedApk(fileUri) {
  const contentUri = await FileSystem.getContentUriAsync(fileUri)
  await launchApkInstaller(contentUri)
  return fileUri
}

export function isInAppUpdateSupported() {
  return Platform.OS === 'android'
}

export async function downloadAndLaunchApkUpdate({ url, version, expectedBytes, expectedSha256, onProgress }) {
  if (!isInAppUpdateSupported()) {
    throw new Error("L'installation intégrée de mise à jour est disponible uniquement sur Android.")
  }

  if (!url) {
    throw new Error('Aucun fichier APK n’est disponible pour cette release.')
  }

  const existingApk = await findExistingDownloadedApk({ version, expectedBytes, expectedSha256 })

  if (existingApk?.fileUri) {
    await installDownloadedApk(existingApk.fileUri)
    return existingApk.fileUri
  }

  await cleanupDownloadedApks({ keepVersions: [version] })

  const { fileUri, task } = await createApkDownloadResumable({
    url,
    version,
    onProgress,
  })

  const result = await task.downloadAsync()

  if (!result?.uri) {
    throw new Error('Le téléchargement de la mise à jour a été interrompu.')
  }

  await verifyDownloadedApk(result.uri, { expectedBytes, expectedSha256 })
  await installDownloadedApk(result.uri)

  return fileUri
}
