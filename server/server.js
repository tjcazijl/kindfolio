'use strict'
// Thuisonderwijs Portfolio - backend (zero dependencies)
// Multi-tenant: accounts (e-mail + wachtwoord), data per account gescheiden.
// Node 22+, gestart met --experimental-sqlite.

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')

const PORT = Number(process.env.PORT || 3017)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const PHOTO_DIR = path.join(DATA_DIR, 'photos')
const MAX_PHOTO_BYTES = 20 * 1024 * 1024
const MAX_JSON_BYTES = 1 * 1024 * 1024

fs.mkdirSync(PHOTO_DIR, { recursive: true })

// ---- foto-versleuteling op schijf (AES-256-GCM) ----
// Sleutel: PORTFOLIO_PHOTO_KEY (64 hex-tekens). Zonder sleutel blijven foto's
// onversleuteld (met waarschuwing); bestaande onversleutelde foto's worden bij
// opstarten met sleutel automatisch alsnog versleuteld.
const PHOTO_KEY = (() => {
  const hex = (process.env.PORTFOLIO_PHOTO_KEY || '').trim()
  if (!hex) return null
  const buf = Buffer.from(hex, 'hex')
  return buf.length === 32 ? buf : null
})()
if (!PHOTO_KEY) {
  console.warn("[foto] PORTFOLIO_PHOTO_KEY ontbreekt of is ongeldig — foto's worden ONVERSLEUTELD opgeslagen")
}
const ENC_MAGIC = Buffer.from('KFENC1')

function encryptPhoto(buf) {
  if (!PHOTO_KEY) return buf
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', PHOTO_KEY, iv)
  const ct = Buffer.concat([cipher.update(buf), cipher.final()])
  return Buffer.concat([ENC_MAGIC, iv, cipher.getAuthTag(), ct])
}
// Onversleutelde (legacy) bestanden passeren ongewijzigd.
function decryptPhoto(buf) {
  if (buf.length < 34 || !buf.subarray(0, 6).equals(ENC_MAGIC)) return buf
  if (!PHOTO_KEY) throw new Error('foto is versleuteld maar PORTFOLIO_PHOTO_KEY ontbreekt')
  const iv = buf.subarray(6, 18)
  const tag = buf.subarray(18, 34)
  const de = crypto.createDecipheriv('aes-256-gcm', PHOTO_KEY, iv)
  de.setAuthTag(tag)
  return Buffer.concat([de.update(buf.subarray(34)), de.final()])
}
// Versleutel bestaande onversleutelde foto's, één voor één, atomair (tmp+rename).
async function migratePhotoEncryption() {
  if (!PHOTO_KEY) return
  let n = 0
  for (const name of await fs.promises.readdir(PHOTO_DIR)) {
    const p = path.join(PHOTO_DIR, name)
    try {
      if (name.endsWith('.enc-tmp')) {
        await fs.promises.unlink(p)
        continue
      }
      const buf = await fs.promises.readFile(p)
      if (buf.subarray(0, 6).equals(ENC_MAGIC)) continue
      const tmp = p + '.enc-tmp'
      await fs.promises.writeFile(tmp, encryptPhoto(buf))
      await fs.promises.rename(tmp, p)
      n++
    } catch (e) {
      console.error('[foto] versleutelen van bestaand bestand mislukt:', name, (e && e.message) || e)
    }
  }
  if (n) console.log(`[foto] ${n} bestaande foto's versleuteld op schijf`)
}
migratePhotoEncryption()

// ---- spraak-naar-tekst (whisper.cpp, lokaal — geen externe dienst) ----

const CHILD_COLORS = [
  '#2f6f4f', '#c2553b', '#3b6fc2', '#9b51b0',
  '#d59a18', '#2a9d8f', '#e76f51', '#5a6f9b',
]

