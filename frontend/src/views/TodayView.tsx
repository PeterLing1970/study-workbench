import { BellRing, CalendarDays, Camera, ChevronRight, Coffee, Edit3, Flame, Lightbulb, LoaderCircle, Play, Plus, Repeat2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ProgressRing } from '../components/ProgressRing'
import { SubjectIcon } from '../components/SubjectIcon'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskTemplateModal } from '../components/TaskTemplateModal'
import type { DashboardData, Task } from '../types'

interface TodayViewProps {
  data: DashboardData | null
  loading: boolean
  onStartTask: (task: Task) => void
  onStartBreak: () => void
  onOpenWrongQuestions: (filter?: string) => void
  onCreateTask: (data: { subject: string; title: string; minutes: number }) => Promise<void>
  onUpdateTask: (id: number, data: { subject?: string; title?: string; minutes?: number }) => Promise<void>
  onDeleteTask: (id: number) => Promise<void>
  onReloadDashboard?: () => Promise<void>
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function TodayView({
  data,
  loading,
  onStartTask,
  onStartBreak,
  onOpenWrongQuestions,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onReloadDashboard,
}: TodayViewProps) {
  const [showForm, setShowForm] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  if (loading || !data) {
    return (
      <div className="center-state">
        <LoaderCircle className="spin" aria-hidden="true" />
        <span>正在准备今天的学习安排…</span>
      </div>
    )
  }

  const nextTask = data.tasks.find((task) => !task.completed) ?? data.tasks[0]
  const displayDate = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${data.date}T00:00:00`))

  const handleDelete = async (taskId: number) => {
    setDeletingId(taskId)
    try {
      await onDeleteTask(taskId)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="today-view" aria-labelledby="today-title">
      <header className="today-hero">
        <div className="hero-copy">
          <h1 id="today-title">AI学习助手</h1>
          <p>{getGreeting()}，<br />今天按计划来</p>
          <div className="hero-meta-row">
            <span className="today-date">{displayDate} · 中考复习</span>
            {data.today_focus_minutes > 0 ? (
              <span className="hero-focus-tag">
                <Flame size={13} /> 今日已专注 {data.today_focus_minutes} 分钟
              </span>
            ) : null}
          </div>
        </div>
        <ProgressRing completed={data.completed_minutes} planned={data.planned_minutes} />
        <img
          className="study-desk-asset"
          src="/assets/study-desk.png"
          alt="盆栽、书本和笔筒组成的学习桌插画"
        />
      </header>

      {/* Spaced repetition due banner */}
      {data.due_reviews > 0 ? (
        <button
          className="due-review-banner"
          type="button"
          onClick={() => onOpenWrongQuestions('到期复习')}
        >
          <span className="due-icon"><BellRing size={20} /></span>
          <div className="due-content">
            <strong>艾宾浩斯复习提醒</strong>
            <span>今日有 <b>{data.due_reviews} 道错题</b> 到达记忆周期，复习加深印象！</span>
          </div>
          <ChevronRight size={18} />
        </button>
      ) : null}

      <div className="today-actions">
        <button className="primary-action" type="button" onClick={() => nextTask && onStartTask(nextTask)}>
          <Play aria-hidden="true" fill="currentColor" size={19} />
          {nextTask ? `开始：${nextTask.subject} ${nextTask.minutes}分钟` : '开始今日学习'}
        </button>
        <button className="add-task-btn" type="button" onClick={() => { setEditingTask(null); setShowForm(true) }}>
          <Plus size={18} aria-hidden="true" />
          加任务
        </button>
        <button
          className="template-btn"
          type="button"
          onClick={() => setShowTemplateModal(true)}
          title="管理每日自动生成的循环任务模板"
        >
          <CalendarDays size={18} aria-hidden="true" />
          模板
        </button>
        <button className="break-btn" type="button" onClick={onStartBreak}>
          <Coffee size={18} aria-hidden="true" />
          休息 5分钟
        </button>
      </div>

      <section className="subject-panel" aria-labelledby="subject-heading">
        <div className="section-heading-row">
          <h2 id="subject-heading">今日科目安排</h2>
          <span>{data.tasks.filter((task) => task.completed).length}/{data.tasks.length} 已完成</span>
        </div>
        {data.tasks.some((task) => task.template_id !== null) ? (
          <p className="template-task-note"><Repeat2 size={14} /> “循环”任务来自模板；删除只跳过今天，永久调整请进入“模板”。</p>
        ) : null}
        <div className="subject-list">
          {data.tasks.map((task) => {
            const subjectInfo = data.subjects.find((s) => s.subject === task.subject)
            const accent = subjectInfo?.accent ?? 'slate'
            return (
              <div className={`subject-row subject-${accent}`} key={task.id}>
                <button className="subject-row-main" type="button" onClick={() => onStartTask(task)}>
                  <span className="subject-icon"><SubjectIcon subject={task.subject} /></span>
                  <span className="subject-copy">
                    <strong>{task.subject}</strong>
                    {task.template_id !== null ? <span className="recurring-task-badge">循环</span> : null}
                    <small className={task.completed ? 'status-done' : ''}>
                      {task.completed ? '已完成' : `${task.title} · ${task.minutes}分钟`}
                    </small>
                  </span>
                </button>
                <div className="task-actions">
                  <button
                    className="task-action-btn"
                    type="button"
                    onClick={() => { setEditingTask(task); setShowForm(true) }}
                    aria-label={`编辑 ${task.title}`}
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="task-action-btn task-action-delete"
                    type="button"
                    onClick={() => handleDelete(task.id)}
                    disabled={deletingId === task.id}
                    aria-label={`删除 ${task.title}`}
                  >
                    {deletingId === task.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                  </button>
                </div>
              </div>
            )
          })}
          {data.tasks.length === 0 ? (
            <div className="chat-empty">
              <p>今天还没有学习任务</p>
              <span>点上方「加任务」或「模板」添加计划</span>
            </div>
          ) : null}
        </div>
      </section>

      <button className="insight-row" type="button" onClick={() => onOpenWrongQuestions()}>
        <span className="insight-icon"><Lightbulb aria-hidden="true" size={23} /></span>
        <span>本周高频错因：<strong>{data.high_frequency_cause}</strong></span>
        <ChevronRight aria-hidden="true" size={21} />
      </button>

      <button className="photo-entry" type="button" onClick={() => onOpenWrongQuestions()}>
        <span className="photo-icon"><Camera aria-hidden="true" size={28} /></span>
        <span>
          <strong>拍照整理错题</strong>
          <small>拍一拍，AI帮你整理和分析</small>
        </span>
        <ChevronRight aria-hidden="true" size={21} />
      </button>

      {showForm ? (
        <TaskFormModal
          editingTask={editingTask}
          onSave={editingTask
            ? (d) => onUpdateTask(editingTask.id, d)
            : onCreateTask
          }
          onClose={() => { setShowForm(false); setEditingTask(null) }}
        />
      ) : null}

      {showTemplateModal ? (
        <TaskTemplateModal
          onClose={() => setShowTemplateModal(false)}
          onTemplatesChanged={async () => {
            await onReloadDashboard?.()
          }}
        />
      ) : null}
    </section>
  )
}
