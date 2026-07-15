// Gebruiksvriendelijke "Wat is er nieuw"-lijst. Nieuwste bovenaan.
// Voeg bij elke release een nieuw item bovenaan toe.

export interface Update {
  id: string // uniek, bepaalt ook de "gezien"-status (gebruik de datum)
  date: string // YYYY-MM-DD
  title: string
  items: string[]
}

export const CHANGELOG: Update[] = [
  {
    id: '2026-07-15',
    date: '2026-07-15',
    title: 'Agenda toegevoegd 📅',
    items: [
      'Plan uitjes, taken en lessen in de nieuwe agenda — te openen via het kalender-icoon rechtsboven op je beginscherm.',
      'Herhalingen: dagelijks, wekelijks (met keuze van weekdagen, bijv. elke woensdag en vrijdag), maandelijks of jaarlijks, met een optionele einddatum.',
      'Koppel een item aan één of meer kinderen, of laat het gezinsbreed.',
      'Vanuit een gepland item maak je met één tik een memo — datum en kind staan al ingevuld.',
      'Bij het maken van een memo staan de foto’s nu in een raster dat je kunt slepen om te herordenen.',
    ],
  },
  {
    id: '2026-07-13',
    date: '2026-07-13',
    title: 'Vakgebieden slimmer & extra veilig',
    items: [
      'Subcategorieën kun je nu ook per kind instellen (bijv. bij Taal alleen voor Fien een “AVI”).',
      'Voeg je een vakgebied toe in de instellingen, dan verschijnt dat nu bij álle kinderen.',
      '“Alle gegevens verwijderen” staat nu apart onderaan en vraagt je e-mailadres ter bevestiging — zo gebeurt dat niet meer per ongeluk.',
    ],
  },
  {
    id: '2026-07-11',
    date: '2026-07-11',
    title: 'Nieuw uiterlijk en handige extra’s',
    items: [
      'Nieuw Kindfolio-icoon op je beginscherm. 🎨',
      'De tijdlijn ziet er nu uit als een echte feed: grotere foto’s in een carousel, een 👍-knop en reacties direct onder elke memo.',
      'Lange memo’s worden ingeklapt met een “Meer weergeven”-knop.',
      'Exporteer je portfolio als PDF — met keuze van kinderen en periode.',
      'Subcategorieën per vakgebied (bijv. Taal → woordenschat, spelling).',
      'Je krijgt nu een mailtje als er op jouw feedback gereageerd wordt.',
    ],
  },
  {
    id: '2026-07-09',
    date: '2026-07-09',
    title: 'Betere dictafoon',
    items: [
      'Inspreken werkt nu in álle browsers (niet meer alleen Chrome en Safari).',
      'Twee manieren: “nauwkeurig” (omgezet op onze eigen server) of “live” (je ziet de tekst terwijl je praat).',
      'Herkent de namen van je kinderen en je vakgebieden beter.',
    ],
  },
  {
    id: '2026-07-03',
    date: '2026-07-03',
    title: 'Extra beveiliging',
    items: [
      'Foto’s worden nu versleuteld opgeslagen op de server.',
    ],
  },
  {
    id: '2026-06-23',
    date: '2026-06-23',
    title: 'Samenvattingen & export',
    items: [
      'Ook zonder AI kun je een samenvatting maken: alle memo’s netjes chronologisch onder elkaar.',
      'Exporteer al je gegevens én foto’s in één ZIP-bestand.',
    ],
  },
  {
    id: '2026-06-22',
    date: '2026-06-22',
    title: 'Kleine verbeteringen',
    items: [
      'Sla een memo op als concept om later af te maken.',
      'Vul je eigen naam in op het feedbackprikbord.',
      'Veiliger verwijderen, met een duidelijke bevestiging.',
    ],
  },
  {
    id: '2026-06-21',
    date: '2026-06-21',
    title: 'Feedback & filters',
    items: [
      'Filter samenvattingen op vakgebied (bijv. alles van Rekenen in mei).',
      'Mailmeldingen bij nieuwe reacties en verwerkte feedback.',
      'Betere e-mailbezorging, zodat berichten minder snel in de spam belanden.',
    ],
  },
  {
    id: '2026-06-20',
    date: '2026-06-20',
    title: 'Kindfolio is live! 🎉',
    items: [
      'De eerste versie van Kindfolio: memo’s per kind, delen met gezinsleden en een lerares, en een feedbackprikbord.',
    ],
  },
]

export const LATEST_UPDATE_ID = CHANGELOG[0]?.id ?? ''
const SEEN_KEY = 'kindfolio-updates-seen'

export function latestSeenUpdate(): string {
  try {
    return localStorage.getItem(SEEN_KEY) || ''
  } catch {
    return ''
  }
}
export function markUpdatesSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, LATEST_UPDATE_ID)
  } catch {
    /* localStorage niet beschikbaar */
  }
}
