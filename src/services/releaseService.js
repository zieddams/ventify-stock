import * as Application from 'expo-application'
import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra ?? {}
const repoOwner = extra.releaseRepoOwner || 'zieddams'
const repoName = extra.releaseRepoName || 'ventify-stock'
const releaseApiUrl = extra.releaseApiUrl || `https://api.github.com/repos/${repoOwner}/${repoName}/releases`
const releasePageUrl = extra.releasePageUrl || `https://github.com/${repoOwner}/${repoName}/releases`

function normalizeVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
}

function parseVersion(value) {
  return normalizeVersion(value)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

function extractApkAsset(assets) {
  return (Array.isArray(assets) ? assets : []).find((asset) => /\.apk$/i.test(asset?.name || '')) || null
}

function normalizeSha256Digest(value) {
  const digest = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, '')

  return /^[a-f0-9]{64}$/.test(digest) ? digest : null
}

function normalizeRelease(item) {
  const apkAsset = extractApkAsset(item?.assets)
  const notes = String(item?.body || '').trim() || 'Aucun changelog fourni.'

  return {
    id: item?.id,
    tagName: item?.tag_name || '',
    version: normalizeVersion(item?.tag_name || item?.name || ''),
    name: item?.name || item?.tag_name || 'Release mobile',
    notes,
    notesLines: notes
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    publishedAt: item?.published_at || item?.created_at || null,
    pageUrl: item?.html_url || releasePageUrl,
    apkUrl: apkAsset?.browser_download_url || null,
    apkName: apkAsset?.name || null,
    apkSize: apkAsset?.size || 0,
    apkSha256: normalizeSha256Digest(apkAsset?.digest),
  }
}

// Constants.nativeAppVersion/nativeBuildVersion were removed from expo-constants (v16, 2024) - expo-application's
// PackageManager-backed read is the real installed-on-device version; Constants.expoConfig?.version is only the
// app.config JSON snapshot baked in at build time, used as a fallback if the native module read is unavailable.
export function getCurrentAppVersion() {
  return Application.nativeApplicationVersion || Constants.expoConfig?.version || null
}

export function compareReleaseVersions(left, right) {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] || 0
    const rightValue = rightParts[index] || 0

    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  return 0
}

export async function getLatestMobileReleases(limit = 5) {
  const response = await fetch(`${releaseApiUrl}?per_page=${limit}`, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  })

  if (!response.ok) {
    throw new Error('Impossible de vérifier les releases GitHub pour le moment.')
  }

  const payload = await response.json()

  return (Array.isArray(payload) ? payload : [])
    .filter((item) => !item?.draft && !item?.prerelease)
    .slice(0, limit)
    .map(normalizeRelease)
}

export function getMobileReleaseHubUrl() {
  return releasePageUrl
}
