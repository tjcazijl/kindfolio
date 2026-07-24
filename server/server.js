'use strict'
// Thuisonderwijs Portfolio - backend (zero dependencies)
// Multi-tenant: accounts (e-mail + wachtwoord), data per account gescheiden.
// Node 22+, gestart met --experimental-sqlite.

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')
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
const WHISPER_BIN = process.env.PORTFOLIO_WHISPER_BIN || ''
const WHISPER_MODEL = process.env.PORTFOLIO_WHISPER_MODEL || ''
const WHISPER_OK = !!(
  WHISPER_BIN &&
  WHISPER_MODEL &&
  fs.existsSync(WHISPER_BIN) &&
  fs.existsSync(WHISPER_MODEL)
)
if (!WHISPER_OK) console.warn('[stt] whisper niet ingesteld — inspreken uitgeschakeld')

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
for (const col of ['verify_token TEXT', 'reset_token TEXT', 'reset_expires INTEGER']) {
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

// ---- mappers ----
const mapChild = (r) => ({
  id: r.id, name: r.name, color: r.color,
  birthYear: r.birth_year ?? undefined, birthDate: r.birth_date ?? undefined,
  subjects: r.subjects ? JSON.parse(r.subjects) : undefined,
  subcategories: r.subcategories ? JSON.parse(r.subcategories) : undefined,
  createdAt: r.created_at,
})

const DEFAULT_SUBJECTS = [
  'Taal', 'Rekenen', 'Lezen', 'Schrijven', 'Natuur', 'Algemene wetenschap',
  'Technisch', 'Geschiedenis', 'Aardrijkskunde', 'Creatief', 'Muziek',
  'Bewegen', 'Sociaal', 'Uitstapje', 'Overig',
]
function accountSettings(accId) {
  const row = db.prepare('SELECT subjects, ai_enabled, subcategories FROM account_settings WHERE account_id = ?').get(accId)
  return {
    subjects: row && row.subjects ? JSON.parse(row.subjects) : DEFAULT_SUBJECTS,
    aiEnabled: row ? row.ai_enabled !== 0 : true,
    // { "Taal": ["Woordenschat","Spelling"], ... }
    subcategories: row && row.subcategories ? JSON.parse(row.subcategories) : {},
  }
}
const mapMemo = (r, resourceIds) => ({
  id: r.id, childId: r.child_id, date: r.date, text: r.text || '',
  subjects: r.subjects ? JSON.parse(r.subjects) : [],
  photoIds: r.photo_ids ? JSON.parse(r.photo_ids) : [],
  resourceIds: resourceIds || [],
  draft: !!r.draft,
  mood: r.mood || undefined,
  likeCount: r.like_count ?? 0,
  likedByMe: !!r.liked,
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
  if (body.attentionText !== undefined || body.attentionSubject !== undefined)
    upsertMemoFocus(memoId, childId, accountId, 'attention', body.attentionText, body.attentionSubject, 'open')
  if (body.followupText !== undefined)
    upsertMemoFocus(memoId, childId, accountId, 'later', body.followupText, null, 'later')
}
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
const mapEvent = (r, childIds) => ({
  id: r.id, title: r.title, notes: r.notes || '',
  type: r.type || 'uitje', date: r.date, time: r.time || undefined,
  freq: r.freq || 'none', everyN: r.every_n || 1,
  weekdays: r.weekdays ? String(r.weekdays).split(',').filter(Boolean) : [],
  until: r.until_date || undefined,
  sortOrder: r.sort_order || 0,
  subjects: r.subjects ? JSON.parse(r.subjects) : [],
  childIds: childIds || [],
  createdAt: r.created_at, updatedAt: r.updated_at,
})

// ---- auth helpers ----
const SECRET =
  process.env.PORTFOLIO_SECRET ||
  crypto.createHash('sha256').update('pf-fallback').digest('hex')
const INVITE_CODE = process.env.PORTFOLIO_INVITE_CODE || ''
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
  const code = String(body.code || '')
  const invited = db.prepare('SELECT id FROM invites WHERE email = ?').get(email)
  // Code-check is niet hoofdlettergevoelig.
  const codeOk = !!INVITE_CODE && code.toLowerCase() === INVITE_CODE.toLowerCase()
  // Uitgenodigden (lerares) mogen registreren zonder beta-code.
  if (INVITE_CODE && !codeOk && !invited) {
    return sendJson(res, 403, { error: 'Ongeldige of ontbrekende uitnodigingscode.' })
  }
  // Eigen portfolio krijg je alleen bij een normale aanmelding (geldige beta-code),
  // niet als je puur via een uitnodiging registreert (dan ben je meelezer).
  const wantsOwn = !invited || codeOk
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
  res.writeHead(302, { Location: `${APP_URL}/?verified=1` })
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

// --- Data (account-scoped via req.accountId) ---
add('GET', /^\/api\/state$/, (req, res) => {
  const acc = req.accountId
  const children = db.prepare('SELECT * FROM children WHERE account_id = ? ORDER BY created_at ASC').all(acc).map(mapChild)
  const memoResLinks = {}
  for (const l of db
    .prepare(
      'SELECT mr.memo_id, mr.resource_id FROM memo_resources mr JOIN memos m ON m.id = mr.memo_id WHERE m.account_id = ?',
    )
    .all(acc)) {
    ;(memoResLinks[l.memo_id] ||= []).push(l.resource_id)
  }
  const memos = db.prepare(
    `SELECT *,
       (SELECT COUNT(*) FROM memo_likes l WHERE l.memo_id = memos.id) AS like_count,
       (SELECT COUNT(*) FROM memo_likes l WHERE l.memo_id = memos.id AND l.user_id = ?) AS liked
     FROM memos WHERE account_id = ? ORDER BY date DESC, created_at DESC`,
  ).all(req.userId, acc).map((r) => mapMemo(r, memoResLinks[r.id] || []))
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
  const events = db
    .prepare('SELECT * FROM events WHERE account_id = ? ORDER BY date ASC, time ASC')
    .all(acc)
    .map((r) => mapEvent(r, eventLinks[r.id] || []))
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
  sendJson(res, 200, {
    children,
    memos,
    summaries,
    comments,
    events,
    focusPoints,
    resources,
    account: {
      id: acc,
      ownerEmail: userEmail(acc),
      email: userEmail(req.userId),
      role: req.role,
      isAdmin: isAdminUser(req.userId),
      voiceEnabled: WHISPER_OK,
      ...accountSettings(acc),
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
  db.prepare(
    'INSERT INTO account_settings (account_id,subjects,ai_enabled,subcategories) VALUES (?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET subjects=excluded.subjects, ai_enabled=excluded.ai_enabled, subcategories=excluded.subcategories',
  ).run(req.accountId, JSON.stringify(subjects), aiEnabled, JSON.stringify(subcategories))
  sendJson(res, 200, { subjects, aiEnabled: !!aiEnabled, subcategories })
})

add('GET', /^\/api\/admin\/users$/, (req, res) => {
  if (!isAdminUser(req.userId)) return sendJson(res, 403, { error: 'Geen toegang' })
  const rows = db
    .prepare(
      `SELECT u.email, u.created_at, u.verified,
        (SELECT COUNT(*) FROM children c WHERE c.account_id = u.id) AS children,
        (SELECT COUNT(*) FROM memos m WHERE m.account_id = u.id) AS memos,
        (SELECT COUNT(*) FROM summaries s WHERE s.account_id = u.id) AS summaries
      FROM users u ORDER BY u.created_at DESC`,
    )
    .all()
  sendJson(res, 200, {
    users: rows.map((r) => ({
      email: r.email,
      createdAt: r.created_at,
      verified: !!r.verified,
      children: r.children,
      memos: r.memos,
      summaries: r.summaries,
    })),
  })
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
  const reactions = {}
  for (const r of likeRows)
    reactions[r.update_id] = { likes: r.likes, likedByMe: !!r.liked, commentCount: 0 }
  for (const r of commentRows)
    (reactions[r.update_id] ||= { likes: 0, likedByMe: false, commentCount: 0 }).commentCount = r.c
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
  const likes = db.prepare('SELECT COUNT(*) AS c FROM update_likes WHERE update_id = ?').get(id).c
  sendJson(res, 200, { likes, likedByMe: !existing })
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
  db.prepare('INSERT INTO children (id,account_id,name,color,birth_year,birth_date,subjects,subcategories,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(child.id, req.accountId, child.name, child.color, child.birth_year, child.birth_date, child.subjects, child.subcategories, child.created_at)
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
  db.prepare('UPDATE children SET name = ?, color = ?, birth_year = ?, birth_date = ?, subjects = ?, subcategories = ? WHERE id = ?')
    .run(name, color, birthYear, birthDate, subjects, subcategories, m[1])
  sendJson(res, 200, mapChild({ ...existing, name, color, birth_year: birthYear, birth_date: birthDate, subjects, subcategories }))
})

add('DELETE', /^\/api\/children\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const child = db.prepare('SELECT id FROM children WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!child) return sendJson(res, 404, { error: 'niet gevonden' })
  const memos = db.prepare('SELECT photo_ids FROM memos WHERE child_id = ? AND account_id = ?').all(m[1], req.accountId)
  deletePhotoFiles(memos.flatMap((r) => (r.photo_ids ? JSON.parse(r.photo_ids) : [])))
  db.prepare('DELETE FROM memos WHERE child_id = ? AND account_id = ?').run(m[1], req.accountId)
  db.prepare('DELETE FROM summaries WHERE child_id = ? AND account_id = ?').run(m[1], req.accountId)
  db.prepare('DELETE FROM children WHERE id = ?').run(m[1])
  sendJson(res, 200, { ok: true })
})

// --- Agenda (events) ---
const EVENT_TYPES = new Set(['uitje', 'taak', 'les'])
const EVENT_FREQ = new Set(['none', 'daily', 'weekly', 'monthly', 'yearly'])
const WEEKDAYS = new Set(['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'])

// Valideert childIds tegen het account en ontdubbelt.
function validChildIds(list, accountId) {
  if (!Array.isArray(list)) return []
  return [...new Set(list)].filter((cid) =>
    db.prepare('SELECT id FROM children WHERE id = ? AND account_id = ?').get(cid, accountId),
  )
}
// Zet de opgegeven weekdagen om naar een opgeschoonde, comma-gescheiden string.
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
  db.prepare(
    'INSERT INTO events (id,account_id,title,notes,type,date,time,freq,every_n,weekdays,until_date,sort_order,subjects,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    ev.id, req.accountId, ev.title, ev.notes, ev.type, ev.date, ev.time,
    ev.freq, ev.every_n, ev.weekdays, ev.until_date, ev.sort_order, ev.subjects, ev.created_at, ev.updated_at,
  )
  const childIds = validChildIds(body.childIds, req.accountId)
  for (const cid of childIds)
    db.prepare('INSERT OR IGNORE INTO event_children (event_id,child_id) VALUES (?,?)').run(ev.id, cid)
  sendJson(res, 201, mapEvent(ev, childIds))
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
  db.prepare(
    'UPDATE events SET title=?,notes=?,type=?,date=?,time=?,freq=?,every_n=?,weekdays=?,until_date=?,sort_order=?,subjects=?,updated_at=? WHERE id=?',
  ).run(title, notes, type, date, time, freq, everyN, weekdays, until, sortOrder, subjects, now(), m[1])
  let childIds
  if (Array.isArray(body.childIds)) {
    childIds = validChildIds(body.childIds, req.accountId)
    db.prepare('DELETE FROM event_children WHERE event_id = ?').run(m[1])
    for (const cid of childIds)
      db.prepare('INSERT OR IGNORE INTO event_children (event_id,child_id) VALUES (?,?)').run(m[1], cid)
  } else {
    childIds = db.prepare('SELECT child_id FROM event_children WHERE event_id = ?').all(m[1]).map((r) => r.child_id)
  }
  sendJson(
    res, 200,
    mapEvent(
      { ...existing, title, notes, type, date, time, freq, every_n: everyN, weekdays, until_date: until, sort_order: sortOrder, subjects },
      childIds,
    ),
  )
})

add('DELETE', /^\/api\/events\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const ev = db.prepare('SELECT id FROM events WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (!ev) return sendJson(res, 404, { error: 'niet gevonden' })
  db.prepare('DELETE FROM event_children WHERE event_id = ?').run(m[1])
  db.prepare('DELETE FROM events WHERE id = ?').run(m[1])
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
  const likes = db.prepare('SELECT COUNT(*) AS c FROM memo_likes WHERE memo_id = ?').get(m[1]).c
  sendJson(res, 200, { likes, likedByMe: !existing })
})

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
  sendJson(res, 200, { ok: true })
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
  const dataJson = Buffer.from(JSON.stringify({ children, memos, summaries, comments }, null, 2), 'utf8')

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

// ---- Spraak-naar-tekst (whisper.cpp, lokaal) ----
const MAX_AUDIO_BYTES = 25 * 1024 * 1024
function execFileP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr || '').slice(0, 300) }))
      else resolve(stdout)
    })
  })
}
// Eén transcriptie tegelijk (beschermt de kleine server).
let transcribeBusy = 0
let transcribeChain = Promise.resolve()

