// Bouwt de volledige tijdlijn (tekst + foto's) als printbare pagina en opent
// die in een nieuw venster. De gebruiker kiest daar "Opslaan als PDF".
// Volledig client-side: de server levert alleen de foto's die hij toch al levert.

import { photoUrl } from '../api'
import { formatDateLong } from './dates'
import type { Child, Memo } from '../types'

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function openTimelinePrint(
  children: Child[],
  memos: Memo[],
  subtitle?: string,
): void {
  const w = window.open('', '_blank')
  if (!w) {
    alert('Sta pop-ups toe om de PDF-weergave te openen.')
    return
  }

  const sections = children
    .map((child) => {
      const list = memos
        .filter((m) => m.childId === child.id && !m.draft)
        .sort(
          (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
        )
      if (!list.length) return ''
      const items = list
        .map(
          (m) => `
        <div class="memo">
          <div class="date">${esc(formatDateLong(m.date))}</div>
          ${
            m.subjects.length
              ? `<div class="tags">${m.subjects
                  .map((s) => `<span>${esc(s)}</span>`)
                  .join('')}</div>`
              : ''
          }
          ${m.text ? `<p class="text">${esc(m.text)}</p>` : ''}
          ${
            m.photoIds.length
              ? `<div class="photos">${m.photoIds
                  .map((id) => `<img src="${photoUrl(id)}" loading="eager" />`)
                  .join('')}</div>`
              : ''
          }
        </div>`,
        )
        .join('')
      return `<section><h2 class="child">${esc(child.name)}</h2>${items}</section>`
    })
    .join('')

  const empty = sections.trim() === ''
  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kindfolio — portfolio</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #23291f; line-height: 1.5; max-width: 760px;
    margin: 0 auto; padding: 24px 20px 60px;
  }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .sub { color: #6b7363; font-size: 13px; margin: 0 0 18px; }
  h2.child {
    font-size: 20px; color: #245a40; margin: 28px 0 10px;
    border-bottom: 2px solid #e3e0d6; padding-bottom: 4px;
  }
  .memo {
    border: 1px solid #e3e0d6; border-radius: 10px; padding: 12px 14px;
    margin: 0 0 12px; page-break-inside: avoid;
  }
  .date { font-size: 13px; font-weight: 700; color: #2f6f4f; text-transform: capitalize; }
  .tags { margin: 6px 0; }
  .tags span {
    display: inline-block; background: #e7efe9; color: #245a40;
    font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; margin-right: 4px;
  }
  .text { white-space: pre-wrap; margin: 6px 0; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .photos img { max-width: 100%; max-height: 420px; border-radius: 8px; }
  .toolbar {
    position: sticky; top: 0; background: #f7f5ef; padding: 12px 0;
    margin-bottom: 12px; border-bottom: 1px solid #e3e0d6; z-index: 5;
  }
  .toolbar button {
    background: #2f6f4f; color: #fff; border: none; border-radius: 10px;
    padding: 10px 18px; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  .toolbar button:disabled { background: #9a9a78; cursor: default; }
  @media print { .toolbar { display: none; } body { padding-top: 0; } }
</style>
</head>
<body>
  <div class="toolbar"><button id="printbtn" onclick="window.print()">📄 Opslaan als PDF / Afdrukken</button></div>
  <h1>Kindfolio — portfolio</h1>
  <p class="sub">${subtitle ? esc(subtitle) + ' · ' : ''}Gemaakt op ${esc(new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
  ${empty ? '<p>Nog geen memo’s om te exporteren.</p>' : sections}
  <script>
    (function () {
      var btn = document.getElementById('printbtn');
      var imgs = document.images, total = imgs.length, loaded = 0;
      if (!total) return;
      btn.disabled = true;
      btn.textContent = "Foto's laden… (0/" + total + ')';
      function done() {
        loaded++;
        if (loaded >= total) {
          btn.disabled = false;
          btn.textContent = '📄 Opslaan als PDF / Afdrukken';
        } else {
          btn.textContent = "Foto's laden… (" + loaded + '/' + total + ')';
        }
      }
      for (var i = 0; i < imgs.length; i++) {
        if (imgs[i].complete) done();
        else { imgs[i].addEventListener('load', done); imgs[i].addEventListener('error', done); }
      }
    })();
  </script>
</body>
</html>`

  w.document.open()
  w.document.write(html)
  w.document.close()
}
