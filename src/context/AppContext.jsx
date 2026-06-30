import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { initDb, getStatuses } from '../db.js'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [dbReady, setDbReady] = useState(false)
  const [dbError, setDbError] = useState(null)
  const [statuses, setStatuses] = useState([])
  const initializedRef = useRef(false)

  const refreshStatuses = useCallback(async () => {
    const s = await getStatuses()
    setStatuses(s)
  }, [])

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    initDb()
      .then(async () => {
        await refreshStatuses()
        setDbReady(true)
      })
      .catch((e) => setDbError(e.message))
  }, [refreshStatuses])

  return (
    <AppContext.Provider value={{ dbReady, dbError, statuses, refreshStatuses }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
