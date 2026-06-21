import { AppState } from 'react-native'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api, {
  clearStoredUser,
  clearToken,
  getStoredUser,
  getToken,
  saveStoredUser,
  saveToken,
} from '../services/api'
import {
  getLocationValidationMessage,
  getCurrentLocation,
  getForegroundPermission,
  getRememberedLocationPayload,
  mapLocationToPayload,
  requestForegroundPermission,
} from '../services/locationService'
import { markSessionOffline, pingSession, reportSession } from '../services/sessionService'

const AuthContext = createContext(null)
const PRESENCE_HEARTBEAT_MS = 20 * 1000
const INTERACTION_PING_GAP_MS = 8 * 1000

function initialSessionStatus() {
  return {
    state: 'idle',
    lastReportAt: null,
    lastPingAt: null,
    lastOfflineAt: null,
    error: null,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionStatus, setSessionStatus] = useState(initialSessionStatus)
  const appStateRef = useRef(AppState.currentState)
  const presenceRef = useRef({
    pingInFlight: false,
    reportInFlight: false,
    lastPingAtMs: 0,
  })

  const refreshUser = useCallback(async () => {
    const response = await api.get('/auth/me')
    setUser(response.data)
    await saveStoredUser(response.data)
    return response.data
  }, [])

  const capturePresenceLocation = useCallback(async ({ shouldRequest = false, forceFresh = false } = {}) => {
    if (!['admin', 'developer', 'rep'].includes(user?.role)) {
      return { payload: null, issue: null }
    }

    const cachedPayload = getRememberedLocationPayload()
    if (!forceFresh && cachedPayload) {
      return { payload: cachedPayload, issue: null }
    }

    try {
      const permission = shouldRequest
        ? await requestForegroundPermission()
        : await getForegroundPermission()

      if (permission.status !== 'granted') {
        return { payload: cachedPayload, issue: null }
      }

      const location = await getCurrentLocation()
      return {
        payload: mapLocationToPayload(location) || cachedPayload,
        issue: getLocationValidationMessage(location),
      }
    } catch {
      return { payload: cachedPayload, issue: null }
    }
  }, [user?.role])

  const sendSessionReport = useCallback(async (reason = 'active') => {
    if (!user?.id || presenceRef.current.reportInFlight) {
      return false
    }

    presenceRef.current.reportInFlight = true

    try {
      const { payload, issue } = await capturePresenceLocation({
        shouldRequest: reason === 'login' || reason === 'resume',
        forceFresh: reason === 'login' || reason === 'resume',
      })

      await reportSession(payload)
      setSessionStatus((prev) => ({
        ...prev,
        state: reason,
        lastReportAt: new Date().toISOString(),
        error: issue,
      }))
      return true
    } catch (error) {
      setSessionStatus((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Présence indisponible.',
      }))
      return false
    } finally {
      presenceRef.current.reportInFlight = false
    }
  }, [capturePresenceLocation, user?.id])

  const sendSessionPing = useCallback(async ({
    reason = 'heartbeat',
    force = false,
    includeLocation = false,
  } = {}) => {
    if (!user?.id || presenceRef.current.pingInFlight) {
      return false
    }

    const now = Date.now()
    if (!force && now - presenceRef.current.lastPingAtMs < INTERACTION_PING_GAP_MS) {
      return false
    }

    presenceRef.current.pingInFlight = true

    try {
      const payload = includeLocation
        ? (await capturePresenceLocation({
          shouldRequest: false,
          forceFresh: reason === 'heartbeat',
        })).payload
        : getRememberedLocationPayload()

      await pingSession(payload)
      presenceRef.current.lastPingAtMs = now

      setSessionStatus((prev) => ({
        ...prev,
        state: reason,
        lastPingAt: new Date().toISOString(),
        error: null,
      }))
      return true
    } catch (error) {
      setSessionStatus((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Heartbeat indisponible.',
      }))
      return false
    } finally {
      presenceRef.current.pingInFlight = false
    }
  }, [capturePresenceLocation, user?.id])

  const sendSessionOffline = useCallback(async (reason = 'offline') => {
    try {
      await markSessionOffline()
      setSessionStatus((prev) => ({
        ...prev,
        state: reason,
        lastOfflineAt: new Date().toISOString(),
        error: null,
      }))
    } catch (error) {
      setSessionStatus((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Statut hors ligne indisponible.',
      }))
    }
  }, [])

  const touchSession = useCallback((reason = 'interaction', options = {}) => (
    sendSessionPing({
      reason,
      force: options.force ?? false,
      includeLocation: options.includeLocation ?? false,
    })
  ), [sendSessionPing])

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        const token = await getToken()
        if (!token) {
          if (mounted) setUser(null)
          return
        }

        const cachedUser = await getStoredUser()
        if (cachedUser && mounted) {
          setUser(cachedUser)
          setLoading(false)
        }

        try {
          await refreshUser()
        } catch {
          await Promise.allSettled([clearToken(), clearStoredUser()])
          if (mounted) setUser(null)
        }
      } catch {
        await Promise.allSettled([clearToken(), clearStoredUser()])
        if (mounted) setUser(null)
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [refreshUser])

  useEffect(() => {
    if (!user?.id) {
      setSessionStatus(initialSessionStatus())
      presenceRef.current.lastPingAtMs = 0
      return undefined
    }

    sendSessionReport('login')

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        sendSessionPing({ reason: 'heartbeat', includeLocation: true })
      }
    }, PRESENCE_HEARTBEAT_MS)

    const sub = AppState.addEventListener('change', (nextState) => {
      const previous = appStateRef.current
      appStateRef.current = nextState

      if ((previous === 'inactive' || previous === 'background') && nextState === 'active') {
        sendSessionReport('resume')
      }

      if (nextState === 'background') {
        sendSessionOffline('background')
      }
    })

    return () => {
      clearInterval(interval)
      sub.remove()
    }
  }, [user?.id, sendSessionOffline, sendSessionPing, sendSessionReport])

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password })
    await saveToken(response.data.token)
    await saveStoredUser(response.data.user)
    setUser(response.data.user)
    return response.data.user
  }

  const logout = async () => {
    try {
      await sendSessionOffline('logout')
    } catch {}

    try {
      await api.post('/auth/logout')
    } catch {}

    await Promise.allSettled([clearToken(), clearStoredUser()])
    setUser(null)
  }

  const value = useMemo(() => ({
    user,
    loading,
    sessionStatus,
    login,
    logout,
    refreshUser,
    touchSession,
    isAdmin: () => ['admin', 'developer'].includes(user?.role),
    isRep: () => user?.role === 'rep',
    isStaff: () => ['admin', 'developer', 'comptable'].includes(user?.role),
    canManageAllCustomers: () => ['admin', 'developer', 'comptable'].includes(user?.role),
  }), [user, loading, sessionStatus, refreshUser, touchSession])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
