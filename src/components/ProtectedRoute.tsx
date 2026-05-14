import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAuthenticated(!!session)
        setLoading(false)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-page">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return authenticated ? <>{children}</> : <Navigate to="/login" replace />
}