const db = new DatabaseSync(path.join(DATA_DIR, 'portfolio.db'))
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    pw_hash TEXT NOT NULL,
    pw_salt TEXT NOT NULL,
    verified INTEGER DEFAULT 1,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS children (
    id TEXT PRIMARY KEY, account_id TEXT, name TEXT NOT NULL,
    color TEXT, birth_year INTEGER, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS memos (
    id TEXT PRIMARY KEY, account_id TEXT, child_id TEXT NOT NULL,
    date TEXT, text TEXT, subjects TEXT, photo_ids TEXT,
    created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY, account_id TEXT, mime TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY, account_id TEXT, child_id TEXT NOT NULL,
    period TEXT, period_label TEXT, start TEXT, end TEXT,
    text TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY, account_id TEXT, user_id TEXT, role TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY, account_id TEXT, email TEXT, role TEXT, token TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY, account_id TEXT, target_type TEXT, target_id TEXT,
    user_id TEXT, author_email TEXT, text TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS account_settings (
    account_id TEXT PRIMARY KEY, subjects TEXT, ai_enabled INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY, account_id TEXT, user_id TEXT, email TEXT,
    message TEXT, page TEXT, status TEXT DEFAULT 'open', created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS feedback_votes (
    feedback_id TEXT, user_id TEXT, created_at INTEGER,
    PRIMARY KEY (feedback_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS feedback_comments (
    id TEXT PRIMARY KEY, feedback_id TEXT, user_id TEXT, email TEXT,
    text TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS memo_likes (
    memo_id TEXT, user_id TEXT, created_at INTEGER,
    PRIMARY KEY (memo_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, account_id TEXT, title TEXT NOT NULL,
    notes TEXT, type TEXT, date TEXT, time TEXT,
    freq TEXT DEFAULT 'none', every_n INTEGER DEFAULT 1,
    weekdays TEXT, until_date TEXT,
    created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS event_children (
    event_id TEXT, child_id TEXT,
    PRIMARY KEY (event_id, child_id)
  );
  CREATE TABLE IF NOT EXISTS update_likes (
    update_id TEXT, user_id TEXT, created_at INTEGER,
    PRIMARY KEY (update_id, user_id)
  );
  -- Eén rij per geslaagde AI-samenvatting; bepaalt het verbruik per portfolio.
  CREATE TABLE IF NOT EXISTS ai_usage (
    id TEXT PRIMARY KEY, account_id TEXT, user_id TEXT,
    kind TEXT,                          -- samenvatting | foto
    created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS ai_usage_account ON ai_usage (account_id);
  CREATE TABLE IF NOT EXISTS update_comments (
    id TEXT PRIMARY KEY, update_id TEXT, user_id TEXT, email TEXT,
    author_name TEXT, text TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS focus_points (
    id TEXT PRIMARY KEY, account_id TEXT, child_id TEXT,
    text TEXT, subject TEXT,
    status TEXT DEFAULT 'open',          -- open | later | done
    source_memo_id TEXT, link_kind TEXT, -- link_kind: attention | later (bij memo), anders NULL
    created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY, account_id TEXT,
    type TEXT, title TEXT NOT NULL, author TEXT, url TEXT,
    subject TEXT, status TEXT, notes TEXT,
    created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS resource_children (
    resource_id TEXT, child_id TEXT,
    PRIMARY KEY (resource_id, child_id)
  );
  CREATE TABLE IF NOT EXISTS memo_resources (
    memo_id TEXT, resource_id TEXT,
    PRIMARY KEY (memo_id, resource_id)
  );
  -- Eén rij per afgevinkte dag van een agenda-item. Bewust per datum: een
  -- wekelijkse zwemles die je vandaag afvinkt, moet volgende week gewoon weer
  -- op de planning staan. Het agenda-item zelf blijft onaangeroerd.
  CREATE TABLE IF NOT EXISTS event_done (
    event_id TEXT, date TEXT, account_id TEXT, user_id TEXT, created_at INTEGER,
    PRIMARY KEY (event_id, date)
  );
  CREATE TABLE IF NOT EXISTS event_focus (
    event_id TEXT, focus_id TEXT,
    PRIMARY KEY (event_id, focus_id)
  );
  -- Koppeling tussen een SLO-kerndoel en iets in de app (memo, leermiddel of
  -- agenda-item), altijd voor één kind. Welke set (po/vo) geldt, staat in de
  -- koppeling zelf: dan hoeft er bij een overstap niets omgezet te worden en
  -- wordt geschiedenis nooit herschreven.
  CREATE TABLE IF NOT EXISTS kerndoel_links (
    id TEXT PRIMARY KEY, account_id TEXT,
    carrier_type TEXT,                   -- memo | resource | event
    carrier_id TEXT,
    child_id TEXT,
    kd_set TEXT,                         -- po | vo
    kd_nr INTEGER,
    source TEXT DEFAULT 'manual',        -- manual | ai
    status TEXT DEFAULT 'ok',            -- ok = telt mee | open = AI-voorstel
    quote TEXT,                          -- citaat uit de memo, als bewijs
    created_at INTEGER
  );
  -- Een periode is een stuk tijd waar je achteraf een naam aan geeft: "Het WK",
  -- "De ijstijd". Welke memo's erin vallen volgt uit de datums en de kinderen —
  -- je hoeft ze niet stuk voor stuk te koppelen.
  CREATE TABLE IF NOT EXISTS periods (
    id TEXT PRIMARY KEY, account_id TEXT,
    title TEXT NOT NULL, start_date TEXT, end_date TEXT, note TEXT,
    status TEXT DEFAULT 'ok',            -- ok | open (voorstel van de AI)
    source TEXT DEFAULT 'manual',        -- manual | ai
    created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS period_children (
    period_id TEXT, child_id TEXT,
    PRIMARY KEY (period_id, child_id)
  );
  CREATE INDEX IF NOT EXISTS periods_account ON periods (account_id);
  CREATE INDEX IF NOT EXISTS kerndoel_links_account ON kerndoel_links (account_id);
  CREATE UNIQUE INDEX IF NOT EXISTS kerndoel_links_uniek
    ON kerndoel_links (carrier_type, carrier_id, child_id, kd_set, kd_nr);
`)

// --- Migratie: account_id-kolom toevoegen aan bestaande DB's + oude data koppelen ---
for (const t of ['children', 'memos', 'photos', 'summaries']) {
  try {
    db.exec(`ALTER TABLE ${t} ADD COLUMN account_id TEXT`)
  } catch {
    /* kolom bestaat al */
  }
}
try {
  db.exec('ALTER TABLE children ADD COLUMN birth_date TEXT')
} catch {
  /* kolom bestaat al */
}
try {
  db.exec('ALTER TABLE children ADD COLUMN subjects TEXT')
} catch {
  /* kolom bestaat al */
}
try {
  db.exec('ALTER TABLE children ADD COLUMN subcategories TEXT')
} catch {
  /* kolom bestaat al */
}
try {
  db.exec("ALTER TABLE feedback ADD COLUMN status TEXT DEFAULT 'open'")
} catch {
  /* kolom bestaat al */
}
// Concept-memo's en eigen naam op het feedbackprikbord.
for (const sql of [
  'ALTER TABLE memos ADD COLUMN draft INTEGER DEFAULT 0',
  'ALTER TABLE feedback ADD COLUMN author_name TEXT',
  'ALTER TABLE feedback_comments ADD COLUMN author_name TEXT',
  'ALTER TABLE account_settings ADD COLUMN subcategories TEXT',
  'ALTER TABLE memos ADD COLUMN mood TEXT',
  'ALTER TABLE summaries ADD COLUMN photo_ids TEXT',
  'ALTER TABLE events ADD COLUMN sort_order INTEGER DEFAULT 0',
  'ALTER TABLE events ADD COLUMN subjects TEXT',
  'ALTER TABLE resources ADD COLUMN subjects TEXT',
  'ALTER TABLE resources ADD COLUMN read_date TEXT',
  'ALTER TABLE ai_usage ADD COLUMN kind TEXT',
  'ALTER TABLE account_settings ADD COLUMN photo_ai INTEGER DEFAULT 0',
  // Kerndoelen: standaard uit, en als ze aanstaan standaard handmatig aanvinken.
  'ALTER TABLE account_settings ADD COLUMN kerndoelen INTEGER DEFAULT 0',
  'ALTER TABLE account_settings ADD COLUMN kerndoelen_ai INTEGER DEFAULT 0',
  // Per kind: welke set geldt, sinds wanneer, en of de 12-jaarsvraag al gesteld is.
  'ALTER TABLE children ADD COLUMN kerndoelen_set TEXT',
  'ALTER TABLE children ADD COLUMN kerndoelen_set_at TEXT',
  'ALTER TABLE children ADD COLUMN kerndoelen_asked INTEGER DEFAULT 0',
  // Onthoudt welke memo's de AI al bekeken heeft, zodat een tweede ronde
  // alleen het nieuwe werk doet.
  'ALTER TABLE memos ADD COLUMN kd_scanned INTEGER DEFAULT 0',
  // Meerdaagse agenda-items: een themaweek of een kamp loopt van date t/m
  // end_date. Staat los van until_date, dat het einde van een herhaling is.
  'ALTER TABLE events ADD COLUMN end_date TEXT',
]) {
  try {
    db.exec(sql)
  } catch {
    /* kolom bestaat al */
  }
}
// Leermiddelen: oude "boek" wordt "leesboek"; los vakgebied → lijst met vakgebieden.
try {
  db.exec("UPDATE resources SET type = 'leesboek' WHERE type = 'boek'")
} catch {
  /* tabel bestaat nog niet / niets te doen */
}
try {
  for (const r of db.prepare('SELECT id, subject FROM resources WHERE subject IS NOT NULL AND (subjects IS NULL OR subjects = \'\')').all()) {
    if (r.subject && String(r.subject).trim()) {
      db.prepare('UPDATE resources SET subjects = ? WHERE id = ?').run(JSON.stringify([String(r.subject).trim()]), r.id)
    }
  }
} catch {
  /* niets te migreren */
}
// Pre-existing data (van vóór accounts) toewijzen aan een placeholder-account.
// Wordt na deploy met één UPDATE aan het echte owner-account gekoppeld.
const LEGACY = 'legacy-account'
for (const t of ['children', 'memos', 'photos', 'summaries']) {
  db.prepare(`UPDATE ${t} SET account_id = ? WHERE account_id IS NULL`).run(LEGACY)
}
for (const col of ['verify_token TEXT', 'reset_token TEXT', 'reset_expires INTEGER', 'last_seen INTEGER']) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col}`)
  } catch {
    /* kolom bestaat al */
  }
}
// Eigenaar-lidmaatschap voor elke bestaande gebruiker (account_id === user id).
for (const u of db.prepare('SELECT id FROM users').all()) {
  const has = db
    .prepare('SELECT id FROM memberships WHERE account_id = ? AND user_id = ?')
    .get(u.id, u.id)
  if (!has) {
    db.prepare(
      'INSERT INTO memberships (id,account_id,user_id,role,created_at) VALUES (?,?,?,?,?)',
    ).run(crypto.randomUUID(), u.id, u.id, 'owner', Date.now())
  }
}

const uid = () => crypto.randomUUID()
const now = () => Date.now()

// ---- SLO-kerndoelen ----
// Twee sets: primair onderwijs (40) en de onderbouw van het voortgezet
// onderwijs (45), beide uit de publicaties van SLO (2026). De nummers lopen
// vanaf 11 uiteen — "kerndoel 26" betekent in de ene set iets heel anders dan
// in de andere. Daarom hoort de set altijd bij het nummer, ook in een verslag.
// `school: 1` markeert de twee doelen die over de leeromgeving gaan in plaats
// van over het kind zelf.
const KERNDOELEN = {
  po: [
    { nr: 1, lg: 'Nederlands', t: 'De school stimuleert de taalcompetentie van leerlingen.', school: 1 },
    { nr: 2, lg: 'Nederlands', t: 'De leerling begrijpt teksten.' },
    { nr: 3, lg: 'Nederlands', t: 'De leerling produceert teksten.' },
    { nr: 4, lg: 'Nederlands', t: 'De leerling voert gesprekken.' },
    { nr: 5, lg: 'Nederlands', t: 'De leerling ontwikkelt zich als bewuste taalgebruiker.' },
    { nr: 6, lg: 'Nederlands', t: 'De leerling toont inzicht in taal als systeem.' },
    { nr: 7, lg: 'Nederlands', t: 'De leerling verkent het gebruik van taal.' },
    { nr: 8, lg: 'Nederlands', t: 'De leerling doet ervaring op met literatuur.' },
    { nr: 9, lg: 'Nederlands', t: 'De leerling toont inzicht in literatuur.' },
    { nr: 10, lg: 'Rekenen en wiskunde', t: 'De leerling redeneert en rekent met getallen en verhoudingen.' },
    { nr: 11, lg: 'Rekenen en wiskunde', t: 'De leerling toont inzicht bij het handelen met grootheden.' },
    { nr: 12, lg: 'Rekenen en wiskunde', t: 'De leerling interpreteert data.' },
    { nr: 13, lg: 'Rekenen en wiskunde', t: 'De leerling toont inzicht in patronen en verbanden.' },
    { nr: 14, lg: 'Rekenen en wiskunde', t: 'De leerling toont inzicht bij meetkundig handelen.' },
    { nr: 15, lg: 'Rekenen en wiskunde', t: 'De leerling gebruikt wiskundige denk-werkwijzen.' },
    { nr: 16, lg: 'Rekenen en wiskunde', t: 'De leerling gebruikt wiskundetaal en wiskundig gereedschap.' },
    { nr: 17, lg: 'Rekenen en wiskunde', t: 'De leerling ontwikkelt een wiskundige attitude.' },
    { nr: 18, lg: 'Rekenen en wiskunde', t: 'De leerling past wiskunde toe in bekende en nieuwe situaties.' },
    { nr: 19, lg: 'Burgerschap', t: 'De school geeft vorm aan de democratische oefenplaats.', school: 1 },
    { nr: 20, lg: 'Burgerschap', t: 'De leerling leert over samenleven in een democratische rechtsstaat.' },
    { nr: 21, lg: 'Burgerschap', t: 'De leerling doet ervaringen op met democratische en maatschappelijke betrokkenheid.' },
    { nr: 22, lg: 'Digitale geletterdheid', t: 'De leerling zet digitale technologie en digitale media in.' },
    { nr: 23, lg: 'Digitale geletterdheid', t: 'De leerling creëert digitale producten.' },
    { nr: 24, lg: 'Digitale geletterdheid', t: 'De leerling participeert in de gedigitaliseerde wereld.' },
    { nr: 25, lg: 'Mens en maatschappij', t: 'De leerling onderzoekt vraagstukken over mens en samenleving.' },
    { nr: 26, lg: 'Mens en maatschappij', t: 'De leerling verkent geografische verschijnselen.' },
    { nr: 27, lg: 'Mens en maatschappij', t: 'De leerling verkent historische verschijnselen.' },
    { nr: 28, lg: 'Mens en maatschappij', t: 'De leerling verkent hoe mensen met elkaar samenleven.' },
    { nr: 29, lg: 'Mens en natuur', t: 'De leerling verkent de wereld vanuit natuurwetenschappelijk en technologisch perspectief.' },
    { nr: 30, lg: 'Mens en natuur', t: 'De leerling toont inzicht in en experimenteert met natuurverschijnselen en technische systemen.' },
    { nr: 31, lg: 'Mens en natuur', t: 'De leerling toont inzicht in organismen en hun gezondheid.' },
    { nr: 32, lg: 'Mens en natuur', t: 'De leerling toont inzicht in en verkent systeem aarde.' },
    { nr: 33, lg: 'Moderne vreemde talen', t: 'De leerling communiceert in het Engels.' },
    { nr: 34, lg: 'Moderne vreemde talen', t: 'De leerling ontwikkelt zich als taal- en cultuurbewuste gebruiker van de Engelse taal.' },
    { nr: 35, lg: 'Kunst en cultuur', t: 'De leerling ontwikkelt artistiek creatief vermogen.' },
    { nr: 36, lg: 'Kunst en cultuur', t: 'De leerling maakt kunstzinnige uitingen.' },
    { nr: 37, lg: 'Kunst en cultuur', t: 'De leerling maakt kunst en cultuur mee.' },
    { nr: 38, lg: 'Bewegen en sport', t: 'De leerling ontwikkelt zich in het bewegen.' },
    { nr: 39, lg: 'Bewegen en sport', t: 'De leerling beweegt samen met anderen.' },
    { nr: 40, lg: 'Bewegen en sport', t: 'De leerling geeft betekenis aan bewegen.' },
  ],
  vo: [
    { nr: 1, lg: 'Nederlands', t: 'De school stimuleert de taalcompetentie van leerlingen.', school: 1 },
    { nr: 2, lg: 'Nederlands', t: 'De leerling begrijpt teksten.' },
    { nr: 3, lg: 'Nederlands', t: 'De leerling produceert teksten.' },
    { nr: 4, lg: 'Nederlands', t: 'De leerling voert gesprekken.' },
    { nr: 5, lg: 'Nederlands', t: 'De leerling ontwikkelt zich als bewuste taalgebruiker.' },
    { nr: 6, lg: 'Nederlands', t: 'De leerling toont inzicht in taal als systeem.' },
    { nr: 7, lg: 'Nederlands', t: 'De leerling verkent het gebruik van taal.' },
    { nr: 8, lg: 'Nederlands', t: 'De leerling doet ervaring op met literatuur.' },
    { nr: 9, lg: 'Nederlands', t: 'De leerling toont inzicht in literatuur.' },
    { nr: 10, lg: 'Rekenen en wiskunde', t: 'De leerling redeneert en rekent met getallen, grootheden en vergelijkingen.' },
    { nr: 11, lg: 'Rekenen en wiskunde', t: 'De leerling interpreteert data en kansen.' },
    { nr: 12, lg: 'Rekenen en wiskunde', t: 'De leerling toont inzicht in patronen en verbanden.' },
    { nr: 13, lg: 'Rekenen en wiskunde', t: 'De leerling toont inzicht bij meetkundig handelen.' },
    { nr: 14, lg: 'Rekenen en wiskunde', t: 'De leerling gebruikt wiskundige denk-werkwijzen.' },
    { nr: 15, lg: 'Rekenen en wiskunde', t: 'De leerling gebruikt wiskundetaal en wiskundig gereedschap.' },
    { nr: 16, lg: 'Rekenen en wiskunde', t: 'De leerling ontwikkelt een wiskundige attitude.' },
    { nr: 17, lg: 'Rekenen en wiskunde', t: 'De leerling past wiskunde toe in bekende en nieuwe situaties.' },
    { nr: 18, lg: 'Burgerschap', t: 'De school geeft vorm aan de democratische oefenplaats.', school: 1 },
    { nr: 19, lg: 'Burgerschap', t: 'De leerling leert over samenleven in een democratische rechtsstaat.' },
    { nr: 20, lg: 'Burgerschap', t: 'De leerling doet ervaringen op met democratische en maatschappelijke betrokkenheid.' },
    { nr: 21, lg: 'Digitale geletterdheid', t: 'De leerling zet digitale technologie en digitale media in.' },
    { nr: 22, lg: 'Digitale geletterdheid', t: 'De leerling creëert digitale producten.' },
    { nr: 23, lg: 'Digitale geletterdheid', t: 'De leerling participeert in de gedigitaliseerde wereld.' },
    { nr: 24, lg: 'Mens en maatschappij', t: 'De leerling onderzoekt vraagstukken over mens en samenleving.' },
    { nr: 25, lg: 'Mens en maatschappij', t: 'De leerling onderzoekt geografische verschijnselen.' },
    { nr: 26, lg: 'Mens en maatschappij', t: 'De leerling onderzoekt historische verschijnselen.' },
    { nr: 27, lg: 'Mens en maatschappij', t: 'De leerling onderzoekt economische verschijnselen.' },
    { nr: 28, lg: 'Mens en maatschappij', t: 'De leerling onderzoekt hoe mensen samenleven.' },
    { nr: 29, lg: 'Mens en natuur', t: 'De leerling verkent en verklaart de wereld vanuit natuurwetenschappelijk en technologisch perspectief.' },
    { nr: 30, lg: 'Mens en natuur', t: 'De leerling toont inzicht in en experimenteert met natuurkundige verschijnselen en technische systemen.' },
    { nr: 31, lg: 'Mens en natuur', t: 'De leerling toont inzicht in en experimenteert met materie, processen en circulaire productie.' },
    { nr: 32, lg: 'Mens en natuur', t: 'De leerling toont inzicht in organismen en hun gezondheid.' },
    { nr: 33, lg: 'Mens en natuur', t: 'De leerling toont inzicht in en verkent systeem aarde.' },
    { nr: 34, lg: 'Moderne vreemde talen', t: 'De leerling gebruikt de Engelse taal in rijke en betekenisvolle contexten.' },
    { nr: 35, lg: 'Moderne vreemde talen', t: 'De leerling communiceert in het Engels.' },
    { nr: 36, lg: 'Moderne vreemde talen', t: 'De leerling ontwikkelt zich als taal- en cultuurbewuste gebruiker van de Engelse taal.' },
    { nr: 37, lg: 'Moderne vreemde talen', t: 'De leerling gebruikt de tweede moderne vreemde taal in rijke en betekenisvolle contexten.' },
    { nr: 38, lg: 'Moderne vreemde talen', t: 'De leerling communiceert in de tweede moderne vreemde taal.' },
    { nr: 39, lg: 'Moderne vreemde talen', t: 'De leerling ontwikkelt zich als taal- en cultuurbewuste gebruiker van de tweede moderne vreemde taal.' },
    { nr: 40, lg: 'Kunst en cultuur', t: 'De leerling ontwikkelt artistiek creatief vermogen.' },
    { nr: 41, lg: 'Kunst en cultuur', t: 'De leerling maakt kunstzinnige uitingen.' },
    { nr: 42, lg: 'Kunst en cultuur', t: 'De leerling maakt kunst en cultuur mee.' },
    { nr: 43, lg: 'Bewegen en sport', t: 'De leerling ontwikkelt zich in het bewegen.' },
    { nr: 44, lg: 'Bewegen en sport', t: 'De leerling beweegt samen met anderen.' },
    { nr: 45, lg: 'Bewegen en sport', t: 'De leerling geeft betekenis aan bewegen.' },
  ],
}
const KD_SETS = new Set(['po', 'vo'])
const kerndoel = (set, nr) => (KERNDOELEN[set] || []).find((k) => k.nr === nr)

// ---- mappers ----
const mapChild = (r) => ({
  id: r.id, name: r.name, color: r.color,
  birthYear: r.birth_year ?? undefined, birthDate: r.birth_date ?? undefined,
  subjects: r.subjects ? JSON.parse(r.subjects) : undefined,
  subcategories: r.subcategories ? JSON.parse(r.subcategories) : undefined,
  // Welke kerndoelenset geldt. Nooit automatisch: zonder keuze is het po, ook
  // als het kind al 12 is — de app vraagt het dan, maar schakelt niet zelf.
  kerndoelenSet: KD_SETS.has(r.kerndoelen_set) ? r.kerndoelen_set : 'po',
  kerndoelenSetAt: r.kerndoelen_set_at ?? undefined,
  kerndoelenAsked: !!r.kerndoelen_asked,
  createdAt: r.created_at,
})

/** Leeftijd in hele jaren, of null als er geen geboortedatum bekend is. */
function childAge(r) {
  if (r.birth_date) {
    const d = new Date(r.birth_date + 'T00:00:00')
    if (!isNaN(d)) {
      const t = new Date()
      let a = t.getFullYear() - d.getFullYear()
      const m = t.getMonth() - d.getMonth()
      if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--
      return a
    }
  }
  if (r.birth_year) return new Date().getFullYear() - Number(r.birth_year)
  return null
}

const DEFAULT_SUBJECTS = [
  'Taal', 'Rekenen', 'Lezen', 'Schrijven', 'Natuur', 'Algemene wetenschap',
  'Technisch', 'Geschiedenis', 'Aardrijkskunde', 'Creatief', 'Muziek',
  'Bewegen', 'Sociaal', 'Uitstapje', 'Overig',
]
function accountSettings(accId) {
  const row = db.prepare('SELECT subjects, ai_enabled, subcategories, photo_ai, kerndoelen, kerndoelen_ai FROM account_settings WHERE account_id = ?').get(accId)
  return {
    subjects: row && row.subjects ? JSON.parse(row.subjects) : DEFAULT_SUBJECTS,
    aiEnabled: row ? row.ai_enabled !== 0 : true,
    // { "Taal": ["Woordenschat","Spelling"], ... }
    subcategories: row && row.subcategories ? JSON.parse(row.subcategories) : {},
    // Foto's naar de AI sturen als schrijfhulp: bewust standaard uit.
    photoAiEnabled: row ? row.photo_ai === 1 : false,
    // Kerndoelen bijhouden is optioneel; niemand is er iets toe verplicht.
    kerndoelenEnabled: row ? row.kerndoelen === 1 : false,
    // Aan = de AI doet voorstellen; uit = je vinkt zelf aan.
    kerndoelenAi: row ? row.kerndoelen_ai === 1 : false,
  }
}
const mapMemo = (r, resourceIds, likedBy) => ({
  id: r.id, childId: r.child_id, date: r.date, text: r.text || '',
  subjects: r.subjects ? JSON.parse(r.subjects) : [],
  photoIds: r.photo_ids ? JSON.parse(r.photo_ids) : [],
  resourceIds: resourceIds || [],
  draft: !!r.draft,
  mood: r.mood || undefined,
  likeCount: r.like_count ?? 0,
  likedByMe: !!r.liked,
  likedBy: likedBy || [],
  createdAt: r.created_at, updatedAt: r.updated_at,
})
const mapFocus = (r) => ({
  id: r.id, childId: r.child_id, text: r.text || '',
  subject: r.subject || undefined, status: r.status || 'open',
  sourceMemoId: r.source_memo_id || undefined,
  linkKind: r.link_kind || undefined,
  createdAt: r.created_at, updatedAt: r.updated_at,
})
// Toegestane stemmingen (reactie van het kind) en aandachtspunt-statussen.
const MOODS = new Set(['leuk', 'prima', 'ging_wel', 'lastig'])
const FOCUS_STATUS = new Set(['open', 'later', 'done'])
const validMood = (v) => (MOODS.has(v) ? v : null)

const RESOURCE_TYPES = new Set(['leerboek', 'leesboek', 'website', 'video', 'app', 'overig'])
// Toegestane statussen per type (leerboeken werken anders dan leesboeken).
const RESOURCE_STATUS_BY_TYPE = {
  leesboek: new Set(['te_lezen', 'bezig', 'gelezen']),
  leerboek: new Set(['in_gebruik', 'afgerond']),
}
const mapResource = (r, childIds) => ({
  id: r.id, type: r.type || 'overig', title: r.title,
  author: r.author || undefined, url: r.url || undefined,
  subjects: r.subjects ? JSON.parse(r.subjects) : r.subject ? [r.subject] : [],
  status: r.status || undefined,
  readDate: r.read_date || undefined,
  notes: r.notes || undefined,
  childIds: childIds || [],
  createdAt: r.created_at, updatedAt: r.updated_at,
})
// Statussen die "af/gelezen" betekenen.
const FINISHED_STATUS = new Set(['gelezen', 'afgerond'])

// Maakt/werkt bij/verwijdert een aan een memo gekoppeld aandachtspunt.
function upsertMemoFocus(memoId, childId, accountId, linkKind, text, subject, defaultStatus) {
  const t = (text || '').trim()
  const existing = db
    .prepare('SELECT * FROM focus_points WHERE source_memo_id = ? AND child_id = ? AND link_kind = ?')
    .get(memoId, childId, linkKind)
  if (t) {
    const subj = (subject || '').trim() || null
    if (existing) {
      db.prepare('UPDATE focus_points SET text=?, subject=?, updated_at=? WHERE id=?').run(t, subj, now(), existing.id)
    } else {
      db.prepare(
        'INSERT INTO focus_points (id,account_id,child_id,text,subject,status,source_memo_id,link_kind,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(uid(), accountId, childId, t, subj, defaultStatus, memoId, linkKind, now(), now())
    }
  } else if (existing && existing.status !== 'done') {
    // Leeggemaakt en nog niet afgerond → weghalen.
    db.prepare('DELETE FROM focus_points WHERE id=?').run(existing.id)
  }
}
// Koppelt (geldige) leermiddelen aan een memo; vervangt bestaande koppelingen.
function setMemoResources(memoId, accountId, resourceIds) {
  if (!Array.isArray(resourceIds)) return
  const valid = [...new Set(resourceIds)].filter((rid) =>
    db.prepare('SELECT id FROM resources WHERE id = ? AND account_id = ?').get(rid, accountId),
  )
  db.prepare('DELETE FROM memo_resources WHERE memo_id = ?').run(memoId)
  for (const rid of valid)
    db.prepare('INSERT OR IGNORE INTO memo_resources (memo_id,resource_id) VALUES (?,?)').run(memoId, rid)
  return valid
}

// Synchroniseert het aandachtspunt + "voor later" van een memo (per kind).
function syncMemoFocus(memoId, childId, accountId, body) {
  // Bij één memo voor meerdere kinderen hoeft een aandachtspunt niet voor
  // allemaal te gelden: "de namen van boerderijdieren" is er vaak maar voor
  // één. Staat er geen lijst bij, dan geldt het voor elk gekozen kind — zo
  // blijft het werken zoals het altijd deed.
  const geldt = (lijst) => !Array.isArray(lijst) || lijst.includes(childId)
  if (body.attentionText !== undefined || body.attentionSubject !== undefined)
    upsertMemoFocus(
      memoId, childId, accountId, 'attention',
      geldt(body.attentionChildIds) ? body.attentionText : '',
      body.attentionSubject, 'open',
    )
  if (body.followupText !== undefined)
    upsertMemoFocus(
      memoId, childId, accountId, 'later',
      geldt(body.followupChildIds) ? body.followupText : '',
      null, 'later',
    )
}
const mapKerndoelLink = (r) => ({
  id: r.id,
  carrierType: r.carrier_type, carrierId: r.carrier_id,
  childId: r.child_id,
  set: r.kd_set, nr: r.kd_nr,
  source: r.source || 'manual',
  status: r.status || 'ok',
  quote: r.quote || undefined,
  createdAt: r.created_at,
})
const CARRIERS = new Set(['memo', 'resource', 'event', 'period'])

const mapPeriod = (r, childIds) => ({
  id: r.id, title: r.title,
  start: r.start_date, end: r.end_date,
  note: r.note || undefined,
  status: r.status || 'ok',
  source: r.source || 'manual',
  childIds: childIds || [],
  createdAt: r.created_at, updatedAt: r.updated_at,
})

const mapSummary = (r) => ({
  id: r.id, childId: r.child_id, period: r.period, periodLabel: r.period_label,
  start: r.start, end: r.end, text: r.text || '',
  photoIds: r.photo_ids ? JSON.parse(r.photo_ids) : [],
  createdAt: r.created_at,
})
const mapComment = (r) => ({
  id: r.id, targetType: r.target_type, targetId: r.target_id,
  authorEmail: r.author_email, text: r.text || '', createdAt: r.created_at,
})
const mapEvent = (r, childIds, focusIds) => ({
  end: r.end_date || undefined,
  id: r.id, title: r.title, notes: r.notes || '',
  type: r.type || 'uitje', date: r.date, time: r.time || undefined,
  freq: r.freq || 'none', everyN: r.every_n || 1,
  weekdays: r.weekdays ? String(r.weekdays).split(',').filter(Boolean) : [],
  until: r.until_date || undefined,
  sortOrder: r.sort_order || 0,
  subjects: r.subjects ? JSON.parse(r.subjects) : [],
  childIds: childIds || [],
  focusIds: focusIds || [],
  createdAt: r.created_at, updatedAt: r.updated_at,
})

// ---- auth helpers ----
const SECRET =
  process.env.PORTFOLIO_SECRET ||
  crypto.createHash('sha256').update('pf-fallback').digest('hex')
const COOKIE_NAME = 'pf_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function parseCookies(req) {
  const header = req.headers.cookie || ''
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}
function timingEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}
function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url')
}
function makeSession(userId) {
  const payload = `${userId}.${Date.now()}`
  return `${payload}.${sign(payload)}`
}
function sessionUserId(req) {
  const c = parseCookies(req)[COOKIE_NAME]
  if (!c) return null
  const i = c.lastIndexOf('.')
  if (i < 0) return null
  const payload = c.slice(0, i)
  const sig = c.slice(i + 1)
  if (!timingEqual(sig, sign(payload))) return null
  const [userId, ts] = payload.split('.')
  // Server-side vervaldatum: een gelekte cookie blijft niet eeuwig geldig.
  const issued = Number(ts || 0)
  if (!issued || Date.now() - issued > COOKIE_MAX_AGE * 1000) return null
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
  return user ? userId : null
}
function setSessionCookie(res, userId) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${makeSession(userId)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`,
  )
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex')
  return { salt, hash }
}
function verifyPassword(pw, salt, hash) {
  const h = crypto.scryptSync(pw, salt, 64).toString('hex')
  return timingEqual(h, hash)
}
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

// ---- admin ----
const ADMIN_EMAILS = new Set(
  (process.env.PORTFOLIO_ADMIN_EMAIL || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
)
function isAdminUser(userId) {
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(userId)
  return u ? ADMIN_EMAILS.has(u.email.toLowerCase()) : false
}
// Eigenaar-only acties (delen beheren, alles wissen).
function requireOwner(req, res) {
  if (req.role !== 'owner') {
    sendJson(res, 403, { error: 'Alleen de eigenaar kan dit doen.' })
    return false
  }
  return true
}
// Inhoud wijzigen mag de eigenaar én medeouders (editor); meelezers niet.
function requireEditor(req, res) {
  if (req.role !== 'owner' && req.role !== 'editor') {
    sendJson(res, 403, { error: 'Je hebt alleen leesrechten voor dit portfolio.' })
    return false
  }
  return true
}
function userEmail(userId) {
  return db.prepare('SELECT email FROM users WHERE id = ?').get(userId)?.email || ''
}
// Maakt (optioneel) het eigenaar-lidmaatschap + past openstaande uitnodigingen toe.
// Uitgenodigde meelezers (lerares) krijgen GEEN eigen portfolio.
function setupMemberships(userId, email, ownPortfolio) {
  if (ownPortfolio) {
    db.prepare(
      'INSERT INTO memberships (id,account_id,user_id,role,created_at) VALUES (?,?,?,?,?)',
    ).run(uid(), userId, userId, 'owner', now())
  }
  for (const inv of db.prepare('SELECT * FROM invites WHERE email = ?').all(email)) {
    const dup = db
      .prepare('SELECT id FROM memberships WHERE account_id = ? AND user_id = ?')
      .get(inv.account_id, userId)
    if (!dup) {
      db.prepare(
        'INSERT INTO memberships (id,account_id,user_id,role,created_at) VALUES (?,?,?,?,?)',
      ).run(uid(), inv.account_id, userId, inv.role, now())
    }
    db.prepare('DELETE FROM invites WHERE id = ?').run(inv.id)
  }
}

// ---- rate limiting (in-memory per IP) ----
const rateBuckets = new Map()
function clientIp(req) {
  const xff = req.headers['x-forwarded-for']
  if (xff) return String(xff).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}
function rateLimit(key, max, windowMs) {
  const t = Date.now()
  let b = rateBuckets.get(key)
  if (!b || t > b.resetAt) {
    b = { count: 0, resetAt: t + windowMs }
    rateBuckets.set(key, b)
  }
  b.count++
  return b.count <= max
}
const sweep = setInterval(() => {
  const t = Date.now()
  for (const [k, b] of rateBuckets) if (t > b.resetAt) rateBuckets.delete(k)
}, 10 * 60 * 1000)
sweep.unref?.()

// ---- e-mail (SendGrid) ----
const SENDGRID_KEY = process.env.PORTFOLIO_SENDGRID_KEY || ''
const FROM_EMAIL = process.env.PORTFOLIO_FROM_EMAIL || 'noreply@kindfolio.nl'
const FROM_NAME = process.env.PORTFOLIO_FROM_NAME || 'Kindfolio'
const APP_URL = process.env.PORTFOLIO_APP_URL || 'https://app.kindfolio.nl'
const REQUIRE_VERIFY = process.env.PORTFOLIO_REQUIRE_VERIFY === 'true'

// Eenvoudige HTML→tekst voor de platte-tekst-variant van de mail.
function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|h\d|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function sendEmail(to, subject, html) {
  if (!SENDGRID_KEY) throw new Error('SendGrid niet geconfigureerd')
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      reply_to: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      // Plain-text vóór HTML (multipart) — beter voor spamfilters.
      content: [
        { type: 'text/plain', value: htmlToText(html) },
        { type: 'text/html', value: html },
      ],
      // Transactionele mail: geen link-rewriting (sendgrid.net) of trackingpixel.
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
    }),
  })
  if (!r.ok) throw new Error('SendGrid-fout: ' + (await r.text()).slice(0, 200))
}

// Verstuurt een niet-kritische mail en logt fouten (maar gooit niet door).
async function sendEmailSafe(to, subject, html, context) {
  try {
    await sendEmail(to, subject, html)
  } catch (e) {
    console.error(`[mail] verzenden mislukt (${context}) naar ${to}: ${(e && e.message) || e}`)
  }
}

function verifyEmailHtml(link) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#2f6f4f">Welkom bij Kindfolio 📚</h2>
    <p>Bevestig je e-mailadres om je account te activeren:</p>
    <p><a href="${link}" style="background:#2f6f4f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">E-mailadres bevestigen</a></p>
    <p style="color:#666;font-size:13px">Of plak deze link in je browser:<br>${link}</p>
    <p style="color:#999;font-size:12px">Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>
  </div>`
}

function resetEmailHtml(link) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#2f6f4f">Wachtwoord opnieuw instellen</h2>
    <p>Je hebt gevraagd om je wachtwoord opnieuw in te stellen. Klik op de knop (geldig voor 1 uur):</p>
    <p><a href="${link}" style="background:#2f6f4f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Nieuw wachtwoord instellen</a></p>
    <p style="color:#666;font-size:13px">Of plak deze link in je browser:<br>${link}</p>
    <p style="color:#999;font-size:12px">Heb je dit niet aangevraagd? Dan kun je deze mail negeren; er verandert niets aan je account.</p>
  </div>`
}

function inviteExistingHtml(owner) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#2f6f4f">Je hebt toegang gekregen 📖</h2>
    <p><strong>${owner}</strong> heeft je toegang gegeven om mee te kijken in hun Kindfolio (thuisonderwijs-portfolio).</p>
    <p>Log in met dit e-mailadres om de memo's te bekijken en reacties/tips te plaatsen:</p>
    <p><a href="${APP_URL}" style="background:#2f6f4f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Naar Kindfolio</a></p>
  </div>`
}

function inviteNewHtml(owner, email) {
  const link = `${APP_URL}/?uitnodiging=${encodeURIComponent(email)}`
  return `<div style="font-family:sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#2f6f4f">Uitnodiging voor Kindfolio 📖</h2>
    <p><strong>${owner}</strong> nodigt je uit om mee te kijken in hun Kindfolio (thuisonderwijs-portfolio) en tips te geven.</p>
    <p>Maak een account aan met <strong>dit e-mailadres</strong> (je hebt geen uitnodigingscode nodig):</p>
    <p><a href="${link}" style="background:#2f6f4f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Account aanmaken</a></p>
    <p style="color:#999;font-size:12px">Na registreren zie je automatisch het gedeelde portfolio.</p>
  </div>`
}

// Escapeert tekst voor veilige weergave in een HTML-mail.
function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
}

function feedbackDoneHtml(message) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#2f6f4f">Je feedback is verwerkt ✅</h2>
    <p>Bedankt voor je feedback in Kindfolio! Je suggestie is meegenomen in een nieuwe update:</p>
    <blockquote style="border-left:3px solid #2f6f4f;margin:0;padding:8px 14px;color:#333;background:#f3f6f3">${esc(message)}</blockquote>
    <p style="margin-top:16px"><a href="${APP_URL}/#/feedback" style="background:#2f6f4f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Naar Kindfolio</a></p>
  </div>`
}

function newFeedbackHtml(author, message) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#2f6f4f">Nieuwe feedback in Kindfolio 📝</h2>
    <p><strong>${esc(author)}</strong> heeft feedback geplaatst:</p>
    <blockquote style="border-left:3px solid #2f6f4f;margin:0;padding:8px 14px;color:#333;background:#f3f6f3">${esc(message)}</blockquote>
    <p style="margin-top:16px"><a href="${APP_URL}/#/feedback" style="background:#2f6f4f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Bekijk feedback</a></p>
  </div>`
}

function feedbackReplyHtml(author, text) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#2f6f4f">Reactie op je feedback 💬</h2>
    <p><strong>${esc(author)}</strong> heeft gereageerd op jouw feedback:</p>
    <blockquote style="border-left:3px solid #2f6f4f;margin:0;padding:8px 14px;color:#333;background:#f3f6f3">${esc(text)}</blockquote>
    <p style="margin-top:16px"><a href="${APP_URL}/#/feedback" style="background:#2f6f4f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Bekijk feedback</a></p>
  </div>`
}

function newCommentHtml(author, context, text) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#2f6f4f">Nieuwe reactie 💬</h2>
    <p><strong>${esc(author)}</strong> heeft gereageerd ${esc(context)}:</p>
    <blockquote style="border-left:3px solid #2f6f4f;margin:0;padding:8px 14px;color:#333;background:#f3f6f3">${esc(text)}</blockquote>
    <p style="margin-top:16px"><a href="${APP_URL}" style="background:#2f6f4f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Open Kindfolio</a></p>
  </div>`
}

// ---- http helpers ----
function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(obj))
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
async function readJson(req) {
  const buf = await readBody(req, MAX_JSON_BYTES)
  if (!buf.length) return {}
  return JSON.parse(buf.toString('utf8'))
}
function deletePhotoFiles(ids) {
  for (const id of ids) {
    try { fs.unlinkSync(path.join(PHOTO_DIR, id)) } catch {}
    try { db.prepare('DELETE FROM photos WHERE id = ?').run(id) } catch {}
  }
}

// ---- routes ----
const routes = []
const add = (method, pattern, handler) => routes.push({ method, pattern, handler })

add('GET', /^\/api\/health$/, (req, res) => sendJson(res, 200, { ok: true }))

// --- Auth ---
add('POST', /^\/api\/register$/, async (req, res) => {
  if (!rateLimit('reg:' + clientIp(req), 5, 60 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Te veel registratiepogingen. Probeer het later opnieuw.' })
  }
  const body = await readJson(req)
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const invited = db.prepare('SELECT id FROM invites WHERE email = ?').get(email)
  // Aanmelden staat open voor iedereen. Wie via een uitnodiging binnenkomt
  // wordt meelezer bij dat portfolio en krijgt geen eigen portfolio.
  const wantsOwn = !invited
  if (!isEmail(email)) return sendJson(res, 400, { error: 'Ongeldig e-mailadres.' })
  if (password.length < 8) {
    return sendJson(res, 400, { error: 'Wachtwoord moet minstens 8 tekens zijn.' })
  }
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (exists) return sendJson(res, 409, { error: 'Er bestaat al een account met dit e-mailadres.' })
  const { salt, hash } = hashPassword(password)
  const id = uid()
  if (REQUIRE_VERIFY) {
    const token = crypto.randomBytes(24).toString('hex')
    db.prepare(
      'INSERT INTO users (id,email,pw_hash,pw_salt,verified,verify_token,created_at) VALUES (?,?,?,?,0,?,?)',
    ).run(id, email, hash, salt, token, now())
    try {
      await sendEmail(
        email,
        'Bevestig je Kindfolio-account',
        verifyEmailHtml(`${APP_URL}/api/verify?token=${token}`),
      )
    } catch (e) {
      console.error(`[mail] verzenden mislukt (verificatie) naar ${email}: ${(e && e.message) || e}`)
      db.prepare('DELETE FROM users WHERE id = ?').run(id)
      return sendJson(res, 502, {
        error: 'Kon de bevestigingsmail niet versturen. Probeer het later opnieuw.',
      })
    }
    setupMemberships(id, email, wantsOwn)
    return sendJson(res, 201, { email, needsVerification: true })
  }
  db.prepare(
    'INSERT INTO users (id,email,pw_hash,pw_salt,verified,created_at) VALUES (?,?,?,?,1,?)',
  ).run(id, email, hash, salt, now())
  setupMemberships(id, email, wantsOwn)
  setSessionCookie(res, id)
  sendJson(res, 201, { email })
})

add('POST', /^\/api\/login$/, async (req, res) => {
  if (!rateLimit('login:' + clientIp(req), 10, 10 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Te veel inlogpogingen. Probeer het over een paar minuten opnieuw.' })
  }
  const body = await readJson(req)
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  // Ook per account beperken (naast per IP): remt verspreide brute force.
  if (!rateLimit('login-email:' + email, 20, 15 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Te veel inlogpogingen. Probeer het over een paar minuten opnieuw.' })
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user || !verifyPassword(password, user.pw_salt, user.pw_hash)) {
    return sendJson(res, 401, { error: 'E-mailadres of wachtwoord onjuist.' })
  }
  if (user.verified === 0) {
    return sendJson(res, 403, {
      error: 'Bevestig eerst je e-mailadres. Check je mail (ook je spam-map).',
    })
  }
  setSessionCookie(res, user.id)
  sendJson(res, 200, { email: user.email })
})

add('GET', /^\/api\/verify$/, (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const token = url.searchParams.get('token') || ''
  const user = token
    ? db.prepare('SELECT id FROM users WHERE verify_token = ?').get(token)
    : null
  if (!user) {
    res.writeHead(302, { Location: `${APP_URL}/?verified=0` })
    return res.end()
  }
  db.prepare('UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?').run(user.id)
  // Meteen inloggen: wie net z'n adres bevestigt hoeft niet opnieuw in te typen.
  // (Scheelt een drempel, vooral op de telefoon vanuit de mail-app.)
  res.writeHead(302, {
    'Set-Cookie': `${COOKIE_NAME}=${makeSession(user.id)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`,
    Location: `${APP_URL}/?verified=1`,
  })
  res.end()
})

add('POST', /^\/api\/forgot$/, async (req, res) => {
  if (!rateLimit('forgot:' + clientIp(req), 5, 60 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Te veel verzoeken. Probeer het later opnieuw.' })
  }
  const body = await readJson(req)
  const email = String(body.email || '').trim().toLowerCase()
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (user) {
    const token = crypto.randomBytes(24).toString('hex')
    db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?')
      .run(token, Date.now() + 60 * 60 * 1000, user.id)
    try {
      await sendEmail(
        email,
        'Wachtwoord opnieuw instellen — Kindfolio',
        resetEmailHtml(`${APP_URL}/#/reset?token=${token}`),
      )
    } catch (e) {
      // Naar de gebruiker stil blijven (geen info lekken), maar server-side loggen.
      console.error(`[mail] verzenden mislukt (wachtwoord-herstel) naar ${email}: ${(e && e.message) || e}`)
    }
  }
  // Altijd 200: verraad niet of een e-mailadres bestaat.
  sendJson(res, 200, { ok: true })
})

add('POST', /^\/api\/reset$/, async (req, res) => {
  const body = await readJson(req)
  const token = String(body.token || '')
  const password = String(body.password || '')
  if (password.length < 8) {
    return sendJson(res, 400, { error: 'Wachtwoord moet minstens 8 tekens zijn.' })
  }
  const user = token
    ? db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token)
    : null
  if (!user || !user.reset_expires || Date.now() > user.reset_expires) {
    return sendJson(res, 400, {
      error: 'Deze link is ongeldig of verlopen. Vraag een nieuwe aan.',
    })
  }
  const { salt, hash } = hashPassword(password)
  db.prepare(
    'UPDATE users SET pw_hash = ?, pw_salt = ?, reset_token = NULL, reset_expires = NULL, verified = 1 WHERE id = ?',
  ).run(hash, salt, user.id)
  sendJson(res, 200, { ok: true })
})

add('POST', /^\/api\/logout$/, (req, res) => {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  )
  sendJson(res, 200, { ok: true })
})

add('GET', /^\/api\/me$/, (req, res) => {
  const userId = sessionUserId(req)
  if (!userId) return sendJson(res, 401, { error: 'auth' })
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId)
  sendJson(res, 200, { email: user.email })
})

// Houdt bij wanneer iemand de app voor het laatst opende (hooguit 1x per uur
// een schrijfactie). Alleen een tijdstempel — geen gedrag of inhoud.
function touchLastSeen(userId) {
  try {
    const t = now()
    const row = db.prepare('SELECT last_seen FROM users WHERE id = ?').get(userId)
    if (!row || !row.last_seen || t - row.last_seen > 3600000) {
      db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(t, userId)
    }
  } catch {
    /* niet kritisch */
  }
}

// --- Data (account-scoped via req.accountId) ---
add('GET', /^\/api\/state$/, (req, res) => {
  const acc = req.accountId
  touchLastSeen(req.userId)
  const children = db.prepare('SELECT * FROM children WHERE account_id = ? ORDER BY created_at ASC').all(acc).map(mapChild)
  const memoResLinks = {}
  for (const l of db
    .prepare(
      'SELECT mr.memo_id, mr.resource_id FROM memo_resources mr JOIN memos m ON m.id = mr.memo_id WHERE m.account_id = ?',
    )
    .all(acc)) {
    ;(memoResLinks[l.memo_id] ||= []).push(l.resource_id)
  }
  // Wie heeft wat leuk gevonden — zodat de tijdlijn de namen kan tonen.
  const memoLikeNames = {}
  for (const l of db
    .prepare(
      `SELECT ml.memo_id, u.email FROM memo_likes ml
       JOIN memos m ON m.id = ml.memo_id
       JOIN users u ON u.id = ml.user_id
       WHERE m.account_id = ? ORDER BY ml.created_at ASC`,
    )
    .all(acc)) {
    ;(memoLikeNames[l.memo_id] ||= []).push(displayName(l.email))
  }
  const memos = db.prepare(
    `SELECT *,
       (SELECT COUNT(*) FROM memo_likes l WHERE l.memo_id = memos.id) AS like_count,
       (SELECT COUNT(*) FROM memo_likes l WHERE l.memo_id = memos.id AND l.user_id = ?) AS liked
     FROM memos WHERE account_id = ? ORDER BY date DESC, created_at DESC`,
  ).all(req.userId, acc).map((r) =>
    mapMemo(r, memoResLinks[r.id] || [], memoLikeNames[r.id] || []),
  )
  const summaries = db.prepare('SELECT * FROM summaries WHERE account_id = ? ORDER BY created_at DESC').all(acc).map(mapSummary)
  const comments = db
    .prepare('SELECT * FROM comments WHERE account_id = ? ORDER BY created_at ASC')
    .all(acc)
    .map(mapComment)
  const eventLinks = {}
  for (const l of db
    .prepare(
      'SELECT ec.event_id, ec.child_id FROM event_children ec JOIN events e ON e.id = ec.event_id WHERE e.account_id = ?',
    )
    .all(acc)) {
    ;(eventLinks[l.event_id] ||= []).push(l.child_id)
  }
  const focusLinks = {}
  for (const l of db
    .prepare(
      'SELECT ef.event_id, ef.focus_id FROM event_focus ef JOIN events e ON e.id = ef.event_id WHERE e.account_id = ?',
    )
    .all(acc)) {
    ;(focusLinks[l.event_id] ||= []).push(l.focus_id)
  }
  const events = db
    .prepare('SELECT * FROM events WHERE account_id = ? ORDER BY date ASC, time ASC')
    .all(acc)
    .map((r) => mapEvent(r, eventLinks[r.id] || [], focusLinks[r.id] || []))
  const focusPoints = db
    .prepare('SELECT * FROM focus_points WHERE account_id = ? ORDER BY created_at DESC')
    .all(acc)
    .map(mapFocus)
  const resLinks = {}
  for (const l of db
    .prepare(
      'SELECT rc.resource_id, rc.child_id FROM resource_children rc JOIN resources r ON r.id = rc.resource_id WHERE r.account_id = ?',
    )
    .all(acc)) {
    ;(resLinks[l.resource_id] ||= []).push(l.child_id)
  }
  const resources = db
    .prepare('SELECT * FROM resources WHERE account_id = ? ORDER BY created_at DESC')
    .all(acc)
    .map((r) => mapResource(r, resLinks[r.id] || []))
  const eventDone = db
    .prepare('SELECT event_id, date FROM event_done WHERE account_id = ?')
    .all(acc)
    .map((r) => `${r.event_id}|${r.date}`)
  const periodLinks = {}
  for (const l of db
    .prepare(
      'SELECT pc.period_id, pc.child_id FROM period_children pc JOIN periods p ON p.id = pc.period_id WHERE p.account_id = ?',
    )
    .all(acc)) {
    ;(periodLinks[l.period_id] ||= []).push(l.child_id)
  }
  const periods = db
    .prepare('SELECT * FROM periods WHERE account_id = ? ORDER BY start_date DESC')
    .all(acc)
    .map((r) => mapPeriod(r, periodLinks[r.id] || []))
  // De kerndoelenlijsten en -koppelingen alleen meesturen als iemand ze gebruikt.
  const settings = accountSettings(acc)
  const kerndoelen = settings.kerndoelenEnabled ? KERNDOELEN : undefined
  const kerndoelLinks = settings.kerndoelenEnabled
    ? db
        .prepare('SELECT * FROM kerndoel_links WHERE account_id = ? ORDER BY created_at ASC')
        .all(acc)
        .map(mapKerndoelLink)
    : undefined
  sendJson(res, 200, {
    children,
    memos,
    summaries,
    comments,
    events,
    focusPoints,
    resources,
    eventDone,
    periods,
    kerndoelen,
    kerndoelLinks,
    account: {
      id: acc,
      ownerEmail: userEmail(acc),
      email: userEmail(req.userId),
      role: req.role,
      isAdmin: isAdminUser(req.userId),
      ...settings,
    },
  })
})

add('POST', /^\/api\/settings$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const cur = accountSettings(req.accountId)
  const subjects = Array.isArray(body.subjects)
    ? [...new Set(body.subjects.map((s) => String(s).trim()).filter(Boolean))]
    : cur.subjects
  const aiEnabled = body.aiEnabled !== undefined ? (body.aiEnabled ? 1 : 0) : cur.aiEnabled ? 1 : 0
  // Subcategorieën: object subject -> lijst (opgeschoond en ontdubbeld).
  let subcategories = cur.subcategories
  if (body.subcategories && typeof body.subcategories === 'object') {
    subcategories = {}
    for (const [k, v] of Object.entries(body.subcategories)) {
      if (!Array.isArray(v)) continue
      const cleaned = [...new Set(v.map((s) => String(s).trim()).filter(Boolean))]
      if (cleaned.length) subcategories[String(k)] = cleaned
    }
  }
  const huidig = accountSettings(req.accountId)
  const photoAi =
    body.photoAiEnabled === undefined ? huidig.photoAiEnabled : !!body.photoAiEnabled
  const kerndoelen =
    body.kerndoelenEnabled === undefined ? huidig.kerndoelenEnabled : !!body.kerndoelenEnabled
  const kerndoelenAi =
    body.kerndoelenAi === undefined ? huidig.kerndoelenAi : !!body.kerndoelenAi
  db.prepare(
    'INSERT INTO account_settings (account_id,subjects,ai_enabled,subcategories,photo_ai,kerndoelen,kerndoelen_ai) VALUES (?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET subjects=excluded.subjects, ai_enabled=excluded.ai_enabled, subcategories=excluded.subcategories, photo_ai=excluded.photo_ai, kerndoelen=excluded.kerndoelen, kerndoelen_ai=excluded.kerndoelen_ai',
  ).run(
    req.accountId, JSON.stringify(subjects), aiEnabled, JSON.stringify(subcategories),
    photoAi ? 1 : 0, kerndoelen ? 1 : 0, kerndoelenAi ? 1 : 0,
  )
  sendJson(res, 200, {
    subjects, aiEnabled: !!aiEnabled, subcategories, photoAiEnabled: photoAi,
    kerndoelenEnabled: kerndoelen, kerndoelenAi,
  })
})

// Beheeroverzicht, gegroepeerd per portfolio: de eigenaar met daaronder de
// mensen die meekijken of meewerken (bv. een lerares of medeouder).
add('GET', /^\/api\/admin\/users$/, (req, res) => {
  if (!isAdminUser(req.userId)) return sendJson(res, 403, { error: 'Geen toegang' })
  const users = db
    .prepare('SELECT id, email, created_at, verified, last_seen FROM users')
    .all()
  const byId = {}
  for (const u of users) byId[u.id] = u
  const memberships = db.prepare('SELECT account_id, user_id, role FROM memberships').all()

  const mapUser = (u, role) => ({
    email: u.email,
    role,
    createdAt: u.created_at,
    verified: !!u.verified,
    lastSeen: u.last_seen || undefined,
  })

  // Per account: wie is de eigenaar en wie heeft er verder toegang.
  const accounts = []
  const seen = new Set()
  for (const m of memberships.filter((x) => x.role === 'owner')) {
    const owner = byId[m.user_id]
    if (!owner) continue
    seen.add(owner.id)
    const acc = m.account_id
    const others = memberships
      .filter((x) => x.account_id === acc && x.user_id !== m.user_id)
      .map((x) => (byId[x.user_id] ? mapUser(byId[x.user_id], x.role) : null))
      .filter(Boolean)
    for (const o of others) seen.add(users.find((u) => u.email === o.email)?.id)
    accounts.push({
      ...mapUser(owner, 'owner'),
      children: db.prepare('SELECT COUNT(*) AS c FROM children WHERE account_id = ?').get(acc).c,
      memos: db.prepare('SELECT COUNT(*) AS c FROM memos WHERE account_id = ?').get(acc).c,
      summaries: db.prepare('SELECT COUNT(*) AS c FROM summaries WHERE account_id = ?').get(acc).c,
      members: others,
    })
  }
  accounts.sort((a, b) => b.createdAt - a.createdAt)

  // Uitgenodigden zonder eigen portfolio staan al onder hun account(s); wie
  // nergens bij hoort tonen we apart, zodat niemand uit beeld valt.
  const losse = users
    .filter((u) => !memberships.some((m) => m.user_id === u.id))
    .map((u) => mapUser(u, 'geen'))
    .sort((a, b) => b.createdAt - a.createdAt)

  // Openstaande uitnodigingen (nog niet geregistreerd).
  const invites = db
    .prepare('SELECT account_id, email, role FROM invites')
    .all()
    .map((i) => ({
      email: i.email,
      role: i.role,
      ownerEmail: byId[i.account_id]?.email || '',
    }))

  sendJson(res, 200, { accounts, losse, invites })
})

// Eigen naam als die is ingevuld, anders het deel vóór de @ (privacy).
function displayName(email) {
  return String(email || '').split('@')[0] || 'iemand'
}
function pickName(name, email) {
  const n = String(name || '').trim()
  return n || displayName(email)
}
function mapFeedbackRow(r, userId) {
  return {
    id: r.id,
    author: pickName(r.author_name, r.email),
    message: r.message,
    status: r.status || 'open',
    votes: r.votes,
    votedByMe: !!r.voted,
    commentCount: r.comment_count,
    mine: r.user_id === userId,
    createdAt: r.created_at,
  }
}
const FEEDBACK_SELECT = `
  SELECT f.id, f.user_id, f.email, f.author_name, f.message, f.status, f.created_at,
    (SELECT COUNT(*) FROM feedback_votes v WHERE v.feedback_id = f.id) AS votes,
    (SELECT COUNT(*) FROM feedback_votes v WHERE v.feedback_id = f.id AND v.user_id = ?) AS voted,
    (SELECT COUNT(*) FROM feedback_comments c WHERE c.feedback_id = f.id) AS comment_count
  FROM feedback f`

// Gedeeld prikbord: alle gebruikers zien dezelfde feedback (niet per account).
add('GET', /^\/api\/feedback$/, (req, res) => {
  const rows = db
    .prepare(
      `${FEEDBACK_SELECT} ORDER BY (f.status = 'done') ASC, votes DESC, f.created_at DESC`,
    )
    .all(req.userId)
  sendJson(res, 200, { feedback: rows.map((r) => mapFeedbackRow(r, req.userId)) })
})

add('POST', /^\/api\/feedback$/, async (req, res) => {
  if (!rateLimit('fb:' + req.userId, 15, 60 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Rustig aan — probeer het over een uurtje weer.' })
  }
  const body = await readJson(req)
  const message = (body.message || '').trim()
  if (!message) return sendJson(res, 400, { error: 'Schrijf eerst een bericht.' })
  const id = uid()
  const authorName = String(body.name || '').trim().slice(0, 80) || null
  db.prepare(
    "INSERT INTO feedback (id,account_id,user_id,email,author_name,message,page,status,created_at) VALUES (?,?,?,?,?,?,?,'open',?)",
  ).run(id, req.accountId, req.userId, userEmail(req.userId), authorName, message.slice(0, 4000), (body.page || '').slice(0, 200), now())
  const row = db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(req.userId, id)
  // Beheerder(s) op de hoogte stellen van nieuwe feedback.
  const author = pickName(authorName, userEmail(req.userId))
  for (const adminEmail of ADMIN_EMAILS) {
    sendEmailSafe(adminEmail, 'Nieuwe feedback in Kindfolio 📝', newFeedbackHtml(author, message), 'nieuwe-feedback')
  }
  sendJson(res, 201, mapFeedbackRow(row, req.userId))
})

add('POST', /^\/api\/feedback\/([^/]+)\/vote$/, (req, res, m) => {
  const fb = db.prepare('SELECT id FROM feedback WHERE id = ?').get(m[1])
  if (!fb) return sendJson(res, 404, { error: 'niet gevonden' })
  const existing = db
    .prepare('SELECT 1 FROM feedback_votes WHERE feedback_id = ? AND user_id = ?')
    .get(m[1], req.userId)
  if (existing) {
    db.prepare('DELETE FROM feedback_votes WHERE feedback_id = ? AND user_id = ?').run(m[1], req.userId)
  } else {
    db.prepare('INSERT INTO feedback_votes (feedback_id,user_id,created_at) VALUES (?,?,?)').run(m[1], req.userId, now())
  }
  const votes = db.prepare('SELECT COUNT(*) AS c FROM feedback_votes WHERE feedback_id = ?').get(m[1]).c
  sendJson(res, 200, { votes, votedByMe: !existing })
})

add('GET', /^\/api\/feedback\/([^/]+)\/comments$/, (req, res, m) => {
  const rows = db
    .prepare('SELECT id, user_id, email, author_name, text, created_at FROM feedback_comments WHERE feedback_id = ? ORDER BY created_at ASC')
    .all(m[1])
  sendJson(res, 200, {
    comments: rows.map((r) => ({
      id: r.id,
      author: pickName(r.author_name, r.email),
      text: r.text,
      mine: r.user_id === req.userId,
      createdAt: r.created_at,
    })),
  })
})

add('POST', /^\/api\/feedback\/([^/]+)\/comments$/, async (req, res, m) => {
  if (!rateLimit('cmt:' + req.userId, 60, 60 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Te veel reacties achter elkaar. Probeer het zo weer.' })
  }
  const fb = db.prepare('SELECT id, user_id, email FROM feedback WHERE id = ?').get(m[1])
  if (!fb) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const text = (body.text || '').trim()
  if (!text) return sendJson(res, 400, { error: 'Schrijf eerst een reactie.' })
  const c = { id: uid(), email: userEmail(req.userId), created_at: now() }
  const authorName = String(body.name || '').trim().slice(0, 80) || null
  db.prepare('INSERT INTO feedback_comments (id,feedback_id,user_id,email,author_name,text,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(c.id, m[1], req.userId, c.email, authorName, text.slice(0, 2000), c.created_at)

  // Mail de indiener van het feedbackpunt (niet als die zelf reageert).
  if (fb.email && fb.user_id !== req.userId) {
    sendEmailSafe(fb.email, 'Nieuwe reactie op je feedback — Kindfolio 💬', feedbackReplyHtml(pickName(authorName, c.email), text), 'feedback-reactie')
  }

  sendJson(res, 201, {
    id: c.id,
    author: pickName(authorName, c.email),
    text: text.slice(0, 2000),
    mine: true,
    createdAt: c.created_at,
  })
})

// Beheerder: feedback markeren als verwerkt (of heropenen).
add('POST', /^\/api\/feedback\/([^/]+)\/status$/, async (req, res, m) => {
  if (!isAdminUser(req.userId)) return sendJson(res, 403, { error: 'Geen toegang' })
  const fb = db.prepare('SELECT email, status, message FROM feedback WHERE id = ?').get(m[1])
  if (!fb) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const status = body.status === 'done' ? 'done' : 'open'
  db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, m[1])
  // Bij overgang naar 'verwerkt': de indiener een mailtje sturen.
  if (status === 'done' && fb.status !== 'done' && fb.email) {
    sendEmailSafe(fb.email, 'Je feedback is verwerkt — Kindfolio ✅', feedbackDoneHtml(fb.message), 'feedback-verwerkt')
  }
  sendJson(res, 200, { status })
})

// Eigen feedback aanpassen (of die van iedereen als beheerder).
add('PATCH', /^\/api\/feedback\/([^/]+)$/, async (req, res, m) => {
  const fb = db.prepare('SELECT id, user_id FROM feedback WHERE id = ?').get(m[1])
  if (!fb) return sendJson(res, 404, { error: 'niet gevonden' })
  if (fb.user_id !== req.userId && !isAdminUser(req.userId)) {
    return sendJson(res, 403, { error: 'Je kunt alleen je eigen feedback aanpassen.' })
  }
  const body = await readJson(req)
  const message = (body.message || '').trim()
  if (!message) return sendJson(res, 400, { error: 'Schrijf eerst een bericht.' })
  db.prepare('UPDATE feedback SET message = ? WHERE id = ?').run(message.slice(0, 4000), m[1])
  const row = db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(req.userId, m[1])
  sendJson(res, 200, mapFeedbackRow(row, req.userId))
})

// Eigen feedback verwijderen (of die van iedereen als beheerder), incl. stemmen en reacties.
add('DELETE', /^\/api\/feedback\/([^/]+)$/, (req, res, m) => {
  const fb = db.prepare('SELECT id, user_id FROM feedback WHERE id = ?').get(m[1])
  if (!fb) return sendJson(res, 404, { error: 'niet gevonden' })
  if (fb.user_id !== req.userId && !isAdminUser(req.userId)) {
    return sendJson(res, 403, { error: 'Je kunt alleen je eigen feedback verwijderen.' })
  }
  db.prepare('DELETE FROM feedback_votes WHERE feedback_id = ?').run(m[1])
  db.prepare('DELETE FROM feedback_comments WHERE feedback_id = ?').run(m[1])
  db.prepare('DELETE FROM feedback WHERE id = ?').run(m[1])
  sendJson(res, 200, { ok: true })
})

// --- Reacties op "Wat is er nieuw"-updates (gedeeld, net als het feedbackprikbord) ---
// update_id komt uit de client-side changelog (bv. "2026-07-15").
const UPDATE_ID_RE = /^[0-9a-z-]{1,40}$/

add('GET', /^\/api\/updates$/, (req, res) => {
  const likeRows = db
    .prepare(
      `SELECT update_id, COUNT(*) AS likes,
        SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS liked
       FROM update_likes GROUP BY update_id`,
    )
    .all(req.userId)
  const commentRows = db
    .prepare('SELECT update_id, COUNT(*) AS c FROM update_comments GROUP BY update_id')
    .all()
  // Wie er een duim gaf — zodat je op de updatepagina de namen kunt zien.
  const namen = {}
  for (const r of db
    .prepare(
      `SELECT ul.update_id, u.email FROM update_likes ul
       JOIN users u ON u.id = ul.user_id ORDER BY ul.created_at ASC`,
    )
    .all()) {
    ;(namen[r.update_id] ||= []).push(displayName(r.email))
  }
  const leeg = () => ({ likes: 0, likedByMe: false, commentCount: 0, likedBy: [] })
  const reactions = {}
  for (const r of likeRows)
    reactions[r.update_id] = {
      likes: r.likes, likedByMe: !!r.liked, commentCount: 0,
      likedBy: namen[r.update_id] || [],
    }
  for (const r of commentRows) (reactions[r.update_id] ||= leeg()).commentCount = r.c
  sendJson(res, 200, { reactions })
})

add('POST', /^\/api\/updates\/([^/]+)\/like$/, (req, res, m) => {
  const id = String(m[1])
  if (!UPDATE_ID_RE.test(id)) return sendJson(res, 400, { error: 'ongeldig' })
  const existing = db
    .prepare('SELECT 1 FROM update_likes WHERE update_id = ? AND user_id = ?')
    .get(id, req.userId)
  if (existing) {
    db.prepare('DELETE FROM update_likes WHERE update_id = ? AND user_id = ?').run(id, req.userId)
  } else {
    db.prepare('INSERT INTO update_likes (update_id,user_id,created_at) VALUES (?,?,?)').run(id, req.userId, now())
  }
  const likedBy = db
    .prepare(
      `SELECT u.email FROM update_likes ul JOIN users u ON u.id = ul.user_id
       WHERE ul.update_id = ? ORDER BY ul.created_at ASC`,
    )
    .all(id)
    .map((r) => displayName(r.email))
  sendJson(res, 200, { likes: likedBy.length, likedByMe: !existing, likedBy })
})

add('GET', /^\/api\/updates\/([^/]+)\/comments$/, (req, res, m) => {
  const id = String(m[1])
  const rows = db
    .prepare('SELECT id, user_id, email, author_name, text, created_at FROM update_comments WHERE update_id = ? ORDER BY created_at ASC')
    .all(id)
  sendJson(res, 200, {
    comments: rows.map((r) => ({
      id: r.id,
      author: pickName(r.author_name, r.email),
      text: r.text,
      mine: r.user_id === req.userId,
      createdAt: r.created_at,
    })),
  })
})

add('POST', /^\/api\/updates\/([^/]+)\/comments$/, async (req, res, m) => {
  const id = String(m[1])
  if (!UPDATE_ID_RE.test(id)) return sendJson(res, 400, { error: 'ongeldig' })
  if (!rateLimit('ucmt:' + req.userId, 60, 60 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Te veel reacties achter elkaar. Probeer het zo weer.' })
  }
  const body = await readJson(req)
  const text = (body.text || '').trim()
  if (!text) return sendJson(res, 400, { error: 'Schrijf eerst een reactie.' })
  const c = { id: uid(), email: userEmail(req.userId), created_at: now() }
  const authorName = String(body.name || '').trim().slice(0, 80) || null
  db.prepare('INSERT INTO update_comments (id,update_id,user_id,email,author_name,text,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(c.id, id, req.userId, c.email, authorName, text.slice(0, 2000), c.created_at)
  // Beheerder(s) op de hoogte stellen van een nieuwe reactie op een update.
  for (const adminEmail of ADMIN_EMAILS) {
    if (userEmail(req.userId) === adminEmail) continue
    sendEmailSafe(
      adminEmail,
      'Nieuwe reactie op een update — Kindfolio 💬',
      feedbackReplyHtml(pickName(authorName, c.email), text),
      'update-reactie',
    )
  }
  sendJson(res, 201, {
    id: c.id,
    author: pickName(authorName, c.email),
    text: text.slice(0, 2000),
    mine: true,
    createdAt: c.created_at,
  })
})

add('POST', /^\/api\/children$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const name = (body.name || '').trim()
  if (!name) return sendJson(res, 400, { error: 'naam verplicht' })
  const count = db.prepare('SELECT COUNT(*) AS c FROM children WHERE account_id = ?').get(req.accountId).c
  const color = body.color || CHILD_COLORS[count % CHILD_COLORS.length]
  const child = {
    id: uid(), name, color,
    birth_year: body.birthYear ?? null,
    birth_date: body.birthDate ?? null,
    subjects: Array.isArray(body.subjects) ? JSON.stringify(body.subjects) : null,
    subcategories:
      body.subcategories && typeof body.subcategories === 'object'
        ? JSON.stringify(body.subcategories)
        : null,
    created_at: now(),
  }
  // Een kind dat al 12 of ouder is aangemeld, start meteen in de vo-set — dan
  // hoeft de ouder daar niet eerst een melding voor weg te klikken.
  const leeftijd = childAge(child)
  child.kerndoelen_set = leeftijd != null && leeftijd >= 12 ? 'vo' : null
  child.kerndoelen_asked = child.kerndoelen_set ? 1 : 0
  db.prepare('INSERT INTO children (id,account_id,name,color,birth_year,birth_date,subjects,subcategories,kerndoelen_set,kerndoelen_asked,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(child.id, req.accountId, child.name, child.color, child.birth_year, child.birth_date, child.subjects, child.subcategories, child.kerndoelen_set, child.kerndoelen_asked, child.created_at)
  sendJson(res, 201, mapChild(child))
})

add('PATCH', /^\/api\/children\/([^/]+)$/, async (req, res, m) => {
  if (!requireEditor(req, res)) return
  const existing = db.prepare('SELECT * FROM children WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!existing) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const name = body.name != null ? String(body.name).trim() : existing.name
  const color = body.color != null ? body.color : existing.color
  const birthYear =
    body.birthYear !== undefined ? body.birthYear : existing.birth_year
  const birthDate =
    body.birthDate !== undefined ? body.birthDate : existing.birth_date
  // subjects/subcategories: array/object = eigen extra's, null = wissen, weglaten = ongewijzigd.
  const subjects =
    body.subjects !== undefined
      ? Array.isArray(body.subjects)
        ? JSON.stringify(body.subjects)
        : null
      : existing.subjects
  const subcategories =
    body.subcategories !== undefined
      ? body.subcategories && typeof body.subcategories === 'object'
        ? JSON.stringify(body.subcategories)
        : null
      : existing.subcategories
  // Kerndoelenset omzetten. De datum onthouden we, want een verslag over een
  // heel jaar moet kunnen laten zien vanaf wanneer de andere set gold.
  let kdSet = existing.kerndoelen_set
  let kdAt = existing.kerndoelen_set_at
  if (body.kerndoelenSet !== undefined && KD_SETS.has(body.kerndoelenSet)) {
    if (body.kerndoelenSet !== (existing.kerndoelen_set || 'po')) {
      kdSet = body.kerndoelenSet
      kdAt = new Date().toISOString().slice(0, 10)
    }
  }
  const kdAsked =
    body.kerndoelenAsked !== undefined
      ? body.kerndoelenAsked
        ? 1
        : 0
      : existing.kerndoelen_asked || 0
  db.prepare('UPDATE children SET name = ?, color = ?, birth_year = ?, birth_date = ?, subjects = ?, subcategories = ?, kerndoelen_set = ?, kerndoelen_set_at = ?, kerndoelen_asked = ? WHERE id = ?')
    .run(name, color, birthYear, birthDate, subjects, subcategories, kdSet, kdAt, kdAsked, m[1])
  sendJson(res, 200, mapChild({
    ...existing, name, color, birth_year: birthYear, birth_date: birthDate,
    subjects, subcategories,
    kerndoelen_set: kdSet, kerndoelen_set_at: kdAt, kerndoelen_asked: kdAsked,
  }))
})

add('DELETE', /^\/api\/children\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const child = db.prepare('SELECT id FROM children WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!child) return sendJson(res, 404, { error: 'niet gevonden' })
  const memos = db.prepare('SELECT photo_ids FROM memos WHERE child_id = ? AND account_id = ?').all(m[1], req.accountId)
  deletePhotoFiles(memos.flatMap((r) => (r.photo_ids ? JSON.parse(r.photo_ids) : [])))
  db.prepare('DELETE FROM memos WHERE child_id = ? AND account_id = ?').run(m[1], req.accountId)
  db.prepare('DELETE FROM summaries WHERE child_id = ? AND account_id = ?').run(m[1], req.accountId)
  db.prepare('DELETE FROM kerndoel_links WHERE child_id = ? AND account_id = ?').run(m[1], req.accountId)
  db.prepare('DELETE FROM children WHERE id = ?').run(m[1])
  sendJson(res, 200, { ok: true })
})

// --- Agenda (events) ---
const EVENT_TYPES = new Set(['uitje', 'taak', 'les'])
const EVENT_FREQ = new Set(['none', 'daily', 'weekly', 'monthly', 'yearly'])
const WEEKDAYS = new Set(['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'])

// Koppelt aandachtspunten aan een agenda-item. Een punt dat nog op "voor later"
// stond gaat daarmee naar "nu oefenen" — je gaat er immers mee aan de slag.
function setEventFocus(eventId, accountId, focusIds) {
  if (!Array.isArray(focusIds)) return
  const valid = [...new Set(focusIds)].filter((fid) =>
    db.prepare('SELECT id FROM focus_points WHERE id = ? AND account_id = ?').get(fid, accountId),
  )
  db.prepare('DELETE FROM event_focus WHERE event_id = ?').run(eventId)
  for (const fid of valid) {
    db.prepare('INSERT OR IGNORE INTO event_focus (event_id,focus_id) VALUES (?,?)').run(eventId, fid)
    db.prepare("UPDATE focus_points SET status = 'open', updated_at = ? WHERE id = ? AND status = 'later'").run(now(), fid)
  }
  return valid
}

// Valideert childIds tegen het account en ontdubbelt.
function validChildIds(list, accountId) {
  if (!Array.isArray(list)) return []
  return [...new Set(list)].filter((cid) =>
    db.prepare('SELECT id FROM children WHERE id = ? AND account_id = ?').get(cid, accountId),
  )
}
// Zet de opgegeven weekdagen om naar een opgeschoonde, comma-gescheiden string.
/** Einddatum van een meerdaags item; leeg of vóór de start = eendaags. */
function cleanEndDate(start, end) {
  const e = typeof end === 'string' ? end.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) return null
  return e > start ? e : null
}
function cleanWeekdays(freq, list) {
  if (freq !== 'weekly' || !Array.isArray(list)) return null
  const days = [...new Set(list.filter((d) => WEEKDAYS.has(d)))]
  return days.length ? days.join(',') : null
}

add('POST', /^\/api\/events$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const title = (body.title || '').trim()
  if (!title) return sendJson(res, 400, { error: 'titel verplicht' })
  const type = EVENT_TYPES.has(body.type) ? body.type : 'uitje'
  const freq = EVENT_FREQ.has(body.freq) ? body.freq : 'none'
  const ev = {
    id: uid(),
    title,
    notes: (body.notes || '').trim() || null,
    type,
    date: body.date || new Date().toISOString().slice(0, 10),
    time: body.time ? String(body.time).slice(0, 5) : null,
    freq,
    every_n: Math.max(1, parseInt(body.everyN, 10) || 1),
    weekdays: cleanWeekdays(freq, body.weekdays),
    until_date: freq !== 'none' && body.until ? body.until : null,
    sort_order: Number.isFinite(body.sortOrder) ? body.sortOrder : now(),
    subjects: cleanSubjects(body.subjects),
    created_at: now(),
    updated_at: now(),
  }
  ev.end_date = cleanEndDate(ev.date, body.end)
  db.prepare(
    'INSERT INTO events (id,account_id,title,notes,type,date,end_date,time,freq,every_n,weekdays,until_date,sort_order,subjects,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    ev.id, req.accountId, ev.title, ev.notes, ev.type, ev.date, ev.end_date, ev.time,
    ev.freq, ev.every_n, ev.weekdays, ev.until_date, ev.sort_order, ev.subjects, ev.created_at, ev.updated_at,
  )
  const childIds = validChildIds(body.childIds, req.accountId)
  for (const cid of childIds)
    db.prepare('INSERT OR IGNORE INTO event_children (event_id,child_id) VALUES (?,?)').run(ev.id, cid)
  const focusIds = setEventFocus(ev.id, req.accountId, body.focusIds) || []
  sendJson(res, 201, mapEvent(ev, childIds, focusIds))
})

add('PATCH', /^\/api\/events\/([^/]+)$/, async (req, res, m) => {
  if (!requireEditor(req, res)) return
  const existing = db.prepare('SELECT * FROM events WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!existing) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const title = body.title != null ? String(body.title).trim() || existing.title : existing.title
  const type =
    body.type !== undefined ? (EVENT_TYPES.has(body.type) ? body.type : existing.type) : existing.type
  const date = body.date !== undefined ? body.date : existing.date
  const time =
    body.time !== undefined ? (body.time ? String(body.time).slice(0, 5) : null) : existing.time
  const notes = body.notes !== undefined ? (body.notes || '').trim() || null : existing.notes
  const freq =
    body.freq !== undefined ? (EVENT_FREQ.has(body.freq) ? body.freq : 'none') : existing.freq
  const everyN =
    body.everyN !== undefined ? Math.max(1, parseInt(body.everyN, 10) || 1) : existing.every_n
  const weekdays =
    body.weekdays !== undefined || body.freq !== undefined
      ? cleanWeekdays(freq, body.weekdays !== undefined ? body.weekdays : (existing.weekdays ? String(existing.weekdays).split(',') : []))
      : existing.weekdays
  const until =
    body.until !== undefined ? (freq !== 'none' && body.until ? body.until : null) : existing.until_date
  const sortOrder =
    body.sortOrder !== undefined && Number.isFinite(body.sortOrder) ? body.sortOrder : existing.sort_order
  const subjects = body.subjects !== undefined ? cleanSubjects(body.subjects) : existing.subjects
  // Einddatum opnieuw toetsen aan de (mogelijk gewijzigde) begindatum.
  const endDate = cleanEndDate(date, body.end !== undefined ? body.end : existing.end_date)
  db.prepare(
    'UPDATE events SET title=?,notes=?,type=?,date=?,end_date=?,time=?,freq=?,every_n=?,weekdays=?,until_date=?,sort_order=?,subjects=?,updated_at=? WHERE id=?',
  ).run(title, notes, type, date, endDate, time, freq, everyN, weekdays, until, sortOrder, subjects, now(), m[1])
  let childIds
  if (Array.isArray(body.childIds)) {
    childIds = validChildIds(body.childIds, req.accountId)
    db.prepare('DELETE FROM event_children WHERE event_id = ?').run(m[1])
    for (const cid of childIds)
      db.prepare('INSERT OR IGNORE INTO event_children (event_id,child_id) VALUES (?,?)').run(m[1], cid)
  } else {
    childIds = db.prepare('SELECT child_id FROM event_children WHERE event_id = ?').all(m[1]).map((r) => r.child_id)
  }
  let focusIds
  if (Array.isArray(body.focusIds)) {
    focusIds = setEventFocus(m[1], req.accountId, body.focusIds)
  } else {
    focusIds = db.prepare('SELECT focus_id FROM event_focus WHERE event_id = ?').all(m[1]).map((r) => r.focus_id)
  }
  sendJson(
    res, 200,
    mapEvent(
      { ...existing, title, notes, type, date, end_date: endDate, time, freq, every_n: everyN, weekdays, until_date: until, sort_order: sortOrder, subjects },
      childIds,
      focusIds,
    ),
  )
})

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/
add('POST', /^\/api\/events\/([^/]+)\/done$/, async (req, res, m) => {
  if (!requireEditor(req, res)) return
  const ev = db.prepare('SELECT id FROM events WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!ev) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const datum = String(body.date || '')
  if (!DATUM_RE.test(datum)) return sendJson(res, 400, { error: 'ongeldige datum' })
  if (body.done) {
    db.prepare('INSERT OR IGNORE INTO event_done (event_id,date,account_id,user_id,created_at) VALUES (?,?,?,?,?)')
      .run(m[1], datum, req.accountId, req.userId, now())
  } else {
    db.prepare('DELETE FROM event_done WHERE event_id = ? AND date = ?').run(m[1], datum)
  }
  sendJson(res, 200, { eventId: m[1], date: datum, done: !!body.done })
})

add('DELETE', /^\/api\/events\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const ev = db.prepare('SELECT id FROM events WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!ev) return sendJson(res, 404, { error: 'niet gevonden' })
  db.prepare('DELETE FROM event_children WHERE event_id = ?').run(m[1])
  db.prepare('DELETE FROM event_focus WHERE event_id = ?').run(m[1])
  db.prepare('DELETE FROM event_done WHERE event_id = ?').run(m[1])
  db.prepare('DELETE FROM events WHERE id = ?').run(m[1])
  dropKerndoelLinks('event', m[1])
  sendJson(res, 200, { ok: true })
})

// Maak fysieke kopieën van foto's, zodat elk kind-memo z'n eigen bestanden heeft
// en het verwijderen van het ene memo de foto's van het andere niet weggooit.
function copyPhotos(ids, accountId) {
  const out = []
  for (const origId of ids) {
    const row = db.prepare('SELECT mime FROM photos WHERE id = ? AND account_id = ?').get(origId, accountId)
    const src = path.join(PHOTO_DIR, origId)
    if (!row || !fs.existsSync(src)) continue
    const newId = uid()
    try {
      fs.copyFileSync(src, path.join(PHOTO_DIR, newId))
      db.prepare('INSERT INTO photos (id,account_id,mime,created_at) VALUES (?,?,?,?)').run(newId, accountId, row.mime, now())
      out.push(newId)
    } catch {
      /* kopiëren mislukt — sla deze foto over */
    }
  }
  return out
}

add('POST', /^\/api\/memos$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  // Eén of meerdere kinderen: childIds heeft voorrang, anders losse childId.
  const childIds = Array.isArray(body.childIds) && body.childIds.length
    ? [...new Set(body.childIds)]
    : body.childId
      ? [body.childId]
      : []
  if (!childIds.length) return sendJson(res, 400, { error: 'kies minstens één kind' })
  // Alle gekozen kinderen moeten van dit account zijn.
  for (const cid of childIds) {
    const child = db.prepare('SELECT id FROM children WHERE id = ? AND account_id = ?').get(cid, req.accountId)
    if (!child) return sendJson(res, 404, { error: 'kind niet gevonden' })
  }
  const date = body.date || new Date().toISOString().slice(0, 10)
  const text = (body.text || '').trim()
  const subjects = JSON.stringify(Array.isArray(body.subjects) ? body.subjects : [])
  const basePhotos = Array.isArray(body.photoIds) ? body.photoIds : []
  const draft = body.draft ? 1 : 0
  const mood = validMood(body.mood)
  // Bij toevoegen aan een extra kind vanuit een bestaande memo krijgen álle
  // nieuwe memo's eigen foto-kopieën (de originele memo houdt de bestanden).
  const copyAll = !!body.copyAllPhotos

  const created = []
  childIds.forEach((cid, i) => {
    // Eerste kind gebruikt de geüploade foto's; volgende kinderen krijgen kopieën.
    const photoIds = i === 0 && !copyAll ? basePhotos : copyPhotos(basePhotos, req.accountId)
    const memo = {
      id: uid(), child_id: cid, date, text, subjects,
      photo_ids: JSON.stringify(photoIds), draft, mood,
      created_at: now(), updated_at: now(),
    }
    db.prepare('INSERT INTO memos (id,account_id,child_id,date,text,subjects,photo_ids,draft,mood,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(memo.id, req.accountId, memo.child_id, memo.date, memo.text, memo.subjects, memo.photo_ids, memo.draft, memo.mood, memo.created_at, memo.updated_at)
    // Aandachtspunt + "voor later" uit de reflectie vastleggen voor dit kind.
    syncMemoFocus(memo.id, cid, req.accountId, body)
    // Gekoppelde leermiddelen (zelfde voor elk gekozen kind).
    const resIds = setMemoResources(memo.id, req.accountId, body.resourceIds) || []
    created.push(mapMemo(memo, resIds))
  })

  // Met childIds geven we een lijst terug; legacy childId blijft één memo.
  if (Array.isArray(body.childIds) && body.childIds.length) {
    sendJson(res, 201, { memos: created })
  } else {
    sendJson(res, 201, created[0])
  }
})

add('PATCH', /^\/api\/memos\/([^/]+)$/, async (req, res, m) => {
  if (!requireEditor(req, res)) return
  const existing = db.prepare('SELECT * FROM memos WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!existing) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const date = body.date != null ? body.date : existing.date
  const text = body.text != null ? String(body.text).trim() : existing.text
  const subjects = body.subjects != null ? JSON.stringify(body.subjects) : existing.subjects
  const photoIds = body.photoIds != null ? JSON.stringify(body.photoIds) : existing.photo_ids
  const before = existing.photo_ids ? JSON.parse(existing.photo_ids) : []
  const after = body.photoIds != null ? body.photoIds : before
  const removed = before.filter((p) => !after.includes(p))
  if (removed.length) deletePhotoFiles(removed)
  const draft = body.draft !== undefined ? (body.draft ? 1 : 0) : existing.draft
  const mood = body.mood !== undefined ? validMood(body.mood) : existing.mood
  const updated_at = now()
  db.prepare('UPDATE memos SET date=?, text=?, subjects=?, photo_ids=?, draft=?, mood=?, updated_at=? WHERE id=?')
    .run(date, text, subjects, photoIds, draft, mood, updated_at, m[1])
  // Reflectie (aandachtspunt / voor later) bijwerken voor het kind van deze memo.
  syncMemoFocus(m[1], existing.child_id, req.accountId, body)
  let resourceIds
  if (Array.isArray(body.resourceIds)) {
    resourceIds = setMemoResources(m[1], req.accountId, body.resourceIds)
  } else {
    resourceIds = db.prepare('SELECT resource_id FROM memo_resources WHERE memo_id = ?').all(m[1]).map((x) => x.resource_id)
  }
  sendJson(res, 200, mapMemo({ ...existing, date, text, subjects, photo_ids: photoIds, draft, mood, updated_at }, resourceIds))
})

add('DELETE', /^\/api\/memos\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const existing = db.prepare('SELECT photo_ids FROM memos WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (existing) {
    deletePhotoFiles(existing.photo_ids ? JSON.parse(existing.photo_ids) : [])
    db.prepare('DELETE FROM memos WHERE id = ?').run(m[1])
    db.prepare('DELETE FROM memo_likes WHERE memo_id = ?').run(m[1])
    db.prepare('DELETE FROM memo_resources WHERE memo_id = ?').run(m[1])
    dropKerndoelLinks('memo', m[1])
  }
  sendJson(res, 200, { ok: true })
})

// Like/duimpje op een memo (ook meelezers mogen liken).
add('POST', /^\/api\/memos\/([^/]+)\/like$/, (req, res, m) => {
  const memo = db.prepare('SELECT id FROM memos WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!memo) return sendJson(res, 404, { error: 'niet gevonden' })
  const existing = db.prepare('SELECT 1 FROM memo_likes WHERE memo_id = ? AND user_id = ?').get(m[1], req.userId)
  if (existing) {
    db.prepare('DELETE FROM memo_likes WHERE memo_id = ? AND user_id = ?').run(m[1], req.userId)
  } else {
    db.prepare('INSERT INTO memo_likes (memo_id,user_id,created_at) VALUES (?,?,?)').run(m[1], req.userId, now())
  }
  const likers = memoLikers(m[1])
  sendJson(res, 200, { likes: likers.length, likedByMe: !existing, likedBy: likers })
})

// Namen van iedereen die deze memo leuk vindt (oudste eerst).
function memoLikers(memoId) {
  return db
    .prepare(
      `SELECT u.email FROM memo_likes ml JOIN users u ON u.id = ml.user_id
       WHERE ml.memo_id = ? ORDER BY ml.created_at ASC`,
    )
    .all(memoId)
    .map((r) => displayName(r.email))
}

// --- Aandachtspunten (focus points) ---
add('POST', /^\/api\/focus$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const child = db.prepare('SELECT id FROM children WHERE id = ? AND account_id = ?').get(body.childId, req.accountId)
  if (!child) return sendJson(res, 404, { error: 'kind niet gevonden' })
  const text = (body.text || '').trim()
  if (!text) return sendJson(res, 400, { error: 'Schrijf eerst een aandachtspunt.' })
  const fp = {
    id: uid(), child_id: body.childId, text,
    subject: (body.subject || '').trim() || null,
    status: FOCUS_STATUS.has(body.status) ? body.status : 'open',
    source_memo_id: null, link_kind: null,
    created_at: now(), updated_at: now(),
  }
  db.prepare(
    'INSERT INTO focus_points (id,account_id,child_id,text,subject,status,source_memo_id,link_kind,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(fp.id, req.accountId, fp.child_id, fp.text, fp.subject, fp.status, fp.source_memo_id, fp.link_kind, fp.created_at, fp.updated_at)
  sendJson(res, 201, mapFocus(fp))
})

add('PATCH', /^\/api\/focus\/([^/]+)$/, async (req, res, m) => {
  if (!requireEditor(req, res)) return
  const existing = db.prepare('SELECT * FROM focus_points WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!existing) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const text = body.text != null ? String(body.text).trim() || existing.text : existing.text
  const subject = body.subject !== undefined ? (body.subject || '').trim() || null : existing.subject
  const status = body.status !== undefined && FOCUS_STATUS.has(body.status) ? body.status : existing.status
  db.prepare('UPDATE focus_points SET text=?, subject=?, status=?, updated_at=? WHERE id=?').run(text, subject, status, now(), m[1])
  sendJson(res, 200, mapFocus({ ...existing, text, subject, status }))
})

add('DELETE', /^\/api\/focus\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const fp = db.prepare('SELECT id FROM focus_points WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!fp) return sendJson(res, 404, { error: 'niet gevonden' })
  db.prepare('DELETE FROM event_focus WHERE focus_id = ?').run(m[1])
  db.prepare('DELETE FROM focus_points WHERE id = ?').run(m[1])
  sendJson(res, 200, { ok: true })
})

// --- Leermiddelen (resources) ---
function resourceStatus(type, status) {
  const allowed = RESOURCE_STATUS_BY_TYPE[type]
  return allowed && allowed.has(status) ? status : null
}
function cleanSubjects(list) {
  if (!Array.isArray(list)) return null
  const s = [...new Set(list.map((x) => String(x).trim()).filter(Boolean))]
  return s.length ? JSON.stringify(s) : null
}
add('POST', /^\/api\/resources$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const title = (body.title || '').trim()
  if (!title) return sendJson(res, 400, { error: 'titel verplicht' })
  const type = RESOURCE_TYPES.has(body.type) ? body.type : 'overig'
  const status = resourceStatus(type, body.status)
  const r = {
    id: uid(), type, title: title.slice(0, 300),
    author: (body.author || '').trim().slice(0, 200) || null,
    url: (body.url || '').trim().slice(0, 1000) || null,
    subjects: cleanSubjects(body.subjects),
    status,
    read_date: FINISHED_STATUS.has(status) && body.readDate ? String(body.readDate).slice(0, 10) : null,
    notes: (body.notes || '').trim().slice(0, 2000) || null,
    created_at: now(), updated_at: now(),
  }
  db.prepare(
    'INSERT INTO resources (id,account_id,type,title,author,url,subjects,status,read_date,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(r.id, req.accountId, r.type, r.title, r.author, r.url, r.subjects, r.status, r.read_date, r.notes, r.created_at, r.updated_at)
  const childIds = validChildIds(body.childIds, req.accountId)
  for (const cid of childIds)
    db.prepare('INSERT OR IGNORE INTO resource_children (resource_id,child_id) VALUES (?,?)').run(r.id, cid)
  sendJson(res, 201, mapResource(r, childIds))
})

add('PATCH', /^\/api\/resources\/([^/]+)$/, async (req, res, m) => {
  if (!requireEditor(req, res)) return
  const existing = db.prepare('SELECT * FROM resources WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!existing) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const type =
    body.type !== undefined ? (RESOURCE_TYPES.has(body.type) ? body.type : existing.type) : existing.type
  const title = body.title != null ? String(body.title).trim().slice(0, 300) || existing.title : existing.title
  const author = body.author !== undefined ? (body.author || '').trim().slice(0, 200) || null : existing.author
  const url = body.url !== undefined ? (body.url || '').trim().slice(0, 1000) || null : existing.url
  const subjects = body.subjects !== undefined ? cleanSubjects(body.subjects) : existing.subjects
  const status =
    body.status !== undefined || body.type !== undefined
      ? resourceStatus(type, body.status !== undefined ? body.status : existing.status)
      : existing.status
  // Gelezen-datum: expliciet meegegeven wint; anders bewaren, of wissen als niet meer "af".
  let readDate
  if (body.readDate !== undefined) {
    readDate = body.readDate ? String(body.readDate).slice(0, 10) : null
  } else {
    readDate = FINISHED_STATUS.has(status) ? existing.read_date : null
  }
  const notes = body.notes !== undefined ? (body.notes || '').trim().slice(0, 2000) || null : existing.notes
  db.prepare(
    'UPDATE resources SET type=?,title=?,author=?,url=?,subjects=?,status=?,read_date=?,notes=?,updated_at=? WHERE id=?',
  ).run(type, title, author, url, subjects, status, readDate, notes, now(), m[1])
  let childIds
  if (Array.isArray(body.childIds)) {
    childIds = validChildIds(body.childIds, req.accountId)
    db.prepare('DELETE FROM resource_children WHERE resource_id = ?').run(m[1])
    for (const cid of childIds)
      db.prepare('INSERT OR IGNORE INTO resource_children (resource_id,child_id) VALUES (?,?)').run(m[1], cid)
  } else {
    childIds = db.prepare('SELECT child_id FROM resource_children WHERE resource_id = ?').all(m[1]).map((x) => x.child_id)
  }
  sendJson(res, 200, mapResource({ ...existing, type, title, author, url, subjects, status, read_date: readDate, notes }, childIds))
})

add('DELETE', /^\/api\/resources\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const r = db.prepare('SELECT id FROM resources WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!r) return sendJson(res, 404, { error: 'niet gevonden' })
  db.prepare('DELETE FROM resource_children WHERE resource_id = ?').run(m[1])
  db.prepare('DELETE FROM memo_resources WHERE resource_id = ?').run(m[1])
  db.prepare('DELETE FROM resources WHERE id = ?').run(m[1])
  dropKerndoelLinks('resource', m[1])
  sendJson(res, 200, { ok: true })
})

// --- Periodes ---
// Achteraf een naam geven aan een stuk tijd. Welke memo's erin vallen leidt de
// app af uit de datums en de gekozen kinderen; dat is precies het punt van
// terugkijken — je hoeft vooraf niets te plannen of te koppelen.
function setPeriodChildren(periodId, accountId, childIds) {
  db.prepare('DELETE FROM period_children WHERE period_id = ?').run(periodId)
  const ins = db.prepare('INSERT OR IGNORE INTO period_children (period_id, child_id) VALUES (?,?)')
  for (const id of validChildIds(childIds, accountId)) ins.run(periodId, id)
}
function periodChildIds(periodId) {
  return db.prepare('SELECT child_id FROM period_children WHERE period_id = ?').all(periodId).map((r) => r.child_id)
}

add('POST', /^\/api\/periods$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const title = (body.title || '').trim()
  if (!title) return sendJson(res, 400, { error: 'Geef een naam op.' })
  const start = String(body.start || '')
  const end = String(body.end || '')
  if (!start || !end) return sendJson(res, 400, { error: 'Geef een begin- en einddatum op.' })
  if (end < start) return sendJson(res, 400, { error: 'De einddatum ligt vóór de begindatum.' })
  const row = {
    id: uid(), title, start_date: start, end_date: end,
    note: (body.note || '').trim() || null,
    status: 'ok', source: 'manual',
    created_at: now(), updated_at: now(),
  }
  db.prepare('INSERT INTO periods (id,account_id,title,start_date,end_date,note,status,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(row.id, req.accountId, row.title, row.start_date, row.end_date, row.note, row.status, row.source, row.created_at, row.updated_at)
  setPeriodChildren(row.id, req.accountId, body.childIds)
  sendJson(res, 201, mapPeriod(row, periodChildIds(row.id)))
})

add('PATCH', /^\/api\/periods\/([^/]+)$/, async (req, res, m) => {
  if (!requireEditor(req, res)) return
  const bestaand = db.prepare('SELECT * FROM periods WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!bestaand) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const title = body.title != null ? String(body.title).trim() || bestaand.title : bestaand.title
  const start = body.start != null ? String(body.start) : bestaand.start_date
  const end = body.end != null ? String(body.end) : bestaand.end_date
  if (end < start) return sendJson(res, 400, { error: 'De einddatum ligt vóór de begindatum.' })
  const note = body.note !== undefined ? String(body.note || '').trim() || null : bestaand.note
  // Een voorstel van de AI overnemen: dan telt hij mee en verdwijnt de stippellijn.
  const status = body.status === 'ok' ? 'ok' : bestaand.status
  db.prepare('UPDATE periods SET title=?, start_date=?, end_date=?, note=?, status=?, updated_at=? WHERE id=?')
    .run(title, start, end, note, status, now(), m[1])
  if (body.childIds !== undefined) setPeriodChildren(m[1], req.accountId, body.childIds)
  sendJson(res, 200, mapPeriod(
    { ...bestaand, title, start_date: start, end_date: end, note, status, updated_at: now() },
    periodChildIds(m[1]),
  ))
})

add('DELETE', /^\/api\/periods\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const p = db.prepare('SELECT id FROM periods WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!p) return sendJson(res, 404, { error: 'niet gevonden' })
  db.prepare('DELETE FROM period_children WHERE period_id = ?').run(m[1])
  db.prepare('DELETE FROM periods WHERE id = ?').run(m[1])
  dropKerndoelLinks('period', m[1])
  sendJson(res, 200, { ok: true })
})

// --- Kerndoelen koppelen ---
/** Koppelingen opruimen als de memo/het leermiddel/het agenda-item weggaat. */
function dropKerndoelLinks(carrierType, carrierId) {
  db.prepare('DELETE FROM kerndoel_links WHERE carrier_type = ? AND carrier_id = ?')
    .run(carrierType, carrierId)
}

/**
 * Vervangt de bevestigde kerndoelen van één memo/leermiddel/agenda-item.
 * AI-voorstellen die nog niet nagekeken zijn (status 'open') blijven staan —
 * die horen thuis in het nakijkscherm, niet in dit formulier.
 */
add('PUT', /^\/api\/kerndoelen\/carrier$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const type = String(body.carrierType || '')
  const id = String(body.carrierId || '')
  if (!CARRIERS.has(type) || !id) return sendJson(res, 400, { error: 'onbekende koppeling' })

  const kinderen = new Set(
    db.prepare('SELECT id FROM children WHERE account_id = ?').all(req.accountId).map((c) => c.id),
  )
  const items = Array.isArray(body.items) ? body.items : []
  const schoon = []
  for (const it of items) {
    const set = String(it.set || '')
    const nr = Number(it.nr)
    if (!KD_SETS.has(set) || !kerndoel(set, nr)) continue
    if (!kinderen.has(String(it.childId))) continue
    schoon.push({ childId: String(it.childId), set, nr })
  }

  db.prepare("DELETE FROM kerndoel_links WHERE account_id = ? AND carrier_type = ? AND carrier_id = ? AND status = 'ok'")
    .run(req.accountId, type, id)
  const ins = db.prepare(
    "INSERT OR REPLACE INTO kerndoel_links (id,account_id,carrier_type,carrier_id,child_id,kd_set,kd_nr,source,status,quote,created_at) VALUES (?,?,?,?,?,?,?,'manual','ok',NULL,?)",
  )
  for (const it of schoon) {
    ins.run(uid(), req.accountId, type, id, it.childId, it.set, it.nr, now())
  }
  sendJson(res, 200, {
    links: db
      .prepare('SELECT * FROM kerndoel_links WHERE account_id = ? AND carrier_type = ? AND carrier_id = ?')
      .all(req.accountId, type, id)
      .map(mapKerndoelLink),
  })
})

/**
 * Een kerndoel in één keer afhandelen voor één kind: een AI-voorstel overnemen
 * (accept) of weggooien (reject), of alles van dat kerndoel loskoppelen
 * (remove). Dat gebeurt per kerndoel, niet per memo — honderden memo's stuk
 * voor stuk langslopen doet niemand, en het bewijs zit toch in de groep.
 */
const KD_ACTIES = {
  accept: "UPDATE kerndoel_links SET status = 'ok' WHERE account_id = ? AND child_id = ? AND kd_set = ? AND kd_nr = ? AND status = 'open'",
  reject: "DELETE FROM kerndoel_links WHERE account_id = ? AND child_id = ? AND kd_set = ? AND kd_nr = ? AND status = 'open'",
  remove: 'DELETE FROM kerndoel_links WHERE account_id = ? AND child_id = ? AND kd_set = ? AND kd_nr = ?',
}
add('POST', /^\/api\/kerndoelen\/review$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const set = String(body.set || '')
  const nr = Number(body.nr)
  const childId = String(body.childId || '')
  if (!KD_SETS.has(set) || !kerndoel(set, nr)) return sendJson(res, 400, { error: 'onbekend kerndoel' })
  // hasOwn, zodat "constructor" en "__proto__" hier geen sleutel zijn.
  if (!Object.hasOwn(KD_ACTIES, body.action)) return sendJson(res, 400, { error: 'onbekende actie' })
  const sql = KD_ACTIES[body.action]
  const r = db.prepare(sql).run(req.accountId, childId, set, nr)
  sendJson(res, 200, { ok: true, aantal: r.changes })
})

// Alleen afbeeldingen toestaan; voorkomt dat een geüpload HTML-bestand later
// als text/html op ons eigen domein wordt geserveerd (stored XSS).
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
])
add('POST', /^\/api\/photos$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  if (!rateLimit('upload:' + req.userId, 300, 10 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Te veel uploads achter elkaar. Probeer het zo weer.' })
  }
  const rawMime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  const mime = ALLOWED_IMAGE_MIME.has(rawMime) ? rawMime : 'image/jpeg'
  const buf = await readBody(req, MAX_PHOTO_BYTES)
  if (!buf.length) return sendJson(res, 400, { error: 'lege upload' })
  const id = uid()
  fs.writeFileSync(path.join(PHOTO_DIR, id), encryptPhoto(buf))
  db.prepare('INSERT INTO photos (id,account_id,mime,created_at) VALUES (?,?,?,?)').run(id, req.accountId, mime, now())
  sendJson(res, 201, { id })
})

add('GET', /^\/api\/photos\/([^/]+)$/, (req, res, m) => {
  const row = db.prepare('SELECT mime FROM photos WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  const file = path.join(PHOTO_DIR, m[1])
  if (!row || !fs.existsSync(file)) {
    res.writeHead(404)
    return res.end()
  }
  const mime = ALLOWED_IMAGE_MIME.has(row.mime) ? row.mime : 'image/jpeg'
  let data
  try {
    data = decryptPhoto(fs.readFileSync(file))
  } catch (e) {
    console.error('[foto] ontsleutelen mislukt:', m[1], (e && e.message) || e)
    res.writeHead(500)
    return res.end()
  }
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': data.length,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
  res.end(data)
})

add('DELETE', /^\/api\/photos\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const row = db.prepare('SELECT id FROM photos WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (row) deletePhotoFiles([m[1]])
  sendJson(res, 200, { ok: true })
})

// ---- Volledige export als ZIP (streaming, geen compressie = licht) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function mimeExt(mime) {
  return {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heif',
  }[mime] || '.jpg'
}
function safeName(s) {
  return (
    String(s || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, ' ') ||
    'kind'
  )
}
// Schrijf met respect voor backpressure → laag, constant geheugengebruik.
function writeChunk(res, buf) {
  return new Promise((resolve) => {
    if (res.write(buf)) resolve()
    else res.once('drain', resolve)
  })
}
// entries: [{ name, data?: Buffer, file?: pad }] — één bestand tegelijk in geheugen.
async function streamZip(res, entries) {
  const central = []
  let offset = 0
  for (const e of entries) {
    let data
    try {
      // Bestanden uit de fotomap staan versleuteld op schijf.
      data = e.data || decryptPhoto(await fs.promises.readFile(e.file))
    } catch {
      continue
    }
    const nameBuf = Buffer.from(e.name, 'utf8')
    const crc = crc32(data)
    const size = data.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 bestandsnamen
    local.writeUInt16LE(0, 8) // method 0 = stored
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12) // datum 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    const localOffset = offset
    await writeChunk(res, local); offset += local.length
    await writeChunk(res, nameBuf); offset += nameBuf.length
    await writeChunk(res, data); offset += data.length
    central.push({ nameBuf, crc, size, localOffset })
  }
  const cdStart = offset
  for (const c of central) {
    const h = Buffer.alloc(46)
    h.writeUInt32LE(0x02014b50, 0)
    h.writeUInt16LE(20, 4)
    h.writeUInt16LE(20, 6)
    h.writeUInt16LE(0x0800, 8)
    h.writeUInt16LE(0, 10)
    h.writeUInt16LE(0, 12)
    h.writeUInt16LE(0x21, 14)
    h.writeUInt32LE(c.crc, 16)
    h.writeUInt32LE(c.size, 20)
    h.writeUInt32LE(c.size, 24)
    h.writeUInt16LE(c.nameBuf.length, 28)
    h.writeUInt16LE(0, 30)
    h.writeUInt16LE(0, 32)
    h.writeUInt16LE(0, 34)
    h.writeUInt16LE(0, 36)
    h.writeUInt32LE(0, 38)
    h.writeUInt32LE(c.localOffset, 42)
    await writeChunk(res, h); offset += h.length
    await writeChunk(res, c.nameBuf); offset += c.nameBuf.length
  }
  const cdSize = offset - cdStart
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(central.length, 8)
  eocd.writeUInt16LE(central.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdStart, 16)
  eocd.writeUInt16LE(0, 20)
  await writeChunk(res, eocd)
  res.end()
}

add('GET', /^\/api\/export$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const acc = req.accountId
  const children = db.prepare('SELECT * FROM children WHERE account_id = ? ORDER BY created_at ASC').all(acc).map(mapChild)
  const memos = db.prepare('SELECT * FROM memos WHERE account_id = ? ORDER BY date ASC, created_at ASC').all(acc).map(mapMemo)
  const summaries = db.prepare('SELECT * FROM summaries WHERE account_id = ? ORDER BY created_at DESC').all(acc).map(mapSummary)
  const comments = db.prepare('SELECT * FROM comments WHERE account_id = ? ORDER BY created_at ASC').all(acc).map(mapComment)
  // Alleen de bevestigde kerndoelen: voorstellen die je nog niet hebt
  // nagekeken horen niet in een export die je aan iemand geeft.
  const kerndoelLinks = db
    .prepare("SELECT * FROM kerndoel_links WHERE account_id = ? AND status = 'ok' ORDER BY created_at ASC")
    .all(acc)
    .map(mapKerndoelLink)
  const periods = db
    .prepare("SELECT * FROM periods WHERE account_id = ? AND status = 'ok' ORDER BY start_date ASC")
    .all(acc)
    .map((r) => mapPeriod(r, periodChildIds(r.id)))
  const dataJson = Buffer.from(
    JSON.stringify({ children, memos, summaries, comments, periods, kerndoelLinks }, null, 2),
    'utf8',
  )

  const nameById = {}
  for (const c of children) nameById[c.id] = c.name
  const entries = [{ name: 'kindfolio-export/data.json', data: dataJson }]
  const used = new Set()
  const counters = {}
  for (const m of memos) {
    for (const pid of m.photoIds) {
      const row = db.prepare('SELECT mime FROM photos WHERE id = ? AND account_id = ?').get(pid, acc)
      if (!row) continue
      used.add(pid)
      const folder = safeName(nameById[m.childId] || 'kind')
      const key = `${folder}/${m.date}`
      counters[key] = (counters[key] || 0) + 1
      entries.push({
        name: `kindfolio-export/fotos/${folder}/${m.date}_${counters[key]}${mimeExt(row.mime)}`,
        file: path.join(PHOTO_DIR, pid),
      })
    }
  }
  // Foto's die niet (meer) aan een memo hangen.
  let orphan = 0
  for (const p of db.prepare('SELECT id, mime FROM photos WHERE account_id = ?').all(acc)) {
    if (used.has(p.id)) continue
    orphan++
    entries.push({ name: `kindfolio-export/fotos/overig/${orphan}${mimeExt(p.mime)}`, file: path.join(PHOTO_DIR, p.id) })
  }

  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="kindfolio-export-${new Date().toISOString().slice(0, 10)}.zip"`,
    'Cache-Control': 'no-store',
  })
  try {
    await streamZip(res, entries)
  } catch (e) {
    console.error('[export] mislukt:', (e && e.message) || e)
    try { res.end() } catch {}
  }
})

// --- AI-samenvatting (server-side) ---
const ANTHROPIC_KEY = process.env.PORTFOLIO_ANTHROPIC_KEY || ''
const ANTHROPIC_MODEL = process.env.PORTFOLIO_MODEL || 'claude-sonnet-4-6'

function formatDateLong(iso) {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('nl-NL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return iso
  }
}

// Ruime bovengrens per gezin, puur om weglopende kosten door een fout af te
// vangen — geen quotum dat je in normaal gebruik hoort te raken.
const AI_MONTH_LIMIT = Number(process.env.PORTFOLIO_AI_LIMIT || 50)
const AI_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const AI_LIMIT_MESSAGE =
  `Er zijn deze maand al ${AI_MONTH_LIMIT} AI-verzoeken gedaan vanuit dit portfolio. ` +
  'Die grens zit er alleen om fouten af te vangen — kom je er in gewoon gebruik tegenaan, ' +
  'mail dan even naar info@kindfolio.nl, dan zetten we hem omhoog. ' +
  'Een samenvatting zónder AI kun je gewoon blijven maken: zet AI uit bij Instellingen.'

/** AI-verzoeken van dit portfolio in de afgelopen 30 dagen. */
function aiUsedThisMonth(accountId) {
  return db
    .prepare('SELECT COUNT(*) AS c FROM ai_usage WHERE account_id = ? AND created_at > ?')
    .get(accountId, now() - AI_WINDOW_MS).c
}
/** Beheerders kennen geen limiet, zodat support en tests niet vastlopen. */
function aiLimitReached(req) {
  if (isAdminUser(req.userId)) return false
  return aiUsedThisMonth(req.accountId) >= AI_MONTH_LIMIT
}
function logAiUse(req, kind) {
  db.prepare('INSERT INTO ai_usage (id,account_id,user_id,kind,created_at) VALUES (?,?,?,?,?)')
    .run(uid(), req.accountId, req.userId, kind, now())
}

add('GET', /^\/api\/summary\/available$/, (req, res) => {
  const onbeperkt = isAdminUser(req.userId)
  const gebruikt = aiUsedThisMonth(req.accountId)
  sendJson(res, 200, {
    available: !!ANTHROPIC_KEY,
    aiLimit: onbeperkt ? null : AI_MONTH_LIMIT,
    aiUsed: gebruikt,
    aiLeft: onbeperkt ? null : Math.max(0, AI_MONTH_LIMIT - gebruikt),
  })
})

add('POST', /^\/api\/summary$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const useAi = body.ai !== false
  if (useAi && !ANTHROPIC_KEY) {
    return sendJson(res, 400, { error: 'Er is op de server nog geen Claude API-sleutel ingesteld.' })
  }
  // Vóór de aanroep controleren, zodat een geweigerd verzoek geen tegoed kost.
  if (useAi && aiLimitReached(req)) {
    return sendJson(res, 403, { error: AI_LIMIT_MESSAGE, aiLimitReached: true })
  }
  const child = db.prepare('SELECT * FROM children WHERE id = ? AND account_id = ?').get(body.childId, req.accountId)
  if (!child) return sendJson(res, 404, { error: 'Kind niet gevonden' })
  const start = String(body.start || '')
  const end = String(body.end || '')
  const subject = String(body.subject || '').trim()
  let memos = db
    .prepare('SELECT * FROM memos WHERE child_id = ? AND account_id = ? AND date >= ? AND date <= ? AND (draft IS NULL OR draft = 0) ORDER BY date ASC')
    .all(body.childId, req.accountId, start, end)
    .map(mapMemo)
  // Optioneel filteren op één vakgebied.
  if (subject) memos = memos.filter((mm) => mm.subjects.includes(subject))
  if (memos.length === 0) return sendJson(res, 400, { error: "Geen memo's in deze periode" })

  const periodLabel = String(body.periodLabel || `${start} t/m ${end}`)
  const period = String(body.period || 'periode')

  let text
  if (!useAi) {
    // Zonder AI: alle memo's chronologisch onder elkaar (geen Anthropic-aanroep).
    text = `# ${child.name} — ${periodLabel}\n`
    for (const memo of memos) {
      text += `\n## ${formatDateLong(memo.date)}\n`
      if (memo.subjects.length) text += `*${memo.subjects.join(', ')}*\n\n`
      text += `${memo.text || '(geen tekst)'}\n`
      if (memo.photoIds.length) text += `\n_(${memo.photoIds.length} foto${memo.photoIds.length > 1 ? "'s" : ''})_\n`
    }
  } else {
  let memoText = ''
  for (const memo of memos) {
    memoText += `\n## ${formatDateLong(memo.date)}\n`
    if (memo.subjects.length) memoText += `Vakgebieden: ${memo.subjects.join(', ')}\n`
    memoText += `${memo.text || '(geen tekst, alleen foto’s)'}\n`
    if (memo.photoIds.length) memoText += `(${memo.photoIds.length} foto${memo.photoIds.length > 1 ? "'s" : ''})\n`
  }

  const instruction = `Je bent een behulpzame assistent voor ouders die thuisonderwijs geven in Nederland.

Hieronder staan de dagelijkse logboek-notities voor ${child.name} over de periode "${periodLabel}" (${period}).

Schrijf een warme, overzichtelijke samenvatting in het Nederlands die een ouder kan gebruiken voor het portfolio van het kind. Houd je aan deze structuur (gebruik Markdown-koppen):

# Samenvatting ${child.name} — ${periodLabel}

**Korte terugblik** — 2 à 3 zinnen over hoe de periode verliep.

## Hoogtepunten
- de leukste of belangrijkste momenten

## Voortgang per vakgebied
- per vak: wat is er gedaan en welke groei is zichtbaar

Gebruik alleen informatie uit de notities. Verzin geen feiten. Als er weinig informatie is, houd de samenvatting dan kort.

Hier zijn de notities:
${memoText}`

  const content = [{ type: 'text', text: instruction }]
  if (body.includePhotos) {
    const photoIds = memos.flatMap((mm) => mm.photoIds).slice(0, 20)
    for (const id of photoIds) {
      try {
        const row = db.prepare('SELECT mime FROM photos WHERE id = ? AND account_id = ?').get(id, req.accountId)
        if (!row) continue
        // Ontsleutelen: op schijf staan de foto's versleuteld opgeslagen.
        const data = decryptPhoto(fs.readFileSync(path.join(PHOTO_DIR, id))).toString('base64')
        content.push({ type: 'image', source: { type: 'base64', media_type: row.mime || 'image/jpeg', data } })
      } catch {}
    }
  }

  let aiRes
  try {
    aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2000, messages: [{ role: 'user', content }] }),
    })
  } catch {
    return sendJson(res, 502, { error: 'Kon Anthropic niet bereiken' })
  }
  if (!aiRes.ok) {
    const t = await aiRes.text()
    if (aiRes.status === 401) return sendJson(res, 500, { error: 'Server-API-sleutel ongeldig' })
    // Tegoed op: geen technische melding, maar een duidelijk alternatief.
    if (/credit balance is too low/i.test(t)) {
      return sendJson(res, 503, {
        error:
          'De AI-samenvatting is even niet beschikbaar (het tegoed op de server is op). Je kunt wel een samenvatting zonder AI maken: zet AI uit bij Instellingen — je krijgt dan alle memo’s netjes op datum onder elkaar.',
      })
    }
    if (aiRes.status === 429) return sendJson(res, 429, { error: 'Te veel verzoeken. Probeer het later opnieuw.' })
    return sendJson(res, 502, { error: 'AI-fout: ' + t.slice(0, 200) })
  }
  const json = await aiRes.json()
  text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  // Pas aftekenen als de AI daadwerkelijk iets teruggaf.
  logAiUse(req, 'samenvatting')
  }

  // Optioneel: lijst van gelezen boeken uit deze periode onderaan de samenvatting.
  if (body.withBooks) {
    const finished = db
      .prepare(
        `SELECT * FROM resources
         WHERE account_id = ? AND type IN ('leesboek','leerboek')
           AND status IN ('gelezen','afgerond')
           AND read_date IS NOT NULL AND read_date >= ? AND read_date <= ?
         ORDER BY read_date ASC`,
      )
      .all(req.accountId, start, end)
      .filter((b) => {
        const kids = db.prepare('SELECT child_id FROM resource_children WHERE resource_id = ?').all(b.id).map((x) => x.child_id)
        return kids.length === 0 || kids.includes(child.id)
      })
    if (finished.length) {
      text += `\n\n## Gelezen boeken\n`
      for (const b of finished) {
        const d = String(b.read_date).split('-')
        const nice = d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : b.read_date
        text += `- ${b.title}${b.author ? ` — ${b.author}` : ''} (${nice})\n`
      }
    }
  }

  // Foto's zichtbaar meenemen in de samenvatting (en dus in de PDF).
  const visiblePhotos = body.withPhotos
    ? memos.flatMap((mm) => mm.photoIds).slice(0, 60)
    : []

  const saved = {
    id: uid(), child_id: child.id, period, period_label: periodLabel,
    start, end, text: text || 'De AI gaf geen tekst terug.',
    photo_ids: visiblePhotos.length ? JSON.stringify(visiblePhotos) : null,
    created_at: now(),
  }
  db.prepare('INSERT INTO summaries (id,account_id,child_id,period,period_label,start,end,text,photo_ids,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(saved.id, req.accountId, saved.child_id, saved.period, saved.period_label, saved.start, saved.end, saved.text, saved.photo_ids, saved.created_at)
  sendJson(res, 200, mapSummary(saved))
})

// --- Schrijfhulp: beschrijf wat er op de foto's te zien is ---
// Levert een ruwe eerste tekst waar de ouder zelf op verder schrijft.
const PHOTO_AI_MODEL = process.env.PORTFOLIO_PHOTO_MODEL || 'claude-sonnet-5'
const PHOTO_AI_MAX = 4 // meer foto's kost snel veel meer, en voegt weinig toe

add('POST', /^\/api\/photo-describe$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  if (!ANTHROPIC_KEY) {
    return sendJson(res, 400, { error: 'Er is op de server nog geen Claude API-sleutel ingesteld.' })
  }
  if (!accountSettings(req.accountId).photoAiEnabled) {
    return sendJson(res, 403, {
      error: 'De foto-schrijfhulp staat uit. Je kunt hem aanzetten bij Instellingen.',
    })
  }
  if (aiLimitReached(req)) return sendJson(res, 403, { error: AI_LIMIT_MESSAGE })

  const body = await readJson(req)
  const child = db
    .prepare('SELECT * FROM children WHERE id = ? AND account_id = ?')
    .get(body.childId, req.accountId)
  if (!child) return sendJson(res, 404, { error: 'Kind niet gevonden' })

  const ids = Array.isArray(body.photoIds) ? body.photoIds.slice(0, PHOTO_AI_MAX) : []
  const images = []
  for (const id of ids) {
    try {
      const row = db.prepare('SELECT mime FROM photos WHERE id = ? AND account_id = ?').get(id, req.accountId)
      if (!row) continue
      const data = decryptPhoto(fs.readFileSync(path.join(PHOTO_DIR, id))).toString('base64')
      images.push({
        type: 'image',
        source: { type: 'base64', media_type: ALLOWED_IMAGE_MIME.has(row.mime) ? row.mime : 'image/jpeg', data },
      })
    } catch (e) {
      console.error('[foto-ai] foto overslaan:', id, (e && e.message) || e)
    }
  }
  if (!images.length) return sendJson(res, 400, { error: "Geen foto's om te bekijken." })

  const leeftijd = child.birth_year ? `${new Date().getFullYear() - child.birth_year} jaar` : null
  const een = images.length === 1
  const vakken = Array.isArray(body.subjects)
    ? body.subjects.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
    : []
  const instructie = `Je schrijft mee aan het logboek van een ouder die thuisonderwijs geeft in Nederland. Daarin legt de ouder per dag vast wat het kind gedaan en geleerd heeft.

Hieronder ${een ? 'staat een foto' : `staan ${images.length} foto's, in volgorde,`} van ${child.name}${leeftijd ? ` (${leeftijd})` : ''}${een ? '' : ' tijdens één bezigheid'}.${vakken.length ? `\nDe ouder heeft hier deze vakgebieden bij gekozen: ${vakken.join(', ')}.` : ''}

Schrijf een korte logboeknotitie in het Nederlands, als aanzet waar de ouder zelf op verder schrijft. Houd je aan het volgende:
- Vertel het als een klein verhaal van wat ${child.name} deed${een ? '' : ', in de volgorde van de foto\'s: waar begon het mee, wat kwam daarna'}. Verleden of tegenwoordige tijd, zoals een ouder het zou opschrijven.
- Laat blijken wat er geoefend of geleerd wordt. Dat mag als slotzin ("Dit draagt bij aan evenwicht en motoriek") of verweven in het verhaal ("die lost hij op met behulp van de plus-sommen"). Houd het bescheiden: "oefent", "draagt bij aan" — niet "beheerst" of "kan nu".
- 2 tot 5 zinnen, lopende tekst, geen kopjes of opsomming.
- Schrijf actief, met ${child.name} als onderwerp van de zin. Dus "${child.name} rekende de sommen uit", niet "de sommen werden uitgerekend".
- Beschrijf géén beeldelementen: geen ondergrond, licht, kleding, of wat er in een hand gehouden wordt. Het gaat om wat er gebeurt, niet om hoe de foto eruitziet.
- Wees concreet: noem gerust de sommen, de titel van een boek of waar het kind mee bezig was, zolang je het duidelijk kunt lezen. Kun je het niet goed zien, beschrijf het dan algemeen ("een rij aftreksommen") in plaats van een getal te gokken.
- Verzin geen namen van anderen, plaatsen of gesprekken. Weet je iets niet zeker, houd het dan algemeen in plaats van het te raden.
- Noem het kind bij de naam ${child.name}.
- Schrijf nuchter, zoals een ouder het zelf opschrijft. Geen uitroeptekens en geen aanmoediging ("wat knap!").
- Begin direct bij wat er gebeurde, zonder inleiding als "Op de foto zie je".

Voorbeeld van de toon en lengte die we zoeken:
"Kay heeft vandaag op rolschaatsen gestaan. Dit zorgt voor beweging en draagt bij aan evenwicht en motoriek."`

  let aiRes
  try {
    aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PHOTO_AI_MODEL,
        max_tokens: 600,
        // Denken uit: dit is een korte beschrijving, geen redeneerklus.
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: [...images, { type: 'text', text: instructie }] }],
      }),
    })
  } catch {
    return sendJson(res, 502, { error: 'Kon Anthropic niet bereiken' })
  }
  if (!aiRes.ok) {
    const t = await aiRes.text()
    if (aiRes.status === 401) return sendJson(res, 500, { error: 'Server-API-sleutel ongeldig' })
    if (/credit balance is too low/i.test(t)) {
      return sendJson(res, 503, {
        error: 'De schrijfhulp is even niet beschikbaar (het tegoed op de server is op).',
      })
    }
    if (aiRes.status === 429) return sendJson(res, 429, { error: 'Te veel verzoeken. Probeer het zo nog eens.' })
    return sendJson(res, 502, { error: 'AI-fout: ' + t.slice(0, 200) })
  }
  const json = await aiRes.json()
  const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
  if (!text) return sendJson(res, 502, { error: 'De AI gaf geen tekst terug.' })
  logAiUse(req, 'foto')
  sendJson(res, 200, { text, photoCount: images.length })
})

// --- Kerndoelen door de AI laten voorstellen ---
// De memo's gaan in bundels per maand naar Claude. Eén verzoek per memo zou bij
// een gevuld logboek honderden verzoeken kosten; per maand gebundeld is het er
// een stuk of vijftien voor een heel jaar.
const KD_SCAN_MODEL = process.env.PORTFOLIO_KD_MODEL || 'claude-sonnet-5'
const KD_BATCH_MAX = 50 // memo's per verzoek
const KD_TEXT_MAX = 700 // tekens per memo die we meesturen

/** Draaiende scans, één per portfolio. Bij een herstart is een scan weg; de
 *  voorstellen die al opgeslagen zijn blijven staan en je hervat door opnieuw
 *  te starten — hij slaat dan over wat al bekeken is. */
const kdScans = new Map()

const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]
const maandLabel = (ym) => {
  const [j, m] = ym.split('-')
  return `${MAANDEN[Number(m) - 1] || m} ${j}`
}

/** Verdeelt de nog niet bekeken memo's in bundels per kind en per maand. */
function kdBatches(accountId) {
  const kinderen = db.prepare('SELECT * FROM children WHERE account_id = ?').all(accountId)
  const batches = []
  for (const kind of kinderen) {
    const set = KD_SETS.has(kind.kerndoelen_set) ? kind.kerndoelen_set : 'po'
    const memos = db
      .prepare(
        `SELECT id, date, text, subjects FROM memos
         WHERE account_id = ? AND child_id = ? AND (draft IS NULL OR draft = 0)
           AND (kd_scanned IS NULL OR kd_scanned = 0)
           AND text IS NOT NULL AND TRIM(text) <> ''
         ORDER BY date ASC`,
      )
      .all(accountId, kind.id)
    const perMaand = new Map()
    for (const mm of memos) {
      const ym = String(mm.date || '').slice(0, 7)
      if (!perMaand.has(ym)) perMaand.set(ym, [])
      perMaand.get(ym).push(mm)
    }
    for (const [ym, lijst] of perMaand) {
      for (let i = 0; i < lijst.length; i += KD_BATCH_MAX) {
        batches.push({
          childId: kind.id,
          childName: kind.name,
          age: childAge(kind),
          set,
          label: maandLabel(ym),
          memos: lijst.slice(i, i + KD_BATCH_MAX),
        })
      }
    }
  }
  return batches
}

/** Eén bundel langs Claude, en de voorstellen wegschrijven. */
async function kdScanBatch(accountId, userId, batch) {
  const lijst = KERNDOELEN[batch.set]
    .filter((k) => !k.school)
    .map((k) => `${k.nr}. [${k.lg}] ${k.t.replace(/^De leerling /, '')}`)
    .join('\n')
  const notities = batch.memos
    .map((mm, i) => {
      const vak = mm.subjects ? JSON.parse(mm.subjects) : []
      const tekst = String(mm.text || '').slice(0, KD_TEXT_MAX)
      return `[${i + 1}] ${mm.date}${vak.length ? ` (${vak.join(', ')})` : ''}\n${tekst}`
    })
    .join('\n\n')

  const instructie = `Je helpt een ouder die thuisonderwijs geeft in Nederland om terug te kijken op wat er aan bod is gekomen. Hieronder staan logboeknotities over ${batch.childName}${batch.age != null ? ` (${batch.age} jaar)` : ''} uit ${batch.label}, en de SLO-kerndoelen die voor dit kind gelden.

Werk in twee stappen.

Stap 1 — vul "doorloop": loop de negen leergebieden één voor één langs en noteer per leergebied in één regel of er iets in de notities staat dat eronder valt. Beoordeel niet waar een notitie hóófdzakelijk over gaat, maar wat er allemaal in voorkomt: een notitie over een vermoeiende dag kan daarnaast gewoon een sportweek bevatten.

Stap 2 — vul "gevonden" met de kerndoelen die uit stap 1 volgen.

Thuisonderwijs speelt zich grotendeels af in gewone dagelijkse situaties. Een kerndoel hoeft niet als les aangeboden te zijn: een gesprek aan tafel, samen spelen of een uitje telt net zo goed mee als het duidelijk in de notitie staat.
- Kies alleen uit de nummers hieronder. Verzin geen nummers.
- Geef per kerndoel de nummers van de notities waarin het terugkomt — niet alle notities uit de maand.
- Geef bij elk kerndoel een kort, letterlijk citaat uit een van die notities. Kun je er geen vinden, koppel het kerndoel dan niet.
- Een activiteit die duidelijk bij een leergebied hoort telt mee, ook als er niet bij staat wát er precies geoefend werd: een sportweek met zwemmen valt onder bewegen, een museumbezoek onder mens en maatschappij.
- Koppel niets waar de notities geen aanwijzing voor geven. Een zieke dag of een dagje niks levert niets op.

De kerndoelen (${batch.set === 'vo' ? 'onderbouw voortgezet onderwijs' : 'primair onderwijs'}):
${lijst}

De notities:
${notities}`


  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: KD_SCAN_MODEL,
      max_tokens: 4000,
      thinking: { type: 'disabled' },
      tools: [
        {
          name: 'kerndoelen_vastleggen',
          description: 'Leg vast welke kerndoelen in de notities terugkomen.',
          input_schema: {
            type: 'object',
            properties: {
              doorloop: {
                type: 'string',
                description: 'Per leergebied één regel: staat er iets in de notities dat eronder valt?',
              },
              gevonden: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nr: { type: 'integer', description: 'Nummer van het kerndoel' },
                    notities: {
                      type: 'array',
                      items: { type: 'integer' },
                      description: 'Nummers van de notities waarin het terugkomt',
                    },
                    citaat: { type: 'string', description: 'Kort, letterlijk citaat als bewijs' },
                  },
                  required: ['nr', 'notities', 'citaat'],
                },
              },
            },
            required: ['doorloop', 'gevonden'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'kerndoelen_vastleggen' },
      messages: [{ role: 'user', content: [{ type: 'text', text: instructie }] }],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    if (/credit balance is too low/i.test(t)) throw new Error('Het tegoed op de server is op.')
    if (res.status === 401) throw new Error('De API-sleutel op de server is ongeldig.')
    throw new Error('AI-fout: ' + t.slice(0, 160))
  }
  const json = await res.json()
  logAiUse({ accountId, userId }, 'kerndoelen')
  const blok = (json.content || []).find((b) => b.type === 'tool_use')
  const gevonden = (blok && blok.input && blok.input.gevonden) || []

  const ins = db.prepare(
    "INSERT OR IGNORE INTO kerndoel_links (id,account_id,carrier_type,carrier_id,child_id,kd_set,kd_nr,source,status,quote,created_at) VALUES (?,?,'memo',?,?,?,?,'ai','open',?,?)",
  )
  let nieuw = 0
  for (const g of gevonden) {
    const nr = Number(g.nr)
    if (!kerndoel(batch.set, nr)) continue
    const citaat = typeof g.citaat === 'string' ? g.citaat.slice(0, 300) : null
    for (const idx of Array.isArray(g.notities) ? g.notities : []) {
      const memo = batch.memos[Number(idx) - 1]
      if (!memo) continue
      const r = ins.run(uid(), accountId, memo.id, batch.childId, batch.set, nr, citaat, now())
      nieuw += r.changes
    }
  }
  // Pas afvinken als de bundel gelukt is, zodat een fout niet stilletjes
  // memo's overslaat bij de volgende ronde.
  const mark = db.prepare('UPDATE memos SET kd_scanned = 1 WHERE id = ?')
  for (const mm of batch.memos) mark.run(mm.id)
  return nieuw
}

// Terugkijken op thema's: welke onderwerpen liepen wekenlang door? Dat is één
// aparte vraag per kind over alle memo's — thema's zie je niet binnen één maand.
const KD_PERIOD_MEMOS = 400 // memo's die we meesturen voor het herkennen
const KD_PERIOD_TEXT = 120 // tekens per memo; het gaat om het onderwerp

async function kdPeriodeVoorstellen(accountId, userId, kind) {
  const memos = db
    .prepare(
      `SELECT date, text FROM memos
       WHERE account_id = ? AND child_id = ? AND (draft IS NULL OR draft = 0)
         AND text IS NOT NULL AND TRIM(text) <> ''
       ORDER BY date DESC LIMIT ?`,
    )
    .all(accountId, kind.id, KD_PERIOD_MEMOS)
    .reverse()
  if (memos.length < 15) return 0 // te weinig om een thema uit te halen

  const regels = memos
    .map((mm) => `${mm.date} ${String(mm.text || '').replace(/\s+/g, ' ').slice(0, KD_PERIOD_TEXT)}`)
    .join('\n')

  const instructie = `Hieronder staan logboekregels uit het thuisonderwijs van ${kind.name}, op datum, met van elke dag het begin van de notitie.

Zoek de onderwerpen die wekenlang terugkwamen — een thema waar het gezin een tijd in zat. Denk aan een wereldkampioenschap dat wordt gevolgd, een fascinatie voor de ijstijd, een verbouwing, een reis.

- Alleen thema's die over meerdere weken en in meerdere notities terugkomen. Eén losse dag is geen thema.
- Geef per thema een korte naam zoals een ouder hem zou opschrijven ("Het WK", "De ijstijd"), plus de eerste en laatste datum waarop het voorkomt.
- Hooguit zes thema's. Vind je er geen, geef dan een lege lijst.
- Verzin niets: het thema moet echt in de regels terug te lezen zijn.

De regels:
${regels}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: KD_SCAN_MODEL,
      max_tokens: 1500,
      thinking: { type: 'disabled' },
      tools: [
        {
          name: 'periodes_vastleggen',
          description: 'Leg de thema’s vast die over meerdere weken terugkwamen.',
          input_schema: {
            type: 'object',
            properties: {
              periodes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    naam: { type: 'string' },
                    start: { type: 'string', description: 'Eerste datum, JJJJ-MM-DD' },
                    eind: { type: 'string', description: 'Laatste datum, JJJJ-MM-DD' },
                  },
                  required: ['naam', 'start', 'eind'],
                },
              },
            },
            required: ['periodes'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'periodes_vastleggen' },
      messages: [{ role: 'user', content: [{ type: 'text', text: instructie }] }],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    if (/credit balance is too low/i.test(t)) throw new Error('Het tegoed op de server is op.')
    throw new Error('AI-fout: ' + t.slice(0, 160))
  }
  const json = await res.json()
  logAiUse({ accountId, userId }, 'periodes')
  const blok = (json.content || []).find((b) => b.type === 'tool_use')
  const gevonden = (blok && blok.input && blok.input.periodes) || []

  const bestaand = new Set(
    db.prepare('SELECT title FROM periods WHERE account_id = ?').all(accountId).map((r) => r.title.toLowerCase()),
  )
  const datum = /^\d{4}-\d{2}-\d{2}$/
  let nieuw = 0
  for (const p of gevonden) {
    const naam = String(p.naam || '').trim().slice(0, 80)
    const start = String(p.start || '')
    const eind = String(p.eind || '')
    if (!naam || !datum.test(start) || !datum.test(eind) || eind < start) continue
    if (bestaand.has(naam.toLowerCase())) continue
    bestaand.add(naam.toLowerCase())
    const id = uid()
    db.prepare("INSERT INTO periods (id,account_id,title,start_date,end_date,note,status,source,created_at,updated_at) VALUES (?,?,?,?,?,NULL,'open','ai',?,?)")
      .run(id, accountId, naam, start, eind, now(), now())
    db.prepare('INSERT OR IGNORE INTO period_children (period_id, child_id) VALUES (?,?)').run(id, kind.id)
    nieuw++
  }
  return nieuw
}

