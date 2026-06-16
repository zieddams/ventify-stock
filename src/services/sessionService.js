import Constants from 'expo-constants'
import { Dimensions, Platform } from 'react-native'
import api from './api'

function getDevicePayload() {
  const { width, height } = Dimensions.get('window')
  const androidInfo = Constants.platform?.android ?? {}
  const locale = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale
    } catch {
      return 'fr-TN'
    }
  })()

  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return 'UTC'
    }
  })()

  return {
    device_name: Constants.deviceName || androidInfo.model || 'Unknown device',
    brand: androidInfo.brand || Platform.constants?.Brand || null,
    model: androidInfo.model || Platform.constants?.Model || Constants.deviceName || null,
    os_version: Platform.OS === 'android'
      ? `Android ${Platform.Version}`
      : `${Platform.OS} ${Platform.Version}`,
    api_level: Platform.OS === 'android' ? Number(Platform.Version) : null,
    app_version: Constants.expoConfig?.version || '1.1.0',
    locale,
    timezone,
    screen_res: `${Math.round(width)}x${Math.round(height)}`,
  }
}

export async function reportSession() {
  return api.post('/sessions/report', getDevicePayload())
}

export async function pingSession() {
  return api.post('/sessions/ping')
}

export async function markSessionOffline() {
  return api.post('/sessions/offline')
}

