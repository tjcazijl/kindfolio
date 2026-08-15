import { registerSW } from 'virtual:pwa-register'

// Hoe vaak we bij een openstaande app naar een nieuwe versie kijken.
const CHECK_INTERVAL = 60 * 60 * 1000 // 1 uur

let klaar = false
let toepassen: (() => void) | null = null
const luisteraars = new Set<() => void>()

function meld() {
  for (const fn of luisteraars) fn()
}

/**
 * Registreert de service worker en houdt bij of er een nieuwe versie klaarstaat.
 *
 * Dit gebeurt bij het opstarten van de app en niet vanuit een component: ook een
 * uitgelogde gebruiker hoort de service worker te krijgen, anders werkt de app
 * niet offline. Er wordt nooit uit zichzelf herladen — dat zou een half
 * geschreven memo kunnen wegvagen.
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    klaar = true
    meld()
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // Een app die dagenlang open blijft staan laadt de pagina nooit opnieuw en
    // controleert dus ook nooit op updates. Daarom zelf kijken: elk uur, en
    // zodra de app weer op de voorgrond komt.
    const kijk = () => {
      registration.update().catch(() => {})
    }
    setInterval(kijk, CHECK_INTERVAL)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') kijk()
    })
  },
})

toepassen = () => {
  // true = wachtende versie activeren en de pagina herladen.
  updateSW(true)
}

/** Staat er een nieuwe versie klaar? */
export const updateKlaar = () => klaar

/** Voert de wachtende update door (herlaadt de pagina). */
export const voerUpdateDoor = () => toepassen?.()

/** Laat het weten zodra er een nieuwe versie klaarstaat. */
export function opUpdate(fn: () => void): () => void {
  luisteraars.add(fn)
  return () => luisteraars.delete(fn)
}