async function transcribeOne(audio, prompt) {
  const base = path.join(os.tmpdir(), 'kf-stt-' + uid())
  const inPath = base + '.in'
  const wavPath = base + '.wav'
  try {
    await fs.promises.writeFile(inPath, audio)
    // Naar 16kHz mono WAV (whisper-eis).
    await execFileP('ffmpeg', ['-nostdin', '-y', '-i', inPath, '-ar', '16000', '-ac', '1', '-f', 'wav', wavPath], { timeout: 30000 })
    const args = ['-m', WHISPER_MODEL, '-f', wavPath, '-l', 'nl', '-nt', '-np', '-t', '2']
    // Prompt met namen + vakgebieden verbetert eigennamen sterk.
    if (prompt) args.push('--prompt', prompt.slice(0, 400))
    const stdout = await execFileP(WHISPER_BIN, args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024 })
    return String(stdout).split('\n').map((s) => s.trim()).filter(Boolean).join(' ')
  } finally {
    fs.promises.unlink(inPath).catch(() => {})
    fs.promises.unlink(wavPath).catch(() => {})
  }
}
// Bouwt een NL-prompt uit de namen van de kinderen + vakgebieden van dit account.
function transcribePrompt(accountId) {
  const kids = db.prepare('SELECT name FROM children WHERE account_id = ?').all(accountId).map((r) => r.name).filter(Boolean)
  const subs = accountSettings(accountId).subjects || []
  let p = 'Een memo over thuisonderwijs in het Nederlands.'
  if (kids.length) p += ` Kinderen: ${kids.slice(0, 15).join(', ')}.`
  if (subs.length) p += ` Vakgebieden: ${subs.slice(0, 20).join(', ')}.`
  return p
}

