import { BellRing, Camera, FileImage, LoaderCircle, RotateCw, Sparkles } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { api } from '../api'
import { WrongQuestionDetail } from '../components/WrongQuestionDetail'
import type { WrongQuestion } from '../types'

interface WrongQuestionsViewProps {
  items: WrongQuestion[]
  loading: boolean
  initialFilter?: string
  onRefresh: () => Promise<void>
  onUpdateStatus: (id: number, status: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

const subjects = ['语文', '数学', '英语', '道法', '物理', '化学', '历史']
const statusFilters = ['全部', '到期复习', '待复习', '已复习', '已掌握'] as const

export function WrongQuestionsView({
  items,
  loading,
  initialFilter,
  onRefresh,
  onUpdateStatus,
  onDelete,
}: WrongQuestionsViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [subject, setSubject] = useState('数学')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedItem, setSelectedItem] = useState<WrongQuestion | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter ?? '全部')

  const today = new Date().toISOString().slice(0, 10)

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMessage('')
    try {
      const result = await api.analyzeWrongQuestion(subject, file)
      setMessage(result.demo ? '图片已保存；配置API后将自动分析。' : `已由 ${result.model} 完成整理。`)
      await onRefresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败，请重试')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const dueItemsCount = items.filter(
    (item) => item.review_status !== '已掌握' && item.next_review_date && item.next_review_date <= today
  ).length

  const filteredItems = items.filter((item) => {
    if (statusFilter === '全部') return true
    if (statusFilter === '到期复习') {
      return item.review_status !== '已掌握' && item.next_review_date && item.next_review_date <= today
    }
    return item.review_status === statusFilter
  })

  return (
    <section className="content-view" aria-labelledby="wrong-title">
      <header className="content-header">
        <h1 id="wrong-title">错题整理</h1>
        <p>保留原图、错因和复习建议，基于艾宾浩斯遗忘曲线智能提醒复习。</p>
      </header>

      <div className="upload-panel">
        <div className="field-group">
          <label htmlFor="subject">科目</label>
          <select id="subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
            {subjects.map((item) => <option key={item}>{item}</option>)}
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
        <button className="upload-button" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
          {uploading ? '正在整理…' : '拍照或选择图片'}
        </button>
        {message ? <p className="form-message" role="status">{message}</p> : null}
      </div>

      <div className="section-heading-row list-heading">
        <h2>错题库</h2>
        <span>共 {items.length} 道 · {dueItemsCount > 0 ? <b className="due-count-badge">今日到期 {dueItemsCount} 道</b> : '暂无到期'}</span>
      </div>

      <div className="wq-filter-bar">
        {statusFilters.map((f) => (
          <button
            key={f}
            type="button"
            className={statusFilter === f ? 'filter-chip active' : 'filter-chip'}
            onClick={() => setStatusFilter(f)}
          >
            {f === '到期复习' && dueItemsCount > 0 ? <BellRing size={13} className="chip-badge-icon" /> : null}
            {f} {f === '到期复习' && dueItemsCount > 0 ? `(${dueItemsCount})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="center-state compact"><LoaderCircle className="spin" />加载中…</div>
      ) : (
        <div className="wrong-list">
          {filteredItems.map((item) => {
            const isDue = item.review_status !== '已掌握' && item.next_review_date && item.next_review_date <= today
            return (
              <button
                className={`wrong-item wrong-item-clickable ${isDue ? 'item-due' : ''}`}
                key={item.id}
                type="button"
                onClick={() => setSelectedItem(item)}
              >
                <span className="wrong-file-icon"><FileImage aria-hidden="true" /></span>
                <div>
                  <div className="wrong-meta">
                    <span>{item.subject}</span>
                    <span className={`wq-status-badge wq-status-${item.review_status}`}>{item.review_status}</span>
                    {isDue ? <span className="wq-due-badge"><BellRing size={11} /> 今日到期复习</span> : null}
                    <time>{new Date(item.created_at).toLocaleDateString('zh-CN')}</time>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.ai_summary}</p>
                  <div className="wrong-tags">
                    <span><Sparkles size={14} aria-hidden="true" /> {item.knowledge_point}</span>
                    <span>错因：{item.cause}</span>
                    <span className="ebbinghaus-mini-tag">
                      <RotateCw size={12} /> 复习 {item.review_count || 0} 次
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
          {filteredItems.length === 0 && !loading ? (
            <div className="center-state compact">暂无{statusFilter === '全部' ? '' : `「${statusFilter}」的`}错题</div>
          ) : null}
        </div>
      )}

      {selectedItem ? (
        <WrongQuestionDetail
          item={selectedItem}
          onUpdateStatus={async (id, status) => {
            await onUpdateStatus(id, status)
            setSelectedItem({ ...selectedItem, review_status: status })
          }}
          onDelete={async (id) => {
            await onDelete(id)
            setSelectedItem(null)
          }}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </section>
  )
}
