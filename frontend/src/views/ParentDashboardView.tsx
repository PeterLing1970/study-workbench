import { Award, BellRing, BookOpenCheck, ChevronRight, CircleAlert, Clock3, Flame, LoaderCircle, Sparkles, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import type { DashboardData, Score, WrongQuestion } from '../types'
import { ProgressRing } from '../components/ProgressRing'
import { SubjectIcon } from '../components/SubjectIcon'
import { ScoreTrendChart } from '../components/ScoreTrendChart'
import { WeeklyReportModal } from '../components/WeeklyReportModal'

interface ParentDashboardViewProps {
  data: DashboardData | null
  scores: Score[]
  wrongQuestions: WrongQuestion[]
  loading: boolean
  onOpenScores: () => void
}

export function ParentDashboardView({
  data,
  scores,
  wrongQuestions,
  loading,
  onOpenScores,
}: ParentDashboardViewProps) {
  const [showWeeklyReport, setShowWeeklyReport] = useState(false)

  if (loading || !data) {
    return <div className="center-state"><LoaderCircle className="spin" />正在整理学习概览…</div>
  }

  const completedTasks = data.tasks.filter((task) => task.completed).length
  const totalScore = scores.reduce((sum, item) => sum + item.score, 0)
  const fullScore = scores.reduce((sum, item) => sum + item.full_score, 0)
  const pendingWrong = wrongQuestions.filter((item) => item.review_status !== '已掌握').length

  return (
    <section className="content-view parent-view" aria-labelledby="parent-title">
      <header className="content-header parent-header">
        <div>
          <h1 id="parent-title">学习概览</h1>
          <p>查看今天的完成情况、番茄专注时长和近期学习记录。</p>
        </div>
        <span className="readonly-note">家长只读</span>
      </header>

      {/* Weekly Report Entry Banner for Parents */}
      <button
        className="parent-report-banner"
        type="button"
        onClick={() => setShowWeeklyReport(true)}
      >
        <span className="report-banner-icon"><Award size={24} /></span>
        <div className="report-banner-copy">
          <strong>本周 AI 学情诊断周报</strong>
          <span>查看孩子的学习亮点、提分突破点及家长陪伴建议</span>
        </div>
        <ChevronRight size={20} />
      </button>

      <section className="parent-progress" aria-label="今日学习进度">
        <div className="parent-progress-copy">
          <span>今日学习计划</span>
          <strong>{completedTasks} / {data.tasks.length}<small> 项完成</small></strong>
          <p><Clock3 size={16} /> 计划 {data.planned_minutes} 分钟 · 已完成 {data.completed_minutes} 分钟</p>
          {data.today_focus_minutes > 0 ? (
            <p className="parent-focus-line"><Flame size={16} /> 今日累计沉浸专注 <strong>{data.today_focus_minutes} 分钟</strong></p>
          ) : null}
        </div>
        <ProgressRing completed={data.completed_minutes} planned={data.planned_minutes} />
      </section>

      {/* Spaced repetition due banner */}
      {data.due_reviews > 0 ? (
        <div className="parent-due-banner">
          <BellRing size={18} />
          <div>
            <strong>艾宾浩斯复习：今日有 {data.due_reviews} 道错题待复习</strong>
            <small>系统按记忆曲线推送，建议提醒孩子按时完成复习。</small>
          </div>
        </div>
      ) : null}

      <section className="parent-section" aria-labelledby="parent-subjects">
        <div className="section-heading-row">
          <h2 id="parent-subjects">今日科目</h2>
          <span>学生端实时同步</span>
        </div>
        <div className="parent-subject-list">
          {data.subjects.map((subject) => (
            <div className={`parent-subject subject-${subject.accent}`} key={subject.subject}>
              <span className="subject-icon"><SubjectIcon subject={subject.subject} /></span>
              <span><strong>{subject.subject}</strong><small>{subject.status}</small></span>
              <b>{subject.pending_count === 0 ? '完成' : `${subject.pending_count}项`}</b>
            </div>
          ))}
          {data.subjects.length === 0 ? (
            <div className="center-state compact">今日暂无安排科目</div>
          ) : null}
        </div>
      </section>

      <div className="parent-insights">
        <button className="parent-insight" type="button" onClick={onOpenScores}>
          <span><TrendingUp size={21} /></span>
          <div><small>最近成绩</small><strong>{totalScore} / {fullScore || 800}</strong></div>
        </button>
        <div className="parent-insight">
          <span><BookOpenCheck size={21} /></span>
          <div><small>待掌握错题</small><strong>{pendingWrong} 道</strong></div>
        </div>
      </div>

      {/* Score Trend Section for Parent */}
      <section className="parent-section">
        <div className="section-heading-row">
          <h2>各科成绩走势</h2>
          <span>多测验趋势</span>
        </div>
        <ScoreTrendChart />
      </section>

      <div className="parent-reminder">
        <CircleAlert size={20} aria-hidden="true" />
        <p>本周高频错因：<strong>{data.high_frequency_cause}</strong>。建议陪孩子复盘解题思路，引导分步拆解，避免直接代答。</p>
      </div>

      {showWeeklyReport ? (
        <WeeklyReportModal onClose={() => setShowWeeklyReport(false)} />
      ) : null}
    </section>
  )
}

