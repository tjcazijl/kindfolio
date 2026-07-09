# Deploy & architectuur

Kindfolio draait op een Linux-server (bijv. Ubuntu 24.04) achter nginx, met
cloud-sync via een eigen backend. Vervang hieronder `your-server` door je eigen
host (een SSH-alias in `~/.ssh/config` werkt prettig).

> De paden en servicenaam (`portfolio-api`, `/var/www/portfolio`, `/opt/portfolio-api`)
> zijn voorbeelden uit de referentie-deployment — kies gerust je eigen namen.

## Onderdelen

| Onderdeel | Waar (voorbeeld) | Details |
|---|---|---|
| Frontend (React/Vite PWA) | `/var/www/portfolio/` | Statische build, geserveerd door nginx |
| Backend API | `/opt/portfolio-api/server.js` | Node, **zero dependencies** (`node:http` + ingebouwde `node:sqlite`) |
| Database | `<DATA_DIR>/portfolio.db` | SQLite (WAL) |
| Foto's | `<DATA_DIR>/photos/<id>` | Losse bestanden |
| Service | systemd `portfolio-api` | luistert op `127.0.0.1:3017`, gestart met `node --experimental-sqlite` |
| Webserver | nginx | HTTPS (Let's Encrypt), `/api/` → `127.0.0.1:3017` |

- **Accounts:** e-mail + wachtwoord (scrypt-hash), cookie-sessie (HttpOnly+Secure,
  HMAC-ondertekend). Data is per account gescheiden.
- **AI-samenvatting:** server-side. De backend roept Anthropic aan met de sleutel
  uit de omgevingsvariabele `PORTFOLIO_ANTHROPIC_KEY`. De frontend ziet de sleutel
  nooit.

## Configuratie (omgevingsvariabelen)

Alle geheimen komen uit de omgeving (bijv. `Environment=`-regels in de
systemd-unit, `chmod 600`). **Commit deze nooit.**

| Variabele | Doel |
|---|---|
| `PORT` | Poort van de backend (default 3017) |
| `DATA_DIR` | Map voor database + foto's |
| `PORTFOLIO_SECRET` | Sleutel om sessiecookies te ondertekenen (lange random string) |
| `PORTFOLIO_PHOTO_KEY` | 64 hex-tekens (32 bytes) — versleutelt foto's op schijf (AES-256-GCM). Bewaar deze sleutel óók buiten de server: zonder sleutel zijn de foto's onleesbaar. Bestaande onversleutelde foto's worden bij opstarten automatisch versleuteld. |
| `PORTFOLIO_ANTHROPIC_KEY` | Anthropic API-sleutel voor samenvattingen |
| `PORTFOLIO_MODEL` | Claude-model (default `claude-sonnet-4-6`) |
| `PORTFOLIO_SENDGRID_KEY` | SendGrid-sleutel voor verificatie-/uitnodigingsmails |
| `PORTFOLIO_ADMIN_EMAIL` | E-mailadres(sen) met beheerrechten (komma-gescheiden) |
| `PORTFOLIO_INVITE_CODE` | Optionele bèta-code die bij registratie vereist is |
| `PORTFOLIO_REQUIRE_VERIFY` | `true` om e-mailverificatie te verplichten |
| `PORTFOLIO_WHISPER_BIN` | Pad naar de `whisper-cli`-binary (spraak-naar-tekst). Leeg = inspreken uit. |
| `PORTFOLIO_WHISPER_MODEL` | Pad naar het ggml-model, bijv. `ggml-base.bin` (`small` = beter NL maar trager) |

### Spraak-naar-tekst (whisper.cpp, lokaal)

Vereist `ffmpeg` en whisper.cpp op de server (geen externe dienst):

```bash
apt-get install -y build-essential cmake ffmpeg
git clone --depth 1 https://github.com/ggerganov/whisper.cpp /opt/whisper.cpp
cd /opt/whisper.cpp && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
sh ./models/download-ggml-model.sh base    # ~142 MB
```

Zet daarna `PORTFOLIO_WHISPER_BIN`/`PORTFOLIO_WHISPER_MODEL`. De browser neemt op met
`MediaRecorder`, de server zet om naar 16kHz-WAV (ffmpeg) en transcribeert lokaal
(één tegelijk); de audio wordt na afloop verwijderd.

## API (alles onder `/api`, sessie vereist)

- `GET  /api/state` — kinderen, memo's, samenvattingen, reacties + accountinfo
- `POST /api/children` · `PATCH /api/children/:id` · `DELETE /api/children/:id`
- `POST /api/memos` · `PATCH /api/memos/:id` · `DELETE /api/memos/:id`
- `POST /api/photos` (ruwe afbeelding-body) → `{ id }` · `GET /api/photos/:id` · `DELETE /api/photos/:id`
- `GET/POST /api/feedback` + stemmen/reacties/status (gedeeld prikbord)

## Frontend opnieuw deployen

```bash
npm run build
rsync -az --delete dist/ your-server:/var/www/portfolio/
```

## Backend opnieuw deployen

```bash
rsync server/server.js your-server:/opt/portfolio-api/server.js
ssh your-server 'systemctl restart portfolio-api'
```

## Lokaal ontwikkelen tegen een backend

`npm run dev` proxyt `/api` naar `API_TARGET` (default `http://localhost:3017`).
Zet `API_TARGET` in je omgeving om tegen een andere backend te draaien. Draait
die backend achter basic auth, maak dan een (gitignored) bestand `.dev-auth` met
`gebruiker:wachtwoord`; de dev-proxy stuurt dat automatisch mee.

## Back-up

Maak periodiek een consistente kopie met `sqlite3 .backup` plus de fotomap,
bijvoorbeeld via een nachtelijke systemd-timer. Versleutel de back-up direct
(de database bevat memo-teksten):

```bash
tar czf - -C "$TMP" portfolio.db -C "$DATA" photos \
  | openssl enc -aes-256-cbc -pbkdf2 -pass file:backup.key -out backup.tar.gz.enc
```

Terugzetten/uitlezen:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:backup.key -in backup.tar.gz.enc | tar xz
```

Bewaar `backup.key` (en `PORTFOLIO_PHOTO_KEY`) óók buiten de server, bijv. in een
wachtwoordmanager — anders is een back-up na serververlies onbruikbaar. Back-ups
op dezelfde server beschermen niet tegen totaal serververlies; haal er af en toe
een offsite kopie van op.
