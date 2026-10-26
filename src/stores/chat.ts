// 共用記事板：目前的成員名單、訊息、連線狀態、畫面切換。
// 畫面只讀這裡的資料、呼叫這裡的動作；這裡只跟 ChatService 窗口講話。

import { computed, markRaw, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { createChatService } from '@/services'
import {
  ChatError,
  type Avatar,
  type ConnectionStatus,
  type EditRecord,
  type FileInfo,
  type Member,
  type Mention,
  type Message,
  type ReplyRef,
} from '@/services/chatService'
import { reconcileMentions } from '@/utils/mention'
import { makeReplyRef } from '@/utils/reply'
import { checkFile, checkText, isInlineImage, normalizeNickname } from '@/utils/validate'

const HIDDEN_KEY = 'chat-hidden-members'
const TITLE = '匿名聊天室'

/** 畫面上的一則訊息：真正的訊息，加上「送出中／送出失敗」的暫時狀態 */
export interface ViewMessage extends Message {
  status?: 'sending' | 'failed'
  progress?: number
  error?: string
  localId?: string
}

export interface Notice {
  id: string
  text: string
  at: string
}

export type TimelineItem =
  | { key: string; type: 'message'; message: ViewMessage; mine: boolean; at: string }
  | { key: string; type: 'notice'; notice: Notice; at: string }

interface Pending {
  localId: string
  kind: 'text' | 'file'
  text?: string
  mentions?: Mention[]
  replyTo?: ReplyRef | null
  file?: File
  info?: FileInfo
  status: 'sending' | 'failed'
  progress: number
  error?: string
  createdAt: string
}

function errorText(e: unknown): string {
  if (e instanceof ChatError) return e.message
  console.error('[chat] 預期之外的錯誤', e)
  return '發生預期之外的錯誤，請再試一次'
}

function loadHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export const useChatStore = defineStore('chat', () => {
  // markRaw：服務是一般物件，不能被 Vue 包成「響應式代理」，
  // 否則裡面的資料會變成代理物件，無法傳給其他分頁（BroadcastChannel 複製不了代理）。
  const service = markRaw(createChatService())

  const booting = ref(true)
  const phase = ref<'join' | 'chat'>('join')
  const me = ref<Member | null>(null)
  const members = ref<Member[]>([])
  const messages = ref<Message[]>([])
  const notices = ref<Notice[]>([])
  const pending = ref<Pending[]>([])
  const connection = ref<ConnectionStatus>('connected')
  const view = ref<'chat' | 'members'>('chat')
  const hidden = ref<Set<string>>(loadHidden())
  const joining = ref(false)
  const joinError = ref('')
  const joinNotice = ref('')
  const unread = ref(0)
  /** 其中有幾則是 @ 到我的（分頁標題只在被 @ 時加上「@」） */
  const unreadMentions = ref(0)
  /** 輸入區正在回覆的那則訊息（沒有就是 null） */
  const replyingTo = ref<Message | null>(null)
  const localUrls = new Map<string, string>()

  // ---------- 衍生資料 ----------

  const onlineCount = computed(() => members.value.filter((m) => m.online).length)
  const canSend = computed(() => connection.value === 'connected')

  const timeline = computed<TimelineItem[]>(() => {
    const meId = me.value?.id
    const items: TimelineItem[] = []
    for (const m of messages.value) {
      if (hidden.value.has(m.memberId)) continue
      items.push({ key: m.id, type: 'message', message: m, mine: m.memberId === meId, at: m.createdAt })
    }
    for (const p of pending.value) {
      if (!me.value) continue
      const message: ViewMessage = {
        id: `local:${p.localId}`,
        localId: p.localId,
        memberId: me.value.id,
        nickname: me.value.nickname,
        avatar: me.value.avatar,
        kind: p.kind,
        text: p.text ?? null,
        mentions: p.mentions ?? [],
        replyTo: p.replyTo ?? null,
        file: p.info ?? null,
        createdAt: p.createdAt,
        updatedAt: p.createdAt,
        edited: false,
        recalled: false,
        status: p.status,
        progress: p.progress,
        error: p.error,
      }
      items.push({ key: message.id, type: 'message', message, mine: true, at: p.createdAt })
    }
    for (const n of notices.value) items.push({ key: n.id, type: 'notice', notice: n, at: n.at })
    return items.sort((a, b) => a.at.localeCompare(b.at))
  })

  // ---------- 內部工具 ----------

  function addNotice(text: string): void {
    notices.value.push({ id: `n:${crypto.randomUUID()}`, text, at: new Date().toISOString() })
    if (notices.value.length > 200) notices.value.splice(0, notices.value.length - 200)
  }

  function upsertMessage(message: Message): void {
    const i = messages.value.findIndex((m) => m.id === message.id)
    if (i >= 0) messages.value[i] = message
    else messages.value.push(message)
  }

  function persistHidden(): void {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden.value]))
    } catch {
      /* 存不了就算了：只是重新整理後會忘記隱藏 */
    }
  }

  function resetRoom(): void {
    me.value = null
    members.value = []
    messages.value = []
    notices.value = []
    pending.value = []
    hidden.value = new Set()
    persistHidden()
    view.value = 'chat'
    unread.value = 0
    unreadMentions.value = 0
    replyingTo.value = null
    connection.value = 'connected'
    phase.value = 'join'
  }

  function enterRoom(member: Member, history: Message[]): void {
    me.value = member
    messages.value = history
    phase.value = 'chat'
    view.value = 'chat'
    joinError.value = ''
    joinNotice.value = ''
  }

  // ---------- 啟動：訂閱事件，嘗試回到聊天室 ----------

  let started = false
  async function init(): Promise<void> {
    if (started) return
    started = true

    service.on('connection.changed', ({ status }) => {
      connection.value = status
    })
    service.on('room.snapshot', ({ members: list }) => {
      members.value = list
    })
    service.on('member.joined', ({ member }) => {
      if (members.value.some((m) => m.id === member.id)) return
      members.value.push(member)
      if (phase.value === 'chat' && member.id !== me.value?.id) addNotice(`${member.nickname} 進來了`)
    })
    service.on('member.left', ({ memberId, nickname }) => {
      members.value = members.value.filter((m) => m.id !== memberId)
      if (hidden.value.delete(memberId)) {
        hidden.value = new Set(hidden.value)
        persistHidden()
      }
      if (phase.value === 'chat') addNotice(`${nickname} 離開了`)
    })
    service.on('member.presence', ({ memberId, online }) => {
      const m = members.value.find((x) => x.id === memberId)
      if (m) m.online = online
    })
    service.on('message.created', ({ message }) => {
      if (phase.value !== 'chat') return
      const known = messages.value.some((m) => m.id === message.id)
      upsertMessage(message)
      if (!known && message.memberId !== me.value?.id && document.hidden) {
        unread.value += 1
        const toMe =
          (message.mentions ?? []).some((m) => m.memberId === me.value?.id) || message.replyTo?.memberId === me.value?.id
        if (toMe) unreadMentions.value += 1
      }
    })
    service.on('message.updated', ({ message }) => {
      if (phase.value !== 'chat') return
      upsertMessage(message)
      // 正在回覆的那則被收回了：不能再回覆它
      if (message.recalled && replyingTo.value?.id === message.id) replyingTo.value = null
    })
    service.on('room.cleared', () => {
      messages.value = []
    })
    service.on('session.expired', () => {
      resetRoom()
      joinNotice.value = new ChatError('NOT_A_MEMBER').message
    })

    try {
      const member = await service.resume()
      const history = await service.loadMessages()
      enterRoom(member, history)
    } catch {
      phase.value = 'join'
    } finally {
      booting.value = false
    }
  }

  // ---------- 動作 ----------

  async function uploadAvatar(file: File): Promise<Avatar> {
    return service.uploadAvatar(file)
  }

  async function join(nickname: string, avatar: Avatar): Promise<boolean> {
    joining.value = true
    joinError.value = ''
    joinNotice.value = ''
    try {
      const value = normalizeNickname(nickname)
      const member = await service.join(value, avatar)
      hidden.value = new Set()
      persistHidden()
      enterRoom(member, [])
      return true
    } catch (e) {
      joinError.value = errorText(e)
      return false
    } finally {
      joining.value = false
    }
  }

  async function leave(): Promise<void> {
    await service.leave()
    resetRoom()
  }

  async function sendText(text: string, mentions: Mention[] = []): Promise<void> {
    const value = checkText(text)
    const localId = crypto.randomUUID()
    const target = replyingTo.value
    replyingTo.value = null
    pending.value.push({
      localId,
      kind: 'text',
      text: value,
      mentions: reconcileMentions(value, mentions),
      replyTo: target ? makeReplyRef(target) : null,
      status: 'sending',
      progress: 0,
      createdAt: new Date().toISOString(),
    })
    await deliverPending(localId)
  }

  async function sendFile(file: File): Promise<void> {
    checkFile(file)
    const localId = crypto.randomUUID()
    const path = `local:${localId}`
    localUrls.set(path, URL.createObjectURL(file))
    const target = replyingTo.value
    replyingTo.value = null
    pending.value.push({
      localId,
      kind: 'file',
      replyTo: target ? makeReplyRef(target) : null,
      file,
      info: {
        path,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        isImage: isInlineImage(file.type) && file.type !== 'image/svg+xml',
      },
      status: 'sending',
      progress: 0,
      createdAt: new Date().toISOString(),
    })
    await deliverPending(localId)
  }

  async function deliverPending(localId: string): Promise<void> {
    const p = pending.value.find((x) => x.localId === localId)
    if (!p) return
    p.status = 'sending'
    p.error = undefined
    p.progress = 0
    try {
      const sent =
        p.kind === 'text'
          ? await service.sendText(p.text ?? '', { mentions: p.mentions ?? [], replyToId: p.replyTo?.messageId })
          : await service.sendFile(
              p.file as File,
              (percent) => {
                p.progress = percent
              },
              { replyToId: p.replyTo?.messageId },
            )
      upsertMessage(sent)
      pending.value = pending.value.filter((x) => x.localId !== localId)
      if (p.info) {
        const url = localUrls.get(p.info.path)
        if (url) URL.revokeObjectURL(url)
        localUrls.delete(p.info.path)
      }
    } catch (e) {
      p.status = 'failed'
      p.error = errorText(e)
    }
  }

  function retry(localId: string): Promise<void> {
    return deliverPending(localId)
  }

  function discardPending(localId: string): void {
    const p = pending.value.find((x) => x.localId === localId)
    if (p?.info) {
      const url = localUrls.get(p.info.path)
      if (url) URL.revokeObjectURL(url)
      localUrls.delete(p.info.path)
    }
    pending.value = pending.value.filter((x) => x.localId !== localId)
  }

  async function editMessage(id: string, text: string): Promise<void> {
    try {
      upsertMessage(await service.editMessage(id, text))
    } catch (e) {
      throw new Error(errorText(e))
    }
  }

  async function recallMessage(id: string): Promise<void> {
    try {
      upsertMessage(await service.recallMessage(id))
    } catch (e) {
      throw new Error(errorText(e))
    }
  }

  function getEditHistory(id: string): Promise<EditRecord[]> {
    return service.getEditHistory(id)
  }

  /** 檔案或頭像的顯示／下載連結；還在上傳中的本機檔案直接用本機預覽 */
  async function fileUrl(path: string): Promise<string> {
    const local = localUrls.get(path)
    if (local) return local
    return service.getFileUrl(path)
  }

  function messageById(id: string): Message | undefined {
    return messages.value.find((m) => m.id === id)
  }

  function startReply(message: Message): void {
    if (message.recalled) return
    replyingTo.value = message
  }

  function cancelReply(): void {
    replyingTo.value = null
  }

  function toggleHide(memberId: string): void {
    const next = new Set(hidden.value)
    if (!next.delete(memberId)) next.add(memberId)
    hidden.value = next
    persistHidden()
  }

  function showMembers(): void {
    view.value = 'members'
  }
  function showChat(): void {
    view.value = 'chat'
  }

  // ---------- 分頁標題的未讀數 ----------

  watch([unread, unreadMentions], ([n, at]) => {
    // 平常顯示未讀數；有人 @ 你時，數字前面多一個 @
    document.title = n > 0 ? `(${at > 0 ? '@' : ''}${n}) ${TITLE}` : TITLE
  })
  function markRead(): void {
    unread.value = 0
    unreadMentions.value = 0
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) markRead()
  })
  window.addEventListener('focus', markRead)

  return {
    service,
    booting,
    phase,
    me,
    members,
    messages,
    connection,
    view,
    hidden,
    joining,
    joinError,
    joinNotice,
    unread,
    onlineCount,
    canSend,
    timeline,
    init,
    uploadAvatar,
    join,
    leave,
    sendText,
    sendFile,
    retry,
    discardPending,
    editMessage,
    recallMessage,
    getEditHistory,
    fileUrl,
    messageById,
    replyingTo,
    startReply,
    cancelReply,
    toggleHide,
    showMembers,
    showChat,
  }
})