async function kdScanRun(accountId, userId) {
  const job = kdScans.get(accountId)
  try {
    for (const batch of job.batches) {
      if (job.stop) {
        job.status = 'gestopt'
        return
      }
      if (aiLimitReached({ accountId, userId })) {
        job.status = 'fout'
        job.error = AI_LIMIT_MESSAGE
        return
      }
      job.bezigMet = `${batch.childName} — ${batch.label}`
      job.gevonden += await kdScanBatch(accountId, userId, batch)
      job.done++
    }
    // Daarna de thema's: één vraag per kind over het hele logboek.
    for (const kind of job.kinderen) {
      if (job.stop) {
        job.status = 'gestopt'
        return
      }
      if (aiLimitReached({ accountId, userId })) break
      job.bezigMet = `Thema's van ${kind.name}`
      job.periodes += await kdPeriodeVoorstellen(accountId, userId, kind)
      job.done++
    }
    job.status = 'klaar'
  } catch (e) {
    job.status = 'fout'
    job.error = (e && e.message) || 'Er ging iets mis bij het doorlopen.'
  } finally {
    job.klaarOp = now()
  }
}

/** Stand van zaken, of — als er niets loopt — een schatting vooraf. */
add('GET', /^\/api\/kerndoelen\/scan$/, (req, res) => {
  const job = kdScans.get(req.accountId)
  if (job && job.status === 'bezig') {
    return sendJson(res, 200, {
      status: 'bezig',
      done: job.done, total: job.batches.length + job.kinderen.length,
      gevonden: job.gevonden, periodes: job.periodes, bezigMet: job.bezigMet,
    })
  }
  const batches = kdBatches(req.accountId)
  const kinderen = db.prepare('SELECT COUNT(*) AS c FROM children WHERE account_id = ?').get(req.accountId).c
  const onbeperkt = isAdminUser(req.userId)
  const gebruikt = aiUsedThisMonth(req.accountId)
  sendJson(res, 200, {
    status: job ? job.status : 'stil',
    error: job ? job.error : undefined,
    done: job ? job.done : 0,
    gevondenVorigeKeer: job ? job.gevonden : 0,
    periodesVorigeKeer: job ? job.periodes : 0,
    memos: batches.reduce((n, b) => n + b.memos.length, 0),
    batches: batches.length,
    // Eén extra verzoek per kind voor het herkennen van thema's.
    kinderen,
    beschikbaar: !!ANTHROPIC_KEY,
    aiLeft: onbeperkt ? null : Math.max(0, AI_MONTH_LIMIT - gebruikt),
  })
})

