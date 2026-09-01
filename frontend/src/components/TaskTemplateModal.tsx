import { Check, LoaderCircle, Plus, Trash2, X } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { api } from '../api'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { TaskTemplate } from '../types'

const subjects = ['语文', '数学', '英语', '道法', '物理', '化学', '历史']
const weekdaysMap = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const minuteOptions = [10, 15, 20, 25, 30, 40, 45, 60]

interface TaskTemplateModalProps {
  onClose: () => void
  onTemplatesChanged?: () => void
}

export function TaskTemplateModal({ onClose, onTemplatesChanged }: TaskTemplateModalProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [subject, setSubject] = useState('语文')
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(20)
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const list = await api.templates()
      setTemplates(list)
    } catch {
      setError('加载模板失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTemplates()
  }, [])

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.length > 1
          ? prev.filter((d) => d !== day)
          : prev
        : [...prev, day].sort((a, b) => a - b)
    )
  }

  const handleAddTemplate = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('请输入模板任务名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.createTemplate({
        subject,
        title: title.trim(),
        minutes,
        weekdays: selectedDays.join(','),
      })
      setTitle('')
      setShowAdd(false)
      await loadTemplates()
      onTemplatesChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建模板失败')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (template: TaskTemplate) => {
    try {
      await api.updateTemplate(template.id, { active: !template.active })
      await loadTemplates()
      onTemplatesChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新状态失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.deleteTemplate(id)
      await loadTemplates()
      onTemplatesChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模板失败')
    }
  }

  return (
    <div ref={dialogRef} className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="template-modal-title" tabIndex={-1} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="modal-sheet template-modal-sheet">
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="关闭">
          <X aria-hidden="true" />
        </button>

        <h2 id="template-modal-title">每日固定任务模板</h2>
        <p className="modal-subtitle">设定每周自动生成的循环任务（如每日古诗默写、单词打卡），每天自动安排到学习计划中。</p>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        {loading ? (
          <div className="center-state compact"><LoaderCircle className="spin" />加载中…</div>
        ) : (
          <div className="template-list">
            {templates.map((tpl) => {
              const activeDays = tpl.weekdays.split(',').map((d) => weekdaysMap[parseInt(d, 10)] ?? '')
              const isAllDays = tpl.weekdays === '0,1,2,3,4,5,6'
              return (
                <div className={`template-item ${tpl.active ? 'active' : 'disabled'}`} key={tpl.id}>
                  <button
                    type="button"
                    className={`template-toggle-btn ${tpl.active ? 'is-on' : ''}`}
                    onClick={() => handleToggleActive(tpl)}
                    title={tpl.active ? '点击停用' : '点击启用'}
                  >
                    <Check size={14} />
                  </button>
                  <div className="template-info">
                    <div className="template-header">
                      <span className="template-subject">{tpl.subject}</span>
                      <strong>{tpl.title}</strong>
                      <span className="template-minutes">{tpl.minutes}分钟</span>
                    </div>
                    <span className="template-days">
                      {isAllDays ? '每天循环' : `循环: ${activeDays.filter(Boolean).join('、')}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="task-action-btn task-action-delete"
                    onClick={() => handleDelete(tpl.id)}
                    aria-label={`删除模板 ${tpl.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )
            })}

            {templates.length === 0 && !showAdd ? (
              <div className="chat-empty">
                <p>暂无固定任务模板</p>
                <span>点击下方按钮添加每日自动循环任务</span>
              </div>
            ) : null}
          </div>
        )}

        {showAdd ? (
          <form className="template-add-form" onSubmit={handleAddTemplate}>
            <h3>新建任务模板</h3>
            <div className="field-group">
              <label htmlFor="tpl-subject">科目</label>
              <select id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                {subjects.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            <label htmlFor="tpl-title">任务名称</label>
            <input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：每日古诗默写"
              maxLength={160}
              autoFocus
            />

            <label>时长</label>
            <div className="minutes-picker">
              {minuteOptions.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={minutes === m ? 'minute-chip active' : 'minute-chip'}
                  onClick={() => setMinutes(m)}
                >
                  {m}分钟
                </button>
              ))}
            </div>

            <label>生效时间</label>
            <div className="weekdays-picker">
              {weekdaysMap.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  className={selectedDays.includes(i) ? 'weekday-chip active' : 'weekday-chip'}
                  onClick={() => toggleDay(i)}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="template-form-actions">
              <button type="button" className="btn-cancel" onClick={() => setShowAdd(false)}>取消</button>
              <button type="submit" className="modal-submit" disabled={saving}>
                {saving ? '保存中…' : '创建模板'}
              </button>
            </div>
          </form>
        ) : (
          <button className="template-add-btn" type="button" onClick={() => setShowAdd(true)}>
            <Plus size={18} /> 添加新模板
          </button>
        )}
      </section>
    </div>
  )
}
