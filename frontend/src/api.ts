import type { AuthUser, ChatMessage, DashboardData, FocusStats, Score, ScoreTrendPoint, Task, TaskTemplate, WeeklyReportData, WrongQuestion } from './types'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...init, credentials: 'include' })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: '请求失败' }))
    throw new ApiError(detail.detail ?? '请求失败', response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  me: () => request<AuthUser>('/api/auth/me'),
  updateProfile: (data: { display_name?: string; grade?: string }) =>
    request<AuthUser>('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  login: (username: string, password: string) => request<AuthUser>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  dashboard: () => request<DashboardData>('/api/dashboard'),

  // Tasks
  toggleTask: (id: number) => request<Task>(`/api/tasks/${id}/toggle`, { method: 'PATCH' }),
  createTask: (data: { subject: string; title: string; minutes: number }) =>
    request<Task>('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateTask: (id: number, data: { subject?: string; title?: string; minutes?: number }) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteTask: (id: number) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  // Templates
  templates: () => request<TaskTemplate[]>('/api/templates'),
  createTemplate: (data: { subject: string; title: string; minutes: number; weekdays: string }) =>
    request<TaskTemplate>('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateTemplate: (id: number, data: { subject?: string; title?: string; minutes?: number; weekdays?: string; active?: boolean }) =>
    request<TaskTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteTemplate: (id: number) => request<void>(`/api/templates/${id}`, { method: 'DELETE' }),

  // Wrong Questions
  wrongQuestions: () => request<WrongQuestion[]>('/api/wrong-questions'),
  dueWrongQuestions: () => request<WrongQuestion[]>('/api/wrong-questions/due'),
  updateWrongQuestion: (id: number, data: { title?: string; cause?: string; knowledge_point?: string; review_status?: string }) =>
    request<WrongQuestion>(`/api/wrong-questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteWrongQuestion: (id: number) => request<void>(`/api/wrong-questions/${id}`, { method: 'DELETE' }),
  analyzeWrongQuestion: (subject: string, image: File) => {
    const form = new FormData()
    form.append('subject', subject)
    form.append('image', image)
    return request<{ item: WrongQuestion; demo: boolean; provider: string; model: string }>(
      '/api/wrong-questions/analyze',
      { method: 'POST', body: form },
    )
  },

  // Scores
  scores: () => request<Score[]>('/api/scores'),
  addScore: (data: {
    exam_name: string
    exam_date: string
    subject: string
    score: number
    full_score: number
    class_rank?: number | null
    grade_rank?: number | null
  }) =>
    request<Score>('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  scoreTrend: () => request<ScoreTrendPoint[]>('/api/scores/trend'),

  // Focus
  saveFocusRecord: (data: { task_id?: number; subject: string; title: string; planned_seconds: number; actual_seconds: number; pomodoros_completed: number }) =>
    request<unknown>('/api/focus-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  focusStats: () => request<FocusStats>('/api/focus-records/stats'),

  // AI Coach & Chat History
  coach: (subject: string, question: string, studentThought: string, provider: 'auto' | 'minimax' | 'deepseek') =>
    request<{ provider: string; model: string; demo: boolean; answer: string }>('/api/ai/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, question, student_thought: studentThought, provider }),
    }),
  chatHistory: (subject?: string) => {
    const query = subject && subject !== '全部' ? `?subject=${encodeURIComponent(subject)}` : ''
    return request<Array<{
      id: number
      subject: string
      question: string
      student_thought: string
      answer: string
      model: string
      provider: string
      demo: boolean
      created_at: string
    }>>(`/api/ai/coach/history${query}`)
  },
  clearChatHistory: (subject?: string) => {
    const query = subject && subject !== '全部' ? `?subject=${encodeURIComponent(subject)}` : ''
    return request<void>(`/api/ai/coach/history${query}`, { method: 'DELETE' })
  },

  // Weekly Report
  weeklyReport: () => request<WeeklyReportData>('/api/reports/weekly'),
  generateWeeklyReport: () => request<WeeklyReportData>('/api/reports/weekly', { method: 'POST' }),
}