add('POST', /^\/api\/kerndoelen\/scan$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  if (!ANTHROPIC_KEY) {
    return sendJson(res, 400, { error: 'Er is op de server nog geen Claude API-sleutel ingesteld.' })
  }
  const inst = accountSettings(req.accountId)
  if (!inst.kerndoelenEnabled || !inst.kerndoelenAi) {
    return sendJson(res, 403, { error: 'Zet bij Instellingen eerst de kerndoelen en de AI-voorstellen aan.' })
  }
  if (aiLimitReached(req)) return sendJson(res, 403, { error: AI_LIMIT_MESSAGE })
  const lopend = kdScans.get(req.accountId)
  if (lopend && lopend.status === 'bezig') {
    return sendJson(res, 409, { error: 'Er loopt al een scan voor dit portfolio.' })
  }
  const batches = kdBatches(req.accountId)
  if (!batches.length) {
    return sendJson(res, 400, { error: "Alle memo's zijn al bekeken." })
  }
  const kinderen = db.prepare('SELECT * FROM children WHERE account_id = ?').all(req.accountId)
  const job = {
    status: 'bezig', batches, kinderen, done: 0, gevonden: 0, periodes: 0,
    bezigMet: null, stop: false, error: null, startedAt: now(),
  }
  kdScans.set(req.accountId, job)
  // Bewust niet awaiten: de scan loopt door nadat dit antwoord verstuurd is.
  kdScanRun(req.accountId, req.userId)
  sendJson(res, 202, { status: 'bezig', total: batches.length + kinderen.length })
})

