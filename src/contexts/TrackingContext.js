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
  distanceBetweenMeters,
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
  const { user, isRep } = useAuth()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [locationPermission, setLocationPermission] = useState('undetermined')
  const [trackingState, setTrackingState] = useState(initialTrackingState)
  const watchRef = useRef(null)
  const lastSentRef = useRef({ at: 0, coords: null })

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
    const activeSession = targetSession || session
    if (!activeSession?.id) return null

    const payload = mapLocationToPayload(location)
    if (!payload) return null

    const now = Date.now()
    const tooSoon = now - lastSentRef.current.at < 45000
    const tooClose = lastSentRef.current.coords
      ? distanceBetweenMeters(lastSentRef.current.coords, payload) < 35
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
        return {
          ...prev,
          latestLocation: saved,
          locations_count: Number(prev.locations_count || 0) + 1,
        }
      })

      return saved
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Synchronisation GPS indisponible.',
      }))
      return null
    }
  }, [session])

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
      if ((targetSession || session)?.id) {
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
  }, [refreshPermission, session, uploadLocation])

  const refreshSessionDetails = useCallback(async () => {
    if (!session?.id) {
      return refreshSession()
    }

    try {
      const data = await getRouteSession(session.id)
      setSession(data)
      return data
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Detail session indisponible.',
      }))
      return session
    }
  }, [refreshSession, session])

  const startSession = useCallback(async (payload = {}) => {
    setBusy(true)
    try {
      const data = await openRouteSession(payload)
      setSession(data)
      await captureCurrentLocation('session-open', data)
      return data
    } finally {
      setBusy(false)
    }
  }, [captureCurrentLocation])

  const addLoad = useCallback(async (lines) => {
    if (!session?.id) {
      throw new Error('Aucune session ouverte.')
    }

    setBusy(true)
    try {
      const data = await addRouteSessionLoad(session.id, lines)
      setSession(data)
      return data
    } finally {
      setBusy(false)
    }
  }, [session])

  const recordReturns = useCallback(async (lines) => {
    if (!session?.id) {
      throw new Error('Aucune session ouverte.')
    }

    setBusy(true)
    try {
      const data = await recordRouteSessionReturns(session.id, lines)
      setSession(data)
      return data
    } finally {
      setBusy(false)
    }
  }, [session])

  const endSession = useCallback(async (payload = {}) => {
    if (!session?.id) {
      throw new Error('Aucune session ouverte.')
    }

    setBusy(true)
    try {
      const data = await closeRouteSession(session.id, payload)
      setSession(data)
      stopWatch()
      return data
    } finally {
      setBusy(false)
    }
  }, [session, stopWatch])

  useEffect(() => {
    if (!user || !isRep()) {
      stopWatch()
      setSession(null)
      setLoading(false)
      setCurrentLocation(null)
      setLocationPermission('undetermined')
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

      await captureCurrentLocation('watch-start', session)
      const subscription = await watchLocation((location) => {
        setCurrentLocation(location)
        uploadLocation(location, 'watch', session)
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
  }, [user, isRep, session, captureCurrentLocation, refreshPermission, stopWatch, uploadLocation])

  useEffect(() => {
    if (!user || !isRep()) return undefined

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshSession()
        if (session?.id && session?.status === 'open') {
          captureCurrentLocation('resume')
        }
      }
    })

    return () => sub.remove()
  }, [user, isRep, session, refreshSession, captureCurrentLocation])

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
