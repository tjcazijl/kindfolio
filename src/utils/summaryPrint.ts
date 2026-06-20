// Opent een samenvatting in een nieuw venster als nette, printbare pagina.
// Werkt cross-platform (ook iOS): de gebruiker kiest daar Delen/Print -> Bewaar als pdf.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inline(text: string): string {
  // **vet** -> <strong>
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^###\s+/.test(line)) {
      closeList()
      out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`)
    } else if (/^##\s+/.test(line)) {
      closeList()
      out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`)
    } else if (/^#\s+/.test(line)) {
      closeList()
      out.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`)
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`)
    } else if (line.trim() === '') {
      closeList()
    } else {
      closeList()
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  closeList()
  return out.join('\n')
}

export function openSummaryPrint(
  title: string,
  metaLine: string,
  markdownText: string,
): void {
  const body = markdownToHtml(markdownText)
  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #23291f; line-height: 1.5; max-width: 720px;
    margin: 0 auto; padding: 28px 22px 60px;
  }
  .meta { color: #6b7363; font-size: 13px; margin: 0 0 18px; }
  h1 { font-size: 24px; margin: 0 0 10px; }
  h2 { font-size: 18px; color: #245a40; margin: 22px 0 6px; }
  h3 { font-size: 15px; margin: 16px 0 4px; }
  p { margin: 8px 0; }
  ul { margin: 6px 0; padding-left: 20px; }
  li { margin: 4px 0; }
  .toolbar {
    position: sticky; top: 0; background: #f7f5ef; padding: 12px 0;
    margin-bottom: 12px; border-bottom: 1px solid #e3e0d6;
  }
  .toolbar button {
    background: #2f6f4f; color: #fff; border: none; border-radius: 10px;
    padding: 10px 18px; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  @media print { .toolbar { display: none; } body { padding-top: 0; } }
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">📄 Opslaan als PDF / Afdrukken</button></div>
  <p class="meta">${escapeHtml(metaLine)}</p>
  ${body}
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) {
    alert('Sta pop-ups toe om de PDF-weergave te openen.')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
