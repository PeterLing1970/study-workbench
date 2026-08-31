import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './api'
import { Navigation } from './components/Navigation'
import { FocusSession } from './components/FocusSession'
import type { AuthUser, DashboardData, Score, TabId, Task, WrongQuestion } from './types'
import { LoginView } from './views/LoginView'
import { ParentDashboardView } from './views/ParentDashboardView'
import { ProfileView } from './views/ProfileView'
import { ScoresView } from './views/ScoresView'
import { TodayView } from './views/TodayView'
import { WrongQuestionsView } from './views/WrongQuestionsView'
import { CoachView } from './views/CoachView'

const REST_TASK: Task = {
  id: 0,
  subject: '休息',
  title: '短暂休息，放松眼睛和身体',
  minutes: 5,
  completed: false,
  template_id: null,
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('today')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [wrongFilter, setWrongFilter] = useState<string>('全部')
  const [coachPrefill, setCoachPrefill] = useState<{ subject: string; question: string } | null>(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [loadingWrong, setLoadingWrong] = useState(false)
  const [loadingScores, setLoadingScores] = useState(false)
  const [error, setError] = useState('')
  const [focusTask, setFocusTask] = useState<Task | null>(null)
  const [restSessionOpen, setRestSessionOpen] = useState(false)

  const handleApiError = useCallback((reason: unknown, fallback: string) => {
    if (reason instanceof ApiError && reason.status === 401) {
      setUser(null)
      setDashboard(null)
      setWrongQuestions([])
      setScores([])
      setFocusTask(null)
      return
    }
    setError(reason instanceof Error ? reason.message : fallback)
  }, [])

  const loadDashboard = useCallback(async () => {
    setLoadingDashboard(true)
    try {
      setDashboard(await api.dashboard())
      setError('')
    } catch (reason) {
      handleApiError(reason, '暂时无法连接学习数据，请检查后端服务。')
    } finally {
      setLoadingDashboard(false)
    }
  }, [handleApiError])

  const loadWrongQuestions = useCallback(async () => {
    setLoadingWrong(true)
    try {
      setWrongQuestions(await api.wrongQuestions())
    } catch (reason) {
      handleApiError(reason, '错题数据加载失败，请重试。')
    } finally {
      setLoadingWrong(false)
    }
  }, [handleApiError])

  const loadScores = useCallback(async () => {
    setLoadingScores(true)
    try {
      setScores(await api.scores())
    } catch (reason) {
      handleApiError(reason, '成绩数据加载失败，请重试。')
    } finally {
      setLoadingScores(false)
    }
  }, [handleApiError])

  useEffect(() => {
    void api.me()
      .then(setUser)
      .catch((reason) => {
        if (!(reason instanceof ApiError && reason.status === 401)) {
          setError('认证服务暂时不可用，请检查后端服务。')
        }
      })
      .finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (user) void Promise.all([loadDashboard(), loadWrongQuestions(), loadScores()])
  }, [user, loadDashboard, loadWrongQuestions, loadScores])

  const handleLogin = async (username: string, password: string) => {
    const authenticatedUser = await api.login(username, password)
    setError('')
    setUser(authenticatedUser)
  }

  const handleLogout = async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      setDashboard(null)
      setWrongQuestions([])
      setScores([])
      setActiveTab('today')
    }
  }

  const toggleTask = async (task: Task) => {
    setDashboard((current) => current ? {
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item),
      completed_minutes: current.completed_minutes + (task.completed ? -task.minutes : task.minutes),
      subjects: current.subjects.map((subject) =>
        subject.subject === task.subject
          ? { ...subject, pending_count: task.completed ? 1 : 0, status: task.completed ? '待完成' : '已完成' }
          : subject,
      ),
    } : current)
    try {
      await api.toggleTask(task.id)
      await loadDashboard()
    } catch (reason) {
      await loadDashboard()
      handleApiError(reason, '任务状态保存失败，请重试。')
    }
  }

  const handleCreateTask = async (data: { subject: string; title: string; minutes: number }) => {
    await api.createTask(data)
    await loadDashboard()
  }

  const handleUpdateTask = async (id: number, data: { subject?: string; title?: string; minutes?: number }) => {
    await api.updateTask(id, data)
    await loadDashboard()
  }

  const handleDeleteTask = async (id: number) => {
    await api.deleteTask(id)
    await loadDashboard()
  }

  const handleUpdateWrongQuestionStatus = async (id: number, status: string) => {
    await api.updateWrongQuestion(id, { review_status: status })
    await loadWrongQuestions()
    await loadDashboard()
  }

  const handleDeleteWrongQuestion = async (id: number) => {
    await api.deleteWrongQuestion(id)
    await loadWrongQuestions()
    await loadDashboard()
  }

  const handleOpenWrongQuestions = (filter?: string) => {
    if (filter) setWrongFilter(filter)
    setActiveTab('wrong')
  }

  const handleNavigateToCoach = (item: WrongQuestion, prompt?: string) => {
    setCoachPrefill({
      subject: item.subject,
      question: prompt || `关于错题《${item.title}》：请分步引导我重新理解与作答。`,
    })
    setActiveTab('coach')
  }

  if (authLoading) return <div className="center-state">正在确认登录状态…</div>
  if (!user) return <LoginView onLogin={handleLogin} serviceError={error} />

  return (
    <div className="app-shell">
      <Navigation active={activeTab} onChange={setActiveTab} role={user.role} />
      <main className="app-main">
        {error ? <div className="error-banner" role="alert">{error}</div> : null}
        {activeTab === 'today' && user.role === 'student' ? (
          <TodayView
            data={dashboard}
            loading={loadingDashboard}
            onStartTask={setFocusTask}
            onStartBreak={() => setRestSessionOpen(true)}
            onOpenWrongQuestions={handleOpenWrongQuestions}
            onCreateTask={handleCreateTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onReloadDashboard={loadDashboard}
          />
        ) : null}
        {activeTab === 'today' && user.role === 'parent' ? (
          <ParentDashboardView
            data={dashboard}
            scores={scores}
            wrongQuestions={wrongQuestions}
            loading={loadingDashboard || loadingScores || loadingWrong}
            onOpenScores={() => setActiveTab('scores')}
          />
        ) : null}
        {activeTab === 'wrong' && user.role === 'student' ? (
          <WrongQuestionsView
            items={wrongQuestions}
            loading={loadingWrong}
            initialFilter={wrongFilter}
            onRefresh={loadWrongQuestions}
            onUpdateStatus={handleUpdateWrongQuestionStatus}
            onDelete={handleDeleteWrongQuestion}
            onNavigateToCoach={handleNavigateToCoach}
          />
        ) : null}
        {activeTab === 'coach' && user.role === 'student' ? (
          <CoachView
            initialSubject={coachPrefill?.subject}
            initialQuestion={coachPrefill?.question}
          />
        ) : null}
        {activeTab === 'scores' ? (
          <ScoresView scores={scores} loading={loadingScores} onScoreAdded={loadScores} />
        ) : null}
        {activeTab === 'profile' ? <ProfileView user={user} onLogout={handleLogout} onUserUpdate={setUser} /> : null}
      </main>
      {focusTask ? (
        <FocusSession
          task={focusTask}
          onClose={() => setFocusTask(null)}
          onComplete={() => {
            if (!focusTask.completed) void toggleTask(focusTask)
            setFocusTask(null)
            void loadDashboard()
          }}
        />
      ) : null}
      {restSessionOpen ? (
        <FocusSession
          task={REST_TASK}
          restOnly
          onClose={() => setRestSessionOpen(false)}
          onComplete={() => setRestSessionOpen(false)}
        />
      ) : null}
    </div>
  )
}
