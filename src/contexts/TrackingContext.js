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
} from '../services/routeSessionService'
import { pingSession, reportSession } from '../services/sessionService'
import { useNotifications } from './NotificationsContext'

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

export function TrackingProvider({ children }) {
  const { user, canUseOperationalMobile } = useAuth()
  const { refreshNotifications } = useNotifications()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [trackingState, setTrackingState] = useState(initialTrackingState)
  const sessionRef = useRef(null)
  const refreshInFlightRef = useRef(false)
  const presenceInFlightRef = useRef(false)

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

  const syncRemotePresence = useCallback(async (reason = 'presence-ping', mode = 'ping') => {
    if (!user || !canUseOperationalMobile()) {
      return null
    }

    if (presenceInFlightRef.current) {
      return null
    }

    presenceInFlightRef.current = true

    try {
      if (mode === 'report') {
        await reportSession()
      } else {
        await pingSession()
      }

      markSynced(reason, null, Boolean(sessionRef.current?.id && sessionRef.current?.status === 'open'))
      return null
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Présence indisponible.',
      }))
      return null
    } finally {
      presenceInFlightRef.current = false
    }
  }, [canUseOperationalMobile, markSynced, user])

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
    await syncRemotePresence('presence-manual', 'report')
    return null
  }, [syncRemotePresence])

  useEffect(() => {
    if (!user || !canUseOperationalMobile()) {
      clearSessionState()
      setLoading(false)
      return
    }

    refreshSession()
    void syncRemotePresence('presence-report', 'report')
  }, [canUseOperationalMobile, clearSessionState, refreshSession, syncRemotePresence, user])

  useEffect(() => {
    if (!user || !canUseOperationalMobile()) {
      return undefined
    }

    const sub = AppState.addEventListener('change', (nextState) => {
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
    currentLocation: null,
    locationPermission: 'disabled',
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
    endSession,
    loading,
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
