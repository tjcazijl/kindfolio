# Briefing landingspagina Kindfolio

Alles wat nodig is om `kindfolio.nl` te bouwen. Feiten in dit document komen uit de
codebase (v0.19.0); alles onder **Aannames** en **Open vragen** moet je nog bevestigen.

---

## 1. Het product in het kort

**Kindfolio** — een mobiele webapp (PWA) voor thuisonderwijs. Ouders leggen per kind
dagelijks een korte memo vast (tekst, foto's, ingesproken), en stellen daar per week,
maand of kwartaal een portfolio-samenvatting van samen.

- Live sinds **20 juni 2026**, nu versie **0.19.0** (± 15 releases in 7 weken)
- App draait op **app.kindfolio.nl**; `kindfolio.nl` is nog leeg → dáár komt de landing
- Open source, **AGPL-3.0**, repo: `github.com/tjcazijl/kindfolio`
- Momenteel **besloten bèta**: registreren vereist een uitnodigingscode
- Contact-adres dat al in de app staat: `info@kindfolio.nl`

**Positioneringszin (concept):**
> Kindfolio is het logboek voor thuisonderwijs: leg elke dag in een minuut vast wat je
> kind heeft gedaan, en houd er zonder extra werk een portfolio aan over.

---

## 2. Doel van de pagina

Eén primaire actie. Kies er één (zie Open vragen):

| Optie | CTA | Wanneer |
|---|---|---|
| A. Wachtlijst (aanbevolen zolang bèta) | "Zet me op de wachtlijst" (e-mail) | Nu |
| B. Direct registreren | "Maak een account" → `app.kindfolio.nl` | Zodra bèta open is |
| C. Zelf hosten | "Bekijk op GitHub" | Altijd secundair |

Secundaire acties: inloggen (bestaande gebruikers), GitHub, privacy/uitleg.

---

## 3. Doelgroep

**Primair:** ouders die thuisonderwijs geven aan één of meer kinderen (basisschool-
leeftijd), Nederlandstalig, gebruiken vooral hun **telefoon**, vaak twee ouders die
allebei bijhouden.

**Secundair (meelezers, geen kopers maar wel beslissers in het gesprek):**
- een begeleider/leerkracht die meeleest en reageert
- (mogelijk) een inspectie of gemeente die om onderbouwing vraagt

**Pijn die ze herkennen:**
1. "Ik weet dat we van alles doen, maar ik leg niets vast."
2. Aan het eind van de maand/het kwartaal moet er een verslag komen → paniek en
   reconstructiewerk.
3. Losse WhatsApp-berichten, foto's in de camerarol, schriftjes: niets bij elkaar.
4. De andere ouder ziet niet wat er die dag gebeurd is.
5. Bestaande tools zijn schoolsystemen (cijfers, roosters, klassen) — dat past niet.

**Emotionele lading:** trots op wat het kind doet + lichte onzekerheid of het "genoeg"
is. De pagina moet geruststellen, niet moraliseren of controle-angst aanwakkeren.

---

## 4. Kernboodschap & bewijs

### De vier pijlers

1. **In een minuut vastgelegd** — memo per kind: typen, foto erbij, of gewoon
   inspreken. Werkt op de telefoon, ook offline.
2. **Automatisch een portfolio** — kies een week/maand/kwartaal, krijg een lopend
   verhaal per kind, met foto's en gelezen boeken; te bewerken en te printen als PDF.
3. **Samen bijhouden** — beide ouders bewerken, een begeleider leest mee en reageert.
4. **Van jou, niet van een platform** — open source, zelf te hosten, foto's versleuteld,
   AI optioneel en uit te zetten.

### Harde privacy-claims (allemaal waar, mogen zo op de pagina)

- Foto's staan **versleuteld op schijf** (AES-256-GCM).
- **EXIF-data (o.a. GPS) wordt al in de browser gestript** vóór het uploaden.
- Ingesproken audio wordt **op de eigen server** omgezet naar tekst (whisper.cpp) en
  daarna **direct verwijderd** — geen externe transcriptiedienst.
- De AI-samenvatting is **optioneel en uit te zetten**. Staat die aan, dan gaan alleen
  de **notitieteksten** van de gekozen periode naar Anthropic — **geen foto's**, geen
  accountgegevens. De API-sleutel staat uitsluitend server-side.
- Data per account gescheiden; referentie-deployment staat **in de EU**.
- **Exporteer alles** (gegevens + foto's) in één ZIP — geen lock-in.
- **AGPL-3.0**: zelf te hosten, aan te passen; afgeleiden blijven open.

### Bezwaren & antwoorden (bouw deze in de FAQ)

| Bezwaar | Antwoord |
|---|---|
| "Weer een abonnement?" | → afhankelijk van model, zie Open vragen |
| "Ik wil geen AI bij mijn kind" | AI staat standaard uit te zetten; zonder AI krijg je alle memo's netjes chronologisch. Foto's gaan nooit naar AI. |
| "Waar staan mijn foto's?" | Versleuteld op een server in de EU, of op je eigen server — het is open source. |
| "Ik houd dit toch niet vol" | Een memo is één zin en één foto. Inspreken kan ook. |
| "Wat als jullie stoppen?" | Alles exporteerbaar in ZIP; broncode staat open onder AGPL. |
| "Werkt het op mijn iPhone?" | PWA, installeerbaar als app-icoon, werkt offline. Inspreken via opname werkt in alle browsers. |

---

## 5. Functies (complete lijst — kies hieruit voor de featureblokken)

**Kinderen & memo's**
- Meerdere kinderen, elk met eigen kleur, geboortedatum en vakgebieden
- Dagelijkse memo per kind: tekst, foto's, datum
- Eén memo in één keer voor meerdere kinderen
- 15 vakgebieden (Taal, Rekenen, Lezen, Schrijven, Natuur, Algemene wetenschap,
  Technisch, Geschiedenis, Aardrijkskunde, Creatief, Muziek, Bewegen, Sociaal,
  Uitstapje, Overig) + eigen vakgebieden en **subcategorieën** (bijv. Taal → Lezen)
- Foto's toevoegen (camera/galerij), automatisch verkleind; max 20 MB per foto
- **Inspreken**: opname → transcriptie naar tekst
- Concept opslaan om later af te maken
- Tijdlijn per kind met dagkoppen ("Vandaag", "Gisteren", "Woensdag 15 juli")
- Duimpjes/likes onder een memo, inclusief wie het leuk vindt

**Reflectie**
- "Hoe ging het?" — stemming van het kind (leuk / prima / ging wel / lastig)
- **Aandachtspunten** per kind: waar het nog moeite mee heeft, met status
  nu oefenen / voor later / afgevinkt
- Aandachtspunten koppelen aan agenda-items

**Agenda**
- Activiteiten met type **les / uitje / taak**, eigen kleur per type
- Herhaling: dagelijks/wekelijks/maandelijks/jaarlijks, elke N, weekdagen, einddatum
- Per kind of gezinsbreed, met vakgebieden
- Vanuit een agenda-item met één tik een voorgevulde memo maken
- Afgelopen items blijven een week zichtbaar, daarna ingeklapt onder "Afgelopen"
- Planning van vandaag op het beginscherm

**Leermiddelen**
- Eigen database: leerboeken, leesboeken, websites, video's, apps, overig
- Status: te lezen / bezig / gelezen (leesboeken), in gebruik / afgerond (leerboeken)
- Auteur, URL, notities, vakgebieden, per kind of gezinsbreed
- Leermiddelen koppelen aan een memo; gelezen boeken toevoegen aan een samenvatting

**Samenvattingen / portfolio**
- Periode: week, maand, kwartaal of eigen datumreeks; per kind; filterbaar op vakgebied
- Met of zonder AI (AI = Claude, server-side)
- Foto's uit de periode optioneel mee; gelezen boeken onderaan
- Bewaarde samenvattingen, gegroepeerd in tabjes per soort periode
- Zelf bij te schaven en te printen/PDF'en

**Samen & delen**
- Rollen: **eigenaar**, **gezinslid** (mag bewerken), **meelezer** (leest en reageert)
- Uitnodigen per e-mail; reacties op memo's en samenvattingen; mailmeldingen
- Accountwisselaar als je bij meerdere portfolio's hoort

**Overig**
- Feedbackprikbord met stemmen en status
- "Wat is er nieuw"-pagina met changelog
- Export van alle gegevens + foto's als ZIP
- PWA: installeerbaar, offline, portrait, autoupdate
- Beheerpagina voor de beheerder (accounts per portfolio, rol, laatst gezien)

---

## 6. Merk & visuele identiteit

**Logo:** `public/icon-512.png` — een "K" opgebouwd uit gestapelde fotokaartjes, een
gouden ster en een groen blaadje/plantje, op crème. Zacht, met ronde hoeken, geen
harde randen. Gebruik dit als vertrekpunt; er is nog geen woordmerk.

**Kleuren (letterlijk uit `src/index.css` — houd de landing identiek aan de app):**

| Token | Hex | Gebruik |
|---|---|---|
| `--bg` | `#f7f5ef` | achtergrond (warm crème) |
| `--card` | `#ffffff` | kaarten |
| `--ink` | `#23291f` | tekst |
| `--muted` | `#6b7363` | bijschriften |
| `--green` | `#2f6f4f` | accent, knoppen, theme-color |
| `--green-dark` | `#245a40` | hover/actief |
| `--line` | `#e3e0d6` | randen |
| `--danger` | `#c2553b` | waarschuwing |
| les / uitje / taak | `#35618e` / `#a86a15` / `#b0492f` | agendacategorieën |
| kindkleuren | `#2f6f4f #c2553b #3b6fc2 #9b51b0 #d59a18 #2a9d8f #e76f51 #5a6f9b` | accentjes/illustratie |

Radius `14px`. De app gebruikt de systeem-fontstack; op de landing mag een echte
letter (bijv. een warme sans of een zachte serif voor koppen), maar houd kleur,
radius en rust gelijk aan de app.

**Toon van de tekst:** Nederlands, `je`-vorm, warm en nuchter, korte zinnen. Zoals de
changelog al klinkt: *"Zet je een boek op 'gelezen', dan kun je het daarna nog een paar
dagen aan een memo koppelen."* Geen marketing-superlatieven, geen "revolutionair",
geen schuldgevoel-copy ("leg je je kind niet tekort?"). Emoji spaarzaam — de app doet
dat ook (📚 ✨ 📝 📌).

---

## 7. Voorgestelde paginastructuur

1. **Hero** — logo, kop, één zin, primaire CTA, telefoon-mockup met de tijdlijn.
   Kop-concept: *"Leg vast wat je kind vandaag geleerd heeft — in één minuut."*
   Sub: *"Kindfolio is het logboek voor thuisonderwijs. Schrijf, spreek of fotografeer
   het moment. Aan het eind van de maand staat je portfolio er al."*
2. **Herkenning** — 3 korte pijnpunten ("Je doet van alles, maar legt niets vast…")
3. **Hoe het werkt** — 3 stappen: *Leg vast → Verzamel → Vat samen*
4. **Featureblokken** — 4–5 stuks met screenshot: memo & inspreken · samenvatting/
   portfolio · agenda & aandachtspunten · leermiddelen/boekenlijst · samen bijhouden
5. **Privacy & open source** — de harde claims uit §4, plus GitHub-link en AGPL
6. **Wat is er nieuw** — bewijs dat het leeft (laatste 3 changelog-items, evt. uit
   `src/data/changelog.ts` gegenereerd)
7. **FAQ** — de bezwaartabel uit §4
8. **Slot-CTA** — herhaling van de primaire actie
9. **Footer** — `info@kindfolio.nl`, GitHub, privacyverklaring, licentie

---

## 8. Technisch

- **Domein:** `kindfolio.nl` + `www` staan op `91.184.0.200` (nog geen site, geen
  HTTPS); `app.kindfolio.nl` op `178.104.39.203` en is live. De landing komt op de root,
  de app blijft op `app.`.
- **Bouw hem statisch.** Losse map met HTML/CSS (of Astro), geen build-zwaarte. Kan
  naast de app door dezelfde nginx geserveerd worden, of los (Netlify/Cloudflare Pages).
  Zet 'm niet in de React-app: die is een ingelogde PWA en cachet agressief.
- **Meta/SEO:**
  - `<html lang="nl">`, title bijv. `Kindfolio — logboek en portfolio voor thuisonderwijs`
  - `theme-color: #2f6f4f`, og:image met het logo + een schermafbeelding
  - Zoekwoorden om op te mikken: *thuisonderwijs portfolio, logboek thuisonderwijs,
    portfolio bijhouden thuisonderwijs, huisonderwijs app, homeschool portfolio
    Nederlands, verslag thuisonderwijs maken*
  - `SoftwareApplication`-schema + `FAQPage`-schema voor de FAQ
- **Analytics:** privacyvriendelijk of geen (past bij de propositie). Plausible/Umami
  self-hosted, of alleen wachtlijst-inschrijvingen tellen.
- **Wachtlijstformulier:** kan een klein endpoint op de bestaande backend worden
  (die draait al met SendGrid), dan blijft alles op eigen server.
- **Prestatie:** geen externe fonts/CDN als het kan; foto's als WebP; doel < 100 kB
  boven de vouw.

---

## 9. Nog aan te leveren (jij)

- [ ] **Screenshots** van app.kindfolio.nl: home, tijdlijn met memo, memo-editor met
      inspreken, samenvatting, agenda, leermiddelen. Let op: **geen echte kindfoto's of
      -namen** — maak een demo-portfolio met verzonnen namen.
- [ ] Beslissing over prijs/model (zie Open vragen)
- [ ] Privacyverklaring + eventueel verwerkersovereenkomst-tekst (AVG). Er is nu geen
      privacypagina; die is met deze claims wel nodig.
- [ ] 1–3 quotes van bèta-gebruikers (mag anoniem: "Ouder van 2, Gelderland")
- [ ] Eventueel: aantal actieve gezinnen/memo's als sociaal bewijs

---

## 10. Aannames — bevestigen

- De landing richt zich op **Nederland én Vlaanderen**. In Vlaanderen is huisonderwijs
  groter en is er onderwijsinspectie → een portfolio is daar concreter "nodig". Als je
  daarop mikt, verdient dat eigen copy en misschien een eigen sectie.
- Er wordt **geen enkele juridische claim** gemaakt ("voldoet aan de eisen van de
  inspectie" o.i.d.) tenzij je die kunt onderbouwen. Voorstel: formuleer het als
  *"alles bij elkaar als iemand ernaar vraagt"*, niet als garantie.
- De landing is puur marketing, zonder inloggen: de app blijft op `app.`.

---

## 11. Open vragen (beantwoorden vóór het schrijven van de copy)

1. **Model:** gratis? donatie? abonnement? De AI-samenvatting kost jou geld per
   gebruiker (Claude API) — dat bepaalt de hele CTA en de FAQ.
2. **Bèta open of dicht?** Blijft de uitnodigingscode staan → dan wordt het een
   wachtlijstpagina in plaats van een aanmeldpagina.
3. **Wie mag zelf hosten en hoe prominent?** Is "self-host" een gelijkwaardig aanbod
   of een voetnoot voor techneuten?
4. **Naam/claim:** blijft de subtitel "Thuisonderwijs logboek" (staat nu in de app) of
   wordt het iets als "logboek & portfolio"?
5. **Wil je één pagina of ook subpagina's** (privacy, functies, veelgestelde vragen,
   voor begeleiders)?
6. **Taal:** alleen Nederlands, of later ook Engels?
