import { NavLink, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { ChildTimeline } from './pages/ChildTimeline'
import { FocusPoints } from './pages/FocusPoints'
import { MemoView } from './pages/MemoView'
import { MemoEditor } from './pages/MemoEditor'
import { Summary } from './pages/Summary'
import { KerndoelScan } from './pages/KerndoelScan'
import { PeriodEditor } from './pages/PeriodEditor'
import { Agenda } from './pages/Agenda'
import { EventEditor } from './pages/EventEditor'
import { EventDetail } from './pages/EventDetail'
import { Resources } from './pages/Resources'
import { ResourceEditor } from './pages/ResourceEditor'
import { Feedback } from './pages/Feedback'
import { Updates } from './pages/Updates'
import { Settings } from './pages/Settings'
import { Admin } from './pages/Admin'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { AccountSwitcher } from './components/AccountSwitcher'
import { InstallPrompt } from './components/InstallPrompt'
import { UpdateBanner } from './components/UpdateBanner'
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
        <UpdateBanner />
        <InstallPrompt auto={false} />
      </>
    )

  return (
    <div className="app">
      <UpdateBanner />
      <InstallPrompt />
      <AccountSwitcher />
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/memo/nieuw" element={<MemoEditor />} />
          <Route path="/kind/:childId" element={<ChildTimeline />} />
          <Route path="/kind/:childId/aandacht" element={<FocusPoints />} />
          <Route path="/kind/:childId/memo/nieuw" element={<MemoEditor />} />
          <Route path="/kind/:childId/memo/:memoId" element={<MemoView />} />
          <Route
            path="/kind/:childId/memo/:memoId/bewerken"
            element={<MemoEditor />}
          />
          <Route path="/samenvatting" element={<Summary />} />
          <Route path="/kerndoelen/scan" element={<KerndoelScan />} />
          <Route path="/periodes/nieuw" element={<PeriodEditor />} />
          <Route path="/periodes/:periodId" element={<PeriodEditor />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/agenda/nieuw" element={<EventEditor />} />
          <Route path="/agenda/:eventId" element={<EventDetail />} />
          <Route path="/agenda/:eventId/bewerken" element={<EventEditor />} />
          <Route path="/leermiddelen" element={<Resources />} />
          <Route path="/leermiddelen/nieuw" element={<ResourceEditor />} />
          <Route
            path="/leermiddelen/:resourceId/bewerken"
            element={<ResourceEditor />}
          />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/updates" element={<Updates />} />
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
          <span>Terugblik</span>
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
