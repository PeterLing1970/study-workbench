import {
  BellRing,
  BookOpen,
  Camera,
  FileImage,
  Filter,
  LoaderCircle,
  Printer,
  RotateCw,
  Search,
  Sparkles,
  Stethoscope,
  X
} from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { api } from '../api'
import { ImageCropModal } from '../components/ImageCropModal'
import { WrongQuestionDetail } from '../components/WrongQuestionDetail'
import { WrongQuestionPrintModal } from '../components/WrongQuestionPrintModal'
import type { WrongQuestion } from '../types'

interface WrongQuestionsViewProps {
  items: WrongQuestion[]
  loading: boolean
  initialFilter?: string
  onRefresh: () => Promise<void>
  onUpdateStatus: (id: number, status: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onNavigateToCoach?: (item: WrongQuestion, prompt?: string) => void
}

const subjects = ['全部', '数学', '物理', '化学', '语文', '英语', '道法', '历史'] as const
const uploadSubjects = ['数学', '物理', '化学', '语文', '英语', '道法', '历史'] as const
const statusFilters = ['全部', '到期复习', '待复习', '已复习', '已掌握'] as const

function cleanPreviewText(text: string): string {
  if (!text) return ''
  // Strip markdown markers and emojis for clean card summary
  let cleaned = text
    .replace(/[#*`_~]/g, '')
    .replace(/🏷️|🩺|✅|💡|🚀/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length > 120) {
    cleaned = cleaned.slice(0, 120) + '…'
  }
  return cleaned
}

export function WrongQuestionsView({
  items,
  loading,
  initialFilter,
  onRefresh,
  onUpdateStatus,
  onDelete,
  onNavigateToCoach,
}: WrongQuestionsViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadSubject, setUploadSubject] = useState('数学')
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [selectedItem, setSelectedItem] = useState<WrongQuestion | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter ?? '全部')
  const [subjectFilter, setSubjectFilter] = useState<string>('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [printSelectedId, setPrintSelectedId] = useState<number | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const uploadFile = async (file: File) => {
    setUploading(true)
    setMessage('')
    try {
      const result = await api.analyzeWrongQuestion(uploadSubject, file)
      setMessage(
        result.demo
          ? '图片已保存，但AI暂未生成可用分析，请稍后重试。'
          : `已由 ${result.model} 完成深度整理与 LaTeX 公式排版。`,
      )
      await onRefresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败，请重试')
    } finally {
      setUploading(false)
    }
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMessage('')
    setPendingFile(file)
    event.target.value = ''
  }

  const dueItemsCount = items.filter(
    (item) =>
      item.review_status !== '已掌握' &&
      item.next_review_date &&
      item.next_review_date <= today
  ).length

  const filteredItems = items.filter((item) => {
    // Subject filter
    if (subjectFilter !== '全部' && item.subject !== subjectFilter) {
      return false
    }

    // Status filter
    if (statusFilter === '到期复习') {
      if (item.review_status === '已掌握' || !item.next_review_date || item.next_review_date > today) {
        return false
      }
    } else if (statusFilter !== '全部' && item.review_status !== statusFilter) {
      return false
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      const matchTitle = item.title.toLowerCase().includes(q)
      const matchKp = item.knowledge_point.toLowerCase().includes(q)
      const matchCause = item.cause.toLowerCase().includes(q)
      const matchSummary = item.ai_summary.toLowerCase().includes(q)
      if (!matchTitle && !matchKp && !matchCause && !matchSummary) {
        return false
      }
    }

    return true
  })

  const handleOpenSinglePrint = (id: number) => {
    setPrintSelectedId(id)
    setIsPrintModalOpen(true)
  }

  const handleOpenBatchPrint = () => {
    setPrintSelectedId(null)
    setIsPrintModalOpen(true)
  }

  return (
    <section className="content-view wq-view-container" aria-labelledby="wrong-title">
      <header className="content-header wq-main-header">
        <div className="wq-header-text">
          <h1 id="wrong-title">错题整理本</h1>
          <p>
            智能识别原题照片，规范 LaTeX
            公式排版与中考踩分点诊断；基于艾宾浩斯记忆曲线定时复习。
          </p>
        </div>
        <div className="wq-header-actions">
          <button
            type="button"
            className="batch-print-btn"
            onClick={handleOpenBatchPrint}
            title="打印或导出错题练习卷"
            disabled={items.length === 0}
          >
            <Printer size={16} />
            <span>打印组卷 / 导出</span>
          </button>
        </div>
      </header>

      {/* Upload & OCR Panel */}
      <div className="upload-panel wq-upload-card">
        <div className="upload-fields-row">
          <div className="field-group">
            <label htmlFor="upload-subject">学科选择</label>
            <select
              id="upload-subject"
              value={uploadSubject}
              onChange={(e) => setUploadSubject(e.target.value)}
            >
              {uploadSubjects.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={handleFile}
          />

          <button
            className="upload-button wq-scan-trigger-btn"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            ) : (
              <Camera size={18} aria-hidden="true" />
            )}
            <span>{uploading ? 'AI 正在识别排版…' : '拍照或上传错题'}</span>
          </button>
        </div>

        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
      </div>

      {/* Filter and Search Bar Section */}
      <div className="wq-filter-control-panel">
        {/* Subject Chips */}
        <div className="wq-subject-filter-row">
          <span className="filter-row-label">
            <Filter size={13} /> 学科：
          </span>
          <div className="wq-chips-scroll">
            {subjects.map((sub) => (
              <button
                key={sub}
                type="button"
                className={subjectFilter === sub ? 'filter-chip active' : 'filter-chip'}
                onClick={() => setSubjectFilter(sub)}
              >
                {sub}
              </button>
            ))}
          </div>
        </div>

        {/* Status Chips */}
        <div className="wq-status-filter-row">
          <span className="filter-row-label">
            <RotateCw size={13} /> 状态：
          </span>
          <div className="wq-chips-scroll">
            {statusFilters.map((f) => (
              <button
                key={f}
                type="button"
                className={statusFilter === f ? 'filter-chip active' : 'filter-chip'}
                onClick={() => setStatusFilter(f)}
              >
                {f === '到期复习' && dueItemsCount > 0 ? (
                  <BellRing size={13} className="chip-badge-icon" />
                ) : null}
                {f} {f === '到期复习' && dueItemsCount > 0 ? `(${dueItemsCount})` : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="wq-search-bar">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="wq-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索考点、错因、题目标题或关键词…"
          />
          {searchQuery ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="清空搜索"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Stats Heading */}
      <div className="section-heading-row list-heading">
        <h2>
          错题列表{' '}
          <small className="heading-count">
            （显示 {filteredItems.length} / 共 {items.length} 题）
          </small>
        </h2>
        <span>
          {dueItemsCount > 0 ? (
            <b className="due-count-badge">
              <BellRing size={13} /> 今日到期 {dueItemsCount} 道待复习
            </b>
          ) : (
            '今日无逾期待复习'
          )}
        </span>
      </div>

      {/* Wrong Question Cards List */}
      {loading ? (
        <div className="center-state compact">
          <LoaderCircle className="spin" /> 加载错题库中…
        </div>
      ) : (
        <div className="wrong-list-v2">
          {filteredItems.map((item) => {
            const isDue =
              item.review_status !== '已掌握' &&
              item.next_review_date &&
              item.next_review_date <= today
            const previewSnippet = cleanPreviewText(item.ai_summary)

            return (
              <article
                className={`wrong-card-v2 ${isDue ? 'item-is-due' : ''}`}
                key={item.id}
                onClick={() => setSelectedItem(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedItem(item)
                  }
                }}
              >
                {/* Card Top Row */}
                <div className="card-top-row">
                  <div className="card-badge-group">
                    <span className="card-subject-badge">{item.subject}</span>
                    <span className={`wq-status-badge wq-status-${item.review_status}`}>
                      {item.review_status}
                    </span>
                    {isDue ? (
                      <span className="wq-due-badge">
                        <BellRing size={11} /> 今日到期
                      </span>
                    ) : null}
                    {item.is_demo ? <span className="demo-data-badge">演示</span> : null}
                  </div>

                  <time className="card-time">
                    {new Date(item.created_at).toLocaleDateString('zh-CN')}
                  </time>
                </div>

                {/* Card Main Body */}
                <div className="card-main-content">
                  {item.has_image && item.image_url ? (
                    <div className="card-thumb-box">
                      <img
                        src={item.image_url}
                        alt="原图缩略"
                        className="card-thumb-img"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="card-thumb-placeholder">
                      <FileImage size={22} />
                    </div>
                  )}

                  <div className="card-text-wrapper">
                    <h3 className="card-title">{item.title}</h3>
                    <p className="card-preview-text">{previewSnippet || '点击查看深度排版与满分踩分点解析…'}</p>
                  </div>
                </div>

                {/* Card Footer Tags */}
                <div className="card-footer-tags">
                  <span className="card-tag tag-kp">
                    <Sparkles size={12} /> {item.knowledge_point}
                  </span>
                  <span className="card-tag tag-cause">
                    <Stethoscope size={12} /> 错因：{item.cause}
                  </span>
                  <span className="card-tag tag-ebbinghaus">
                    <RotateCw size={12} /> 复习 {item.review_count || 0} 次
                  </span>
                </div>
              </article>
            )
          })}

          {filteredItems.length === 0 && !loading ? (
            <div className="center-state compact wq-empty-card">
              <BookOpen size={36} />
              <p>
                暂无符合条件的错题
                {subjectFilter !== '全部' ? `（${subjectFilter}）` : ''}
                {statusFilter !== '全部' ? `（${statusFilter}）` : ''}
              </p>
              <span>可尝试切换学科筛选或上传新错题。</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Wrong Question Detail Modal */}
      {selectedItem ? (
        <WrongQuestionDetail
          item={selectedItem}
          onUpdateStatus={async (id, status) => {
            await onUpdateStatus(id, status)
            setSelectedItem((prev) => (prev ? { ...prev, review_status: status } : null))
          }}
          onDelete={async (id) => {
            await onDelete(id)
            setSelectedItem(null)
          }}
          onClose={() => setSelectedItem(null)}
          onOpenPrint={handleOpenSinglePrint}
          onNavigateToCoach={onNavigateToCoach}
        />
      ) : null}

      {/* Wrong Question Print / Export Modal */}
      {isPrintModalOpen ? (
        <WrongQuestionPrintModal
          items={items}
          initialSelectedId={printSelectedId}
          onClose={() => {
            setIsPrintModalOpen(false)
            setPrintSelectedId(null)
          }}
        />
      ) : null}
      {pendingFile ? (
        <ImageCropModal
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={(file) => {
            setPendingFile(null)
            void uploadFile(file)
          }}
        />
      ) : null}
    </section>
  )
}
