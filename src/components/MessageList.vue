<script setup lang="ts">
// 訊息區：貼著底部排列。你在最底部時新訊息自動捲到底；
// 你往上看舊訊息時不拉你，改在底部出現「有 N 則新訊息」按鈕。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageItem from './MessageItem.vue'
import Icon from './Icon.vue'

const emit = defineEmits<{ 'open-image': [payload: { url: string; name: string }] }>()

const store = useChatStore()
const scroller = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const atBottom = ref(true)
const newCount = ref(0)

const items = computed(() => store.timeline)

function measureBottom(): boolean {
  const el = scroller.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

function toBottom(): void {
  const el = scroller.value
  if (!el) return
  el.scrollTop = el.scrollHeight
  atBottom.value = true
  newCount.value = 0
}

function onScroll(): void {
  atBottom.value = measureBottom()
  if (atBottom.value) newCount.value = 0
}

watch(
  () => items.value.length,
  async (now, before) => {
    const added = items.value.slice(Math.max(before ?? 0, 0))
    const wasAtBottom = atBottom.value
    const mineAdded = added.some((i) => i.type === 'message' && i.mine)
    await nextTick()
    if (wasAtBottom || mineAdded) {
      toBottom()
    } else {
      newCount.value += added.filter((i) => i.type === 'message' && !i.mine).length
    }
  },
)

// 圖片載入、訊息展開等讓高度變化時，如果本來就在底部就繼續貼著底部
let observer: ResizeObserver | null = null
onMounted(() => {
  toBottom()
  if (inner.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      if (atBottom.value) toBottom()
    })
    observer.observe(inner.value)
  }
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div class="wrap">
    <div ref="scroller" class="scroller" role="log" aria-label="聊天訊息" @scroll.passive="onScroll">
      <div ref="inner" class="inner">
        <p v-if="items.length === 0" class="empty">還沒有訊息，說點什麼吧</p>
        <template v-for="item in items" :key="item.key">
          <div v-if="item.type === 'notice'" class="notice">{{ item.notice.text }}</div>
          <MessageItem v-else :message="item.message" :mine="item.mine" @open-image="emit('open-image', $event)" />
        </template>
      </div>
    </div>

    <button v-if="newCount > 0 && !atBottom" type="button" class="jump" @click="toBottom">
      有 {{ newCount }} 則新訊息<Icon name="arrowDown" :size="16" :stroke="2" />
    </button>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.scroller {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
}

.inner {
  margin-top: auto; /* 訊息少的時候貼在底部 */
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty {
  align-self: center;
  padding: 40px 0;
  font-size: 15px;
  color: var(--muted);
}

.notice {
  align-self: center;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--bg-raised);
  font-size: 12px;
  color: var(--muted);
}

.jump {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: var(--shadow-float);
}

@media (min-width: 860px) {
  .inner {
    padding: 24px 32px;
    gap: 16px;
  }
}
</style>
