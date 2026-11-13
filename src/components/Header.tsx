import { useStore } from '../store'
import { useTooltip } from '../hooks/useTooltip'
import ViewportTooltip from './ViewportTooltip'
import { SettingsIcon } from './icons'
import { Button } from './Button'

type AppView = 'home' | 'editor' | 'tagger'

type HeaderProps = {
  activeView: AppView
  onNavigate: (view: AppView) => void
}

export default function Header({ activeView, onNavigate }: HeaderProps) {
  const setShowSettings = useStore((s) => s.setShowSettings)
  const settingsTooltip = useTooltip()

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
    </>
  )
}
