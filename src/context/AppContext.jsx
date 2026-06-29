import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { initDb, getStatuses, getPendingCount } from '../db.js'
import { runSync, pullFromServer, registerBackgroundSync } from '../sync.js'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [dbReady, setDbReady] = useState(false)
  const [dbError, setDbError] = useState(null)
  const [statuses, setStatuses] = useState([])
  const [syncStatus, setSyncStatus] = useState('synced') // 'synced'|'pending'|'syncing'|'error'|'offline'
  const [pendingCount, setPendingCount] = useState(0)
  const syncTimerRef = useRef(null)
  const initializedRef = useRef(false)

  const refreshStatuses = useCallback(async () => {
    const s = await getStatuses()
    setStatuses(s)
  }, [])

  const refreshPending = useCallback(async () => {
    const c = await getPendingCount()
    setPendingCount(c)
    if (c > 0 && syncStatus === 'synced') setSyncStatus('pending')
    if (c === 0) setSyncStatus('synced')
  }, [syncStatus])

  const sync = useCallback(async () => {
    setSyncStatus('syncing')
    const { failed } = await runSync(setSyncStatus)
    await refreshPending()
    return failed
  }, [refreshPending])

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    initDb()
      .then(async () => {
        setDbReady(true)
        await refreshStatuses()
        await refreshPending()
        registerBackgroundSync()
        // Pull server data first, then push local queue
        await pullFromServer()
        await refreshStatuses()
        runSync(setSyncStatus).then(refreshPending)
      })
      .catch((e) => setDbError(e.message))
  }, [refreshStatuses, refreshPending])

  // Re-sync when coming back online
  useEffect(() => {
    const handler = () => sync()
    window.addEventListener('online', handler)
    return () => window.removeEventListener('online', handler)
  }, [sync])

  // Poll pending count every 10s in case background changes happen
  useEffect(() => {
    if (!dbReady) return
    syncTimerRef.current = setInterval(refreshPending, 10000)
    return () => clearInterval(syncTimerRef.current)
  }, [dbReady, refreshPending])

  return (
    <AppContext.Provider value={{
      dbReady, dbError,
      statuses, refreshStatuses,
      syncStatus, pendingCount,
      sync, refreshPending,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
