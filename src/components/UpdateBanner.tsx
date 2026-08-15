import { useEffect, useState } from 'react'
import { opUpdate, updateKlaar, voerUpdateDoor } from '../utils/swUpdate'

/**
 * Meldt onderin dat er een nieuwe versie klaarstaat. De gebruiker beslist zelf
 * wanneer die wordt doorgevoerd; er wordt nooit uit zichzelf herladen.
 */
export function UpdateBanner() {
  const [klaar, setKlaar] = useState(updateKlaar())
  const [bezig, setBezig] = useState(false)

  useEffect(() => opUpdate(() => setKlaar(true)), [])

  if (!klaar) return null

  return (
    <div className="update-banner" role="status">
      <span>Er staat een nieuwe versie klaar.</span>
      <button
        type="button"
        className="btn sm"
        disabled={bezig}
        onClick={() => {
          setBezig(true)
          voerUpdateDoor()
        }}
      >
        {bezig ? 'Bezig…' : 'Vernieuwen'}
      </button>
    </div>
  )
}
