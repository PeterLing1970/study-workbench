import { Calendar, CheckCircle2, FileImage, LoaderCircle, RotateCw, Sparkles, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { WrongQuestion } from '../types'

interface WrongQuestionDetailProps {
  item: WrongQuestion
  onUpdateStatus: (id: number, status: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onClose: () => void
}

const statusOptions = ['待复习', '已复习', '已掌握'] as const

function formatReviewDue(nextDate: string | null): string {
  if (!nextDate) return '无需复习'
  const today = new Date().toISOString().slice(0, 10)
  if (nextDate < today) return '已逾期，建议今天完成'
  if (nextDate === today) return '今日到期复习'
  const diffDays = Math.round((new Date(nextDate).getTime() - new Date(today).getTime()) / (1000 * 3600 * 24))
  return `${diffDays} 天后复习 (${nextDate})`
}

export function WrongQuestionDetail({ item, onUpdateStatus, onDelete, onClose }: WrongQuestionDetailProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)
  const [status, setStatus] = useState(item.review_status)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === status) return
    setUpdating(true)
    try {
      await onUpdateStatus(item.id, newStatus)
      setStatus(newStatus)
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await onDelete(item.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div ref={dialogRef} className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wq-detail-title" tabIndex={-1} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="modal-sheet wq-detail-sheet">
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="关闭">
          <X aria-hidden="true" />
        </button>

        <div className="wq-detail-header">
          <span className="wq-detail-icon"><FileImage aria-hidden="true" /></span>
          <div>
            <span className="wq-detail-subject">{item.subject}</span>
            <time className="wq-detail-date">{new Date(item.created_at).toLocaleDateString('zh-CN')}</time>
          </div>
        </div>

        <h2 id="wq-detail-title">{item.title}</h2>

        <div className="wq-detail-tags">
          <span className="wq-tag"><Sparkles size={14} aria-hidden="true" /> {item.knowledge_point}</span>
          <span className="wq-tag">错因：{item.cause}</span>
          <span className="wq-tag ebbinghaus-tag">
            <RotateCw size={13} /> 已复习 {item.review_count || 0} 次 · 艾宾浩斯周期
          </span>
        </div>

        {item.review_status !== '已掌握' && item.next_review_date ? (
          <div className="wq-due-notice">
            <Calendar size={15} />
            <span>复习节奏：{formatReviewDue(item.next_review_date)}</span>
          </div>
        ) : null}

        <div className="wq-detail-analysis">
          <h3>AI 分析与解题指引</h3>
          <p>{item.ai_summary}</p>
        </div>

        <div className="wq-status-section">
          <h3>掌握状态追踪</h3>
          <div className="status-buttons">
            {statusOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                className={status === opt ? `status-btn status-btn-active status-${opt}` : 'status-btn'}
                onClick={() => handleStatusChange(opt)}
                disabled={updating}
              >
                {opt === '已复习' ? <RotateCw size={14} /> : opt === '已掌握' ? <CheckCircle2 size={14} /> : null}
                {opt}
              </button>
            ))}
          </div>
          <small className="status-hint">
            点击「已复习」系统将按艾宾浩斯曲线自动推算下次复习日期（1/3/7/15/30天）。
          </small>
          {updating ? <span className="status-saving"><LoaderCircle className="spin" size={14} /> 保存中…</span> : null}
        </div>

        <button
          className={confirmDelete ? 'wq-delete-btn confirm' : 'wq-delete-btn'}
          type="button"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting
            ? <><LoaderCircle className="spin" size={16} /> 删除中…</>
            : confirmDelete
              ? <><Trash2 size={16} /> 确认删除此错题</>
              : <><Trash2 size={16} /> 删除错题</>
          }
        </button>
      </section>
    </div>
  )
}
