<script setup lang="ts">
// 輸入區：附件、文字輸入框、送出。電腦按 Enter 送出、Shift+Enter 換行；手機 Enter 換行。
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { ChatError, type Member, type Mention } from '@/services/chatService'
import { MENTION_MAX, findMentionQuery } from '@/utils/mention'
import { FILE_MAX_BYTES, MESSAGE_MAX, RATE_LIMIT_MS, charCount } from '@/utils/validate'
import { formatSize } from '@/utils/format'
import { describeMessage } from '@/utils/reply'
import Icon from './Icon.vue'
import MentionPicker from './MentionPicker.vue'

const store = useChatStore()
const text = ref('')
const file = ref<File | null>(null)
const filePreview = ref('')
const error = ref('')
const busy = ref(false)
const box = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// ----- 回覆：輸入區上方顯示「回覆誰：內容」，可取消 -----
const replyView = computed(() => (store.replyingTo ? describeMessage(store.replyingTo) : null))
watch(
  () => store.replyingTo?.id,
  async (id) => {
    if (!id) return
    await nextTick()
    box.value?.focus()
  },
)

// ----- @ 提及 -----
const mentions = ref<Mention[]>([])
const picker = ref<{ start: number; query: string } | null>(null)
const activeIdx = ref(0)
const PICKER_ID = 'mention-list'

const candidates = computed<Member[]>(() => {
  if (!picker.value) return []
  const q = picker.value.query.toLowerCase()
  return store.members
    .filter((m) => m.id !== store.me?.id && m.nickname.toLowerCase().includes(q))
    .sort((a, b) => Number(b.online) - Number(a.online))
    .slice(0, 8)
})
const pickerOpen = computed(() => candidates.value.length > 0)

function updatePicker(): void {
  const el = box.value
  if (!el || el.selectionStart !== el.selectionEnd) {
    picker.value = null
    return
  }
  const found = findMentionQuery(el.value.slice(0, el.selectionStart))
  if (found?.start !== picker.value?.start || found?.query !== picker.value?.query) activeIdx.value = 0
  picker.value = found
}

async function pickMention(m: Member): Promise<void> {
  const el = box.value
  if (!el || !picker.value) return
  if (mentions.value.length >= MENTION_MAX && !mentions.value.some((x) => x.memberId === m.id)) {
    error.value = '一則訊息最多可以 @ 10 個人'
    picker.value = null
    return
  }
  const caret = el.selectionStart
  const insert = `@${m.nickname} `
  text.value = text.value.slice(0, picker.value.start) + insert + text.value.slice(caret)
  if (!mentions.value.some((x) => x.memberId === m.id)) {
    mentions.value.push({ memberId: m.id, nickname: m.nickname })
  }
  picker.value = null
  await nextTick()
  const pos = text.value.indexOf(insert) + insert.length
  el.focus()
  el.setSelectionRange(pos, pos)
  autosize()
}

const count = computed(() => charCount(text.value.trim()))
const over = computed(() => count.value > MESSAGE_MAX)
const showCount = computed(() => count.value >= 900)
const hasContent = computed(() => !!file.value || text.value.trim().length > 0)
const canSubmit = computed(() => hasContent.value && !over.value && store.canSend && !busy.value)
const coarse = window.matchMedia('(pointer: coarse)').matches

function autosize(): void {
  const el = box.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 132) + 'px'
}

function onKeydown(e: KeyboardEvent): void {
  if (e.isComposing || e.keyCode === 229) return // 輸入中文時按 Enter 是在選字，不能當成送出
  if (pickerOpen.value) {
    const n = candidates.value.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx.value = (activeIdx.value + 1) % n
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx.value = (activeIdx.value - 1 + n) % n
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      void pickMention(candidates.value[activeIdx.value])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      picker.value = null
      return
    }
  }
  if (e.key === 'Escape' && store.replyingTo) {
    e.preventDefault()
    store.cancelReply()
    return
  }
  if (e.key !== 'Enter') return
  if (coarse || e.shiftKey) return
  e.preventDefault()
  void submit()
}

function pickFile(): void {
  fileInput.value?.click()
}

function clearFile(): void {
  if (filePreview.value) URL.revokeObjectURL(filePreview.value)
  filePreview.value = ''
  file.value = null
}

function onFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const picked = input.files?.[0]
  input.value = ''
  if (!picked) return
  error.value = ''
  if (picked.size > FILE_MAX_BYTES) {
    clearFile()
    error.value = '檔案不能超過 10MB'
    return
  }
  clearFile()
  file.value = picked
  if (picked.type.startsWith('image/') && picked.type !== 'image/svg+xml') {
    filePreview.value = URL.createObjectURL(picked)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  error.value = ''
  busy.value = true
  const toSend = text.value
  const toMention = mentions.value.map((m) => ({ ...m }))
  const toUpload = file.value
  try {
    if (toUpload) {
      clearFileKeepForSend()
      await store.sendFile(toUpload)
      if (toSend.trim()) await sleep(RATE_LIMIT_MS + 100)
    }
    if (toSend.trim()) {
      text.value = ''
      mentions.value = []
      picker.value = null
      await nextTick()
      autosize()
      await store.sendText(toSend, toMention)
    }
  } catch (e) {
    error.value = e instanceof ChatError ? e.message : '送出失敗，請再試一次'
    if (!text.value) {
      text.value = toSend
      mentions.value = toMention
    }
  } finally {
    busy.value = false
    box.value?.focus()
  }
}

