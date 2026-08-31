import { type FormEvent, useState } from 'react'
import { AlertCircle, ChevronDown, LineChart, LoaderCircle, Plus, Sparkles, TrendingUp, X } from 'lucide-react'
import { api } from '../api'
import { ScoreTrendChart } from '../components/ScoreTrendChart'
import type { Score } from '../types'

interface ScoresViewProps {
  scores: Score[]
  loading: boolean
  onScoreAdded: () => Promise<void>
}

const SUBJECT_FULL_SCORES: Record<string, number> = {
  '语文': 120, '数学': 120, '英语': 120,
  '道法': 100, '物理': 100, '化学': 100, '历史': 100, '体育': 40,
}
const subjectList = Object.keys(SUBJECT_FULL_SCORES)

export function ScoresView({ scores, loading, onScoreAdded }: ScoresViewProps) {
  const [showForm, setShowForm] = useState(false)
  const [showTrend, setShowTrend] = useState(true)
  const [examName, setExamName] = useState('')
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10))
  const [subject, setSubject] = useState('语文')
  const [score, setScore] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // Group scores by exam
  const examGroups = scores.reduce<Record<string, Score[]>>((groups, s) => {
    const key = `${s.exam_name}|${s.exam_date}`
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
    return groups
  }, {})
  const examKeys = Object.keys(examGroups)
  const [activeExam, setActiveExam] = useState(examKeys[0] ?? '')
  const activeScores = examGroups[activeExam || examKeys[0]] ?? scores
  const activeExamName = (activeExam || examKeys[0])?.split('|')[0] ?? '暂无考试'

  const total = activeScores.reduce((sum, item) => sum + item.score, 0)
  const fullTotal = activeScores.reduce((sum, item) => sum + item.full_score, 0)
  const activeIsDemo = activeScores.some((item) => item.is_demo)

  // Diagnostics: find weak subjects (< 80% rate)
  const weakSubjects = activeScores.filter((item) => {
    const percent = Math.round((item.score / item.full_score) * 100)
    return percent < 80
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const name = examName.trim()
    if (!name) { setFormError('请输入考试名称'); return }
    const scoreNum = parseInt(score, 10)
    if (isNaN(scoreNum) || scoreNum < 0) { setFormError('请输入有效分数'); return }
    const fullScore = SUBJECT_FULL_SCORES[subject]
    if (scoreNum > fullScore) { setFormError(`${subject}满分为 ${fullScore}`); return }

    setSaving(true)
    setFormError('')
    setFormSuccess('')
    try {
      await api.addScore({ exam_name: name, exam_date: examDate, subject, score: scoreNum, full_score: fullScore })
      setFormSuccess(`${subject} ${scoreNum}分 已录入`)
      setScore('')
      // Move to next subject
      const idx = subjectList.indexOf(subject)
      if (idx < subjectList.length - 1) setSubject(subjectList[idx + 1])
      await onScoreAdded()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '录入失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="content-view" aria-labelledby="scores-title">
      <header className="content-header scores-header">
        <div>
          <h1 id="scores-title">成绩与分析</h1>
          <p>程序负责准确计算，可视化追踪学科走势并进行弱科诊断。</p>
        </div>
        <button className="add-score-btn" type="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X size={18} /> : <Plus size={18} />}
          {showForm ? '收起' : '录入成绩'}
        </button>
      </header>

      {showForm ? (
        <form className="score-form" onSubmit={handleSubmit}>
          <div className="score-form-row">
            <div className="score-form-field">
              <label htmlFor="exam-name">考试名称</label>
              <input id="exam-name" value={examName} onChange={(e) => setExamName(e.target.value)} placeholder="例如：九月月考" required />
            </div>
            <div className="score-form-field">
              <label htmlFor="exam-date">日期</label>
              <input id="exam-date" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} required />
            </div>
          </div>
          <div className="score-form-row">
            <div className="score-form-field">
              <label htmlFor="score-subject">科目</label>
              <select id="score-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                {subjectList.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="score-form-field">
              <label htmlFor="score-value">分数 <small>/ {SUBJECT_FULL_SCORES[subject]}</small></label>
              <input id="score-value" type="number" min={0} max={SUBJECT_FULL_SCORES[subject]} value={score} onChange={(e) => setScore(e.target.value)} placeholder="0" required />
            </div>
            <button className="score-form-submit" type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
              录入
            </button>
          </div>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          {formSuccess ? <p className="form-success" role="status">{formSuccess}</p> : null}
        </form>
      ) : null}

      {!loading && scores.length === 0 ? (
        <div className="score-empty-state" role="status">
          <LineChart size={28} aria-hidden="true" />
          <div>
            <strong>还没有真实成绩</strong>
            <p>点击“录入成绩”添加第一次考试，之后这里会自动生成总分、弱科诊断和趋势图。</p>
          </div>
        </div>
      ) : null}

      {/* Multi-exam Trend Chart */}
      {scores.length > 0 ? <div className="trend-section">
        <div className="section-heading-row">
          <h2 className="section-heading-with-icon">
            <TrendingUp size={20} /> 各科得分率走势
          </h2>
          <button
            type="button"
            className="text-toggle-btn"
            onClick={() => setShowTrend(!showTrend)}
          >
            {showTrend ? '收起走势' : '展开走势'}
          </button>
        </div>
        {showTrend ? <ScoreTrendChart /> : null}
      </div> : null}

      {/* Weak Subjects Diagnostics */}
      {weakSubjects.length > 0 ? (
        <div className="diagnostics-card">
          <div className="diagnostics-header">
            <Sparkles size={18} className="diagnostics-sparkle" />
            <strong>中考提分重点诊断</strong>
          </div>
          <p>
            检测到 <strong>{weakSubjects.map((w) => w.subject).join('、')}</strong> 目前得分率低于 80%，是提分潜力最大的科目。建议结合「AI辅导」针对性突破薄弱知识点，并在「错题整理」中坚持艾宾浩斯复习。
          </p>
        </div>
      ) : null}

      {examKeys.length > 1 ? (
        <div className="exam-switcher">
          <label htmlFor="exam-select"><ChevronDown size={14} /> 切换考试明细</label>
          <select id="exam-select" value={activeExam || examKeys[0]} onChange={(e) => setActiveExam(e.target.value)}>
            {examKeys.map((key) => {
              const [name, date] = key.split('|')
              return <option key={key} value={key}>{name} ({date})</option>
            })}
          </select>
        </div>
      ) : null}

      {scores.length > 0 ? <section className="score-summary" aria-label="考试总分">
        <div>
          <span>{activeExamName} {activeIsDemo ? <b className="demo-data-badge">演示数据</b> : null}</span>
          <strong>{total}<small> / {fullTotal || 800}</small></strong>
        </div>
        <div className="score-rate">
          <span>得分率</span>
          <strong>{fullTotal ? Math.round((total / fullTotal) * 100) : 0}%</strong>
        </div>
      </section> : null}

      {scores.length > 0 ? <div className="section-heading-row list-heading">
        <h2>科目明细</h2>
        <span>{activeScores.length} 科</span>
      </div> : null}

      {loading ? (
        <div className="center-state compact"><LoaderCircle className="spin" />加载中…</div>
      ) : scores.length > 0 ? (
        <div className="score-list">
          {activeScores.map((item) => {
            const percent = Math.round((item.score / item.full_score) * 100)
            const isWeak = percent < 80
            return (
              <div className="score-row" key={item.id}>
                <div className="score-row-heading">
                  <div className="score-row-title">
                    <strong>{item.subject}</strong>
                    {isWeak ? <span className="score-weak-pill"><AlertCircle size={12} /> 提升重点</span> : null}
                  </div>
                  <span>{item.score} / {item.full_score} ({percent}%)</span>
                </div>
                <div className={`score-bar ${isWeak ? 'bar-weak' : ''}`}><span style={{ width: `${percent}%` }} /></div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
