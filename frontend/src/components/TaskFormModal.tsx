import { LoaderCircle, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { Task } from '../types'

const subjects = ['语文', '数学', '英语', '道法', '物理', '化学', '历史']
const minuteOptions = [10, 15, 20, 25, 30, 40, 45, 60]

interface TaskFormModalProps {
  editingTask?: Task | null
  onSave: (data: { subject: string; title: string; minutes: number }) => Promise<void>
  onClose: () => void
}

export function TaskFormModal({ editingTask, onSave, onClose }: TaskFormModalProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)
  const [subject, setSubject] = useState(editingTask?.subject ?? '数学')
  const [title, setTitle] = useState(editingTask?.title ?? '')
  const [minutes, setMinutes] = useState(editingTask?.minutes ?? 20)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('请输入任务标题'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({ subject, title: title.trim(), minutes })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={dialogRef} className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="task-form-title" tabIndex={-1} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="modal-sheet">
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="关闭">
          <X aria-hidden="true" />
        </button>
        <h2 id="task-form-title">{editingTask ? '编辑任务' : '新建任务'}</h2>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label htmlFor="task-subject">科目</label>
          <select id="task-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((s) => <option key={s}>{s}</option>)}
          </select>

          <label htmlFor="task-title">标题</label>
          <input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：二次函数错题复习"
            maxLength={160}
            autoFocus
          />

          <label htmlFor="task-minutes">时长</label>
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

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="modal-submit" type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : null}
            {saving ? '保存中…' : editingTask ? '保存修改' : '添加任务'}
          </button>
        </form>
      </section>
    </div>
  )
}
