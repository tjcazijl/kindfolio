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
| `PORTFOLIO_AI_LIMIT` | Aantal AI-samenvattingen per portfolio (default 3). Bij het bereiken krijgt de gebruiker de melding om contact op te nemen; samenvatten zónder AI blijft onbeperkt. Elk gebruik komt als rij in de tabel `ai_usage` — met `DELETE FROM ai_usage WHERE account_id = '…'` zet je het voor één portfolio terug. |
| `PORTFOLIO_SENDGRID_KEY` | SendGrid-sleutel voor verificatie-/uitnodigingsmails |
| `PORTFOLIO_ADMIN_EMAIL` | E-mailadres(sen) met beheerrechten (komma-gescheiden) |
| `PORTFOLIO_INVITE_CODE` | Optionele code die bij registratie vereist is. **Leeg laten** voor open registratie — sinds v0.22 vraagt het inlogscherm er niet meer om, dus met een gevulde waarde kan niemand meer een account maken. |
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

## Landingspagina op kindfolio.nl

De map `landing/` is een gewone statische site (`index.html`, `styles.css`,
`assets/`) — geen build, geen Node. Hij hoort op `kindfolio.nl`; de app blijft op
`app.kindfolio.nl`.

**Uitgangssituatie:** DNS wordt beheerd bij Hostnet. `kindfolio.nl` en `www`
wijzen naar `91.184.0.200` (parkeerpagina van Hostnet), `app.kindfolio.nl` naar
`178.104.39.203` (de eigen server bij Hetzner).

### 1. Bestanden naar de server

```bash
ssh SERVER 'sudo mkdir -p /var/www/kindfolio-site && sudo chown -R $USER:$USER /var/www/kindfolio-site'
rsync -az --delete landing/ SERVER:/var/www/kindfolio-site/
```

### 2. nginx-serverblok

`/etc/nginx/sites-available/kindfolio-site`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name kindfolio.nl www.kindfolio.nl;

    root /var/www/kindfolio-site;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # Afbeeldingen en stylesheet mogen lang gecachet worden.
    location ~* \.(?:jpg|png|svg|webp|css)$ {
        expires 30d;
        add_header Cache-Control "public";
    }

    # index.html juist niet — anders zien bezoekers oude tekst.
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
```

Aanzetten en testen:

```bash
sudo ln -s /etc/nginx/sites-available/kindfolio-site /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3. DNS omzetten bij Hostnet

In het Hostnet-paneel, bij de DNS-records van `kindfolio.nl`:

| Type | Naam | Van | Naar |
|---|---|---|---|
| A | `@` | 91.184.0.200 | **178.104.39.203** |
| A of CNAME | `www` | 91.184.0.200 | **178.104.39.203** (of CNAME naar `kindfolio.nl`) |

> **Laat de MX-records met rust.** De e-mail van `kindfolio.nl` loopt via Hostnet;
> die records staan los van de A-records. Verwijder ook geen TXT/SPF-records.

Zet de TTL een dag van tevoren laag (300 s) als je de omschakeling kort wilt
houden. Controleren of het is doorgekomen:

```bash
dig +short kindfolio.nl A
```

### 4. HTTPS-certificaat

Pas draaien nadat de DNS naar de server wijst, anders faalt de validatie:

```bash
sudo certbot --nginx -d kindfolio.nl -d www.kindfolio.nl
```

Certbot voegt zelf het `listen 443`-blok en de HTTP→HTTPS-omleiding toe.

### 5. Controleren

```bash
curl -sI https://kindfolio.nl | head -1
curl -sI https://www.kindfolio.nl | head -1
curl -sI https://app.kindfolio.nl | head -1
```

Alle drie moeten `200` of `301` geven, en de app moet nog gewoon werken.

### Bijwerken na een tekstwijziging

```bash
rsync -az --delete landing/ SERVER:/var/www/kindfolio-site/
```

### Alternatief zonder eigen server

Heb je bij Hostnet een hostingpakket (geen kale domeinregistratie), dan kun je de
drie onderdelen van `landing/` ook gewoon in de webroot van dat pakket zetten via
FTP of het bestandsbeheer. Dan hoeft er niets aan DNS of nginx te veranderen en
regelt Hostnet het certificaat. Nadeel: site en app staan dan op twee plekken.

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
