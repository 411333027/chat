import { onUnmounted, ref } from 'vue'

/** 寬度 860px 以上算電腦版（名單固定在右側）；以下算手機版（名單是獨立頁）。 */
export const DESKTOP_QUERY = '(min-width: 860px)'

export function useIsDesktop() {
  const mq = window.matchMedia(DESKTOP_QUERY)
  const isDesktop = ref(mq.matches)
  const onChange = (e: MediaQueryListEvent) => {
    isDesktop.value = e.matches
  }
  mq.addEventListener('change', onChange)
  onUnmounted(() => mq.removeEventListener('change', onChange))
  return isDesktop
}
