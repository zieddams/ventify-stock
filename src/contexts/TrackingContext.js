import { AppState } from 'react-native'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import {
  addRouteSessionLoad,
  closeRouteSession,
  getRouteSession,
  getTodayRouteSession,
  openRouteSession,
  recordRouteSessionReturns,
  storeRouteLocation,
} from '../services/routeSessionService'
import {
  LIVE_TRACKING_DISTANCE_METERS,
  LIVE_TRACKING_INTERVAL_MS,
  distanceBetweenMeters,
  getLocationValidationMessage,
  getCurrentLocation,
  getForegroundPermission,
  mapLocationToPayload,
  requestForegroundPermission,
  watchLocation,
} from '../services/locationService'

const TrackingContext = createContext(null)

function initialTrackingState() {
  return {
    active: false,
    lastSyncAt: null,
    lastSyncReason: null,
    error: null,
  }
}

export function TrackingProvider({ children }) {
  const { user, isRep, touchSession } = useAuth()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [locationPermission, setLocationPermission] = useState('undetermined')
  const [trackingState, setTrackingState] = useState(initialTrackingState)
  const watchRef = useRef(null)
  const lastSentRef = useRef({ at: 0, coords: null })
  const sessionRef = useRef(null)
  const refreshInFlightRef = useRef(false)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const stopWatch = useCallback(() => {
    if (watchRef.current?.remove) {
      watchRef.current.remove()
    }
    watchRef.current = null
    setTrackingState((prev) => ({
      ...prev,
      active: false,
    }))
  }, [])

  const refreshPermission = useCallback(async (shouldRequest = false) => {
    try {
      const result = shouldRequest
        ? await requestForegroundPermission()
        : await getForegroundPermission()

      setLocationPermission(result.status)
      return result.status
    } catch {
      setLocationPermission('denied')
      return 'denied'
    }
  }, [])

  const refreshSession = useCallback(async () => {
    if (!user || !isRep()) {
      setSession(null)
      setLoading(false)
      return null
    }

    try {
      const data = await getTodayRouteSession()
      setSession(data)
      return data
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Session indisponible.',
      }))
      return null
    } finally {
      setLoading(false)
    }
  }, [user, isRep])

  const uploadLocation = useCallback(async (location, reason = 'manual', targetSession = null) => {
    const activeSession = targetSession || sessionRef.current
    if (!activeSession?.id) return null

    const payload = mapLocationToPayload(location)
    if (!payload) {
      setTrackingState((prev) => ({
        ...prev,
        error: getLocationValidationMessage(location) || 'Position GPS invalide.',
      }))
      return null
    }

    const now = Date.now()
    const tooSoon = now - lastSentRef.current.at < Math.max(LIVE_TRACKING_INTERVAL_MS - 2000, 10000)
    const tooClose = lastSentRef.current.coords
      ? distanceBetweenMeters(lastSentRef.current.coords, payload) < Math.max(LIVE_TRACKING_DISTANCE_METERS - 5, 15)
      : false

    if (reason === 'watch' && tooSoon && tooClose) {
      return null
    }

    try {
      const saved = await storeRouteLocation(activeSession.id, payload)
      lastSentRef.current = {
        at: now,
        coords: payload,
      }

      setTrackingState({
        active: true,
        lastSyncAt: saved.recorded_at || payload.recorded_at,
        lastSyncReason: reason,
        error: null,
      })

      setSession((prev) => {
        if (!prev || prev.id !== activeSession.id) return prev
        const nextSession = {
          ...prev,
          latestLocation: saved,
          locations_count: Number(prev.locations_count || 0) + 1,
        }
        sessionRef.current = nextSession
        return nextSession
      })

      return saved
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Synchronisation GPS indisponible.',
      }))
      return null
    }
  }, [])

  const captureCurrentLocation = useCallback(async (reason = 'manual', targetSession = null) => {
    const permission = await refreshPermission(reason !== 'status')
    if (permission !== 'granted') {
      setTrackingState((prev) => ({
        ...prev,
        error: 'Autorisez la localisation pour suivre les tournees.',
      }))
      return null
    }

    try {
      const location = await getCurrentLocation()
      setCurrentLocation(location)
      const locationIssue = getLocationValidationMessage(location)
      if (locationIssue) {
        setTrackingState((prev) => ({
          ...prev,
          error: locationIssue,
        }))
        return location
      }
      if ((targetSession || sessionRef.current)?.id) {
        await uploadLocation(location, reason, targetSession)
      }
      return location
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error.message || 'Localisation indisponible.',
      }))
      return null
    }
  }, [refreshPermission, uploadLocation])

  const refreshSessionDetails = useCallback(async () => {
    const activeSession = sessionRef.current

    if (!activeSession?.id) {
      return refreshSession()
    }

    if (refreshInFlightRef.current) {
      return activeSession
    }

    refreshInFlightRef.current = true

    try {
      const data = await getRouteSession(activeSession.id)
      setSession(data)
      sessionRef.current = data
      return data
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Detail session indisponible.',
      }))
      return activeSession
    } finally {
      refreshInFlightRef.current = false
    }
  }, [refreshSession])

  const startSession = useCallback(async (payload = {}) => {
    setBusy(true)
    try {
      const data = await openRouteSession(payload)
      setSession(data)
      sessionRef.current = data
      await captureCurrentLocation('session-open', data)
      await touchSession('session-open', { force: true, includeLocation: false })
      return data
    } finally {
      setBusy(false)
    }
  }, [captureCurrentLocation, touchSession])

  const addLoad = useCallback(async (lines) => {
    if (!sessionRef.current?.id) {
      throw new Error('Aucune session ouverte.')
    }

    setBusy(true)
    try {
      const data = await addRouteSessionLoad(sessionRef.current.id, lines)
      setSession(data)
      sessionRef.current = data
      await captureCurrentLocation('route-load', data)
      await touchSession('route-load', { force: true, includeLocation: false })
      return data
    } finally {
      setBusy(false)
    }
  }, [captureCurrentLocation, touchSession])

  const recordReturns = useCallback(async (lines) => {
    if (!sessionRef.current?.id) {
      throw new Error('Aucune session ouverte.')
    }

    setBusy(true)
    try {
      const data = await recordRouteSessionReturns(sessionRef.current.id, lines)
      setSession(data)
      sessionRef.current = data
      await captureCurrentLocation('route-returns', data)
      await touchSession('route-returns', { force: true, includeLocation: false })
      return data
    } finally {
      setBusy(false)
    }
  }, [captureCurrentLocation, touchSession])

  const endSession = useCallback(async (payload = {}) => {
    if (!sessionRef.current?.id) {
      throw new Error('Aucune session ouverte.')
    }

    setBusy(true)
    try {
      await captureCurrentLocation('session-close', sessionRef.current)
      const data = await closeRouteSession(sessionRef.current.id, payload)
      setSession(data)
      sessionRef.current = data
      stopWatch()
      await touchSession('session-close', { force: true, includeLocation: false })
      return data
    } finally {
      setBusy(false)
    }
  }, [captureCurrentLocation, stopWatch, touchSession])

  const syncInteraction = useCallback(async (reason = 'interaction', options = {}) => {
    const includeLocation = options.includeLocation ?? false
    const refreshSessionAfter = options.refreshSession ?? false

    if (includeLocation && sessionRef.current?.id && sessionRef.current?.status === 'open') {
      await captureCurrentLocation(reason, sessionRef.current)
    }

    if (refreshSessionAfter) {
      await refreshSessionDetails()
    }

    await touchSession(reason, {
      force: options.force ?? true,
      includeLocation: false,
    })
  }, [captureCurrentLocation, refreshSessionDetails, touchSession])

  useEffect(() => {
    if (!user || !isRep()) {
      stopWatch()
      setSession(null)
      sessionRef.current = null
      setLoading(false)
      setCurrentLocation(null)
      setLocationPermission('undetermined')
      lastSentRef.current = { at: 0, coords: null }
      return
    }

    refreshSession()
    refreshPermission(false)
  }, [user, isRep, refreshSession, refreshPermission, stopWatch])

  useEffect(() => {
    if (!user || !isRep() || !session?.id || session?.status !== 'open') {
      stopWatch()
      return undefined
    }

    let cancelled = false

    ;(async () => {
      const permission = await refreshPermission(true)
      if (permission !== 'granted' || cancelled) return

      await captureCurrentLocation('watch-start', sessionRef.current)
      const subscription = await watchLocation((location) => {
        setCurrentLocation(location)
        uploadLocation(location, 'watch', sessionRef.current)
      })

      if (cancelled) {
        subscription?.remove?.()
        return
      }

      watchRef.current = subscription
      setTrackingState((prev) => ({
        ...prev,
        active: true,
      }))
    })()

    return () => {
      cancelled = true
      stopWatch()
    }
  }, [user, isRep, session?.id, session?.status, captureCurrentLocation, refreshPermission, stopWatch, uploadLocation])

  useEffect(() => {
    if (!user || !isRep()) return undefined

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshSession()
        if (sessionRef.current?.id && sessionRef.current?.status === 'open') {
          captureCurrentLocation('resume')
        }
      }
    })

    return () => sub.remove()
  }, [user, isRep, refreshSession, captureCurrentLocation])

  const value = useMemo(() => ({
    session,
    loading,
    busy,
    currentLocation,
    locationPermission,
    trackingState,
    refreshPermission,
    refreshSession,
    refreshSessionDetails,
    captureCurrentLocation,
    startSession,
    addLoad,
    recordReturns,
    endSession,
    syncInteraction,
  }), [
    session,
    loading,
    busy,
    currentLocation,
    locationPermission,
    trackingState,
    refreshPermission,
    refreshSession,
    refreshSessionDetails,
    captureCurrentLocation,
    startSession,
    addLoad,
    recordReturns,
    endSession,
    syncInteraction,
  ])

  return (
    <TrackingContext.Provider value={value}>
      {children}
    </TrackingContext.Provider>
  )
}

export function useTracking() {
  return useContext(TrackingContext)
}
