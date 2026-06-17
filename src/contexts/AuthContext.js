import { AppState } from 'react-native'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import api, { clearToken, getToken, saveToken } from '../services/api'
import {
  getLocationValidationMessage,
  getCurrentLocation,
  getForegroundPermission,
  mapLocationToPayload,
  requestForegroundPermission,
} from '../services/locationService'
import { markSessionOffline, pingSession, reportSession } from '../services/sessionService'

const AuthContext = createContext(null)

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

  const refreshUser = useCallback(async () => {
    const response = await api.get('/auth/me')
    setUser(response.data)
    return response.data
  }, [])

  const capturePresenceLocation = useCallback(async (shouldRequest = false) => {
    if (!['admin', 'developer', 'rep'].includes(user?.role)) {
      return { payload: null, issue: null }
    }

    try {
      const permission = shouldRequest
        ? await requestForegroundPermission()
        : await getForegroundPermission()

      if (permission.status !== 'granted') {
        return { payload: null, issue: null }
      }

      const location = await getCurrentLocation()
      return {
        payload: mapLocationToPayload(location),
        issue: getLocationValidationMessage(location),
      }
    } catch {
      return { payload: null, issue: null }
    }
  }, [user?.role])

  const sendSessionReport = useCallback(async (reason = 'active') => {
    try {
      const { payload, issue } = await capturePresenceLocation(reason === 'login' || reason === 'resume')
      await reportSession(payload)
      setSessionStatus((prev) => ({
        ...prev,
        state: reason,
        lastReportAt: new Date().toISOString(),
        error: issue,
      }))
    } catch (error) {
      setSessionStatus((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Presence indisponible.',
      }))
    }
  }, [capturePresenceLocation])

  const sendSessionPing = useCallback(async () => {
    try {
      const { payload, issue } = await capturePresenceLocation(false)
      await pingSession(payload)
      setSessionStatus((prev) => ({
        ...prev,
        state: 'ping',
        lastPingAt: new Date().toISOString(),
        error: issue,
      }))
    } catch (error) {
      setSessionStatus((prev) => ({
        ...prev,
        error: error.response?.data?.message || error.message || 'Heartbeat indisponible.',
      }))
    }
  }, [capturePresenceLocation])

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

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        const token = await getToken()
        if (!token) {
          if (mounted) setUser(null)
          return
        }

        try {
          await refreshUser()
        } catch {
          await clearToken()
          if (mounted) setUser(null)
        }
      } catch {
        try {
          await clearToken()
        } catch {}
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
      return undefined
    }

    sendSessionReport('login')

    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        sendSessionPing()
      }
    }, 2 * 60 * 1000)

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

    await clearToken()
    setUser(null)
  }

  const value = useMemo(() => ({
    user,
    loading,
    sessionStatus,
    login,
    logout,
    refreshUser,
    isAdmin: () => ['admin', 'developer'].includes(user?.role),
    isRep: () => user?.role === 'rep',
    isStaff: () => ['admin', 'developer', 'comptable'].includes(user?.role),
    canManageAllCustomers: () => ['admin', 'developer', 'comptable'].includes(user?.role),
  }), [user, loading, sessionStatus, refreshUser])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
