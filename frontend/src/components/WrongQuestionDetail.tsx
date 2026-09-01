import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  FileImage,
  Flame,
  HelpCircle,
  Lightbulb,
  LoaderCircle,
  Printer,
  RotateCw,
  Sparkles,
  Stethoscope,
  Trash2,
  X,
  ZoomIn
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { WrongQuestion } from '../types'
import { MathMarkdown } from './MathMarkdown'

interface WrongQuestionDetailProps {
  item: WrongQuestion
  onUpdateStatus: (id: number, status: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onClose: () => void
  onOpenPrint?: (id: number) => void
  onNavigateToCoach?: (item: WrongQuestion, customPrompt?: string) => void
}

const statusOptions = ['待复习', '已复习', '已掌握'] as const

function formatReviewDue(nextDate: string | null): { text: string; isDue: boolean; isOverdue: boolean } {
  if (!nextDate) return { text: '无需复习', isDue: false, isOverdue: false }
  const today = new Date().toISOString().slice(0, 10)
  if (nextDate < today) {
    return { text: `已逾期 (${nextDate})，建议今日完成复习`, isDue: true, isOverdue: true }
  }
  if (nextDate === today) {
    return { text: '今日到期复习', isDue: true, isOverdue: false }
  }
  const diffDays = Math.round((new Date(nextDate).getTime() - new Date(today).getTime()) / (1000 * 3600 * 24))
  return { text: `${diffDays} 天后复习 (${nextDate})`, isDue: false, isOverdue: false }
}

interface ParsedTemplate {
  isStructured: boolean
  baseInfo?: string
  diagnosis?: string
  solution?: string
  takeaways?: string
  variations?: string
  rawMarkdown: string
}

function parseAiSummary(text: string): ParsedTemplate {
  if (!text) return { isStructured: false, rawMarkdown: '' }

  const hasSections =
    text.includes('🏷️') ||
    text.includes('🩺') ||
    text.includes('✅') ||
    text.includes('💡') ||
    text.includes('🚀')

  if (!hasSections) {
    return { isStructured: false, rawMarkdown: text }
  }

  // Split by main emojis/headings
  const extractBetween = (startToken: string, endTokens: string[]): string | undefined => {
    const sIdx = text.indexOf(startToken)
    if (sIdx === -1) return undefined
    const afterStart = text.slice(sIdx + startToken.length)
    let minEnd = afterStart.length
    for (const eToken of endTokens) {
      const eIdx = afterStart.indexOf(eToken)
      if (eIdx !== -1 && eIdx < minEnd) {
        minEnd = eIdx
      }
    }
    // 兼容历史脏数据：AI 偶发把换行双重转义为 \n（两字符），替换回真实换行
    return afterStart.slice(0, minEnd).trim().replace(/\\n/g, '\n')
  }

  const baseInfo = extractBetween('🏷️ 基础信息', ['🩺 错因深度诊断', '✅ 满分标准解析', '💡 提炼与升华', '🚀 举一反三'])
  const diagnosis = extractBetween('🩺 错因深度诊断', ['✅ 满分标准解析', '💡 提炼与升华', '🚀 举一反三'])
  const solution = extractBetween('✅ 满分标准解析', ['💡 提炼与升华', '🚀 举一反三'])
  const takeaways = extractBetween('💡 提炼与升华', ['🚀 举一反三'])
  const variations = extractBetween('🚀 举一反三', [])

  return {
    isStructured: true,
    baseInfo,
    diagnosis,
    solution,
    takeaways,
    variations,
    rawMarkdown: text,
  }
}

export function WrongQuestionDetail({
  item,
  onUpdateStatus,
  onDelete,
  onClose,
  onOpenPrint,
  onNavigateToCoach,
}: WrongQuestionDetailProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)
  const [status, setStatus] = useState(item.review_status)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showImageZoom, setShowImageZoom] = useState(false)

  const reviewInfo = useMemo(() => formatReviewDue(item.next_review_date), [item.next_review_date])
  const parsed = useMemo(() => parseAiSummary(item.ai_summary), [item.ai_summary])

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
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await onDelete(item.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const handleGoCoachVariation = () => {
    if (!onNavigateToCoach) return
    const coachPrompt = parsed.variations
      ? `【错题变式巩固训练】\n原题目：${item.title}\n知识点：${item.knowledge_point}\n变式训练题目：\n${parsed.variations}\n\n请针对这道变式题，像名师一样分步引导我思考解答。`
      : `【错题答疑】\n关于错题《${item.title}》（考点：${item.knowledge_point}）：请分步引导我重新分析与巩固。`
    onNavigateToCoach(item, coachPrompt)
    onClose()
  }

  return (
    <div
      ref={dialogRef}
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wq-detail-title"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="modal-sheet wq-detail-sheet">
        {/* Close Button */}
        <button
          className="icon-button modal-close"
          type="button"
          onClick={onClose}
          aria-label="关闭"
        >
          <X aria-hidden="true" />
        </button>

        {/* Header Bar */}
        <header className="wq-sheet-header">
          <div className="wq-header-badges">
            <span className="wq-subject-pill">{item.subject}</span>
            <span className={`wq-status-badge wq-status-${status}`}>
              {status}
            </span>
            {item.is_demo ? <span className="demo-data-badge">演示数据</span> : null}
            <time className="wq-created-time">
              录入于 {new Date(item.created_at).toLocaleDateString('zh-CN')}
            </time>
          </div>

          <h2 id="wq-detail-title" className="wq-title-text">
            {item.title}
          </h2>

          <div className="wq-meta-chips">
            <span className="wq-chip kp-chip">
              <Sparkles size={13} aria-hidden="true" /> 考点：{item.knowledge_point}
            </span>
            <span className="wq-chip cause-chip">
              <Stethoscope size={13} aria-hidden="true" /> 错因：{item.cause}
            </span>
            <span className="wq-chip ebbinghaus-chip">
              <RotateCw size={13} aria-hidden="true" /> 已复习 {item.review_count || 0} 次 · 艾宾浩斯
            </span>
          </div>

          {/* Review Due Banner */}
          {status !== '已掌握' && item.next_review_date ? (
            <div className={`wq-review-alert ${reviewInfo.isDue ? 'is-due' : ''}`}>
              <Calendar size={15} />
              <span>复习节奏：{reviewInfo.text}</span>
            </div>
          ) : null}
        </header>

        {/* Structured Sections Container */}
        <div className="wq-cards-container">
          {/* Section: Original Image if uploaded */}
          {item.has_image && item.image_url ? (
            <div className="wq-section-card wq-photo-card">
              <div className="wq-card-header">
                <span className="wq-card-icon icon-blue">
                  <FileImage size={16} />
                </span>
                <h3>错题原图照片</h3>
                <button
                  type="button"
                  className="preview-zoom-btn"
                  onClick={() => setShowImageZoom(true)}
                >
                  <ZoomIn size={14} /> 查看大图
                </button>
              </div>
              <div className="wq-photo-preview-box" onClick={() => setShowImageZoom(true)}>
                <img
                  src={item.image_url}
                  alt="错题原图"
                  className="wq-preview-img"
                />
                <div className="photo-zoom-hint">
                  <Eye size={16} /> 点击全屏查看高清原图
                </div>
              </div>
            </div>
          ) : null}

          {/* Section 1: 基础信息与原题重现 */}
          {parsed.isStructured && parsed.baseInfo ? (
            <div className="wq-section-card wq-card-base">
              <div className="wq-card-header">
                <span className="wq-card-icon icon-blue">
                  <BookOpen size={16} />
                </span>
                <h3>原题精准重现</h3>
              </div>
              <div className="wq-card-body">
                <MathMarkdown content={parsed.baseInfo} />
              </div>
            </div>
          ) : null}

          {/* Section 2: 错因深度诊断 */}
          {parsed.isStructured && parsed.diagnosis ? (
            <div className="wq-section-card wq-card-diagnosis">
              <div className="wq-card-header">
                <span className="wq-card-icon icon-coral">
                  <Stethoscope size={16} />
                </span>
                <h3>错因深度诊断</h3>
                <span className="card-badge badge-warning">思维卡壳定位</span>
              </div>
              <div className="wq-card-body">
                <MathMarkdown content={parsed.diagnosis} />
              </div>
            </div>
          ) : null}

          {/* Section 3: 满分标准解析与规范步骤 */}
          {parsed.isStructured && parsed.solution ? (
            <div className="wq-section-card wq-card-solution">
              <div className="wq-card-header">
                <span className="wq-card-icon icon-green">
                  <CheckCircle2 size={16} />
                </span>
                <h3>满分标准解析 · 踩分点</h3>
                <span className="card-badge badge-success">中考规范步骤</span>
              </div>
              <div className="wq-card-body">
                <MathMarkdown content={parsed.solution} />
              </div>
            </div>
          ) : null}

          {/* Section 4: 提炼与升华 */}
          {parsed.isStructured && parsed.takeaways ? (
            <div className="wq-section-card wq-card-takeaways">
              <div className="wq-card-header">
                <span className="wq-card-icon icon-amber">
                  <Lightbulb size={16} />
                </span>
                <h3>名师提炼 · 解题题眼与避坑</h3>
                <span className="card-badge badge-amber">条件反射</span>
              </div>
              <div className="wq-card-body">
                <MathMarkdown content={parsed.takeaways} />
              </div>
            </div>
          ) : null}

          {/* Section 5: 举一反三（变式训练） */}
          {parsed.isStructured && parsed.variations ? (
            <div className="wq-section-card wq-card-variations">
              <div className="wq-card-header">
                <span className="wq-card-icon icon-purple">
                  <Flame size={16} />
                </span>
                <h3>举一反三 · 变式巩固新题</h3>
                <span className="card-badge badge-purple">巩固测试</span>
              </div>
              <div className="wq-card-body">
                <MathMarkdown content={parsed.variations} />
                {onNavigateToCoach ? (
                  <button
                    type="button"
                    className="wq-coach-link-btn"
                    onClick={handleGoCoachVariation}
                  >
                    <Sparkles size={15} /> 前往 AI 辅导对练此题 <ChevronRight size={15} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Fallback for non-structured / manual summary */}
          {!parsed.isStructured ? (
            <div className="wq-section-card wq-card-general">
              <div className="wq-card-header">
                <span className="wq-card-icon icon-blue">
                  <HelpCircle size={16} />
                </span>
                <h3>AI 深度分析与解题指引</h3>
              </div>
              <div className="wq-card-body">
                <MathMarkdown content={parsed.rawMarkdown} />
              </div>
            </div>
          ) : null}
        </div>

        {/* Status Mastery Tracking Section */}
        <div className="wq-status-control-box">
          <div className="status-control-header">
            <strong>掌握状态追踪</strong>
            <span>基于艾宾浩斯记忆周期（1/3/7/15/30天）智能推算</span>
          </div>

          <div className="status-buttons-grid">
            {statusOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                className={
                  status === opt
                    ? `status-btn status-btn-active status-${opt}`
                    : 'status-btn'
                }
                onClick={() => handleStatusChange(opt)}
                disabled={updating}
              >
                {opt === '已复习' ? (
                  <RotateCw size={15} />
                ) : opt === '已掌握' ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <Calendar size={15} />
                )}
                <span>{opt}</span>
              </button>
            ))}
          </div>

          {updating ? (
            <div className="status-saving-hint">
              <LoaderCircle className="spin" size={14} /> 正在同步复习进度…
            </div>
          ) : null}
        </div>

        {/* Action Toolbar */}
        <footer className="wq-detail-footer">
          {onOpenPrint ? (
            <button
              type="button"
              className="btn-secondary wq-print-btn"
              onClick={() => onOpenPrint(item.id)}
            >
              <Printer size={16} /> 打印本题练习卡
            </button>
          ) : null}

          <button
            className={confirmDelete ? 'wq-delete-btn confirm' : 'wq-delete-btn'}
            type="button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <LoaderCircle className="spin" size={16} /> 删除中…
              </>
            ) : confirmDelete ? (
              <>
                <Trash2 size={16} /> 确认删除此错题
              </>
            ) : (
              <>
                <Trash2 size={16} /> 删除错题
              </>
            )}
          </button>
        </footer>

        {/* Image Zoom Lightbox Modal */}
        {showImageZoom && item.image_url ? (
          <div
            className="lightbox-overlay"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowImageZoom(false)}
          >
            <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="lightbox-close"
                onClick={() => setShowImageZoom(false)}
                aria-label="关闭大图预览"
              >
                <X size={20} />
              </button>
              <img
                src={item.image_url}
                alt="错题高清原图"
                className="lightbox-image"
              />
              <div className="lightbox-caption">
                <span>{item.subject} · {item.title}</span>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
