import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { AccountAccess, Child, Comment, Memo, Summary } from './types'
import {
  AuthError,
  addComment as apiAddComment,
  createChild,
  createMemo,
  createMemoForChildren,
  deleteChild,
  deleteComment as apiDeleteComment,
  deleteMemo,
  deleteAllData as apiDeleteAllData,
  deleteSummary as apiDeleteSummary,
  fetchAccounts,
  fetchState,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  saveSettings as apiSaveSettings,
  setActiveAccount,
  updateChild as apiUpdateChild,
  updateMemo,
  type ChildInput,
  type MemoInput,
} from './api'

interface DataContextValue {
  children: Child[]
  memos: Memo[]
  summaries: Summary[]
  comments: Comment[]
  loading: boolean
  error: string | null
  authRequired: boolean
  accountEmail: string | null
  isAdmin: boolean
  role: 'owner' | 'editor' | 'commenter'
  canEdit: boolean
  isOwner: boolean
  ownerEmail: string | null
  accountId: string | null
  accounts: AccountAccess[]
  subjects: string[]
  aiEnabled: boolean
  saveSettings: (data: {
    subjects?: string[]
    aiEnabled?: boolean
  }) => Promise<void>
  switchAccount: (id: string) => Promise<void>
  addComment: (
    targetType: 'memo' | 'summary',
    targetId: string,
    text: string,
  ) => Promise<void>
  removeComment: (id: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    code: string,
  ) => Promise<{ needsVerification?: boolean }>
  logout: () => Promise<void>
  reload: () => Promise<void>
  addChild: (data: ChildInput) => Promise<Child>
  updateChild: (id: string, data: ChildInput) => Promise<void>
  removeChild: (id: string) => Promise<void>
  addMemo: (data: MemoInput) => Promise<Memo>
  addMemoMulti: (childIds: string[], data: MemoInput) => Promise<Memo[]>
  editMemo: (id: string, data: MemoInput) => Promise<Memo>
  removeMemo: (id: string) => Promise<void>
  removeSummary: (id: string) => Promise<void>
  wipeData: () => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [childList, setChildList] = useState<Child[]>([])
  const [memos, setMemos] = useState<Memo[]>([])
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [role, setRole] = useState<'owner' | 'editor' | 'commenter'>('owner')
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<AccountAccess[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [aiEnabled, setAiEnabled] = useState(true)

  const reload = useCallback(async () => {
    try {
      const state = await fetchState()
      setChildList(state.children)
      setMemos(state.memos)
      setSummaries(state.summaries || [])
      setComments(state.comments || [])
      setAccountEmail(state.account?.email ?? null)
      setIsAdmin(!!state.account?.isAdmin)
      setRole(state.account?.role ?? 'owner')
      setOwnerEmail(state.account?.ownerEmail ?? null)
      setAccountId(state.account?.id ?? null)
      setSubjects(state.account?.subjects ?? [])
      setAiEnabled(state.account?.aiEnabled ?? true)
      fetchAccounts()
        .then(setAccounts)
        .catch(() => {})
      setAuthRequired(false)
      setError(null)
    } catch (e) {
      if (e instanceof AuthError) {
        setAuthRequired(true)
      } else {
        throw e
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    reload()
      .catch((e) => active && setError(e.message || 'Verbinden mislukt'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [reload])

  const login = useCallback(
    async (email: string, password: string) => {
      await apiLogin(email, password)
      await reload()
    },
    [reload],
  )

  const register = useCallback(
    async (email: string, password: string, code: string) => {
      const r = await apiRegister(email, password, code)
      if (!r.needsVerification) await reload()
      return r
    },
    [reload],
  )

  const logout = useCallback(async () => {
    await apiLogout()
    setActiveAccount('')
    setAuthRequired(true)
    setChildList([])
    setMemos([])
    setSummaries([])
    setComments([])
    setAccountEmail(null)
    setIsAdmin(false)
  }, [])

  const switchAccount = useCallback(
    async (id: string) => {
      setActiveAccount(id)
      await reload()
    },
    [reload],
  )

  const value: DataContextValue = {
    children: childList,
    memos,
    summaries,
    comments,
    loading,
    error,
    authRequired,
    accountEmail,
    isAdmin,
    role,
    canEdit: role === 'owner' || role === 'editor',
    isOwner: role === 'owner',
    ownerEmail,
    accountId,
    accounts,
    subjects,
    aiEnabled,
    saveSettings: async (data) => {
      await apiSaveSettings(data)
      await reload()
    },
    switchAccount,
    login,
    register,
    logout,
    reload,
    addChild: async (data) => {
      const child = await createChild(data)
      await reload()
      return child
    },
    updateChild: async (id, data) => {
      await apiUpdateChild(id, data)
      await reload()
    },
    removeChild: async (id) => {
      await deleteChild(id)
      await reload()
    },
    addMemo: async (data) => {
      const memo = await createMemo(data)
      await reload()
      return memo
    },
    addMemoMulti: async (childIds, data) => {
      const memos = await createMemoForChildren(childIds, data)
      await reload()
      return memos
    },
    editMemo: async (id, data) => {
      const memo = await updateMemo(id, data)
      await reload()
      return memo
    },
    removeMemo: async (id) => {
      await deleteMemo(id)
      await reload()
    },
    removeSummary: async (id) => {
      await apiDeleteSummary(id)
      await reload()
    },
    wipeData: async () => {
      await apiDeleteAllData()
      await reload()
    },
    addComment: async (targetType, targetId, text) => {
      await apiAddComment(targetType, targetId, text)
      await reload()
    },
    removeComment: async (id) => {
      await apiDeleteComment(id)
      await reload()
    },
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData buiten DataProvider gebruikt')
  return ctx
}
