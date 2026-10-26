<script setup lang="ts">
// 單則訊息：文字、圖片、檔案、已收回，以及自己訊息的編輯／收回／已編輯展開。
import { computed, nextTick, onUnmounted, ref, toRef } from 'vue'
import type { EditRecord } from '@/services/chatService'
import { useChatStore, type ViewMessage } from '@/stores/chat'
import { formatTime } from '@/utils/format'
import { MESSAGE_MAX, charCount } from '@/utils/validate'
import { splitMentions } from '@/utils/mention'
import { useFileUrl } from '@/composables/useFileUrl'
import { describeMessage } from '@/utils/reply'
import AvatarBadge from './AvatarBadge.vue'
import EditHistory from './EditHistory.vue'
import FileCard from './FileCard.vue'
import Icon from './Icon.vue'

const props = defineProps<{ message: ViewMessage; mine: boolean }>()
const emit = defineEmits<{ 'open-image': [payload: { url: string; name: string }] }>()

const store = useChatStore()

const m = computed(() => props.message)
const pending = computed(() => !!m.value.status)
const isImage = computed(() => m.value.kind === 'file' && !!m.value.file?.isImage && !m.value.recalled)
const isFile = computed(() => m.value.kind === 'file' && !!m.value.file && !m.value.file.isImage && !m.value.recalled)
const canAct = computed(() => props.mine && !pending.value && !m.value.recalled)
// ----- @ 提及：文字切成一般字與標籤；被 @ 的人看到的整則訊息會多一圈強調色與「提到你」 -----
const segments = computed(() => splitMentions(m.value.text ?? '', m.value.mentions))
const mentionsMe = computed(
  () => !props.mine && !m.value.recalled && (m.value.mentions ?? []).some((x) => x.memberId === store.me?.id),
)
// ----- 回覆：上方的引用、被回覆的人看到的標示、點引用跳回原訊息 -----
const repliesMe = computed(() => !props.mine && !m.value.recalled && m.value.replyTo?.memberId === store.me?.id)
const toMe = computed(() => mentionsMe.value || repliesMe.value)
const canReply = computed(() => !pending.value && !m.value.recalled && !editing.value)

interface QuoteInfo {
  state: 'ok' | 'recalled' | 'hidden'
  nickname: string
  kind: 'text' | 'image' | 'file'
  preview: string
  jumpable: boolean
}
const quote = computed<QuoteInfo | null>(() => {
  const r = m.value.replyTo
  if (!r) return null
  const base = { nickname: r.nickname, kind: r.kind, preview: r.preview }
  if (store.hidden.has(r.memberId)) return { ...base, state: 'hidden', jumpable: false }
  const live = store.messageById(r.messageId)
  if (live?.recalled) return { ...base, state: 'recalled', jumpable: false }
  if (live) return { ...base, ...describeMessage(live), nickname: live.nickname, state: 'ok', jumpable: true }
  return { ...base, state: 'ok', jumpable: false }
})

function jumpToOriginal(): void {
  const id = m.value.replyTo?.messageId
  if (!id || !quote.value?.jumpable) return
  const el = document.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.remove('flash')
  void el.offsetWidth // 重新觸發動畫
  el.classList.add('flash')
  window.setTimeout(() => el.classList.remove('flash'), 1600)
}

function reply(): void {
  closeMenu()
  store.startReply(m.value)
}

const canEdit = computed(() => canAct.value && m.value.kind === 'text')

// ----- 圖片縮圖 -----
const imagePath = toRef(() => (isImage.value ? m.value.file!.path : null))
const { url: imageUrl, failed: imageFailed } = useFileUrl(imagePath)

function openImage(): void {
  if (imageUrl.value) emit('open-image', { url: imageUrl.value, name: m.value.file!.name })
}

// ----- 已編輯：就在訊息下方展開舊版本 -----
const historyOpen = ref(false)
const history = ref<EditRecord[]>([])
const historyError = ref('')

async function toggleHistory(): Promise<void> {
  if (historyOpen.value) {
    historyOpen.value = false
    return
  }
  historyError.value = ''
  try {
    history.value = await store.getEditHistory(m.value.id)
    historyOpen.value = true
  } catch (e) {
    historyError.value = e instanceof Error ? e.message : '讀不到舊版本'
  }
}

// ----- 編輯 -----
const editing = ref(false)
const draft = ref('')
const editError = ref('')
const editBox = ref<HTMLTextAreaElement | null>(null)
const draftCount = computed(() => charCount(draft.value.trim()))