add('DELETE', /^\/api\/kerndoelen\/scan$/, (req, res) => {
  if (!requireEditor(req, res)) return
  const job = kdScans.get(req.accountId)
  if (job && job.status === 'bezig') job.stop = true
  sendJson(res, 200, { ok: true })
})

// Samenvatting bewerken (tekst bijschaven na het genereren).
add('PATCH', /^\/api\/summaries\/([^/]+)$/, async (req, res, m) => {
  if (!requireEditor(req, res)) return
  const existing = db.prepare('SELECT * FROM summaries WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!existing) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const text = body.text != null ? String(body.text) : existing.text
  const periodLabel =
    body.periodLabel != null
      ? String(body.periodLabel).trim().slice(0, 200) || existing.period_label
      : existing.period_label
  const photoIds =
    body.photoIds !== undefined
      ? Array.isArray(body.photoIds) && body.photoIds.length
        ? JSON.stringify(body.photoIds)
        : null
      : existing.photo_ids
  db.prepare('UPDATE summaries SET text = ?, period_label = ?, photo_ids = ? WHERE id = ?')
    .run(text, periodLabel, photoIds, m[1])
  sendJson(res, 200, mapSummary({ ...existing, text, period_label: periodLabel, photo_ids: photoIds }))
})

add('DELETE', /^\/api\/summaries\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  db.prepare('DELETE FROM summaries WHERE id = ? AND account_id = ?').run(m[1], req.accountId)
  sendJson(res, 200, { ok: true })
})

