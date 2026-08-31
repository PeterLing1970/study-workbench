import { Check, Flame, LoaderCircle, Music, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { Task } from '../types'

interface FocusSessionProps {
  task: Task
  onClose: () => void
  onComplete: () => void
}

type TimerMode = 'task' | 'pomodoro' | 'break'

// Web Audio synthesizer for white noise & focus ambiance
class AmbientSound {
  private ctx: AudioContext | null = null
  private node: AudioNode | null = null
  private isRunning = false

  start(type: 'rain' | 'waves' | 'brown') {
    if (this.isRunning) this.stop()
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AudioCtx()
      const bufferSize = this.ctx.sampleRate * 2
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const data = buffer.getChannelData(0)
      let lastOut = 0.0

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        if (type === 'brown' || type === 'waves') {
          // Brown noise integration
          lastOut = (lastOut + 0.02 * white) / 1.02
          data[i] = lastOut * 3.5
        } else {
          // Pink / soft rain noise filter
          data[i] = (Math.random() * 2 - 1) * 0.15
        }
      }

      const noise = this.ctx.createBufferSource()
      noise.buffer = buffer
      noise.loop = true

      const filter = this.ctx.createBiquadFilter()
      filter.type = type === 'rain' ? 'lowpass' : 'bandpass'
      filter.frequency.value = type === 'rain' ? 800 : 400

      const gain = this.ctx.createGain()
      gain.gain.value = 0.18

      noise.connect(filter)
      filter.connect(gain)
      gain.connect(this.ctx.destination)

      noise.start()
      this.node = noise
      this.isRunning = true
    } catch {
      // AudioContext unavailable
    }
  }

  stop() {
    try {
      if (this.node && 'stop' in this.node) {
        (this.node as AudioBufferSourceNode).stop()
      }
      this.ctx?.close()
    } catch {
      // ignore
    } finally {
      this.ctx = null
      this.node = null
      this.isRunning = false
    }
  }

  active() {
    return this.isRunning
  }
}

