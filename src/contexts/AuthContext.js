import { createContext, useContext, useEffect, useState } from 'react'
import api, { saveToken, clearToken, getToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session on app launch
    getToken().then(async (token) => {
      if (token) {
        try {
          const r = await api.get('/auth/me')
          setUser(r.data)
        } catch {
          await clearToken()
        }
      }
      setLoading(false)
    })
  }, [])

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password })
    await saveToken(r.data.token)
    setUser(r.data.user)
    return r.data.user
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch {}
    await clearToken()
    setUser(null)
  }

  const isAdmin = () => ['admin', 'developer'].includes(user?.role)
  const isRep   = () => user?.role === 'rep'

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isRep }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