// Verwijdert ALLE gegevens van het ingelogde account (account blijft bestaan).
add('DELETE', /^\/api\/account\/data$/, (req, res) => {
  if (!requireOwner(req, res)) return
  const acc = req.accountId
  const fromMemos = db
    .prepare('SELECT photo_ids FROM memos WHERE account_id = ?')
    .all(acc)
    .flatMap((r) => (r.photo_ids ? JSON.parse(r.photo_ids) : []))
  const standalone = db
    .prepare('SELECT id FROM photos WHERE account_id = ?')
    .all(acc)
    .map((p) => p.id)
  deletePhotoFiles([...new Set([...fromMemos, ...standalone])])
  db.prepare('DELETE FROM memos WHERE account_id = ?').run(acc)
  db.prepare('DELETE FROM summaries WHERE account_id = ?').run(acc)
  db.prepare('DELETE FROM children WHERE account_id = ?').run(acc)
  db.prepare('DELETE FROM photos WHERE account_id = ?').run(acc)
  db.prepare('DELETE FROM event_done WHERE account_id = ?').run(acc)
  db.prepare('DELETE FROM kerndoel_links WHERE account_id = ?').run(acc)
  for (const p of db.prepare('SELECT id FROM periods WHERE account_id = ?').all(acc)) {
    db.prepare('DELETE FROM period_children WHERE period_id = ?').run(p.id)
  }
  db.prepare('DELETE FROM periods WHERE account_id = ?').run(acc)
  sendJson(res, 200, { ok: true })
})