add('GET', /^\/api\/transcribe\/available$/, (req, res) =>
  sendJson(res, 200, { available: WHISPER_OK }),
)

add('POST', /^\/api\/transcribe$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  if (!WHISPER_OK) return sendJson(res, 400, { error: 'Spraakherkenning is niet ingesteld op de server.' })
  if (!rateLimit('stt:' + req.userId, 60, 10 * 60 * 1000)) {
    return sendJson(res, 429, { error: 'Even wachten met inspreken.' })
  }
  if (transcribeBusy > 3) {
    return sendJson(res, 429, { error: 'Het is nu druk met omzetten. Probeer het zo weer.' })
  }
  let audio
  try {
    audio = await readBody(req, MAX_AUDIO_BYTES)
  } catch {
    return sendJson(res, 413, { error: 'Opname te groot.' })
  }
  if (!audio.length) return sendJson(res, 400, { error: 'Lege opname.' })

  transcribeBusy++
  const prompt = transcribePrompt(req.accountId)
  const job = transcribeChain.then(() => transcribeOne(audio, prompt))
  transcribeChain = job.catch(() => {})
  try {
    const text = await job
    sendJson(res, 200, { text })
  } catch (e) {
    console.error('[stt] mislukt:', (e && e.message) || e)
    sendJson(res, 500, { error: 'Omzetten mislukt. Probeer opnieuw of typ de tekst.' })
  } finally {
    transcribeBusy--
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

add('GET', /^\/api\/summary\/available$/, (req, res) =>
  sendJson(res, 200, { available: !!ANTHROPIC_KEY }),
)

add('POST', /^\/api\/summary$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const body = await readJson(req)
  const useAi = body.ai !== false
  if (useAi && !ANTHROPIC_KEY) {
    return sendJson(res, 400, { error: 'Er is op de server nog geen Claude API-sleutel ingesteld.' })
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
        const data = fs.readFileSync(path.join(PHOTO_DIR, id)).toString('base64')
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
    if (aiRes.status === 429) return sendJson(res, 429, { error: 'Te veel verzoeken of tegoed op. Probeer het later opnieuw.' })
    return sendJson(res, 502, { error: 'AI-fout: ' + t.slice(0, 200) })
  }
  const json = await aiRes.json()
  text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
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
