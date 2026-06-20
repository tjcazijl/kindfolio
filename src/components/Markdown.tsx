import { Fragment, type ReactNode } from 'react'

// Lichtgewicht Markdown-weergave voor AI-samenvattingen.
// Ondersteunt: # / ## / ### koppen, - opsommingen, **vet**, lege regels.

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={`${keyBase}-${i}`}>{part}</Fragment>
  })
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let list: ReactNode[] = []

  const flushList = () => {
    if (list.length) {
      out.push(<ul key={`ul-${out.length}`}>{list}</ul>)
      list = []
    }
  }

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (/^###\s+/.test(line)) {
      flushList()
      out.push(<h4 key={idx}>{renderInline(line.replace(/^###\s+/, ''), `h${idx}`)}</h4>)
    } else if (/^##\s+/.test(line)) {
      flushList()
      out.push(<h3 key={idx}>{renderInline(line.replace(/^##\s+/, ''), `h${idx}`)}</h3>)
    } else if (/^#\s+/.test(line)) {
      flushList()
      out.push(<h2 key={idx}>{renderInline(line.replace(/^#\s+/, ''), `h${idx}`)}</h2>)
    } else if (/^[-*]\s+/.test(line)) {
      list.push(<li key={idx}>{renderInline(line.replace(/^[-*]\s+/, ''), `li${idx}`)}</li>)
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      out.push(<p key={idx}>{renderInline(line, `p${idx}`)}</p>)
    }
  })
  flushList()

  return <div className="markdown">{out}</div>
}