// ---- Reacties (memo's en samenvattingen) ----
add('POST', /^\/api\/comments$/, async (req, res) => {
  if (!rateLimit('cmt:' + req.userId, 60, 60 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Te veel reacties achter elkaar. Probeer het zo weer.' })
  }
  const body = await readJson(req)
  const type = body.targetType === 'summary' ? 'summary' : 'memo'
  const targetId = String(body.targetId || '')
  const text = String(body.text || '').trim()
  if (!text) return sendJson(res, 400, { error: 'Lege reactie' })
  const table = type === 'summary' ? 'summaries' : 'memos'
  const exists = db.prepare(`SELECT id FROM ${table} WHERE id = ? AND account_id = ?`).get(targetId, req.accountId)
  if (!exists) return sendJson(res, 404, { error: 'niet gevonden' })
  const c = {
    id: uid(), account_id: req.accountId, target_type: type, target_id: targetId,
    user_id: req.userId, author_email: userEmail(req.userId), text, created_at: now(),
  }
  db.prepare('INSERT INTO comments (id,account_id,target_type,target_id,user_id,author_email,text,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(c.id, c.account_id, c.target_type, c.target_id, c.user_id, c.author_email, c.text, c.created_at)

  // Mail de accounteigenaar bij een nieuwe reactie (niet als die zelf reageert).
  const ownerEmail = userEmail(req.accountId)
  if (ownerEmail && req.userId !== req.accountId) {
    let context
    if (type === 'summary') {
      const s = db.prepare('SELECT child_id, period_label FROM summaries WHERE id = ?').get(targetId)
      const cn = s ? db.prepare('SELECT name FROM children WHERE id = ?').get(s.child_id)?.name : ''
      context = `op de samenvatting van ${cn || 'een kind'} (${s?.period_label || ''})`
    } else {
      const mm = db.prepare('SELECT child_id, date FROM memos WHERE id = ?').get(targetId)
      const cn = mm ? db.prepare('SELECT name FROM children WHERE id = ?').get(mm.child_id)?.name : ''
      context = `op de memo van ${cn || 'een kind'} (${mm?.date || ''})`
    }
    sendEmailSafe(ownerEmail, 'Nieuwe reactie in Kindfolio 💬', newCommentHtml(c.author_email, context, text), 'nieuwe-reactie')
  }

  sendJson(res, 201, mapComment(c))
})

add('DELETE', /^\/api\/comments\/([^/]+)$/, (req, res, m) => {
  const c = db.prepare('SELECT * FROM comments WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (c && (c.user_id === req.userId || req.role === 'owner')) {
    db.prepare('DELETE FROM comments WHERE id = ?').run(m[1])
  }
  sendJson(res, 200, { ok: true })
})

// ---- Accounts waar de gebruiker toegang toe heeft (voor de wisselaar) ----
add('GET', /^\/api\/accounts$/, (req, res) => {
  const rows = db
    .prepare('SELECT account_id, role FROM memberships WHERE user_id = ? ORDER BY created_at ASC')
    .all(req.userId)
  sendJson(res, 200, {
    accounts: rows.map((r) => ({
      id: r.account_id,
      role: r.role,
      ownerEmail: userEmail(r.account_id),
    })),
  })
})

// ---- Delen / uitnodigen (alleen eigenaar) ----
add('POST', /^\/api\/invite$/, async (req, res) => {
  if (!requireOwner(req, res)) return
  const body = await readJson(req)
  const email = String(body.email || '').trim().toLowerCase()
  if (!isEmail(email)) return sendJson(res, 400, { error: 'Ongeldig e-mailadres.' })
  if (email === userEmail(req.userId)) {
    return sendJson(res, 400, { error: 'Je kunt jezelf niet uitnodigen.' })
  }
  // 'editor' = medeouder (mag bewerken), anders 'commenter' = meelezer (read-only).
  const role = body.role === 'editor' ? 'editor' : 'commenter'
  const owner = userEmail(req.userId)
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existingUser) {
    const existing = db.prepare('SELECT id, role FROM memberships WHERE account_id = ? AND user_id = ?').get(req.accountId, existingUser.id)
    if (!existing) {
      db.prepare('INSERT INTO memberships (id,account_id,user_id,role,created_at) VALUES (?,?,?,?,?)')
        .run(uid(), req.accountId, existingUser.id, role, now())
    } else if (existing.role !== 'owner' && existing.role !== role) {
      // Bestaande deelnemer: rol bijwerken (bv. meelezer → medeouder).
      db.prepare('UPDATE memberships SET role = ? WHERE id = ?').run(role, existing.id)
    }
    await sendEmailSafe(email, 'Je hebt toegang gekregen tot een Kindfolio', inviteExistingHtml(owner), 'uitnodiging-bestaand')
  } else {
    const inv = db.prepare('SELECT id FROM invites WHERE account_id = ? AND email = ?').get(req.accountId, email)
    if (!inv) {
      db.prepare('INSERT INTO invites (id,account_id,email,role,token,created_at) VALUES (?,?,?,?,?,?)')
        .run(uid(), req.accountId, email, role, crypto.randomBytes(16).toString('hex'), now())
    } else {
      db.prepare('UPDATE invites SET role = ? WHERE id = ?').run(role, inv.id)
    }
    await sendEmailSafe(email, 'Uitnodiging voor Kindfolio', inviteNewHtml(owner, email), 'uitnodiging-nieuw')
  }
  sendJson(res, 200, { ok: true })
})

add('GET', /^\/api\/shares$/, (req, res) => {
  if (!requireOwner(req, res)) return
  const members = db
    .prepare("SELECT user_id, role FROM memberships WHERE account_id = ? AND role != 'owner'")
    .all(req.accountId)
    .map((r) => ({ email: userEmail(r.user_id), role: r.role, status: 'active' }))
  const pending = db
    .prepare('SELECT email, role FROM invites WHERE account_id = ?')
    .all(req.accountId)
    .map((r) => ({ email: r.email, role: r.role, status: 'pending' }))
  sendJson(res, 200, { shares: [...members, ...pending] })
})

add('DELETE', /^\/api\/shares$/, async (req, res) => {
  if (!requireOwner(req, res)) return
  const body = await readJson(req)
  const email = String(body.email || '').trim().toLowerCase()
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (u) {
    db.prepare("DELETE FROM memberships WHERE account_id = ? AND user_id = ? AND role != 'owner'").run(req.accountId, u.id)
  }
  db.prepare('DELETE FROM invites WHERE account_id = ? AND email = ?').run(req.accountId, email)
  sendJson(res, 200, { ok: true })
})

// ---- server ----
const OPEN = new Set([
  '/api/health',
  '/api/register',
  '/api/login',
  '/api/verify',
  '/api/forgot',
  '/api/reset',
])
// Routes die alleen de gebruiker nodig hebben, niet een actief account.
const USER_ONLY = new Set(['/api/me', '/api/logout', '/api/accounts'])

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname

    if (pathname.startsWith('/api/') && !OPEN.has(pathname)) {
      const userId = sessionUserId(req)
      if (!userId) return sendJson(res, 401, { error: 'auth' })
      req.userId = userId
      if (!USER_ONLY.has(pathname)) {
        // Actief account: expliciet via header/query, anders eigen account.
        const explicit =
          req.headers['x-account-id'] || url.searchParams.get('account') || ''
        const requested = explicit || userId
        let m = db
          .prepare('SELECT role FROM memberships WHERE account_id = ? AND user_id = ?')
          .get(requested, userId)
        if (!m && !explicit) {
          // Geen eigen portfolio (bv. lerares) → val terug op eerste toegankelijke account.
          const first = db
            .prepare('SELECT account_id, role FROM memberships WHERE user_id = ? ORDER BY created_at ASC')
            .get(userId)
          if (first) {
            req.accountId = first.account_id
            req.role = first.role
            m = first
          }
        }
        if (!m) return sendJson(res, 403, { error: 'Geen toegang tot dit portfolio.' })
        if (req.accountId === undefined) {
          req.accountId = requested
          req.role = m.role
        }
      }
    }

    for (const r of routes) {
      if (r.method !== req.method) continue
      const match = r.pattern.exec(pathname)
      if (match) return await r.handler(req, res, match)
    }
    sendJson(res, 404, { error: 'onbekende route' })
  } catch (err) {
    sendJson(res, err.statusCode || 500, { error: err.message || 'serverfout' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`portfolio-api (multi-tenant) op 127.0.0.1:${PORT}, data in ${DATA_DIR}`)
})
