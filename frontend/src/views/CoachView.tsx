import { Bot, BookOpen, BrainCircuit, LoaderCircle, Send, Trash2, User } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { MathMarkdown } from '../components/MathMarkdown'
import type { ChatMessage, WrongQuestion } from '../types'

interface CoachViewProps {
  initialSubject?: string
  initialQuestion?: string
}

const subjects = ['全部', '数学', '物理', '化学', '语文', '英语', '道法', '历史']
const agentOptions = [
  { value: 'auto', label: '智能路由', description: 'MiniMax 主服务，DeepSeek V4 Flash 自动备用' },
  { value: 'minimax', label: 'MiniMax M3', description: '适合综合讲解与图片题' },
  { value: 'deepseek_flash', label: 'DeepSeek V4 Flash', description: '响应更快，适合日常答疑与快速讲解' },
  { value: 'deepseek_pro', label: 'DeepSeek V4 Pro', description: '能力更强，适合复杂数理推理与分步分析' },
] as const
type AgentChoice = typeof agentOptions[number]['value']

export function CoachView({ initialSubject, initialQuestion }: CoachViewProps = {}) {
  const [subject, setSubject] = useState(initialSubject || '全部')
  const [question, setQuestion] = useState(initialQuestion || '')
  const [thought, setThought] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)
  const [agentChoice, setAgentChoice] = useState<AgentChoice>('auto')
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([])
  const [showWrongPicker, setShowWrongPicker] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (initialSubject) setSubject(initialSubject)
    if (initialQuestion) {
      setQuestion(initialQuestion)
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [initialSubject, initialQuestion])

  // Load chat history from backend
  const loadHistory = async (targetSubject: string) => {
    setLoadingHistory(true)
    try {
      const records = await api.chatHistory(targetSubject)
      const formatted: ChatMessage[] = []
      for (const r of records) {
        formatted.push({
          id: r.id,
          role: 'student',
          content: r.student_thought ? `${r.question}\n\n💡 我的思路：${r.student_thought}` : r.question,
          subject: r.subject,
          created_at: r.created_at,
        })
        formatted.push({
          id: r.id,
          role: 'ai',
          content: r.answer,
          model: r.demo ? '演示模式' : r.model,
          demo: r.demo,
          subject: r.subject,
          created_at: r.created_at,
        })
      }
      setMessages(formatted)
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    void loadHistory(subject)
  }, [subject])

  useEffect(() => {
    void api.wrongQuestions()
      .then((items) => setWrongQuestions(items.filter((item) => !item.is_demo)))
      .catch(() => setWrongQuestions([]))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleClearHistory = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    try {
      await api.clearChatHistory(subject)
      setMessages([])
      setConfirmClear(false)
    } catch {
      // ignore
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const q = question.trim()
    if (!q || loading) return

    const askSubject = subject === '全部' ? '数学' : subject
    const studentMsg: ChatMessage = {
      role: 'student',
      content: thought.trim() ? `${q}\n\n💡 我的思路：${thought.trim()}` : q,
      subject: askSubject,
    }
    setMessages((prev) => [...prev, studentMsg])
    setQuestion('')
    setThought('')
    setLoading(true)

    try {
      const result = await api.coach(askSubject, q, thought.trim(), agentChoice)
      const aiMsg: ChatMessage = {
        role: 'ai',
        content: result.answer,
        model: result.demo ? '演示模式' : result.model,
        demo: result.demo,
        subject: askSubject,
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch (err) {
      const errMsg: ChatMessage = {
        role: 'ai',
        content: err instanceof Error ? err.message : 'AI 暂时无法回答，请稍后重试。',
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const importWrongQuestion = (item: WrongQuestion) => {
    setSubject(item.subject)
    setQuestion([
      item.title,
      `知识点：${item.knowledge_point}`,
      `原错因：${item.cause}`,
      item.ai_summary ? `已有分析：${item.ai_summary}` : '',
      '请根据这道错题分步引导我重新理解和作答。',
    ].filter(Boolean).join('\n'))
    setShowWrongPicker(false)
    textareaRef.current?.focus()
  }

  return (
    <section className="content-view coach-view" aria-labelledby="coach-title">
      <header className="content-header coach-header-row">
        <div>
          <h1 id="coach-title">AI 辅导</h1>
          <p>选择科目后提问，AI 会分步引导思考；历史对话自动保存。</p>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            className={confirmClear ? 'clear-history-btn confirm' : 'clear-history-btn'}
            onClick={handleClearHistory}
            title="清空历史对话"
          >
            <Trash2 size={15} />
            <span>{confirmClear ? '确认清空' : '清空历史'}</span>
          </button>
        ) : null}
      </header>

      <div className="coach-subject-bar">
        {subjects.map((s) => (
          <button
            key={s}
            type="button"
            className={subject === s ? 'subject-chip active' : 'subject-chip'}
            onClick={() => setSubject(s)}
            aria-pressed={subject === s}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="coach-tools-row">
        <label className="agent-selector" htmlFor="coach-agent">
          <BrainCircuit size={17} aria-hidden="true" />
          <span>AI智能体</span>
          <select id="coach-agent" value={agentChoice} onChange={(e) => setAgentChoice(e.target.value as AgentChoice)}>
            {agentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <span className="agent-description">{agentOptions.find((option) => option.value === agentChoice)?.description}</span>
        <button className="import-wrong-btn" type="button" onClick={() => setShowWrongPicker((value) => !value)}>
          <BookOpen size={17} aria-hidden="true" /> 从错题导入
        </button>
      </div>

      {showWrongPicker ? (
        <section className="wrong-import-panel" aria-label="选择要导入的错题">
          <strong>选择错题</strong>
          {wrongQuestions.length > 0 ? (
            <div className="wrong-import-list">
              {wrongQuestions.map((item) => (
                <button key={item.id} type="button" onClick={() => importWrongQuestion(item)}>
                  <span>{item.subject}</span>
                  <strong>{item.title}</strong>
                  <small>{item.knowledge_point}</small>
                </button>
              ))}
            </div>
          ) : <p>还没有可导入的真实错题，请先到“错题”页面拍照或录入。</p>}
        </section>
      ) : null}

      <div className="chat-container">
        {loadingHistory ? (
          <div className="center-state compact">
            <LoaderCircle className="spin" size={20} />
            <span>加载对话历史…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <Bot size={42} strokeWidth={1.4} />
            <p>选好科目，输入题目或问题开始辅导</p>
            <span>AI 会分步提示解题思路，所有问答将持久保存</span>
          </div>
        ) : (
          <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions">
            {messages.map((msg, i) => (
              <div className={`chat-bubble chat-${msg.role}`} key={i}>
                <span className="chat-avatar">
                  {msg.role === 'student' ? <User size={18} /> : <Bot size={18} />}
                </span>
                <div className="chat-content">
                  {msg.subject ? (
                    <span className="chat-subject-tag">{msg.subject}</span>
                  ) : null}
                  {msg.role === 'ai' && msg.model ? (
                    <span className={msg.demo ? 'chat-model demo' : 'chat-model'}>{msg.model}</span>
                  ) : null}
                  <div className="chat-text">
                    <MathMarkdown content={msg.content} />
                  </div>
                </div>
              </div>
            ))}
            {loading ? (
              <div className="chat-bubble chat-ai">
                <span className="chat-avatar"><Bot size={18} /></span>
                <div className="chat-content" role="status">
                  <span className="chat-thinking"><LoaderCircle className="spin" size={16} /> 正在思考…</span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="chat-input-group">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={question}
            onChange={(e) => { setQuestion(e.target.value); autoResize(e.target) }}
            placeholder={subject === '全部' ? '输入题目或问题（默认数学）…' : `输入${subject}题目或问题…`}
            aria-label={subject === '全部' ? '输入题目或问题，默认数学' : `输入${subject}题目或问题`}
            rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }}
          />
          <input
            className="chat-thought-input"
            value={thought}
            onChange={(e) => setThought(e.target.value)}
            placeholder="我的思路（可选）"
            aria-label="我的思路，可选"
          />
        </div>
        <button className="chat-send" type="submit" disabled={loading || !question.trim()} aria-label="发送">
          {loading ? <LoaderCircle className="spin" size={20} /> : <Send size={20} />}
        </button>
      </form>
    </section>
  )
}
