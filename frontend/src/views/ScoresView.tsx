import { type FormEvent, useState } from 'react'
import { AlertCircle, ChevronDown, LineChart, LoaderCircle, Pencil, Plus, Sparkles, Trash2, TrendingUp, X } from 'lucide-react'
import { api } from '../api'
import { ScoreTrendChart } from '../components/ScoreTrendChart'
import type { Score } from '../types'

interface ScoresViewProps {
  scores: Score[]
  loading: boolean
  isParent: boolean
  onScoreAdded: () => Promise<void>
}

const SUBJECT_DEFAULT_FULL_SCORES: Record<string, number> = {
  '语文': 120, '数学': 120, '英语': 120,
  '道法': 100, '物理': 100, '化学': 100, '历史': 100, '体育': 40,
  '总分': 0, // 满分不固定，录入时自由填写
}
const TOTAL_SUBJECT = '总分'
const subjectList = Object.keys(SUBJECT_DEFAULT_FULL_SCORES)

export function ScoresView({ scores, loading, isParent, onScoreAdded }: ScoresViewProps) {
  const [showForm, setShowForm] = useState(false)
  const [showTrend, setShowTrend] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [examName, setExamName] = useState('')
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10))
  const [subject, setSubject] = useState('语文')
  const [fullScore, setFullScore] = useState(120)
  const [score, setScore] = useState('')
  const [classRank, setClassRank] = useState('')
  const [gradeRank, setGradeRank] = useState('')
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

  const subjectScores = activeScores.filter((item) => item.subject !== TOTAL_SUBJECT)
  const totalRow = activeScores.find((item) => item.subject === TOTAL_SUBJECT) ?? null
  const total = subjectScores.reduce((sum, item) => sum + item.score, 0)
  const fullTotal = subjectScores.reduce((sum, item) => sum + item.full_score, 0)
  const activeIsDemo = activeScores.some((item) => item.is_demo)
  const activeClassRank = totalRow?.class_rank ?? null
  const activeGradeRank = totalRow?.grade_rank ?? null

  // Diagnostics: find weak subjects (< 80% rate), excluding the total row
  const weakSubjects = subjectScores.filter((item) => {
    const percent = Math.round((item.score / item.full_score) * 100)
    return percent < 80
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const name = examName.trim()
    if (!name) { setFormError('请输入考试名称'); return }
    const scoreNum = Number.parseFloat(score)
    if (isNaN(scoreNum) || scoreNum < 0) { setFormError('请输入有效分数'); return }
    if (scoreNum > fullScore) { setFormError(`${subject}满分为 ${fullScore}`); return }
    const classRankNum = classRank ? parseInt(classRank, 10) : null
    const gradeRankNum = gradeRank ? parseInt(gradeRank, 10) : null
    if (classRankNum !== null && (!Number.isInteger(classRankNum) || classRankNum < 1)) { setFormError('班级排名必须为正整数'); return }
    if (gradeRankNum !== null && (!Number.isInteger(gradeRankNum) || gradeRankNum < 1)) { setFormError('年级排名必须为正整数'); return }

    setSaving(true)
    setFormError('')
    setFormSuccess('')
    try {
      const payload = {
        exam_name: name,
        exam_date: examDate,
        subject,
        score: scoreNum,
        full_score: fullScore,
        class_rank: classRankNum,
        grade_rank: gradeRankNum,
      }
      if (editingId !== null) {
        await api.updateScore(editingId, payload)
        setFormSuccess(`${subject} ${scoreNum}分 已更新`)
        setEditingId(null)
      } else {
        await api.addScore(payload)
        setFormSuccess(`${subject} ${scoreNum}分 已录入`)
        setScore('')
        // Move to next subject
        const idx = subjectList.indexOf(subject)
        if (idx < subjectList.length - 1) {
          const nextSubject = subjectList[idx + 1]
          setSubject(nextSubject)
          setFullScore(SUBJECT_DEFAULT_FULL_SCORES[nextSubject])
        }
      }
      await onScoreAdded()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item: Score) => {
    setEditingId(item.id)
    setExamName(item.exam_name)
    setExamDate(item.exam_date)
    setSubject(item.subject)
    setFullScore(item.full_score)
    setScore(String(item.score))
    setClassRank(item.class_rank !== null ? String(item.class_rank) : '')
    setGradeRank(item.grade_rank !== null ? String(item.grade_rank) : '')
    setFormError('')
    setFormSuccess('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setShowForm(false)
    setFormError('')
    setFormSuccess('')
  }

  const handleDelete = async (item: Score) => {
    if (!window.confirm(`确定删除「${item.exam_name} · ${item.subject} ${item.score}分」这条成绩吗？此操作不可恢复。`)) return
    try {
      await api.deleteScore(item.id)
      setFormSuccess(`已删除 ${item.subject} 成绩`)
      await onScoreAdded()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <section className="content-view" aria-labelledby="scores-title">
      <header className="content-header scores-header">
        <div>
          <h1 id="scores-title">成绩与分析</h1>
          <p>程序负责准确计算，可视化追踪学科走势并进行弱科诊断。</p>
        </div>
        <button className="add-score-btn" type="button" onClick={() => (showForm ? cancelEdit() : setShowForm(true))}>
          {showForm ? <X size={18} /> : <Plus size={18} />}
          {showForm ? '收起' : '录入成绩'}
        </button>
      </header>

      {showForm ? (
        <form className="score-form" onSubmit={handleSubmit}>
          <h3 className="score-form-title">
            {editingId !== null ? `编辑 ${subject} 成绩` : '录入成绩'}
          </h3>
          {editingId !== null ? <p className="form-note">修改后点击「保存修改」生效；考试名称与日期变更后会归入新的考试分组。</p> : null}
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
              <select id="score-subject" value={subject} onChange={(e) => {
                const nextSubject = e.target.value
                setSubject(nextSubject)
                setFullScore(SUBJECT_DEFAULT_FULL_SCORES[nextSubject])
              }}>
                {subjectList.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="score-form-field">
              <label htmlFor="score-full-score">满分</label>
              {subject === TOTAL_SUBJECT ? (
                <input
                  id="score-full-score"
                  type="number"
                  min={1}
                  max={2000}
                  value={fullScore || ''}
                  onChange={(e) => setFullScore(Number(e.target.value))}
                  placeholder="例如：680"
                  required
                />
              ) : (
                <select id="score-full-score" value={fullScore} onChange={(e) => setFullScore(Number(e.target.value))}>
                  {subject === '体育' ? <option value={40}>40 分</option> : (
                    <>
                      <option value={100}>100 分</option>
                      <option value={120}>120 分</option>
                    </>
                  )}
                </select>
              )}
            </div>
            <div className="score-form-field">
              <label htmlFor="score-value">分数 <small>/ {fullScore}</small></label>
              <input id="score-value" type="number" min={0} max={fullScore} step="0.1" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} placeholder="例如：93.5" required />
            </div>
          </div>
          <div className="score-form-row score-rank-row">
            <div className="score-form-field">
              <label htmlFor="class-rank">班级排名 <small>可选</small></label>
              <input id="class-rank" type="number" min={1} max={10000} step={1} value={classRank} onChange={(e) => setClassRank(e.target.value)} placeholder="例如：5" />
            </div>
            <div className="score-form-field">
              <label htmlFor="grade-rank">年级排名 <small>可选</small></label>
              <input id="grade-rank" type="number" min={1} max={10000} step={1} value={gradeRank} onChange={(e) => setGradeRank(e.target.value)} placeholder="例如：28" />
            </div>
            <button className="score-form-submit" type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={16} /> : editingId !== null ? <Pencil size={16} /> : <Plus size={16} />}
              {editingId !== null ? (saving ? '保存中…' : '保存修改') : (saving ? '录入中…' : '录入')}
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
        {activeClassRank !== null ? <div className="score-rank-summary"><span>班级排名</span><strong>第 {activeClassRank} 名</strong></div> : null}
        {activeGradeRank !== null ? <div className="score-rank-summary"><span>年级排名</span><strong>第 {activeGradeRank} 名</strong></div> : null}
      </section> : null}

      {scores.length > 0 ? <div className="section-heading-row list-heading">
        <h2>科目明细</h2>
        <span>{subjectScores.length} 科{totalRow ? ' + 总分' : ''}</span>
      </div> : null}

      {loading ? (
        <div className="center-state compact"><LoaderCircle className="spin" />加载中…</div>
      ) : scores.length > 0 ? (
        <div className="score-list">
          {activeScores.map((item) => {
            const percent = Math.round((item.score / item.full_score) * 100)
            const isWeak = percent < 80
            const isTotal = item.subject === TOTAL_SUBJECT
            const rankBadge = item.class_rank !== null || item.grade_rank !== null ? (
              <span className="score-rank-badge">
                {item.class_rank !== null ? `班级第 ${item.class_rank} 名` : null}
                {item.class_rank !== null && item.grade_rank !== null ? ' · ' : null}
                {item.grade_rank !== null ? `年级第 ${item.grade_rank} 名` : null}
              </span>
            ) : null
            return (
              <div className={`score-row ${isTotal ? 'total-row' : ''}`} key={item.id}>
                <div className="score-row-heading">
                  <div className="score-row-title">
                    <strong>{item.subject}{isTotal ? <b className="total-label">本次考试总分</b> : null}</strong>
                    {isWeak ? <span className="score-weak-pill"><AlertCircle size={12} /> 提升重点</span> : null}
                  </div>
                  <span className={isTotal ? 'total-score' : ''}>{item.score} / {item.full_score} ({percent}%)</span>
                </div>
                <div className={`score-bar ${isWeak ? 'bar-weak' : ''} ${isTotal ? 'bar-total' : ''}`}><span style={{ width: `${percent}%` }} /></div>
                {rankBadge}
                {!isParent ? (
                  <div className="score-row-actions">
                    <button type="button" className="score-action-btn" onClick={() => startEdit(item)} title="编辑这条成绩">
                      <Pencil size={14} /> 编辑
                    </button>
                    <button type="button" className="score-action-btn danger" onClick={() => handleDelete(item)} title="删除这条成绩">
                      <Trash2 size={14} /> 删除
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
