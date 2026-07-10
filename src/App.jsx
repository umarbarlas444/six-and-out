import { useState } from 'react'
import { AppProvider, useApp } from '@/context/AppContext.jsx'
import { ThemeProvider } from '@/context/ThemeContext.jsx'
import Header from '@/components/Header.jsx'
import Home from '@/screens/Home.jsx'
import StatusMgmt from '@/screens/StatusMgmt.jsx'
import BookingForm from '@/screens/BookingForm.jsx'
import SearchModal from '@/screens/SearchModal.jsx'
import { Loader2 } from 'lucide-react'

function Shell() {
  const { dbReady, dbError } = useApp()
  const [screen, setScreen] = useState('home')
  const [modal, setModal] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const openAdd    = (prefill = {}) => setModal({ type: 'add', prefill })
  const openEdit   = (id) => setModal({ type: 'edit', id })
  const openSearch = () => setModal({ type: 'search' })
  const closeModal = () => setModal(null)
  const refresh    = () => setRefreshKey((k) => k + 1)

  if (dbError) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-lg font-semibold">Failed to open database</p>
      <p className="text-sm text-muted-foreground max-w-sm">{dbError}</p>
      <p className="text-xs text-muted-foreground">Requires Chrome 102+, Firefox 111+, or Safari 16.4+</p>
    </div>
  )

  if (!dbReady) return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col">
      <Header screen={screen} onNavigate={setScreen} onSearch={openSearch} />

      <main className="mx-auto w-full max-w-screen-xl flex-1 px-4 py-8 sm:px-6">
        {screen === 'home' && (
          <Home
            onAdd={openAdd}
            onEdit={openEdit}
            refreshKey={refreshKey}
          />
        )}
        {screen === 'settings' && <StatusMgmt />}
      </main>

      {modal?.type === 'add' && (
        <BookingForm prefill={modal.prefill} onClose={closeModal} onSaved={refresh} />
      )}
      {modal?.type === 'edit' && (
        <BookingForm bookingId={modal.id} onClose={closeModal} onSaved={refresh} />
      )}
      {modal?.type === 'search' && (
        <SearchModal
          onClose={closeModal}
          onAddBooking={(prefill) => { closeModal(); openAdd(prefill) }}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ThemeProvider>
  )
}
