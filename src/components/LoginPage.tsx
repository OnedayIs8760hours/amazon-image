import { useEffect, useState, type FormEvent } from 'react'

const DEMO_ACCOUNT = 'admin'
const DEMO_PASSWORD = '123456'
const AUTH_STORAGE_KEY = 'amazon-image-studio-authenticated'

type LoginPageProps = {
  onAuthenticated: () => void
}

function SparklesIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5 13.25 8.75 19.5 10l-6.25 1.25L12 17.5l-1.25-6.25L4.5 10l6.25-1.25L12 2.5Z" fill="currentColor" />
      <path d="m19 15 .55 2.45L22 18l-2.45.55L19 21l-.55-2.45L16 18l2.45-.55L19 15ZM5 15l.4 1.6L7 17l-1.6.4L5 19l-.4-1.6L3 17l1.6-.4L5 15Z" fill="currentColor" opacity=".7" />
    </svg>
  )
}

export function hasDemoLoginSession() {
  return sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true'
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    document.title = '登录 · 亚马逊图片工作台'
  }, [])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    window.setTimeout(() => {
      if (account.trim() === DEMO_ACCOUNT && password === DEMO_PASSWORD) {
        sessionStorage.setItem(AUTH_STORAGE_KEY, 'true')
        onAuthenticated()
      } else {
        setError('账号或密码不正确，请使用演示账号登录')
        setSubmitting(false)
      }
    }, 260)
  }

  return (
    <main className="login-shell flex min-h-screen bg-[#f7f7f5] text-gray-900 lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="login-visual relative hidden overflow-hidden text-white lg:block">
        <img src={`${import.meta.env.BASE_URL}creative-assets/scene-creative.png`} alt="AI 创意视觉" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/20" />
        <div className="absolute inset-x-0 bottom-0 p-12 xl:p-16">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-gray-950">
            <SparklesIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-6 max-w-lg text-4xl font-semibold tracking-[-0.04em]">让每一个商品，<br />都拥有专业图片。</h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/65">从 Listing 策划、A+ 内容到图片生成与编辑，在一个创作空间完成。</p>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-950">
              <SparklesIcon className="h-5 w-5" />
            </span>
            <div><p className="text-sm font-semibold">亚马逊图片工作台</p><p className="mt-0.5 text-[11px] text-gray-500">Amazon Image Studio</p></div>
          </div>
          <div className="inline-flex rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-400">团队创作空间</div>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em]">欢迎回来</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">登录后继续你的商品图片策划与创作。</p>
          <form className="mt-8 space-y-5" onSubmit={submit}>
            <label className="block text-xs font-medium text-gray-500">账号
              <input type="text" autoComplete="username" required value={account} onChange={(event) => setAccount(event.target.value)} placeholder="请输入账号" className="login-input mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none transition focus:border-white/25" />
            </label>
            <label className="block text-xs font-medium text-gray-500">密码
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" className="login-input mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none transition focus:border-white/25" />
            </label>
            {error && <div role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
            <button type="submit" disabled={submitting} className="h-12 w-full rounded-full bg-white text-sm font-semibold text-gray-950 transition hover:bg-gray-200 disabled:cursor-wait disabled:opacity-50">{submitting ? '正在登录…' : '登录'}</button>
          </form>
          <p className="mt-5 text-center text-[11px] text-gray-400">演示账号：<span className="font-medium text-gray-600">admin</span> / <span className="font-medium text-gray-600">123456</span></p>
          <p className="mt-5 text-center text-[11px] leading-5 text-gray-400">当前为前端演示登录，账号数据仅用于界面体验。</p>
        </div>
      </section>
    </main>
  )
}
