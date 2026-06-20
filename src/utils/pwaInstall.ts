// Hulpfuncties rond "zet op beginscherm" (PWA-installatie).
// Android/Chrome geeft via `beforeinstallprompt` een échte installatieknop;
// iOS/Safari staat dat niet toe — daar tonen we alleen uitleg.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// Vroeg aanroepen (vóór React rendert): het event kan meteen bij laden vuren.
export function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function canPromptInstall(): boolean {
  return !!deferred
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}

export function onInstallChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// Draait de app al als geïnstalleerd icoon?
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  const ua = navigator.userAgent
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPad op iOS 13+ doet zich voor als Mac; herken aan touch.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}