async function startEdit(): Promise<void> {
  closeMenu()
  draft.value = m.value.text ?? ''
  editError.value = ''
  editing.value = true
  await nextTick()
  editBox.value?.focus()
}

function cancelEdit(): void {
  editing.value = false
  historyOpen.value = false
}

async function saveEdit(): Promise<void> {
  editError.value = ''
  try {
    await store.editMessage(m.value.id, draft.value)
    editing.value = false
    historyOpen.value = false
  } catch (e) {
    editError.value = e instanceof Error ? e.message : '儲存失敗，請再試一次'
  }
}

function onEditKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') cancelEdit()
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) void saveEdit()
}

// ----- 收回 -----
const actionError = ref('')
async function recall(): Promise<void> {
  closeMenu()
  actionError.value = ''
  try {
    await store.recallMessage(m.value.id)
    historyOpen.value = false
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : '收回失敗，請再試一次'
  }
}

// ----- 手機長按／右鍵開選單；電腦滑過顯示工具列 -----
const menuOpen = ref(false)
let pressTimer = 0

function openMenu(): void {
  if (!canReply.value) return
  menuOpen.value = true
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0)
  document.addEventListener('keydown', onMenuKey)
}
function closeMenu(): void {
  menuOpen.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('keydown', onMenuKey)
}
function onOutside(e: PointerEvent): void {
  if (!(e.target as HTMLElement).closest?.('.menu')) closeMenu()
}
function onMenuKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeMenu()
}
function onPressStart(e: PointerEvent): void {
  if (e.pointerType !== 'touch' || !canReply.value) return
  window.clearTimeout(pressTimer)
  pressTimer = window.setTimeout(openMenu, 450)
}
function onPressEnd(): void {
  window.clearTimeout(pressTimer)
}
function onContextMenu(e: MouseEvent): void {
  // 只有自己的訊息才接管右鍵選單；別人的訊息保留瀏覽器原本的（可以複製文字）
  if (!props.mine || !canReply.value) return
  e.preventDefault()
  openMenu()
}
onUnmounted(() => {
  closeMenu()
  window.clearTimeout(pressTimer)
})

const time = computed(() => formatTime(m.value.createdAt))
const retryable = computed(() => m.value.status === 'failed')
</script>

