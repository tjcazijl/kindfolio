# Thuisonderwijs Portfolio

Een mobiele webapp (PWA) om per kind dagelijks een memo te loggen — met **tekst**, **foto's** en **ingesproken tekst** (spraak-naar-tekst) — en om per **week / maand / kwartaal** een AI-samenvatting te maken voor het portfolio.

De app draait live met **cloud-sync**: alle memo's en foto's staan centraal in een database op de eigen server en synchroniseren tussen apparaten (beide ouders zien dezelfde data). Zie [`docs/DEPLOY.md`](docs/DEPLOY.md) voor de server-architectuur en redeploy-stappen. De Claude API-sleutel voor samenvattingen staat **server-side** (omgevingsvariabele); de frontend ziet die nooit.

## Functies

- 👧 Meerdere kinderen beheren
- 📝 Dagelijkse memo per kind met datum en vakgebied-labels
- 📷 Foto's toevoegen (camera of galerij), automatisch verkleind voor compacte opslag
- 🎤 Inspreken: spraak wordt omgezet naar tekst (Web Speech API, werkt het best in Chrome op Android)
- ✨ AI-samenvatting per week/maand/kwartaal via Claude (optioneel foto's meesturen)
- ⬇️ Export / ⬆️ import als back-up
- 📱 Installeerbaar als app-icoon op je telefoon (PWA), werkt offline

## Vereisten

Je hebt **Node.js 18+** nodig om de app te bouwen/draaien. Er staat nog geen Node op deze Mac. Installeer het op één van deze manieren:

- **Makkelijkst:** download de installer van <https://nodejs.org> (kies de LTS-versie) en doorloop de setup.
- **Of met Homebrew** (als je dat installeert via <https://brew.sh>): `brew install node`

Controleer daarna in een nieuwe terminal:

```bash
node --version   # bijv. v20.x
npm --version
```

## Lokaal draaien

```bash
cd ~/portfolio
npm install
npm run dev
```

Vite toont een URL (bijv. `http://localhost:5173`). Open die op je computer, of op je telefoon via je lokale netwerk:

```bash
npm run dev -- --host
```

Dan staat er ook een "Network"-adres (bijv. `http://192.168.1.20:5173`) dat je op je telefoon in de browser kunt openen (telefoon en computer op hetzelfde wifi).

## Op je telefoon testen (met microfoon)

De **microfoon/inspreken** werkt alleen via een beveiligde verbinding (https). Daarvoor is er een apart script dat een zelfondertekend certificaat gebruikt:

```bash
npm run dev:telefoon
```

Dit toont een **Network**-adres met `https://`, bijv. `https://192.168.68.56:5173/`.

1. Zorg dat je telefoon op **hetzelfde wifi** zit als deze computer.
2. Open dat https-adres in de browser van je telefoon.
3. Je krijgt een **certificaatwaarschuwing** (omdat het certificaat zelfondertekend is). Dat is hier veilig:
   - **iPhone (Safari):** tik op *Details tonen* → *Deze website bezoeken* → *Bezoeken*.
   - **Android (Chrome):** tik op *Geavanceerd* → *Doorgaan naar … (onveilig)*.
4. Geef toestemming voor de microfoon wanneer je voor het eerst op *Inspreken* tikt.

> macOS kan bij de eerste keer vragen of "node" inkomende verbindingen mag accepteren — klik op **Sta toe**.
>
> Voor een echte app op je beginscherm (zonder waarschuwing) host je de app op een gratis https-adres — zie *Bouwen & publiceren* hieronder.

## Bouwen & publiceren

```bash
npm run build      # output in dist/
npm run preview    # lokaal de productieversie bekijken
```

De map `dist/` is een statische site. Je kunt die gratis hosten op bijv. **Netlify**, **Vercel** of **Cloudflare Pages** (sleep de `dist`-map erin, of koppel een Git-repo). Eenmaal op een https-adres kun je de app op je telefoon openen en via het browsermenu **"Toevoegen aan beginscherm"** als app installeren.

## AI-samenvattingen instellen

De samenvattingen draaien **server-side**: de backend roept Anthropic aan met de
sleutel uit de omgevingsvariabele `PORTFOLIO_ANTHROPIC_KEY`. De frontend bevat dus
geen sleutel. Zie [`docs/DEPLOY.md`](docs/DEPLOY.md) voor het instellen. Houd er
rekening mee dat API-gebruik kosten met zich meebrengt.

## Techniek

- **Frontend:** React + TypeScript + Vite, `vite-plugin-pwa` (offline/installeerbaar)
- **Backend:** zero-dependency Node (`node:http` + ingebouwde `node:sqlite`), cookie-sessies
- **Spraak:** Web Speech API (spraak-naar-tekst, in de browser)
- **AI:** Claude Messages API, server-side aangeroepen

## Privacy

De gegevens staan op je **eigen server** (in dit project binnen de EU) en zijn per
account gescheiden. Alleen wanneer er een samenvatting wordt gemaakt, gaan de
memo's van de gekozen periode naar Anthropic om die te genereren.

## Licentie

[GNU AGPL-3.0](LICENSE) — vrij te gebruiken en aan te passen, mits afgeleide
werken (ook als netwerkdienst) onder dezelfde licentie beschikbaar blijven.
