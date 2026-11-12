import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon } from './icons'
import { Sheet } from './Sheet'

export default function SupportPromptModal() {
  const supportPromptOpen = useStore((s) => s.supportPromptOpen)
  const dismissSupportPrompt = useStore((s) => s.dismissSupportPrompt)
  const confirmDialog = useStore((s) => s.confirmDialog)
  const detailTaskId = useStore((s) => s.detailTaskId)
  const lightboxImageId = useStore((s) => s.lightboxImageId)
  const showSettings = useStore((s) => s.showSettings)
  const maskEditorImageId = useStore((s) => s.maskEditorImageId)

  const blockedByHigherPriorityModal = Boolean(
    confirmDialog || detailTaskId || lightboxImageId || showSettings || maskEditorImageId,
  )
  const visible = supportPromptOpen && !blockedByHigherPriorityModal

  useCloseOnEscape(visible, dismissSupportPrompt)
  usePreventBackgroundScroll(visible)

  if (!visible) return null

  return createPortal(
    <Sheet
      onClose={dismissSupportPrompt}
      rootClassName="z-[70]"
      className="flex max-w-sm flex-col p-6 pb-7 pt-8"
      labelledBy="support-sheet-title"
    >
        <div className="absolute right-4 top-4">
          <button
            type="button"
            onClick={dismissSupportPrompt}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 mt-4 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-[#f4f0ff] text-[#946ce6] dark:bg-[#946ce6]/10 dark:text-[#bba3f2]">
            <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
        </div>

        <h3 id="support-sheet-title" className="mb-3 text-center text-xl font-semibold text-gray-900 dark:text-gray-100">
          感谢使用 🎉
        </h3>

        <p className="mb-8 px-2 text-center text-[15px] leading-relaxed text-gray-500 dark:text-gray-400">
          你已经成功生成了超过 <strong className="font-semibold text-gray-800 dark:text-gray-200">50</strong> 张图片！<br />
          如果这个工具对你有所帮助，<br />
          欢迎反馈问题或分享你的建议。
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://github.com/OnedayIs8760hours/amazon-image"
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismissSupportPrompt}
            className="flex w-full sm:w-auto flex-1 items-center justify-center gap-2 rounded-2xl bg-[#946ce6] px-5 py-3.5 text-[15px] font-semibold text-white transition-all hover:bg-[#8358dc] active:scale-[0.98] dark:bg-[#946ce6] dark:hover:bg-[#a885ee]"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            项目主页
          </a>
          <a
            href="https://github.com/OnedayIs8760hours/amazon-image/issues"
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismissSupportPrompt}
            className="flex w-full sm:w-auto flex-1 items-center justify-center gap-2 rounded-2xl bg-[#f4f4f5] px-5 py-3.5 text-[15px] font-semibold text-gray-600 transition-all hover:bg-gray-200 active:scale-[0.98] dark:bg-[#27272a] dark:text-gray-300 dark:hover:bg-[#3f3f46]"
          >
            <svg className="h-[18px] w-[18px] opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            反馈问题
          </a>
        </div>
    </Sheet>,
    document.body,
  )
}