<template>
  <article class="msg" :class="{ mine }" :data-mid="m.id">
    <div v-if="!mine" class="who">
      <AvatarBadge :avatar="m.avatar" :size="22" />
      <span class="nick">{{ m.nickname }}</span>
      <span v-if="mentionsMe" class="at-you">提到你</span>
      <span v-if="repliesMe" class="at-you">回覆你</span>
    </div>

    <component
      :is="quote.jumpable ? 'button' : 'div'"
      v-if="quote && !editing"
      class="quote"
      :class="{ gone: quote.state !== 'ok' }"
      :type="quote.jumpable ? 'button' : undefined"
      :aria-label="quote.jumpable ? `跳到被回覆的訊息：${quote.nickname}` : undefined"
      @click="jumpToOriginal"
    >
      <Icon name="reply" :size="14" :stroke="2" />
      <span v-if="quote.state === 'recalled'" class="q-text">回覆 {{ quote.nickname }}：原訊息已收回</span>
      <span v-else-if="quote.state === 'hidden'" class="q-text">回覆已隱藏的人的訊息</span>
      <template v-else>
        <span class="q-name">{{ quote.nickname }}</span>
        <span class="q-text">
          <Icon v-if="quote.kind === 'image'" name="image" :size="14" />
          <Icon v-else-if="quote.kind === 'file'" name="file" :size="14" />
          {{ quote.preview }}
        </span>
      </template>
    </component>

    <div class="row">
      <!-- 內容 -->
      <div v-if="editing" class="edit">
        <label class="sr-only" :for="`edit-${m.id}`">編輯訊息</label>
        <textarea
          :id="`edit-${m.id}`"
          ref="editBox"
          v-model="draft"
          rows="2"
          @keydown="onEditKey"
        />
        <p v-if="draftCount > MESSAGE_MAX" class="over">{{ draftCount }} / {{ MESSAGE_MAX }}，請縮短後再儲存</p>
        <p v-if="editError" class="over" role="alert">{{ editError }}</p>
        <div class="edit-actions">
          <button type="button" class="btn edit-cancel" @click="cancelEdit">取消</button>
          <button type="button" class="btn edit-save" :disabled="!draft.trim() || draftCount > MESSAGE_MAX" @click="saveEdit">
            儲存
          </button>
        </div>
      </div>

      <div v-else-if="m.recalled" class="bubble recalled">這則訊息已收回</div>

      <template v-else-if="isImage">
        <button
          type="button"
          class="thumb"
          :class="{ sending: pending }"
          :aria-label="`查看圖片大圖：${m.file!.name}`"
          :disabled="!imageUrl"
          @pointerdown="onPressStart"
          @pointerup="onPressEnd"
          @pointerleave="onPressEnd"
          @contextmenu="onContextMenu"
          @click="openImage"
        >
          <img v-if="imageUrl && !imageFailed" :src="imageUrl" :alt="m.file!.name" draggable="false" />
          <span v-else class="thumb-empty">
            <Icon name="image" :size="36" :stroke="1.5" />
            <small v-if="imageFailed">圖片已無法取得</small>
          </span>
          <span v-if="pending && m.status === 'sending'" class="thumb-progress" aria-hidden="true">
            <span :style="{ width: (m.progress ?? 0) + '%' }" />
          </span>
        </button>
      </template>

      <div
        v-else-if="isFile"
        :class="{ sending: pending }"
        @pointerdown="onPressStart"
        @pointerup="onPressEnd"
        @pointerleave="onPressEnd"
        @contextmenu="onContextMenu"
      >
        <FileCard :file="m.file!" :progress="m.progress" :sending="m.status === 'sending'" />
      </div>

      <div
        v-else
        class="bubble"
        :class="{ sending: pending, 'to-me': toMe }"
        @pointerdown="onPressStart"
        @pointerup="onPressEnd"
        @pointerleave="onPressEnd"
        @contextmenu="onContextMenu"
      ><template v-for="(s, i) in segments" :key="i"><span
          v-if="s.mention"
          class="tag"
          :class="{ me: s.mention.memberId === store.me?.id }"
        >{{ s.text }}</span><template v-else>{{ s.text }}</template></template></div>

      <time v-if="!editing" class="time" :datetime="m.createdAt">{{ m.status === 'sending' ? '送出中…' : time }}</time>

      <!-- 電腦：滑過自己的訊息時出現的工具列 -->
      <div v-if="canReply" class="toolbar" role="toolbar" aria-label="訊息操作">
        <button type="button" @click="reply">回覆</button>
        <button v-if="canEdit" type="button" @click="startEdit">編輯</button>
        <button v-if="canAct" type="button" class="danger" @click="recall">收回</button>
      </div>

      <!-- 手機：長按 -->
      <div v-if="menuOpen" class="menu" role="menu" aria-label="訊息操作">
        <button type="button" role="menuitem" @click="reply">回覆</button>
        <button v-if="canEdit" type="button" role="menuitem" @click="startEdit">編輯</button>
        <button v-if="canAct" type="button" role="menuitem" class="danger" @click="recall">收回</button>
      </div>
    </div>

    <button
      v-if="m.edited && !m.recalled && !editing"
      type="button"
      class="edited"
      :aria-expanded="historyOpen"
      @click="toggleHistory"
    >
      已編輯<Icon :name="historyOpen ? 'up' : 'down'" :size="14" :stroke="2" />
    </button>
    <EditHistory v-if="historyOpen && !editing" :records="history" :created-at="m.createdAt" />
    <p v-if="historyError" class="problem" role="alert">{{ historyError }}</p>
    <p v-if="actionError" class="problem" role="alert">{{ actionError }}</p>

    <div v-if="retryable" class="failed" role="alert">
      <span>{{ m.error ?? '送出失敗' }}</span>
      <button type="button" @click="store.retry(m.localId!)">點此重試</button>
      <button type="button" @click="store.discardPending(m.localId!)">刪除</button>
    </div>
  </article>
</template>

<style scoped>
.msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  max-width: 86%;
}

.msg.mine {
  align-self: flex-end;
  align-items: flex-end;
}

.who {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 4px;
  max-width: 100%;
}

.nick {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  max-width: 100%;
}

.mine .row {
  flex-direction: row-reverse;
}

.bubble {
  padding: 10px 14px;
  border-radius: var(--radius-tail) var(--radius-bubble) var(--radius-bubble) var(--radius-bubble);
  background: var(--bg-raised);
  font-size: 15px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-width: 0;
  user-select: text;
  -webkit-touch-callout: none;
}

.mine .bubble {
  border-radius: var(--radius-bubble) var(--radius-tail) var(--radius-bubble) var(--radius-bubble);
  background: var(--accent);
  color: var(--on-accent);
}

/* 被 @ 的人：整則訊息多一圈強調色，上面有「提到你」 */
.bubble.to-me {
  box-shadow: 0 0 0 2px var(--mention);
}

