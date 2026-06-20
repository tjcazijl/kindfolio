# Deploy & architectuur

De app draait op een Linux-server (bijv. Ubuntu 24.04) achter nginx, met
cloud-sync via een eigen backend. Vervang hieronder `your-server` door je eigen
host (een SSH-alias in `~/.ssh/config` werkt prettig).

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
| `PORTFOLIO_ANTHROPIC_KEY` | Anthropic API-sleutel voor samenvattingen |
| `PORTFOLIO_MODEL` | Claude-model (default `claude-sonnet-4-6`) |
| `PORTFOLIO_SENDGRID_KEY` | SendGrid-sleutel voor verificatie-/uitnodigingsmails |
| `PORTFOLIO_ADMIN_EMAIL` | E-mailadres(sen) met beheerrechten (komma-gescheiden) |
| `PORTFOLIO_INVITE_CODE` | Optionele bèta-code die bij registratie vereist is |
| `PORTFOLIO_REQUIRE_VERIFY` | `true` om e-mailverificatie te verplichten |

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
bijvoorbeeld via een nachtelijke systemd-timer die een `.tar.gz` wegschrijft en
de laatste N stuks bewaart. Houd er rekening mee dat back-ups op dezelfde server
niet beschermen tegen totaal serververlies — haal er af en toe een offsite kopie
van op.
