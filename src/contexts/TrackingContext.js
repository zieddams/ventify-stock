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
  getRememberedLocationPayload,
  LIVE_TRACKING_INTERVAL_MS,
  mapLocationToPayload,
  requestForegroundPermission,
  watchLocation,
} from '../services/locationService'
import { pingSession, reportSession } from '../services/sessionService'
import { useNotifications } from './NotificationsContext'
import { isTerrainTrackingEnabled } from '../utils/companyFeatures'

const TrackingContext = createContext(null)
const REMOTE_SESSION_SYNC_MS = 5000
const REMOTE_PRESENCE_SYNC_MS = 30000

function initialTrackingState() {
  return {
    active: false,
    lastSyncAt: null,
    lastSyncReason: null,
    error: null,
  }
}

function normalizeLocationPermissionStatus(permission) {
  if (permission?.status === 'granted') {
    return 'granted'
  }

  if (permission?.status === 'denied' || permission?.canAskAgain === false) {
    return 'denied'
  }

  return 'pending'
}

export function TrackingProvider({ children }) {
  const { user, canUseOperationalMobile } = useAuth()
  const terrainTrackingEnabled = isTerrainTrackingEnabled(user)
  const { refreshNotifications } = useNotifications()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [appState, setAppState] = useState(AppState.currentState)
  const [locationPermission, setLocationPermission] = useState('disabled')
  const [trackingState, setTrackingState] = useState(initialTrackingState)
  const sessionRef = useRef(null)
  const refreshInFlightRef = useRef(false)
  const presenceInFlightRef = useRef(false)
  const locationWatchRef = useRef(null)
  const locationWatchSyncRef = useRef(false)
  const lastPushedLocationRef = useRef(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const markSynced = useCallback((reason, error = null, active = null) => {
    setTrackingState((prev) => ({
      ...prev,
      active: active ?? prev.active,
      lastSyncAt: new Date().toISOString(),
      lastSyncReason: reason,
      error,
    }))
  }, [])

  const clearSessionState = useCallback(() => {
    setSession(null)
    sessionRef.current = null
    setTrackingState(initialTrackingState())
  }, [])

  const syncNotificationInbox = useCallback(async () => {
    try {
      await refreshNotifications({ announce: true, silent: true, force: true })
    } catch {
      // notification refresh should never block the session workflow
    }
  }, [refreshNotifications])

  const refreshSession = useCallback(async () => {
    if (!user || !canUseOperationalMobile()) {
      clearSessionState()
      setLoading(false)
      return null
    }

    if (refreshInFlightRef.current) {
      return sessionRef.current
    }

    refreshInFlightRef.current = true

    try {
      const data = await getTodayRouteSession()
      const nextSession = data?.status === 'open' ? data : null
      setSession(nextSession)
      sessionRef.current = nextSession
      markSynced('session-refresh', null, Boolean(nextSession))
      return nextSession
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        active: false,
        error: error.response?.data?.message || error.message || 'Session indisponible.',
      }))
      return null
    } finally {
      refreshInFlightRef.current = false
      setLoading(false)
    }
  }, [canUseOperationalMobile, clearSessionState, markSynced, user])

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
      const nextSession = data?.status === 'open' ? data : null
      setSession(nextSession)
      sessionRef.current = nextSession
      markSynced('session-detail-refresh', null, Boolean(nextSession))
      return nextSession
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Détail session indisponible.',
      }))
      return activeSession
    } finally {
      refreshInFlightRef.current = false
    }
  }, [markSynced, refreshSession])

  const captureLocation = useCallback(async ({
    requestPermission = false,
    preferFresh = false,
  } = {}) => {
    if (!terrainTrackingEnabled) {
      setCurrentLocation(null)
      setLocationPermission('disabled')
      return null
    }

    try {
      let permission = await getForegroundPermission()

      if (permission?.status !== 'granted' && requestPermission) {
        permission = await requestForegroundPermission()
      }

      setLocationPermission(normalizeLocationPermissionStatus(permission))

      if (permission?.status !== 'granted') {
        return null
      }

      const location = await getCurrentLocation({
        preferCached: !preferFresh,
      })
      setCurrentLocation(location)
      return location
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error?.message || prev.error || 'Localisation indisponible.',
      }))
      return null
    }
  }, [terrainTrackingEnabled])

  const syncRemotePresence = useCallback(async (reason = 'presence-ping', mode = 'ping', options = {}) => {
    if (!user || !canUseOperationalMobile()) {
      return null
    }

    if (presenceInFlightRef.current) {
      return null
    }

    presenceInFlightRef.current = true

    try {
      const includeLocation = options.includeLocation !== false && terrainTrackingEnabled
      let locationPayload = options.locationPayload ?? null

      if (includeLocation && locationPayload == null) {
        const location = await captureLocation({
          requestPermission: options.requestPermission === true,
          preferFresh: options.preferFreshLocation === true || mode === 'report',
        })
        locationPayload = mapLocationToPayload(location)
        locationPayload ??= getRememberedLocationPayload()
      }

      if (mode === 'report') {
        await reportSession(locationPayload)
      } else {
        await pingSession(locationPayload)
      }

      markSynced(reason, null, Boolean(sessionRef.current?.id && sessionRef.current?.status === 'open'))
      return locationPayload
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Présence indisponible.',
      }))
      return null
    } finally {
      presenceInFlightRef.current = false
    }
  }, [canUseOperationalMobile, captureLocation, markSynced, terrainTrackingEnabled, user])

  const startSession = useCallback(async (payload = {}) => {
    setBusy(true)
    try {
      const data = await openRouteSession(payload)
      const nextSession = data?.status === 'open' ? data : null
      setSession(nextSession)
      sessionRef.current = nextSession
      markSynced('session-open', null, Boolean(nextSession))
      await syncNotificationInbox()
      return data
    } finally {
      setBusy(false)
    }
  }, [markSynced, syncNotificationInbox])

  const addLoad = useCallback(async (lines) => {
    if (!sessionRef.current?.id) {
      throw new Error('Aucune session ouverte.')
    }

    setBusy(true)
    try {
      const data = await addRouteSessionLoad(sessionRef.current.id, lines)
      const nextSession = data?.status === 'open' ? data : null
      setSession(nextSession)
      sessionRef.current = nextSession
      markSynced('route-load', null, Boolean(nextSession))
      await syncNotificationInbox()
      return data
    } finally {
      setBusy(false)
    }
  }, [markSynced, syncNotificationInbox])

  const recordReturns = useCallback(async (lines) => {
    if (!sessionRef.current?.id) {
      throw new Error('Aucune session ouverte.')
    }

    setBusy(true)
    try {
      const data = await recordRouteSessionReturns(sessionRef.current.id, lines)
      const nextSession = data?.status === 'open' ? data : null
      setSession(nextSession)
      sessionRef.current = nextSession
      markSynced('route-returns', null, Boolean(nextSession))
      await syncNotificationInbox()
      return data
    } finally {
      setBusy(false)
    }
  }, [markSynced, syncNotificationInbox])

  const endSession = useCallback(async (payload = {}) => {
    if (!sessionRef.current?.id) {
      throw new Error('Aucune session ouverte.')
    }

    setBusy(true)
    try {
      const data = await closeRouteSession(sessionRef.current.id, payload)
      clearSessionState()
      markSynced('session-close', null, false)
      await syncNotificationInbox()
      return data
    } finally {
      setBusy(false)
    }
  }, [clearSessionState, markSynced, syncNotificationInbox])

  const syncInteraction = useCallback(async (reason = 'interaction', options = {}) => {
    if (options.refreshSession) {
      await refreshSessionDetails()
      return
    }

    markSynced(reason, null, Boolean(sessionRef.current?.id && sessionRef.current?.status === 'open'))
  }, [markSynced, refreshSessionDetails])

  const captureCurrentLocation = useCallback(async () => {
    const location = await captureLocation({
      requestPermission: terrainTrackingEnabled,
      preferFresh: true,
    })
    const locationPayload = mapLocationToPayload(location) ?? getRememberedLocationPayload()

    if (locationPayload && sessionRef.current?.id && sessionRef.current?.status === 'open') {
      try {
        await storeRouteLocation(sessionRef.current.id, locationPayload)
        lastPushedLocationRef.current = locationPayload
      } catch (error) {
        setTrackingState((prev) => ({
          ...prev,
          error: error.response?.data?.message || error.message || 'Position GPS indisponible.',
        }))
      }
    }

    await syncRemotePresence('presence-manual', 'report', {
      includeLocation: terrainTrackingEnabled,
      locationPayload,
    })

    return location
  }, [captureLocation, syncRemotePresence, terrainTrackingEnabled])

  const stopLocationWatch = useCallback(() => {
    if (locationWatchRef.current?.remove) {
      locationWatchRef.current.remove()
    }

    locationWatchRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!user || !canUseOperationalMobile() || !terrainTrackingEnabled || appState !== 'active') {
      stopLocationWatch()
      return undefined
    }

    const startWatch = async () => {
      try {
        let permission = await getForegroundPermission()

        if (permission?.status !== 'granted') {
          permission = await requestForegroundPermission()
        }

        if (cancelled) {
          return
        }

        setLocationPermission(normalizeLocationPermissionStatus(permission))

        if (permission?.status !== 'granted') {
          stopLocationWatch()
          return
        }

        stopLocationWatch()

        const subscription = await watchLocation(async (location) => {
          if (cancelled) {
            return
          }

          setCurrentLocation(location)

          const payload = mapLocationToPayload(location)
          if (!payload) {
            return
          }

          const previousPayload = lastPushedLocationRef.current
          const distance = previousPayload ? distanceBetweenMeters(previousPayload, payload) : Number.POSITIVE_INFINITY
          const previousRecordedAt = previousPayload?.recorded_at ? new Date(previousPayload.recorded_at).getTime() : 0
          const currentRecordedAt = payload.recorded_at ? new Date(payload.recorded_at).getTime() : Date.now()

          if (previousPayload && distance < 5 && Math.abs(currentRecordedAt - previousRecordedAt) < (LIVE_TRACKING_INTERVAL_MS / 2)) {
            return
          }

          if (locationWatchSyncRef.current) {
            return
          }

          locationWatchSyncRef.current = true

          try {
            if (sessionRef.current?.id && sessionRef.current?.status === 'open') {
              await storeRouteLocation(sessionRef.current.id, payload)
              markSynced('location-watch', null, true)
            } else {
              await pingSession(payload)
              markSynced('location-watch-idle', null, false)
            }

            lastPushedLocationRef.current = payload
          } catch (error) {
            setTrackingState((prev) => ({
              ...prev,
              error: error.response?.data?.message || error.message || 'Position GPS indisponible.',
            }))
          } finally {
            locationWatchSyncRef.current = false
          }
        })

        if (!cancelled) {
          locationWatchRef.current = subscription
        } else {
          subscription?.remove?.()
        }
      } catch (error) {
        setTrackingState((prev) => ({
          ...prev,
          error: error?.message || prev.error || 'Localisation indisponible.',
        }))
      }
    }

    void startWatch()

    return () => {
      cancelled = true
      stopLocationWatch()
    }
  }, [appState, canUseOperationalMobile, markSynced, stopLocationWatch, terrainTrackingEnabled, user])

  useEffect(() => {
    if (!terrainTrackingEnabled) {
      setCurrentLocation(null)
      setLocationPermission('disabled')
      lastPushedLocationRef.current = null
      stopLocationWatch()
    }
  }, [stopLocationWatch, terrainTrackingEnabled])

  useEffect(() => {
    if (!user || !canUseOperationalMobile()) {
      clearSessionState()
      setCurrentLocation(null)
      setLocationPermission('disabled')
      setLoading(false)
      return
    }

    refreshSession()
    void syncRemotePresence('presence-report', 'report', {
      requestPermission: terrainTrackingEnabled,
    })
  }, [canUseOperationalMobile, clearSessionState, refreshSession, syncRemotePresence, terrainTrackingEnabled, user])

  useEffect(() => {
    if (!user || !canUseOperationalMobile()) {
      return undefined
    }

    const sub = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState)

      if (nextState === 'active') {
        if (sessionRef.current?.id) {
          refreshSessionDetails()
        } else {
          refreshSession()
        }

        void syncRemotePresence('presence-resume', 'report')
      }
    })

    return () => sub.remove()
  }, [canUseOperationalMobile, refreshSession, refreshSessionDetails, syncRemotePresence, user])

  useEffect(() => {
    if (!user || !canUseOperationalMobile()) {
      return undefined
    }

    const interval = setInterval(() => {
      if (AppState.currentState !== 'active') {
        return
      }

      if (sessionRef.current?.id) {
        refreshSessionDetails()
        return
      }

      refreshSession()
    }, REMOTE_SESSION_SYNC_MS)

    return () => clearInterval(interval)
  }, [canUseOperationalMobile, refreshSession, refreshSessionDetails, user])

  useEffect(() => {
    if (!user || !canUseOperationalMobile()) {
      return undefined
    }

    const interval = setInterval(() => {
      if (AppState.currentState !== 'active') {
        return
      }

      void syncRemotePresence('presence-heartbeat')
    }, REMOTE_PRESENCE_SYNC_MS)

    return () => clearInterval(interval)
  }, [canUseOperationalMobile, syncRemotePresence, user])

  const value = useMemo(() => ({
    session,
    loading,
    busy,
    currentLocation,
    locationPermission,
    trackingState,
    refreshSession,
    refreshSessionDetails,
    captureCurrentLocation,
    startSession,
    addLoad,
    recordReturns,
    endSession,
    syncInteraction,
  }), [
    addLoad,
    busy,
    captureCurrentLocation,
    currentLocation,
    endSession,
    loading,
    locationPermission,
    recordReturns,
    refreshSession,
    refreshSessionDetails,
    session,
    startSession,
    syncInteraction,
    trackingState,
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
