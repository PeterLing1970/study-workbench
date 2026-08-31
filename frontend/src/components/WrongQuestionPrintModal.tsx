import { Check, CheckSquare, Eye, EyeOff, FileText, Printer, Square, X } from 'lucide-react'
import { useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { WrongQuestion } from '../types'
import { MathMarkdown } from './MathMarkdown'

interface WrongQuestionPrintModalProps {
  items: WrongQuestion[]
  initialSelectedId?: number | null
  onClose: () => void
}

type PrintMode = 'practice' | 'review'

export function WrongQuestionPrintModal({
  items,
  initialSelectedId,
  onClose,
}: WrongQuestionPrintModalProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)
  const [selectedIds, setSelectedIds] = useState<number[]>(
    initialSelectedId ? [initialSelectedId] : items.map((item) => item.id)
  )
  const [printMode, setPrintMode] = useState<PrintMode>('practice')

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    setSelectedIds(items.map((item) => item.id))
  }

  const clearAll = () => {
    setSelectedIds([])
  }

  const selectedQuestions = items.filter((item) => selectedIds.includes(item.id))

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      ref={dialogRef}
      className="modal-overlay print-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-modal-title"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="modal-sheet print-modal-sheet">
        <header className="print-modal-header no-print">
          <div className="print-modal-title-group">
            <span className="print-header-icon">
              <Printer aria-hidden="true" />
            </span>
            <div>
              <h2 id="print-modal-title">错题打印与组卷重练</h2>
              <p>生成标准 A4 错题练习卷或复习手册，支持一键打印与导出 PDF。</p>
            </div>
          </div>
          <button
            className="icon-button modal-close"
            type="button"
            onClick={onClose}
            aria-label="关闭"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {/* Print Controls Toolbar */}
        <div className="print-toolbar no-print">
          <div className="print-mode-selector">
            <span className="toolbar-label">打印模式：</span>
            <button
              type="button"
              className={printMode === 'practice' ? 'mode-btn active' : 'mode-btn'}
              onClick={() => setPrintMode('practice')}
            >
              <EyeOff size={15} />
              <span>练习模式（隐藏解析，留白自测）</span>
            </button>
            <button
              type="button"
              className={printMode === 'review' ? 'mode-btn active' : 'mode-btn'}
              onClick={() => setPrintMode('review')}
            >
              <Eye size={15} />
              <span>复习模式（包含错因与满分解析）</span>
            </button>
          </div>

          <div className="print-action-bar">
            <div className="selection-stats">
              <span>
                已选 <strong>{selectedQuestions.length}</strong> / {items.length} 题
              </span>
              <button type="button" className="text-btn" onClick={selectAll}>
                <CheckSquare size={13} /> 全选
              </button>
              <button type="button" className="text-btn" onClick={clearAll}>
                <Square size={13} /> 清空
              </button>
            </div>
            <button
              type="button"
              className="btn-primary print-trigger-btn"
              onClick={handlePrint}
              disabled={selectedQuestions.length === 0}
            >
              <Printer size={16} /> 立即打印 / 导出 PDF
            </button>
          </div>
        </div>

        {/* Question Selector List (Hidden during print) */}
        <div className="print-question-selector no-print">
          <div className="selector-grid">
            {items.map((item, idx) => {
              const isSelected = selectedIds.includes(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`selector-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelect(item.id)}
                >
                  <span className="selector-check">
                    {isSelected ? <Check size={14} /> : null}
                  </span>
                  <span className="selector-num">第 {idx + 1} 题</span>
                  <span className="selector-sub">{item.subject}</span>
                  <strong className="selector-title">{item.title}</strong>
                </button>
              )
            })}
          </div>
        </div>

        {/* Printable Paper Area (Shown on screen as preview and styled specifically for @media print) */}
        <div className="printable-paper-wrapper">
          <div className="printable-paper">
            {/* Paper Header */}
            <div className="paper-header">
              <div className="paper-meta-top">
                <span>班级：___________</span>
                <span>姓名：___________</span>
                <span>日期：___________</span>
                <span>得分：___________</span>
              </div>
              <h1 className="paper-title">
                {printMode === 'practice' ? '错题重练与巩固自测试卷' : '错题复习与解析精解手册'}
              </h1>
              <p className="paper-subtitle">
                共 {selectedQuestions.length} 道题目 · 基于温故知新艾宾浩斯强化
              </p>
            </div>

            {/* Question Items */}
            {selectedQuestions.length === 0 ? (
              <div className="empty-print-state no-print">
                <FileText size={36} />
                <p>请至少勾选一道错题进行打印</p>
              </div>
            ) : (
              <div className="paper-questions-list">
                {selectedQuestions.map((item, index) => (
                  <article className="paper-question-card" key={item.id}>
                    <div className="paper-q-header">
                      <span className="paper-q-index">第 {index + 1} 题</span>
                      <span className="paper-q-subject">【{item.subject}】</span>
                      <span className="paper-q-kp">考点：{item.knowledge_point}</span>
                    </div>

                    <h3 className="paper-q-title">{item.title}</h3>

                    {/* Image if available */}
                    {item.has_image && item.image_url ? (
                      <div className="paper-q-image-box">
                        <img
                          src={item.image_url}
                          alt={item.title}
                          className="paper-q-image"
                        />
                      </div>
                    ) : null}

                    {/* Question Content / Solution Content depending on mode */}
                    {printMode === 'practice' ? (
                      <div className="paper-practice-area">
                        {/* Preserve the v0.4.3 on-screen preview; use the stricter extraction only on paper. */}
                        <div className="paper-summary-snippet print-preview-only">
                          <MathMarkdown content={extractQuestionOnly(item.ai_summary)} />
                        </div>
                        <div className="paper-summary-snippet print-output-only">
                          <MathMarkdown content={extractQuestionForPrint(item.ai_summary)} />
                        </div>
                        <div className="paper-answer-blank">
                          <div className="answer-grid-lines">
                            <span className="blank-label">【答题区 / 解题步骤】</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="paper-review-area">
                        <div className="paper-review-tags">
                          <span className="paper-tag-cause">原错因：{item.cause}</span>
                          <span className="paper-tag-count">已复习 {item.review_count || 0} 次</span>
                        </div>
                        <div className="paper-review-content">
                          <MathMarkdown content={item.ai_summary} />
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <div className="paper-footer">
              <span>AI学习助手 · 错题强化卷</span>
              <span>让每一道错题都成为提分的阶梯</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * Extracts question/problem context only if structured template is present,
 * or returns full content if not strictly structured.
 */
function extractQuestionOnly(fullText: string): string {
  if (!fullText) return ''
  if (fullText.includes('原题重现：')) {
    const parts = fullText.split('🩺 错因深度诊断')
    return parts[0].trim()
  }
  return fullText
}

function extractQuestionForPrint(fullText: string): string {
  if (!fullText) return ''

  const diagnosisIndex = fullText.search(/(?:🩺\s*)?错因深度诊断/)
  const questionSection = diagnosisIndex >= 0 ? fullText.slice(0, diagnosisIndex) : fullText
  const originalQuestion = questionSection.match(
    /(?:\*\*)?原题重现(?:\*\*)?\s*[：:]\s*([\s\S]*)$/
  )

  if (originalQuestion?.[1]?.trim()) return originalQuestion[1].trim()

  if (diagnosisIndex >= 0 || /基础信息|满分标准解析|错因/.test(fullText)) return ''

  return fullText.trim()
}
