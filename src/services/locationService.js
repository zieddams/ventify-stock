import * as Location from 'expo-location'

export async function getForegroundPermission() {
  return Location.getForegroundPermissionsAsync()
}

export async function requestForegroundPermission() {
  return Location.requestForegroundPermissionsAsync()
}

export async function getCurrentLocation() {
  const enabled = await Location.hasServicesEnabledAsync()
  if (!enabled) {
    throw new Error('Les services de localisation sont desactives sur cet appareil.')
  }

  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: true,
  })
}

export async function watchLocation(onUpdate) {
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 40,
      timeInterval: 60000,
      mayShowUserSettingsDialog: true,
    },
    onUpdate,
  )
}

export function mapLocationToPayload(location) {
  const coords = location?.coords ?? location
  if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) return null

  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy ?? null,
    speed: coords.speed ?? null,
    recorded_at: location?.timestamp
      ? new Date(location.timestamp).toISOString()
      : new Date().toISOString(),
  }
}

export function distanceBetweenMeters(a, b) {
  if (!a?.latitude || !a?.longitude || !b?.latitude || !b?.longitude) return Number.POSITIVE_INFINITY

  const earthRadius = 6371000
  const toRad = (value) => (value * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const latA = toRad(a.latitude)
  const latB = toRad(b.latitude)

  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(latA) * Math.cos(latB)

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return earthRadius * c
}
