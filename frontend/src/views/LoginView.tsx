import { FormEvent, useState } from 'react'
import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, UserRound } from 'lucide-react'

interface LoginViewProps {
  onLogin: (username: string, password: string) => Promise<void>
  serviceError?: string
}

export function LoginView({ onLogin, serviceError = '' }: LoginViewProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await onLogin(username.trim(), password)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-mark">学</span>
          <div><strong>AI学习助手</strong><small>智能错题 · 一对一辅导</small></div>
        </div>

        <div className="login-copy">
          <h1 id="login-title">欢迎回来</h1>
          <p>登录后继续今天的学习。</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label htmlFor="username">账号</label>
          <div className="login-input">
            <UserRound size={19} aria-hidden="true" />
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入账号"
              required
              minLength={3}
              autoFocus
            />
          </div>

          <label htmlFor="password">密码</label>
          <div className="login-input">
            <LockKeyhole size={19} aria-hidden="true" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error || serviceError ? <p className="login-error" role="alert">{error || serviceError}</p> : null}
          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? <LoaderCircle className="spin" size={20} /> : <LogIn size={20} />}
            {submitting ? '正在登录…' : '登录 AI学习助手'}
          </button>
        </form>

        <p className="login-note">学生和家长使用各自账号，均由家庭管理员在 NAS 中设置。</p>
      </section>
    </main>
  )
}
