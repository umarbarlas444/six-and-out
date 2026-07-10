import { useState, useEffect } from 'react'

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)

  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e) }
    const onInstalled = () => { setInstalled(true); setDeferredPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferredPrompt(null)
  }

  return {
    canInstall: !!deferredPrompt,
    isIOS,
    isStandalone,
    installed,
    install,
  }
}
