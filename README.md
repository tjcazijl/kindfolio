# Kindfolio

Een mobiele webapp (PWA) voor thuisonderwijs: leg per kind dagelijks een memo vast — met **tekst**, **foto's** en **ingesproken tekst** (spraak-naar-tekst) — en stel optioneel per **week / maand / kwartaal** een samenvatting samen voor het portfolio.

Kindfolio is **open source** en **zelf te hosten**. De app draait met **cloud-sync**: memo's en foto's staan centraal in een database op de server die je zelf beheert, en synchroniseren tussen apparaten (zo zien beide ouders dezelfde gegevens). Zie [`docs/DEPLOY.md`](docs/DEPLOY.md) voor de server-architectuur en deploy-stappen.

## Functies

- 👧 Meerdere kinderen beheren, met eigen kleur, geboortedatum en vakgebieden
- 📝 Dagelijkse memo per kind met datum en vakgebied-labels (in één keer voor meerdere kinderen kan ook)
- 📷 Foto's toevoegen (camera of galerij), automatisch verkleind voor compacte opslag
- 🎤 Inspreken: spraak wordt omgezet naar tekst (Web Speech API, werkt het best in Chrome op Android)
- ✨ **Optionele** AI-samenvatting per periode — uit te zetten in de instellingen; staat het uit, dan zie je gewoon alle memo's onder elkaar
- 👨‍👩‍👧 Samen werken: een medeouder kan meebewerken, een begeleider/lerares kan meelezen en reageren
- ⬇️ Tekstgegevens exporteren als back-up
- 📱 Installeerbaar als app-icoon op je telefoon (PWA), werkt offline

## Vereisten

Je hebt **Node.js 18+** nodig om de app te bouwen en te draaien:

- **Makkelijkst:** download de installer van <https://nodejs.org> (kies de LTS-versie).
- **Of met Homebrew:** `brew install node`

Controleer daarna in een nieuwe terminal:

```bash
node --version
npm --version
```

## Lokaal draaien

```bash
git clone https://github.com/tjcazijl/kindfolio.git
cd kindfolio
npm install
npm run dev
```

Vite toont een URL (bijv. `http://localhost:5173`). De frontend praat met `/api`; zet
de omgevingsvariabele `API_TARGET` naar je eigen backend, of draai de backend lokaal
(zie [`docs/DEPLOY.md`](docs/DEPLOY.md)).

Om de app op een telefoon in hetzelfde wifi-netwerk te openen:

```bash
npm run dev -- --host
```

Dan verschijnt er ook een "Network"-adres (bijv. `http://192.168.1.20:5173`).

## Op een telefoon testen (met microfoon)

De **microfoon/inspreken** werkt alleen via een beveiligde verbinding (https). Daarvoor is er een apart script met een zelfondertekend certificaat:

```bash
npm run dev:telefoon
```

Dit toont een **Network**-adres met `https://`. Open dat op de telefoon (zelfde wifi).
Je krijgt een certificaatwaarschuwing (zelfondertekend); doorgaan is hier veilig:

- **iPhone (Safari):** *Details tonen* → *Deze website bezoeken* → *Bezoeken*.
- **Android (Chrome):** *Geavanceerd* → *Doorgaan naar … (onveilig)*.

Geef daarna toestemming voor de microfoon bij de eerste keer *Inspreken*.

## Bouwen

```bash
npm run build      # statische frontend in dist/
npm run preview    # lokaal de productiebuild bekijken
```

`dist/` is de statische frontend; daarnaast draait de zero-dependency backend
(`server/server.js`). De volledige hostingopzet (nginx, systemd, HTTPS) staat in
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Techniek

- **Frontend:** React + TypeScript + Vite, `vite-plugin-pwa` (offline/installeerbaar)
- **Backend:** zero-dependency Node (`node:http` + ingebouwde `node:sqlite`), cookie-sessies
- **Spraak:** Web Speech API (spraak-naar-tekst, in de browser)
- **AI (optioneel):** Claude Messages API, server-side aangeroepen

## Privacy

Kindfolio is zelf te hosten: de gegevens staan op de server die je zelf beheert (in
de referentie-deployment binnen de EU) en zijn per account gescheiden. De
AI-samenvatting is **optioneel** en uit te zetten. Staat die aan, dan gaan alleen de
**notitieteksten** van de gekozen periode naar Anthropic om de samenvatting te
genereren — **geen foto's** en geen accountgegevens. De API-sleutel staat uitsluitend
**server-side** (omgevingsvariabele); de frontend ziet die nooit.

## Licentie

[GNU AGPL-3.0](LICENSE) — vrij te gebruiken en aan te passen, mits afgeleide werken
(ook als netwerkdienst) onder dezelfde licentie beschikbaar blijven.
