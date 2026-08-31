import { Award, BookOpen, CheckCircle2, Flame, HeartHandshake, Lightbulb, LoaderCircle, RefreshCw, Sparkles, Target, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { WeeklyReportData } from '../types'

interface WeeklyReportModalProps {
  onClose: () => void
}

export function WeeklyReportModal({ onClose }: WeeklyReportModalProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)
  const [data, setData] = useState<WeeklyReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadReport = async (force = false) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const report = force ? await api.generateWeeklyReport() : await api.weeklyReport()
      setData(report)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取周报失败，请重试')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadReport()
  }, [])

  return (
    <div
      ref={dialogRef}
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="weekly-report-title"
      aria-describedby="weekly-report-description"
      tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <section className="modal-sheet weekly-report-sheet">
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="关闭周报">
          <X aria-hidden="true" />
        </button>

        <div className="weekly-report-header">
          <div className="report-badge">
            <Sparkles size={16} /> 初三 AI 学情周报
          </div>
          <h2 id="weekly-report-title">
            本周学习与诊断分析
          </h2>
          <p id="weekly-report-description" className="sr-only">
            汇总本周真实任务、专注、错题和成绩记录；不会用演示数字替代空数据。
          </p>
          {data ? (
            <p className="report-date-range">
              {data.week_start} 至 {data.week_end} · 周期总结
            </p>
          ) : null}
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {loading ? (
          <div className="center-state compact">
            <LoaderCircle className="spin" size={24} />
            <span>AI 正在汇总学情数据并生成诊断…</span>
          </div>
        ) : data ? (
          <div className="report-content">
            {!data.data_sufficient ? (
              <p className="report-data-notice" role="status">
                本周数据不足，以下统计保持真实的 0 值，不使用演示数据。
              </p>
            ) : null}
            {/* Stats Overview */}
            <div className="report-stats-grid">
              <div className="report-stat-card">
                <span className="stat-label"><CheckCircle2 size={15} /> 任务完成率</span>
                <strong className="stat-value">{data.completion_rate}%</strong>
                <small className="stat-sub">{data.total_completed_tasks} / {data.total_planned_tasks} 项完成</small>
              </div>

              <div className="report-stat-card">
                <span className="stat-label"><Flame size={15} /> 沉浸专注</span>
                <strong className="stat-value">{data.total_focus_minutes} <small>分</small></strong>
                <small className="stat-sub">{data.total_pomodoros} 个番茄钟</small>
              </div>

              <div className="report-stat-card">
                <span className="stat-label"><BookOpen size={15} /> 错题攻克</span>
                <strong className="stat-value">{data.mastered_count} <small>道</small></strong>
                <small className="stat-sub">总在库 {data.wrong_count} 道</small>
              </div>
            </div>

            {/* AI Diagnosis Sections */}
            <div className="diagnosis-sections">
              {/* Highlights */}
              <div className="diagnosis-card card-highlights">
                <div className="diagnosis-card-title">
                  <Award size={18} />
                  <strong>学情亮点与进步</strong>
                </div>
                <p>{data.highlights}</p>
              </div>

              {/* Weaknesses */}
              <div className="diagnosis-card card-weaknesses">
                <div className="diagnosis-card-title">
                  <Target size={18} />
                  <strong>需重点突破薄弱项</strong>
                </div>
                <p>{data.weaknesses}</p>
                {data.weak_subjects.length > 0 ? (
                  <div className="report-tags-row">
                    <span>关注学科：</span>
                    {data.weak_subjects.map((sub) => (
                      <span key={sub} className="report-subject-tag">{sub}</span>
                    ))}
                    <span className="report-cause-tag">高频错因：{data.frequent_cause}</span>
                  </div>
                ) : null}
              </div>

              {/* Action Plan */}
              <div className="diagnosis-card card-plan">
                <div className="diagnosis-card-title">
                  <Lightbulb size={18} />
                  <strong>下周中考提分行动建议</strong>
                </div>
                <p>{data.action_plan}</p>
              </div>

              {/* Parent Advice */}
              <div className="diagnosis-card card-parent">
                <div className="diagnosis-card-title">
                  <HeartHandshake size={18} />
                  <strong>家长陪伴与激励指南</strong>
                </div>
                <p>{data.parent_advice}</p>
              </div>
            </div>

            {/* Footer Action */}
            <div className="report-footer">
              <button
                type="button"
                className="btn-refresh-report"
                onClick={() => loadReport(true)}
                disabled={refreshing}
              >
                <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
                {refreshing
                  ? 'AI 正在生成诊断…'
                  : data.generated_by_ai
                    ? '重新生成本周 AI 诊断'
                    : '生成本周 AI 诊断'}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
