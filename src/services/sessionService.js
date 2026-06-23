import Constants from 'expo-constants'
import { Dimensions, Platform } from 'react-native'
import api from './api'

export function getDevicePayload() {
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
    platform: Platform.OS,
    os_version: Platform.OS === 'android'
      ? `Android ${Platform.Version}`
      : `${Platform.OS} ${Platform.Version}`,
    api_level: Platform.OS === 'android' ? Number(Platform.Version) : null,
    app_version: Constants.expoConfig?.version || Constants.nativeAppVersion || '1.3.18',
    native_app_version: Constants.nativeAppVersion || Constants.expoConfig?.version || null,
    native_build_version: Constants.nativeBuildVersion || String(Constants.expoConfig?.android?.versionCode ?? ''),
    runtime_version: String(Constants.expoConfig?.runtimeVersion || Constants.expoRuntimeVersion || ''),
    app_ownership: Constants.appOwnership || null,
    execution_environment: Constants.executionEnvironment ? String(Constants.executionEnvironment) : null,
    locale,
    timezone,
    screen_res: `${Math.round(width)}x${Math.round(height)}`,
  }
}

export async function reportSession(location = null) {
  return api.post('/sessions/report', {
    ...getDevicePayload(),
    ...(location ?? {}),
  })
}

export async function pingSession(location = null) {
  return api.post('/sessions/ping', location ?? {})
}

export async function markSessionOffline() {
  return api.post('/sessions/offline')
}