.at-you {
  flex: none;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--mention-bg);
  color: var(--mention-ink);
  font-size: 11px;
  font-weight: 500;
}

/* 訊息裡的 @代號 標籤 */
.tag {
  padding: 0 4px;
  border-radius: 6px;
  background: rgba(90, 110, 130, 0.18);
  font-weight: 500;
}

.mine .tag {
  background: rgba(245, 241, 234, 0.22);
}

.tag.me {
  background: var(--mention-bg);
  color: var(--mention-ink);
}

.bubble.recalled {
  background: transparent;
  border: 1px dashed var(--border-input);
  color: var(--muted);
  font-size: 14px;
  font-style: italic;
}

.mine .bubble.recalled {
  background: transparent;
  color: var(--muted);
}

.sending {
  opacity: 0.75;
}

.time {
  flex: none;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}

.thumb {
  position: relative;
  width: 210px;
  height: 140px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-tail) var(--radius-bubble) var(--radius-bubble) var(--radius-bubble);
  background: var(--bg-placeholder);
  color: var(--faint);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-touch-callout: none;
}

.mine .thumb {
  border-radius: var(--radius-bubble) var(--radius-tail) var(--radius-bubble) var(--radius-bubble);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.thumb-progress {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  height: 6px;
  border-radius: 3px;
  background: var(--line-strong);
  overflow: hidden;
}

.thumb-progress span {
  display: block;
  height: 100%;
  background: var(--accent);
}

/* 編輯模式 */
.edit {
  width: min(420px, 78vw);
  padding: 12px;
  border-radius: var(--radius-bubble);
  background: var(--accent);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.edit textarea {
  width: 100%;
  resize: none;
  padding: 10px 12px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--accent-border);
  background: var(--bg-surface);
  color: var(--ink);
  font-size: 15px;
  line-height: 1.5;
}

.edit .over {
  font-size: 13px;
  color: var(--danger-on-accent);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.edit-actions .btn {
  min-height: 40px;
  padding: 0 18px;
}

.edit-cancel {
  border-color: var(--accent-border);
  color: var(--on-accent);
}

.edit-cancel:hover:not(:disabled) {
  background: rgba(245, 241, 234, 0.12);
}

.edit-save {
  background: var(--on-accent);
  color: var(--accent);
  border-color: transparent;
  font-weight: 700;
}

.edit-save:hover:not(:disabled) {
  background: #fff;
}

.edit-save:disabled {
  background: rgba(245, 241, 234, 0.35);
  color: var(--accent);
}

/* 已編輯 */
.edited {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 4px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  text-decoration: underline;
}

/* 電腦：滑過顯示的工具列 */
.toolbar {
  display: none;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-btn);
  background: var(--bg-surface);
}

.toolbar button,
.menu button {
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font-size: 13px;
  color: var(--ink);
}

.toolbar button:hover,
.menu button:hover {
  background: var(--bg-raised);
}

.danger {
  color: var(--danger) !important;
}

@media (hover: hover) and (min-width: 860px) {
  .row:hover .toolbar,
  .row:focus-within .toolbar {
    display: flex;
  }
}

/* 手機：長按出現的選單 */
.menu {
  position: absolute;
  top: 100%;
  z-index: 5;
  margin-top: 4px;
  left: 0;
  width: 140px;
  padding: 6px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-float);
  display: flex;
  flex-direction: column;
}

.menu button {
  height: 40px;
  font-size: 14px;
  text-align: left;
}

.mine .menu {
  left: auto;
  right: 0;
}

/* 回覆的引用：在訊息上方，同一側 */
.quote {
  max-width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-surface);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 6px;
  text-align: left;
}

button.quote:hover {
  background: var(--bg-raised);
}

.q-name {
  flex: none;
  max-width: 7em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--ink-2);
}

.q-text {
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.q-text :deep(svg) {
  vertical-align: -2px;
  margin-right: 2px;
}

.quote.gone {
  font-style: italic;
}

/* 跳回原訊息時，閃一下 */
.msg.flash {
  animation: flash 1.6s ease-out;
}

@keyframes flash {
  0%,
  35% {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  100% {
    background: transparent;
  }
}

.msg {
  border-radius: 12px;
}

.problem {
  font-size: 12px;
  color: var(--danger);
}

.failed {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
  font-size: 13px;
  color: var(--danger);
}

.failed button {
  min-height: 32px;
  padding: 4px;
  border: 0;
  background: transparent;
  color: var(--danger);
  font-size: 13px;
  text-decoration: underline;
}
</style>
