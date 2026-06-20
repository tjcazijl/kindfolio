import { NavLink, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { ChildTimeline } from './pages/ChildTimeline'
import { MemoView } from './pages/MemoView'
import { MemoEditor } from './pages/MemoEditor'
import { Summary } from './pages/Summary'
import { Feedback } from './pages/Feedback'
import { Settings } from './pages/Settings'
import { Admin } from './pages/Admin'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { AccountSwitcher } from './components/AccountSwitcher'
import { InstallPrompt } from './components/InstallPrompt'
import { useData } from './store'

export function App() {
  const { loading, authRequired } = useData()

  // Wachtwoord-reset is een publieke pagina (gebruiker is uitgelogd).
  if (window.location.hash.startsWith('#/reset')) return <ResetPassword />

  if (loading) {
    return (
      <div className="login-screen">
        <p className="empty-note">Laden…</p>
      </div>
    )
  }

  // Op het inlogscherm tonen we de installatieknop wel, maar niet automatisch.
  if (authRequired)
    return (
      <>
        <Login />
        <InstallPrompt auto={false} />
      </>
    )

  return (
    <div className="app">
      <InstallPrompt />
      <AccountSwitcher />
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/memo/nieuw" element={<MemoEditor />} />
          <Route path="/kind/:childId" element={<ChildTimeline />} />
          <Route path="/kind/:childId/memo/nieuw" element={<MemoEditor />} />
          <Route path="/kind/:childId/memo/:memoId" element={<MemoView />} />
          <Route
            path="/kind/:childId/memo/:memoId/bewerken"
            element={<MemoEditor />}
          />
          <Route path="/samenvatting" element={<Summary />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/instellingen" element={<Settings />} />
          <Route path="/beheer" element={<Admin />} />
        </Routes>
      </main>

      <nav className="tabbar">
        <NavLink to="/" end className="tab">
          <span className="tab-icon">🏠</span>
          <span>Kinderen</span>
        </NavLink>
        <NavLink to="/samenvatting" className="tab">
          <span className="tab-icon">✨</span>
          <span>Samenvatting</span>
        </NavLink>
        <NavLink to="/feedback" className="tab">
          <span className="tab-icon">💬</span>
          <span>Feedback</span>
        </NavLink>
        <NavLink to="/instellingen" className="tab">
          <span className="tab-icon">⚙️</span>
          <span>Instellingen</span>
        </NavLink>
      </nav>
    </div>
  )
}