function clearFileKeepForSend(): void {
  // 檔案已交給記事板處理（畫面上會出現上傳中的訊息），這裡只清掉預覽
  if (filePreview.value) URL.revokeObjectURL(filePreview.value)
  filePreview.value = ''
  file.value = null
}
</script>

<template>
  <footer class="composer">
    <MentionPicker v-if="pickerOpen" :id="PICKER_ID" :members="candidates" :active="activeIdx" @pick="pickMention" />
    <div v-if="store.replyingTo && replyView" class="reply-bar" role="status">
      <Icon name="reply" :size="18" />
      <div class="reply-info">
        <span class="reply-who">回覆 {{ store.replyingTo.nickname }}</span>
        <span class="reply-what">
          <Icon v-if="replyView.kind === 'image'" name="image" :size="14" />
          <Icon v-else-if="replyView.kind === 'file'" name="file" :size="14" />
          {{ replyView.preview }}
        </span>
      </div>
      <button type="button" class="icon-btn" aria-label="取消回覆" @click="store.cancelReply()"><Icon name="x" /></button>
    </div>

    <div v-if="file" class="attach">
      <div class="thumb">
        <img v-if="filePreview" :src="filePreview" alt="" />
        <Icon v-else name="file" :size="22" />
      </div>
      <div class="info">
        <span class="name">{{ file.name }}</span>
        <span class="size">{{ formatSize(file.size) }}</span>
      </div>
      <button type="button" class="icon-btn" aria-label="取消附加檔案" @click="clearFile"><Icon name="x" /></button>
    </div>

    <div v-if="error" class="note note-error" role="alert"><Icon name="alert" :size="18" />{{ error }}</div>

    <div class="line">
      <button type="button" class="icon-btn" aria-label="附加檔案" @click="pickFile"><Icon name="clip" :size="22" /></button>
      <input ref="fileInput" class="sr-only" type="file" tabindex="-1" aria-hidden="true" @change="onFile" />

      <label class="sr-only" for="message-box">輸入訊息</label>
      <textarea
        id="message-box"
        ref="box"
        v-model="text"
        rows="1"
        :class="{ bad: over }"
        :placeholder="coarse ? '輸入訊息' : '輸入訊息，Enter 送出，Shift+Enter 換行'"
        enterkeyhint="enter"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="pickerOpen"
        :aria-controls="PICKER_ID"
        :aria-activedescendant="pickerOpen ? `${PICKER_ID}-${activeIdx}` : undefined"
        @input="autosize(); updatePicker()"
        @click="updatePicker"
        @keyup="updatePicker"
        @blur="picker = null"
        @keydown="onKeydown"
      />

      <button type="button" class="send" :disabled="!canSubmit" aria-label="送出" @click="submit">
        <span class="send-label">送出</span><Icon name="send" :size="20" :stroke="2" />
      </button>
    </div>

    <p v-if="showCount" class="count" :class="{ bad: over }">
      {{ count }} / {{ MESSAGE_MAX }}<template v-if="over">，請縮短後再送出</template>
    </p>
    <p v-if="!store.canSend" class="offline">連線恢復後才能送出</p>
  </footer>
</template>

<style scoped>
.composer {
  flex: none;
  position: relative;
  padding: 10px 8px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.line {
  display: flex;
  align-items: flex-end;
  gap: 4px;
}

textarea {
  flex: 1;
  min-width: 0;
  height: var(--tap);
  max-height: 132px;
  resize: none;
  padding: 10px 16px;
  border-radius: 22px;
  border: 1px solid var(--border-input);
  background: var(--bg-page);
  font-size: 16px; /* 16px 以上，iPhone 才不會自動放大畫面 */
  line-height: 1.4;
  color: var(--ink);
}

textarea.bad {
  border-color: var(--danger);
}

.icon-btn {
  flex: none;
  width: var(--tap);
  height: var(--tap);
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ink-2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: var(--bg-raised);
}

.send {
  flex: none;
  width: var(--tap);
  height: var(--tap);
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
}

.send:hover:not(:disabled) {
  background: #4f6275;
}

.send:disabled {
  background: var(--bg-placeholder);
  color: var(--faint);
}

.send-label {
  display: none;
}

.reply-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px 6px 12px;
  border-radius: 12px;
  background: var(--bg-raised);
  color: var(--ink-2);
}

.reply-bar > :deep(svg) {
  flex: none;
}

.reply-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}

.reply-who {
  font-size: 12px;
  font-weight: 500;
}

.reply-what {
  font-size: 13px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reply-what :deep(svg) {
  vertical-align: -2px;
  margin-right: 2px;
}

.attach {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px 8px 12px;
  border-radius: 12px;
  background: var(--bg-raised);
}

.attach .thumb {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: var(--bg-placeholder);
  color: var(--faint);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.attach img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  font-size: 12px;
  color: var(--muted);
}

.count {
  font-size: 13px;
  color: var(--muted);
  text-align: right;
  padding-right: 8px;
}

.count.bad {
  color: var(--danger);
}

.offline {
  font-size: 13px;
  color: var(--muted);
  padding-left: 8px;
}

@media (min-width: 860px) {
  .composer {
    padding: 16px 32px 20px;
  }

  .line {
    gap: 10px;
  }

  textarea {
    border-radius: var(--radius-field);
  }

  .send {
    width: auto;
    padding: 0 22px;
    border-radius: var(--radius-field);
  }

  .send-label {
    display: inline;
  }

  .count,
  .offline {
    padding: 0;
  }
}
</style>
