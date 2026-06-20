import { useNavigate } from 'react-router-dom'
import { useData } from '../store'

export function AccountSwitcher() {
  const navigate = useNavigate()
  const { accounts, accountId, switchAccount } = useData()

  if (accounts.length <= 1) return null

  async function onChange(id: string) {
    await switchAccount(id)
    navigate('/')
  }

  return (
    <div className="account-switcher">
      <span className="switcher-label">Portfolio:</span>
      <select
        className="switcher-select"
        value={accountId ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.role === 'owner' ? 'Mijn portfolio' : a.ownerEmail}
          </option>
        ))}
      </select>
    </div>
  )
}