export function FocusSession({ task, onClose, onComplete }: FocusSessionProps) {
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro')
  const [running, setRunning] = useState(true)
  const [secondsLeft, setSecondsLeft] = useState(25 * 60)
  const [actualSeconds, setActualSeconds] = useState(0)
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0)
  const [soundActive, setSoundActive] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [savingRecord, setSavingRecord] = useState(false)

  const soundRef = useRef<AmbientSound | null>(null)
  const closeSession = () => {
    soundRef.current?.stop()
    onClose()
  }
  const dialogRef = useDialogA11y<HTMLDivElement>(closeSession)

  useEffect(() => {
    soundRef.current = new AmbientSound()
    return () => {
      soundRef.current?.stop()
    }
  }, [])

  // Timer countdown & elapsed counter
  useEffect(() => {
    if (!running || secondsLeft <= 0) return
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
      if (timerMode !== 'break') {
        setActualSeconds((s) => s + 1)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, secondsLeft, timerMode])

  // Timer complete handler
  useEffect(() => {
    if (secondsLeft === 0) {
      if (timerMode === 'pomodoro') {
        setPomodorosCompleted((c) => c + 1)
        // Transition to short break
        setTimerMode('break')
        setSecondsLeft(5 * 60)
      } else if (timerMode === 'break') {
        // Back to pomodoro
        setTimerMode('pomodoro')
        setSecondsLeft(25 * 60)
      } else if (timerMode === 'task') {
        setShowFeedback(true)
      }
    }
  }, [secondsLeft, timerMode])

  const toggleSound = () => {
    if (soundActive) {
      soundRef.current?.stop()
      setSoundActive(false)
    } else {
      soundRef.current?.start('waves')
      setSoundActive(true)
    }
  }

  const switchMode = (mode: TimerMode) => {
    setTimerMode(mode)
    if (mode === 'pomodoro') setSecondsLeft(25 * 60)
    else if (mode === 'break') setSecondsLeft(5 * 60)
    else if (mode === 'task') setSecondsLeft(task.minutes * 60)
  }

  const handleFinish = async (_mastery: 'mastered' | 'need_practice') => {
    setSavingRecord(true)
    try {
      await api.saveFocusRecord({
        task_id: task.id,
        subject: task.subject,
        title: task.title,
        planned_seconds: task.minutes * 60,
        actual_seconds: actualSeconds,
        pomodoros_completed: pomodorosCompleted + (timerMode === 'pomodoro' && actualSeconds >= 1500 ? 1 : 0),
      })
    } catch {
      // continue anyway
    } finally {
      setSavingRecord(false)
      soundRef.current?.stop()
      onComplete()
    }
  }

  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const seconds = (secondsLeft % 60).toString().padStart(2, '0')
  const totalActualMinutes = Math.round(actualSeconds / 60)

  return (
    <div ref={dialogRef} className="focus-overlay" role="dialog" aria-modal="true" aria-labelledby="focus-title" tabIndex={-1}>
      <section className="focus-sheet pomodoro-sheet">
        <button className="icon-button focus-close" type="button" onClick={closeSession} aria-label="关闭专注学习">
          <X aria-hidden="true" />
        </button>

        {!showFeedback ? (
          <>
            <div className="focus-mode-selector">
              <button
                type="button"
                className={`mode-chip ${timerMode === 'pomodoro' ? 'active' : ''}`}
                onClick={() => switchMode('pomodoro')}
              >
                <Flame size={14} /> 番茄钟 (25分)
              </button>
              <button
                type="button"
                className={`mode-chip ${timerMode === 'task' ? 'active' : ''}`}
                onClick={() => switchMode('task')}
              >
                任务时长 ({task.minutes}分)
              </button>
              <button
                type="button"
                className={`mode-chip ${timerMode === 'break' ? 'active' : ''}`}
                onClick={() => switchMode('break')}
              >
                休息 (5分)
              </button>
            </div>

            <span className="focus-subject">{task.subject}</span>
            <h2 id="focus-title">{task.title}</h2>

            <div className={`focus-time ${timerMode === 'break' ? 'break-mode' : ''}`} aria-live="polite">
              {minutes}:{seconds}
            </div>

            <div className="pomodoro-tracker">
              {Array.from({ length: Math.max(4, pomodorosCompleted + 1) }).map((_, i) => (
                <span
                  key={i}
                  className={`pomodoro-dot ${i < pomodorosCompleted ? 'filled' : i === pomodorosCompleted && timerMode === 'pomodoro' ? 'current' : ''}`}
                  title={`番茄 ${i + 1}`}
                />
              ))}
              <span className="pomodoro-count-label">已专注 {totalActualMinutes} 分钟 · {pomodorosCompleted} 个番茄</span>
            </div>

            <div className="focus-controls">
              <button className="focus-toggle" type="button" onClick={() => setRunning((value) => !value)}>
                {running ? <Pause aria-hidden="true" fill="currentColor" /> : <Play aria-hidden="true" fill="currentColor" />}
                {running ? '暂停' : '继续'}
              </button>

              <button
                type="button"
                className={`sound-toggle-btn ${soundActive ? 'active' : ''}`}
                onClick={toggleSound}
                title={soundActive ? '关闭白噪音' : '开启沉浸白噪音'}
              >
                {soundActive ? <Volume2 size={18} /> : <VolumeX size={18} />}
                <span>{soundActive ? '海浪声' : '白噪音'}</span>
              </button>

              <button
                type="button"
                className="btn-reset-timer"
                onClick={() => {
                  setRunning(false)
                  if (timerMode === 'pomodoro') setSecondsLeft(25 * 60)
                  else if (timerMode === 'break') setSecondsLeft(5 * 60)
                  else setSecondsLeft(task.minutes * 60)
                }}
                title="重置本节"
              >
                <RotateCcw size={16} />
              </button>
            </div>

            <button className="focus-complete" type="button" onClick={() => setShowFeedback(true)}>
              <Check aria-hidden="true" /> 完成本次学习
            </button>
          </>
        ) : (
          <div className="focus-feedback-card">
            <h3>🎉 太棒了！本次专注结束</h3>
            <p>本次学习累计专注 <strong>{totalActualMinutes} 分钟</strong>（{pomodorosCompleted} 个番茄钟）。</p>
            <p className="feedback-prompt">请选择你对本次任务的掌握程度：</p>

            <div className="feedback-buttons">
              <button
                type="button"
                className="feedback-btn mastered"
                onClick={() => handleFinish('mastered')}
                disabled={savingRecord}
              >
                {savingRecord ? <LoaderCircle className="spin" size={16} /> : <Check size={18} />}
                <strong>已掌握</strong>
                <small>知识点已消化，按时推进</small>
              </button>
              <button
                type="button"
                className="feedback-btn need-practice"
                onClick={() => handleFinish('need_practice')}
                disabled={savingRecord}
              >
                {savingRecord ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={18} />}
                <strong>仍不熟练</strong>
                <small>建议后续安排错题或专项复习</small>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
