import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

const ACTIVITY_SESSION_KEY = 'irtiwaa_mobile_activity_session'

let cachedSessionId = null
let currentScreenName = 'Login'
let currentScreenLabel = 'Login'

function fallbackSessionId() {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function getMobileActivitySessionId() {
  if (cachedSessionId) {
    return cachedSessionId
  }

  try {
    const stored = await SecureStore.getItemAsync(ACTIVITY_SESSION_KEY)

    if (stored) {
      cachedSessionId = stored
      return stored
    }

    const nextValue = typeof Crypto.randomUUID === 'function'
      ? `mobile-${Crypto.randomUUID()}`
      : fallbackSessionId()

    await SecureStore.setItemAsync(ACTIVITY_SESSION_KEY, nextValue)
    cachedSessionId = nextValue
    return nextValue
  } catch {
    cachedSessionId = fallbackSessionId()
    return cachedSessionId
  }
}

export function setCurrentMobileScreen(screenName, screenLabel = screenName) {
  currentScreenName = String(screenName || 'Unknown')
  currentScreenLabel = String(screenLabel || currentScreenName)
}

export function getCurrentMobileScreen() {
  return {
    name: currentScreenName,
    label: currentScreenLabel,
    routePath: `/mobile/${String(currentScreenName || 'unknown').toLowerCase()}`,
  }
}
