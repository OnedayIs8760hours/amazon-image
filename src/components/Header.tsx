import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useTooltip } from '../hooks/useTooltip'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import ViewportTooltip from './ViewportTooltip'
import HelpModal from './HelpModal'
import { HelpCircleIcon, InstallIcon, SettingsIcon } from './icons'
import { Button } from './Button'
import { isLocalAppHostname } from '../lib/pwa'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type AppView = 'home' | 'editor' | 'tagger'

type HeaderProps = {
  activeView: AppView
  onNavigate: (view: AppView) => void
}

const LOCAL_INSTALL_REMINDER = '这是本地版。安装后，下次启动应用前仍需要先打开项目目录中的 start-amazon-image-studio.bat，保持本地服务运行；否则应用无法使用。'

function isInstalledPwa() {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export default function Header({ activeView, onNavigate }: HeaderProps) {
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const [showHelp, setShowHelp] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(isInstalledPwa)
  const isLocalApp = isLocalAppHostname(window.location.hostname)

  const installTooltip = useTooltip()
  const helpTooltip = useTooltip()
  const settingsTooltip = useTooltip()

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setIsPwaInstalled(false)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsPwaInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const promptInstall = async (promptEvent: BeforeInstallPromptEvent) => {
    setInstallPrompt(null)

    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      setIsPwaInstalled(choice.outcome === 'accepted')
    } catch {
      setIsPwaInstalled(isInstalledPwa())
    }
  }

  const handleInstallClick = () => {
    if (installPrompt) {
      const promptEvent = installPrompt

      if (isLocalApp) {
        setConfirmDialog({
          title: '安装为应用',
          message: LOCAL_INSTALL_REMINDER,
          showCancel: true,
          confirmText: '继续安装',
          cancelText: '取消',
          icon: 'info',
          action: () => {
            void promptInstall(promptEvent)
          },
        })
      } else {
        void promptInstall(promptEvent)
      }
      return
    }

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const installInstructions = isIos
      ? '在 Safari 浏览器中，点击底部「分享」按钮，选择「添加到主屏幕」即可安装此应用。'
      : '请在浏览器的菜单中选择「添加到主屏幕」或「安装应用」。\n\n（如果在微信等内置浏览器中，请先在外部浏览器打开）'

    setConfirmDialog({
      title: isLocalApp ? '安装本地应用' : '安装为应用',
      message: isLocalApp ? `${LOCAL_INSTALL_REMINDER}\n\n${installInstructions}` : installInstructions,
      showCancel: false,
      confirmText: '我知道了',
      icon: 'info',
      action: () => {},
    })
  }

  return (
    <>
      <header data-no-drag-select className="safe-area-top fixed left-0 right-0 top-0 z-40 border-b border-black/[0.06] bg-white/75 shadow-[0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-gray-950/80 dark:shadow-none">
        <div className="safe-area-x safe-header-inner mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            <h1 className="hidden min-w-0 min-[520px]:block">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="truncate text-[17px] font-semibold tracking-[-0.025em] text-gray-900 transition-colors hover:text-gray-600 dark:text-gray-100 dark:hover:text-gray-300 sm:text-lg"
              >
                亚马逊图片工作台
              </button>
            </h1>
            <nav className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className={`h-8 rounded-[10px] px-2.5 text-xs font-semibold transition sm:px-3 ${activeView === 'home' ? 'bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900' : 'text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100'}`}
              >
                首页
              </button>
              <button
                type="button"
                onClick={() => onNavigate('editor')}
                className={`h-8 rounded-[10px] px-2.5 text-xs font-semibold transition sm:px-3 ${activeView === 'editor' ? 'bg-[hsl(var(--primary))] text-white shadow-sm' : 'text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100'}`}
              >
                图片编辑
              </button>
              <button
                type="button"
                onClick={() => onNavigate('tagger')}
                className={`h-8 rounded-[10px] px-2.5 text-xs font-semibold transition sm:px-3 ${activeView === 'tagger' ? 'bg-[hsl(var(--primary))] text-white shadow-sm' : 'text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100'}`}
              >
                AI 人物打标
              </button>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!isPwaInstalled && (
              <div
                className="relative"
                {...installTooltip.handlers}
              >
                <Button
                  onClick={() => {
                    dismissAllTooltips()
                    handleInstallClick()
                  }}
                  variant="plain"
                  size="icon"
                  className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  aria-label="安装为应用"
                >
                  <InstallIcon className="h-5 w-5" />
                </Button>
                <ViewportTooltip visible={installTooltip.visible} className="whitespace-nowrap">
                  安装为应用
                </ViewportTooltip>
              </div>
            )}
            <div
              className="relative"
              {...helpTooltip.handlers}
            >
              <Button
                onClick={() => {
                  dismissAllTooltips()
                  setShowHelp(true)
                }}
                variant="plain"
                size="icon"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                aria-label="操作指南"
              >
                <HelpCircleIcon className="h-5 w-5" />
              </Button>
              <ViewportTooltip visible={helpTooltip.visible} className="whitespace-nowrap">
                操作指南
              </ViewportTooltip>
            </div>
            <div
              className="relative"
              {...settingsTooltip.handlers}
            >
              <Button
                onClick={() => setShowSettings(true)}
                variant="plain"
                size="icon"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                aria-label="设置"
              >
                <SettingsIcon className="h-5 w-5" />
              </Button>
              <ViewportTooltip visible={settingsTooltip.visible} className="whitespace-nowrap">
                设置
              </ViewportTooltip>
            </div>
          </div>
        </div>
      </header>

      <div className="safe-area-top invisible pointer-events-none" aria-hidden="true">
        <div className="safe-header-inner" />
      </div>
      {showHelp && <HelpModal appMode="gallery" onClose={() => setShowHelp(false)} />}
    </>
  )
}
