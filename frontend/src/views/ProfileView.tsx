import { Award, Bot, ChevronRight, Database, Edit3, Flame, HardDrive, LogOut, Save, ShieldCheck, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AuthUser, FocusStats } from '../types'
import { WeeklyReportModal } from '../components/WeeklyReportModal'

interface ProfileViewProps {
  user: AuthUser
  onLogout: () => Promise<void>
  onUserUpdate: (user: AuthUser) => void
}

const GRADES = ['初一', '初二', '初三', '高一', '高二', '高三', '大学']

export function ProfileView({ user, onLogout, onUserUpdate }: ProfileViewProps) {
  const isParent = user.role === 'parent'
  const [stats, setStats] = useState<FocusStats | null>(null)
  const [showWeeklyReport, setShowWeeklyReport] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(user.display_name)
  const [gradeInput, setGradeInput] = useState(user.grade || '初三')
  const [saving, setSaving] = useState(false)

  const displayLabel = user.display_name || (isParent ? '家长账号' : `${user.grade || '初三'}学生`)

  const saveProfile = async () => {
    setSaving(true)
    try {
      const updated = await api.updateProfile({ display_name: nameInput.trim(), grade: gradeInput })
      onUserUpdate(updated)
      setEditing(false)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    void api.focusStats().then(setStats).catch(() => {})
  }, [])

  return (
    <section className="content-view" aria-labelledby="profile-title">
      <header className="content-header">
        <h1 id="profile-title">我的</h1>
        <p>{isParent ? '查看学习进度和成绩趋势，学习数据保持只读。' : '完成学习任务、整理错题并使用 AI 辅导。'}</p>
      </header>

      <section className="profile-card">
        <span className={isParent ? 'avatar avatar-parent' : 'avatar'}>{isParent ? '家' : '学'}</span>
        <div><strong>{displayLabel}</strong><small>登录账号：{user.username}</small></div>
        {!isParent ? (
          <button
            className="profile-edit-btn"
            type="button"
            onClick={() => {
              setNameInput(user.display_name)
              setGradeInput(user.grade || '初三')
              setEditing((value) => !value)
            }}
            aria-label="编辑名字与年级"
          >
            <Edit3 size={15} />
          </button>
        ) : null}
      </section>

      {editing ? (
        <section className="profile-edit-panel">
          <label>
            <span>名字</span>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="输入名字"
              maxLength={40}
            />
          </label>
          <label>
            <span>年级</span>
            <select value={gradeInput} onChange={(e) => setGradeInput(e.target.value)}>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <button className="profile-save-btn" type="button" onClick={saveProfile} disabled={saving}>
            <Save size={15} />
            {saving ? '保存中…' : '保存'}
          </button>
        </section>
      ) : null}

      {/* Weekly Report Entry Button */}
      <button
        className="profile-report-entry"
        type="button"
        onClick={() => setShowWeeklyReport(true)}
      >
        <span className="profile-report-icon"><Award size={20} /></span>
        <div className="profile-report-copy">
          <strong>AI 学情诊断周报</strong>
          <span>查看本周任务完成、专注时长与中考提分突破点</span>
        </div>
        <ChevronRight size={18} />
      </button>

      {/* Focus Statistics Card */}
      {stats ? (
        <div className="focus-stats-card">
          <div className="focus-stats-header">
            <Timer size={18} />
            <strong>专注学习统计</strong>
          </div>
          <div className="focus-stats-grid">
            <div className="focus-stat-box">
              <span>今日专注</span>
              <strong>{stats.today_minutes} <small>分钟</small></strong>
              <small>{stats.today_pomodoros} 个番茄</small>
            </div>
            <div className="focus-stat-box">
              <span>本周累计</span>
              <strong>{stats.week_minutes} <small>分钟</small></strong>
              <small>{stats.week_pomodoros} 个番茄</small>
            </div>
          </div>
          {Object.keys(stats.subject_minutes).length > 0 ? (
            <div className="focus-subject-breakdown">
              <span>本周学科专注分布：</span>
              <div className="subject-pills">
                {Object.entries(stats.subject_minutes).map(([sub, mins]) => (
                  <span key={sub} className="subject-pill">
                    {sub} {mins}分钟
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="settings-list">
        <div><Bot aria-hidden="true" /><span><strong>AI服务</strong><small>DeepSeek V4 Flash / Pro、Gemini 3.7 Flash</small></span></div>
        <div><Database aria-hidden="true" /><span><strong>学习数据</strong><small>PostgreSQL 是正式记录来源</small></span></div>
        <div><HardDrive aria-hidden="true" /><span><strong>家庭存储</strong><small>错题图片保存在 NAS</small></span></div>
        <div><ShieldCheck aria-hidden="true" /><span><strong>隐私与权限</strong><small>{isParent ? '家长账号只能查看，不能修改学习记录' : '学生账号可记录任务、错题和成绩'}</small></span></div>
      </div>

      <button className="logout-button" type="button" onClick={() => void onLogout()}>
        <LogOut size={18} aria-hidden="true" />退出登录
      </button>

      <p className="version-note">AI学习助手 v0.6.2 · 家庭内测版</p>

      {showWeeklyReport ? (
        <WeeklyReportModal onClose={() => setShowWeeklyReport(false)} />
      ) : null}
    </section>
  )
}
