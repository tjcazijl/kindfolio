// "a", "a en b", "a, b en c"
export function joinNl(names: string[]): string {
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`
}

/**
 * "Jij en Myranda vinden dit leuk" — je eigen naam wordt "jij" en staat vooraan.
 * Gedeeld tussen de tijdlijn en de updatepagina, zodat het overal hetzelfde leest.
 */
export function likeText(names: string[], myEmail: string | null): string {
  if (!names.length) return ''
  const mij = (myEmail || '').split('@')[0]
  const anderen = names.filter((n) => n !== mij)
  const lijst = names.length > anderen.length ? ['jij', ...anderen] : anderen
  const zin = `${joinNl(lijst)} ${lijst.length === 1 ? 'vindt' : 'vinden'} dit leuk`
  return zin.charAt(0).toUpperCase() + zin.slice(1)
}
