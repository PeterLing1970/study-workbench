export type TabId = 'today' | 'wrong' | 'coach' | 'scores' | 'profile'

export interface AuthUser {
  id: number
  username: string
  role: 'student' | 'parent'
}

export interface Task {
  id: number
  subject: string
  title: string
  minutes: number
  completed: boolean
}

export interface SubjectSummary {
  subject: string
  status: string
  pending_count: number
  accent: string
}

export interface DashboardData {
  date: string
  planned_minutes: number
  completed_minutes: number
  tasks: Task[]
  subjects: SubjectSummary[]
  high_frequency_cause: string
  pending_reviews: number
  due_reviews: number
  today_focus_minutes: number
}

export interface WrongQuestion {
  id: number
  subject: string
  title: string
  cause: string
  knowledge_point: string
  ai_summary: string
  review_status: string
  review_count: number
  next_review_date: string | null
  is_demo: boolean
  created_at: string
}

export interface Score {
  id: number
  exam_name: string
  exam_date: string
  subject: string
  score: number
  full_score: number
  is_demo: boolean
}

export interface ScoreTrendPoint {
  exam_name: string
  exam_date: string
  subject: string
  score: number
  full_score: number
  percent: number
}

export interface ChatMessage {
  id?: number
  role: 'student' | 'ai'
  content: string
  subject?: string
  student_thought?: string
  model?: string
  demo?: boolean
  created_at?: string
}

export interface TaskTemplate {
  id: number
  subject: string
  title: string
  minutes: number
  weekdays: string
  active: boolean
  sort_order: number
}

export interface FocusStats {
  today_minutes: number
  today_pomodoros: number
  week_minutes: number
  week_pomodoros: number
  subject_minutes: Record<string, number>
}

export interface WeeklyReportData {
  id?: number
  week_start: string
  week_end: string
  completion_rate: number
  total_planned_tasks: number
  total_completed_tasks: number
  total_focus_minutes: number
  total_pomodoros: number
  wrong_count: number
  mastered_count: number
  frequent_cause: string
  weak_subjects: string[]
  data_sufficient: boolean
  generated_by_ai: boolean
  highlights: string
  weaknesses: string
  action_plan: string
  parent_advice: string
  created_at: string
}
