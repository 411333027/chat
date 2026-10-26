import { onUnmounted, ref, watch, type Ref } from 'vue'
import { useChatStore } from '@/stores/chat'

/** 取得檔案或頭像的顯示連結（連結是暫時的、要向服務詢問，所以是非同步的）。 */
export function useFileUrl(path: Ref<string | null | undefined>) {
  const store = useChatStore()
  const url = ref('')
  const failed = ref(false)
  let alive = true

  watch(
    path,
    async (p) => {
      url.value = ''
      failed.value = false
      if (!p) return
      try {
        const u = await store.fileUrl(p)
        if (alive && path.value === p) url.value = u
      } catch {
        if (alive) failed.value = true
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    alive = false
  })

  return { url, failed }
}
