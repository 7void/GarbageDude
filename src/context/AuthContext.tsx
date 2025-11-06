import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { watchAuth, login, logout } from '../services/auth'

interface AuthState {
  user: User | null
  loading: boolean
  claims: Record<string, any> | null
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
  hasRole(role: string): boolean
  refreshClaims(): Promise<void>
}

const Ctx = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: any }) {
  const [user, setUser] = useState<User | null>(null)
  const [claims, setClaims] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = watchAuth(async u => {
      setUser(u)
      if (u) {
        const res = await u.getIdTokenResult(true)
        setClaims(res.claims)
      } else {
        setClaims(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  async function doLogin(email: string, password: string) {
    await login(email, password)
  }

  async function doLogout() { await logout() }

  function hasRole(role: string) {
    if (!claims) return false
    if (claims.role && claims.role === role) return true
    if (Array.isArray((claims as any).roles) && (claims as any).roles.includes(role)) return true
    return false
  }

  async function refreshClaims() {
    if (!user) return
    const res = await user.getIdTokenResult(true)
    setClaims(res.claims)
  }
  return <Ctx.Provider value={{ user, loading, claims, login: doLogin, logout: doLogout, hasRole, refreshClaims }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be inside AuthProvider')
  return v
}
