import * as Location from 'expo-location'

const TUNISIA_BOUNDS = {
  minLatitude: 30,
  maxLatitude: 37.6,
  minLongitude: 7,
  maxLongitude: 11.8,
}

const ANDROID_EMULATOR_DEFAULT = {
  latitude: 37.4219983,
  longitude: -122.084,
}

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

function getCoords(location) {
  return location?.coords ?? location ?? null
}

export function isTunisiaCoordinate(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false
  }

  return lat >= TUNISIA_BOUNDS.minLatitude
    && lat <= TUNISIA_BOUNDS.maxLatitude
    && lng >= TUNISIA_BOUNDS.minLongitude
    && lng <= TUNISIA_BOUNDS.maxLongitude
}

export function getLocationValidationMessage(location) {
  const coords = getCoords(location)
  if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) {
    return 'Position GPS invalide ou non capturee.'
  }

  if (isTunisiaCoordinate(coords.latitude, coords.longitude)) {
    return null
  }

  const emulatorDefaultMatch = Math.abs(coords.latitude - ANDROID_EMULATOR_DEFAULT.latitude) < 0.01
    && Math.abs(coords.longitude - ANDROID_EMULATOR_DEFAULT.longitude) < 0.01

  if (emulatorDefaultMatch) {
    return 'L emulateur utilise encore la position Android par defaut. Definissez une position en Tunisie.'
  }

  return 'Position recue hors Tunisie. Verifiez les coordonnees GPS ou la position de l emulateur.'
}

export function mapLocationToPayload(location) {
  const coords = getCoords(location)
  if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) return null
  if (!isTunisiaCoordinate(coords.latitude, coords.longitude)) return null

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
