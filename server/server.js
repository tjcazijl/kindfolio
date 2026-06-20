'use strict'
// Thuisonderwijs Portfolio - backend (zero dependencies)
// Multi-tenant: accounts (e-mail + wachtwoord), data per account gescheiden.
// Node 22+, gestart met --experimental-sqlite.

const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')

const PORT = Number(process.env.PORT || 3017)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const PHOTO_DIR = path.join(DATA_DIR, 'photos')
const MAX_PHOTO_BYTES = 20 * 1024 * 1024
const MAX_JSON_BYTES = 1 * 1024 * 1024

fs.mkdirSync(PHOTO_DIR, { recursive: true })

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
  db.exec("ALTER TABLE feedback ADD COLUMN status TEXT DEFAULT 'open'")
} catch {
  /* kolom bestaat al */
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
  createdAt: r.created_at,
})

const DEFAULT_SUBJECTS = [
  'Taal', 'Rekenen', 'Lezen', 'Schrijven', 'Natuur', 'Algemene wetenschap',
  'Technisch', 'Geschiedenis', 'Aardrijkskunde', 'Creatief', 'Muziek',
  'Bewegen', 'Sociaal', 'Uitstapje', 'Overig',
]
function accountSettings(accId) {
  const row = db.prepare('SELECT subjects, ai_enabled FROM account_settings WHERE account_id = ?').get(accId)
  return {
    subjects: row && row.subjects ? JSON.parse(row.subjects) : DEFAULT_SUBJECTS,
    aiEnabled: row ? row.ai_enabled !== 0 : true,
  }
}
const mapMemo = (r) => ({
  id: r.id, childId: r.child_id, date: r.date, text: r.text || '',
  subjects: r.subjects ? JSON.parse(r.subjects) : [],
  photoIds: r.photo_ids ? JSON.parse(r.photo_ids) : [],
  createdAt: r.created_at, updatedAt: r.updated_at,
})
const mapSummary = (r) => ({
  id: r.id, childId: r.child_id, period: r.period, periodLabel: r.period_label,
  start: r.start, end: r.end, text: r.text || '', createdAt: r.created_at,
})
const mapComment = (r) => ({
  id: r.id, targetType: r.target_type, targetId: r.target_id,
  authorEmail: r.author_email, text: r.text || '', createdAt: r.created_at,
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
  const userId = payload.split('.')[0]
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
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })
  if (!r.ok) throw new Error('SendGrid-fout: ' + (await r.text()).slice(0, 200))
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
    } catch {
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
    } catch {
      /* stil falen; geen info lekken */
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
  const memos = db.prepare('SELECT * FROM memos WHERE account_id = ? ORDER BY date DESC, created_at DESC').all(acc).map(mapMemo)
  const summaries = db.prepare('SELECT * FROM summaries WHERE account_id = ? ORDER BY created_at DESC').all(acc).map(mapSummary)
  const comments = db
    .prepare('SELECT * FROM comments WHERE account_id = ? ORDER BY created_at ASC')
    .all(acc)
    .map(mapComment)
  sendJson(res, 200, {
    children,
    memos,
    summaries,
    comments,
    account: {
      id: acc,
      ownerEmail: userEmail(acc),
      email: userEmail(req.userId),
      role: req.role,
      isAdmin: isAdminUser(req.userId),
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
  db.prepare(
    'INSERT INTO account_settings (account_id,subjects,ai_enabled) VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET subjects=excluded.subjects, ai_enabled=excluded.ai_enabled',
  ).run(req.accountId, JSON.stringify(subjects), aiEnabled)
  sendJson(res, 200, { subjects, aiEnabled: !!aiEnabled })
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

// Toon alleen het deel vóór de @ als publieke naam (privacy op het prikbord).
function displayName(email) {
  return String(email || '').split('@')[0] || 'iemand'
}
function mapFeedbackRow(r, userId) {
  return {
    id: r.id,
    author: displayName(r.email),
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
  SELECT f.id, f.user_id, f.email, f.message, f.status, f.created_at,
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
  const body = await readJson(req)
  const message = (body.message || '').trim()
  if (!message) return sendJson(res, 400, { error: 'Schrijf eerst een bericht.' })
  const id = uid()
  db.prepare(
    "INSERT INTO feedback (id,account_id,user_id,email,message,page,status,created_at) VALUES (?,?,?,?,?,?,'open',?)",
  ).run(id, req.accountId, req.userId, userEmail(req.userId), message.slice(0, 4000), (body.page || '').slice(0, 200), now())
  const row = db.prepare(`${FEEDBACK_SELECT} WHERE f.id = ?`).get(req.userId, id)
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
    .prepare('SELECT id, user_id, email, text, created_at FROM feedback_comments WHERE feedback_id = ? ORDER BY created_at ASC')
    .all(m[1])
  sendJson(res, 200, {
    comments: rows.map((r) => ({
      id: r.id,
      author: displayName(r.email),
      text: r.text,
      mine: r.user_id === req.userId,
      createdAt: r.created_at,
    })),
  })
})

add('POST', /^\/api\/feedback\/([^/]+)\/comments$/, async (req, res, m) => {
  const fb = db.prepare('SELECT id FROM feedback WHERE id = ?').get(m[1])
  if (!fb) return sendJson(res, 404, { error: 'niet gevonden' })
  const body = await readJson(req)
  const text = (body.text || '').trim()
  if (!text) return sendJson(res, 400, { error: 'Schrijf eerst een reactie.' })
  const c = { id: uid(), email: userEmail(req.userId), created_at: now() }
  db.prepare('INSERT INTO feedback_comments (id,feedback_id,user_id,email,text,created_at) VALUES (?,?,?,?,?,?)')
    .run(c.id, m[1], req.userId, c.email, text.slice(0, 2000), c.created_at)
  sendJson(res, 201, {
    id: c.id,
    author: displayName(c.email),
    text: text.slice(0, 2000),
    mine: true,
    createdAt: c.created_at,
  })
})

// Beheerder: feedback markeren als verwerkt (of heropenen).
add('POST', /^\/api\/feedback\/([^/]+)\/status$/, async (req, res, m) => {
  if (!isAdminUser(req.userId)) return sendJson(res, 403, { error: 'Geen toegang' })
  const body = await readJson(req)
  const status = body.status === 'done' ? 'done' : 'open'
  const r = db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, m[1])
  if (!r.changes) return sendJson(res, 404, { error: 'niet gevonden' })
  sendJson(res, 200, { status })
})

// Beheerder: feedback verwijderen (incl. stemmen en reacties).
add('DELETE', /^\/api\/feedback\/([^/]+)$/, (req, res, m) => {
  if (!isAdminUser(req.userId)) return sendJson(res, 403, { error: 'Geen toegang' })
  db.prepare('DELETE FROM feedback_votes WHERE feedback_id = ?').run(m[1])
  db.prepare('DELETE FROM feedback_comments WHERE feedback_id = ?').run(m[1])
  db.prepare('DELETE FROM feedback WHERE id = ?').run(m[1])
  sendJson(res, 200, { ok: true })
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
    created_at: now(),
  }
  db.prepare('INSERT INTO children (id,account_id,name,color,birth_year,birth_date,subjects,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(child.id, req.accountId, child.name, child.color, child.birth_year, child.birth_date, child.subjects, child.created_at)
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
  // subjects: array = eigen lijst, null = terug naar accountlijst, weglaten = ongewijzigd.
  const subjects =
    body.subjects !== undefined
      ? Array.isArray(body.subjects)
        ? JSON.stringify(body.subjects)
        : null
      : existing.subjects
  db.prepare('UPDATE children SET name = ?, color = ?, birth_year = ?, birth_date = ?, subjects = ? WHERE id = ?')
    .run(name, color, birthYear, birthDate, subjects, m[1])
  sendJson(res, 200, mapChild({ ...existing, name, color, birth_year: birthYear, birth_date: birthDate, subjects }))
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

  const created = []
  childIds.forEach((cid, i) => {
    // Eerste kind gebruikt de geüploade foto's; volgende kinderen krijgen kopieën.
    const photoIds = i === 0 ? basePhotos : copyPhotos(basePhotos, req.accountId)
    const memo = {
      id: uid(), child_id: cid, date, text, subjects,
      photo_ids: JSON.stringify(photoIds),
      created_at: now(), updated_at: now(),
    }
    db.prepare('INSERT INTO memos (id,account_id,child_id,date,text,subjects,photo_ids,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(memo.id, req.accountId, memo.child_id, memo.date, memo.text, memo.subjects, memo.photo_ids, memo.created_at, memo.updated_at)
    created.push(mapMemo(memo))
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
  const updated_at = now()
  db.prepare('UPDATE memos SET date=?, text=?, subjects=?, photo_ids=?, updated_at=? WHERE id=?')
    .run(date, text, subjects, photoIds, updated_at, m[1])
  sendJson(res, 200, mapMemo({ ...existing, date, text, subjects, photo_ids: photoIds, updated_at }))
})

add('DELETE', /^\/api\/memos\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const existing = db.prepare('SELECT photo_ids FROM memos WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (existing) {
    deletePhotoFiles(existing.photo_ids ? JSON.parse(existing.photo_ids) : [])
    db.prepare('DELETE FROM memos WHERE id = ?').run(m[1])
  }
  sendJson(res, 200, { ok: true })
})

// Alleen afbeeldingen toestaan; voorkomt dat een geüpload HTML-bestand later
// als text/html op ons eigen domein wordt geserveerd (stored XSS).
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
])
add('POST', /^\/api\/photos$/, async (req, res) => {
  if (!requireEditor(req, res)) return
  const rawMime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  const mime = ALLOWED_IMAGE_MIME.has(rawMime) ? rawMime : 'image/jpeg'
  const buf = await readBody(req, MAX_PHOTO_BYTES)
  if (!buf.length) return sendJson(res, 400, { error: 'lege upload' })
  const id = uid()
  fs.writeFileSync(path.join(PHOTO_DIR, id), buf)
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
  res.writeHead(200, {
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
  fs.createReadStream(file).pipe(res)
})

add('DELETE', /^\/api\/photos\/([^/]+)$/, (req, res, m) => {
  if (!requireEditor(req, res)) return
  const row = db.prepare('SELECT id FROM photos WHERE id = ? AND account_id = ?').get(m[1], req.accountId)
  if (row) deletePhotoFiles([m[1]])
  sendJson(res, 200, { ok: true })
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
  if (!ANTHROPIC_KEY) {
    return sendJson(res, 400, { error: 'Er is op de server nog geen Claude API-sleutel ingesteld.' })
  }
  const body = await readJson(req)
  const child = db.prepare('SELECT * FROM children WHERE id = ? AND account_id = ?').get(body.childId, req.accountId)
  if (!child) return sendJson(res, 404, { error: 'Kind niet gevonden' })
  const start = String(body.start || '')
  const end = String(body.end || '')
  const memos = db
    .prepare('SELECT * FROM memos WHERE child_id = ? AND account_id = ? AND date >= ? AND date <= ? ORDER BY date ASC')
    .all(body.childId, req.accountId, start, end)
    .map(mapMemo)
  if (memos.length === 0) return sendJson(res, 400, { error: "Geen memo's in deze periode" })

  const periodLabel = String(body.periodLabel || `${start} t/m ${end}`)
  const period = String(body.period || 'periode')

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
  const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')

  const saved = {
    id: uid(), child_id: child.id, period, period_label: periodLabel,
    start, end, text: text || 'De AI gaf geen tekst terug.', created_at: now(),
  }
  db.prepare('INSERT INTO summaries (id,account_id,child_id,period,period_label,start,end,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(saved.id, req.accountId, saved.child_id, saved.period, saved.period_label, saved.start, saved.end, saved.text, saved.created_at)
  sendJson(res, 200, mapSummary(saved))
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
    try { await sendEmail(email, 'Je hebt toegang gekregen tot een Kindfolio', inviteExistingHtml(owner)) } catch {}
  } else {
    const inv = db.prepare('SELECT id FROM invites WHERE account_id = ? AND email = ?').get(req.accountId, email)
    if (!inv) {
      db.prepare('INSERT INTO invites (id,account_id,email,role,token,created_at) VALUES (?,?,?,?,?,?)')
        .run(uid(), req.accountId, email, role, crypto.randomBytes(16).toString('hex'), now())
    } else {
      db.prepare('UPDATE invites SET role = ? WHERE id = ?').run(role, inv.id)
    }
    try { await sendEmail(email, 'Uitnodiging voor Kindfolio', inviteNewHtml(owner, email)) } catch {}
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
