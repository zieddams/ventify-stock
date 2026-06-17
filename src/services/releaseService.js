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
  }
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
    throw new Error('Impossible de verifier les releases GitHub pour le moment.')
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
