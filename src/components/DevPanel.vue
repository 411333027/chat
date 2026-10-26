<script setup lang="ts">
// 階段一專用的測試工具（只有假後端才有）。接上 Supabase 後，這個面板自動消失。
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/chat'

const store = useChatStore()
const dev = store.service.devTools
const open = ref(false)
const offline = computed(() => store.connection !== 'connected')
const minutes = computed(() => Math.round((dev?.expireAfterMs ?? 0) / 60000))
const status = ref('')

/** 執行測試動作，並在面板上告訴你有沒有成功 */
function run(label: string, action: (() => void) | undefined): void {
  if (typeof action !== 'function') {
    status.value = '這個按鈕需要先重新整理頁面（Ctrl+Shift+R）才會生效'
    return
  }
  try {
    action()
    status.value = `已執行：${label}`
  } catch (e) {
    status.value = `執行失敗：${e instanceof Error ? e.message : String(e)}`
  }
}
</script>

<template>
  <aside v-if="dev" class="dev">
    <button type="button" class="toggle" :aria-expanded="open" @click="open = !open">
      測試工具
    </button>
    <div v-if="open" class="panel">
      <p>這些按鈕只在「假後端」才有，用來測試斷線、被 @、被回覆、聊天室已滿。</p>
      <button type="button" :disabled="store.connection === 'reconnecting'" @click="run(offline ? '恢復連線' : '模擬斷線', () => dev?.setOffline(!offline))">
        {{ offline ? '恢復連線' : '模擬斷線' }}
      </button>
      <button type="button" :disabled="store.phase !== 'chat'" @click="run('模擬離線過久', dev.expireMe)">
        模擬離線超過 {{ minutes }} 分鐘（被視為離開）
      </button>
      <button type="button" :disabled="store.phase !== 'chat'" @click="run('讓機器人 @ 我', dev.mentionMe)">讓機器人 @ 我</button>
      <button type="button" :disabled="store.phase !== 'chat'" @click="run('讓機器人回覆我', dev.replyToMe)">
        讓機器人回覆我的上一則訊息
      </button>
      <p v-if="store.phase !== 'chat'" class="hint">要先進入聊天室，這兩顆按鈕才能按</p>
      <button type="button" @click="run('把聊天室加到 50 人', dev.fillRoom)">把聊天室加到 50 人</button>
      <p v-if="status" class="status" role="status">{{ status }}</p>
    </div>
  </aside>
</template>

<style scoped>
.dev {
  position: fixed;
  /* 手機：放在頂部列下方的右側（訊息貼著底部排，這裡通常是空的，不會蓋到訊息） */
  top: calc(var(--header-h) + 8px);
  right: 8px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  font-size: 13px;
}

.toggle {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px dashed var(--border-input);
  background: var(--bg-surface);
  color: var(--muted);
  font-size: 12px;
}

.panel {
  width: 240px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--line-strong);
  background: var(--bg-surface);
  box-shadow: var(--shadow-float);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel p {
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
}

.hint,
.status {
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
}

.status {
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--bg-raised);
}

.panel button {
  min-height: 40px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-input);
  background: transparent;
  font-size: 13px;
  text-align: left;
}

.panel button:hover:not(:disabled) {
  background: var(--bg-raised);
}

.panel button:disabled {
  color: var(--faint);
}

/* 電腦版放右下角（名單欄下方空白處），不要蓋到輸入區的附件鈕 */
@media (min-width: 860px) {
  .dev {
    top: auto;
    right: 12px;
    bottom: 12px;
  }
}
</style>
