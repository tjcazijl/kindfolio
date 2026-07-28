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
    id: '2026-07-28',
    date: '2026-07-28',
    title: 'Aandachtspunten koppelen aan je agenda',
    items: [
      'Koppel bij een agenda-item de aandachtspunten waar je aan wilt werken. Staat een punt nog op “voor later”? Door het te koppelen schuift het vanzelf naar “nu oefenen”.',
      'In de agendaregel staat een 📌-knop naast de notitie-knop: één tik brengt je bij het aandachtspunt, de tweede vinkt het af.',
      'Op je beginscherm staat nu de planning van vandaag, onder de kinderen en de memo-knop. De kindkaartjes zijn wat compacter zodat alles op één scherm past.',
    ],
  },
  {
    id: '2026-07-26',
    date: '2026-07-26',
    title: 'Overzichtelijker: dagen, agenda & subcategorieën',
    items: [
      'In de tijdlijn staat nu een duidelijke dagkop boven de memo’s van die dag (“Vandaag”, “Gisteren” of bijv. “Woensdag 15 juli”), met een lijn ertussen.',
      'In de agenda staan afgelopen activiteiten onder een apart, ingeklapt “Afgelopen”-kopje — zo begin je meteen bij vandaag, maar blijft het verleden vindbaar.',
      'Bij leermiddelen en agenda-items kun je nu ook subcategorieën kiezen (bijv. Taal → Lezen), net als bij een memo.',
    ],
  },
  {
    id: '2026-07-24',
    date: '2026-07-24',
    title: 'Agenda: verleden blijft staan & categorieën',
    items: [
      'Agenda-items verdwijnen niet meer meteen na de dag: ze blijven een week staan, zodat je rustig nog een memo kunt schrijven.',
      'Met de nieuwe 📝-knop in de agenda maak je direct een voorgevulde memo (datum, kind en titel staan al klaar).',
      'Voeg vakgebieden toe aan een agenda-item; die worden dan ook meteen ingevuld in de memo. Zo klik je bij een herhalende activiteit alleen nog “notitie maken”, schrijft kort hoe het ging, en klaar.',
    ],
  },
  {
    id: '2026-07-22c',
    date: '2026-07-22',
    title: 'Boeken bijhouden: status, gelezen-lijst & samenvatting',
    items: [
      'Wissel de status van een boek met één tik: Te lezen / Aan het lezen / Gelezen (leerboeken: In gebruik / Afgerond).',
      'Leg vast wanneer je een boek gelezen hebt; gelezen boeken staan apart onder een inklapbaar deel — overzichtelijker.',
      'Gelezen boeken staan niet meer tussen de keuzes als je een memo maakt.',
      'Bij een samenvatting kun je de gelezen boeken uit die periode onderaan toevoegen.',
    ],
  },
  {
    id: '2026-07-22b',
    date: '2026-07-22',
    title: 'Leermiddelen slimmer & agenda ordenen',
    items: [
      'Koppel leermiddelen aan een memo: kies bij het schrijven welke boeken, sites of video’s je gebruikte.',
      'Boeken zijn nu gesplitst in leerboeken en leesboeken — leesboeken lopen van te lezen → bezig → uit, leerboeken van in gebruik → afgerond.',
      'Geef een leermiddel meerdere vakgebieden.',
      'Agenda-items zonder tijd kun je nu handmatig omhoog/omlaag zetten, zodat een later toegevoegd item op de juiste plek komt.',
    ],
  },
  {
    id: '2026-07-22',
    date: '2026-07-22',
    title: 'Samenvattingen bewerken & foto’s erbij',
    items: [
      'Een bewaarde samenvatting kun je nu zelf bijschaven met de knop “Bewerken”.',
      'Bij het maken kies je of de foto’s uit die periode mee mogen — ze komen dan bij de samenvatting én in de PDF.',
      'Je eigen berichten op het feedbackprikbord kun je nu bewerken of verwijderen.',
    ],
  },
  {
    id: '2026-07-19b',
    date: '2026-07-19',
    title: 'Leermiddelen 📚',
    items: [
      'Nieuwe Leermiddelen-sectie (via het boek-icoon rechtsboven op je beginscherm): bewaar je boeken, websites, video’s en apps op één plek — je eigen database.',
      'Filter op type; “Boeken” wordt zo je eigen boekenlijst, met status (te lezen / bezig / gelezen) en auteur.',
      'Koppel een leermiddel aan een vakgebied en optioneel aan een kind.',
    ],
  },
  {
    id: '2026-07-19',
    date: '2026-07-19',
    title: 'Aandachtspunten & reflectie ✍️',
    items: [
      'Bij een memo kun je nu optioneel “Hoe ging het?” invullen: wat je kind ervan vond (met een emoji), een aandachtspunt (waar het nog moeite mee heeft) en iets voor later of verdieping.',
      'Aandachtspunten komen samen op een overzicht per kind — via de nieuwe knop op de kindpagina — zodat je er gericht mee kunt oefenen en ze kunt afvinken als ze onder de knie zijn.',
      'De kindpagina is opgeruimd: nieuwe memo, vakgebieden en aandacht staan nu overzichtelijk bovenaan, met de memo’s direct daaronder.',
    ],
  },
  {
    id: '2026-07-16',
    date: '2026-07-16',
    title: 'Reageren op updates & memo delen met meer kinderen',
    items: [
      'Geef een 👍 en plaats een reactie onder de updates op deze pagina.',
      'Een bestaande memo kun je nu in de bewerkmodus ook aan een ander kind toevoegen — er wordt dan een kopie voor dat kind gemaakt.',
    ],
  },
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
