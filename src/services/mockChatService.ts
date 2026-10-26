// 階段一的「假後端」。它遵守 chatService.ts 的約定，做出真後端會有的行為：
// 同樣的錯誤代碼、同樣的事件順序、同樣的資料格式。階段二換成 Supabase 時，畫面不用改。
//
// 多人互動靠兩招：
//  1. 內建幾個機器人成員，會定時說話、進進出出。
//  2. 同一個瀏覽器開多個分頁時，用 BroadcastChannel（分頁之間的對講機）互相同步，
//     每個分頁算一個人。機器人只在「搶到 Web Lock 的那個分頁」裡跑，避免重複。
// 資料只存在瀏覽器：除了檔案內容，其餘會暫存在 localStorage，讓單一分頁重新整理後能回來。

import {
  ChatError,
  type Avatar,
  type ChatEventName,
  type ChatEvents,
  type ChatService,
  type ConnectionStatus,
  type DevTools,
  type EditRecord,
  type FileInfo,
  type Member,
  type Mention,
  type ReplyRef,
  type SendOptions,
  type Message,
  type Unsubscribe,
  AVATAR_COLORS,
  AVATAR_ICONS,
} from './chatService'
import {
  RATE_LIMIT_MS,
  ROOM_CAPACITY,
  checkAvatarFile,
  checkFile,
  checkText,
  isInlineImage,
  normalizeNickname,
} from '@/utils/validate'
import { blobToDataUrl, processAvatarImage } from '@/utils/avatar'
import { MENTION_MAX, reconcileMentions } from '@/utils/mention'
import { describeMessage } from '@/utils/reply'

/** 離線超過這段時間，就視為離開（第 0 節 #1，數字可調） */
const EXPIRE_AFTER_MS = 10 * 60 * 1000
const BEAT_EVERY_MS = 2000
const OFFLINE_AFTER_MS = 7000
const SESSION_KEY = 'chat-mock-session'
const ROOM_KEY = 'chat-mock-room'
const CHANNEL = 'chat-mock-channel'

interface RoomMember extends Member {
  lastSeen: number
  bot: boolean
}

interface RoomState {
  members: RoomMember[]
  messages: Message[]
  edits: Record<string, EditRecord[]>
}

type Op =
  | { t: 'join'; member: RoomMember }
  | { t: 'leave'; memberId: string; reason: 'left' | 'expired' }
  | { t: 'presence'; memberId: string; online: boolean }
  | { t: 'beat'; memberId: string; at: number }
  | { t: 'msg'; message: Message; blob?: Blob }
  | { t: 'edit'; message: Message; record: EditRecord }
  | { t: 'recall'; message: Message }

type Wire =
  | { t: 'hello'; from: string }
  | { t: 'whohas'; memberId: string; from: string }
  | { t: 'taken'; to: string }
  | { t: 'sync'; to: string; state: RoomState; blobs: [string, Blob][] }
  | { t: 'op'; op: Op }

const BOT_LINES = [
  '大家好，今天有人要一起看比賽嗎？',
  '我剛下班，現在才吃晚餐',
  '有人推薦最近好看的影集嗎？',
  '哈哈，這個太好笑了',
  '明天好像會下雨，記得帶傘',
  '我煮了咖喃，超級香',
  '剛剛那首歌是誰點的，好聽',
  '有人想一起去爬山嗎',
  '先去忙一下，等等回來',
  '晚上八點開始對吧？',
  '我也是這樣覺得',
  '今天的月亮好圓',
]

const BOT_SEEDS: { nickname: string; icon: Avatar & { kind: 'preset' } }[] = [
  { nickname: '阿凱', icon: { kind: 'preset', icon: 'leaf', color: 'green' } },
  { nickname: '小美', icon: { kind: 'preset', icon: 'heart', color: 'pink' } },
  { nickname: '大雄', icon: { kind: 'preset', icon: 'flame', color: 'orange' } },
  { nickname: 'Zoe', icon: { kind: 'preset', icon: 'moon', color: 'purple' } },
  { nickname: 'Mio', icon: { kind: 'preset', icon: 'cloud', color: 'teal' } },
]

function uid(): string {
  return crypto.randomUUID()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

type Handler = (payload: never) => void

export class MockChatService implements ChatService {
  readonly devTools: DevTools

  private handlers = new Map<ChatEventName, Set<Handler>>()
  private state: RoomState = { members: [], messages: [], edits: {} }
  private blobs = new Map<string, Blob>()
  private urls = new Map<string, string>()
  private beats = new Map<string, number>()
  private channel: BroadcastChannel | null = null
  private tabId = uid()
  private me: RoomMember | null = null
  /** 模擬斷線中 */
  private offline = false
  /** 斷線中，或剛恢復連線、還沒補完訊息：這段期間來自別人的變動先排隊 */
  private holding = false
  private queue: Array<() => void> = []
  private lastSentAt = 0
  private isLeader = false
  private ready: Promise<void>

  constructor() {
    this.devTools = {
      expireAfterMs: EXPIRE_AFTER_MS,
      setOffline: (v) => this.setOffline(v),
      expireMe: () => this.expireMe(),
      fillRoom: () => this.fillRoom(),
      mentionMe: () => this.mentionMe(),
      replyToMe: () => this.replyToMe(),
    }
    this.ready = this.start()
  }

  // ---------- 事件 ----------

  on<K extends ChatEventName>(name: K, handler: (payload: ChatEvents[K]) => void): Unsubscribe {
    let set = this.handlers.get(name)
    if (!set) this.handlers.set(name, (set = new Set()))
    set.add(handler as Handler)
    return () => set!.delete(handler as Handler)
  }

  private emit<K extends ChatEventName>(name: K, payload: ChatEvents[K]): void {
    this.handlers.get(name)?.forEach((h) => (h as (p: ChatEvents[K]) => void)(payload))
  }

  /** 離線時，來自別人的變動先排隊，連線恢復後由 catchUp 一次補上 */
  private deliver(fn: () => void): void {
    if (this.holding) this.queue.push(fn)
    else fn()
  }

  // ---------- 啟動與分頁同步 ----------

  private async start(): Promise<void> {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL)
      this.channel.onmessage = (e: MessageEvent<Wire>) => this.onWire(e.data)
    }
    let synced = false
    const wait = new Promise<void>((resolve) => {
      this.onSync = () => {
        synced = true
        resolve()
      }
      setTimeout(resolve, 250)
    })
    this.channel?.postMessage({ t: 'hello', from: this.tabId } satisfies Wire)
    await wait
    if (!synced) this.restoreFromStorage()
    this.cleanup()
    this.startLeaderElection()
    setInterval(() => this.tick(), BEAT_EVERY_MS)
    window.addEventListener('pagehide', () => this.persist())
  }

  private onSync: (() => void) | null = null
  private identityTaken: (() => void) | null = null

  private onWire(w: Wire): void {
    if (w.t === 'hello') {
      if (this.state.members.length === 0 && this.state.messages.length === 0) return
      // 搶到鎖的分頁優先回答；其他分頁稍晚回答，新分頁只收第一份
      const reply = () =>
        this.channel?.postMessage({
          t: 'sync',
          to: w.from,
          state: this.state,
          blobs: [...this.blobs.entries()],
        } satisfies Wire)
      if (this.isLeader) reply()
      else setTimeout(reply, 80)
    } else if (w.t === 'whohas') {
      // 有分頁問「這個身分是不是正在用」：我正在用的話就告訴它
      if (this.me && this.me.id === w.memberId && w.from !== this.tabId) {
        this.channel?.postMessage({ t: 'taken', to: w.from } satisfies Wire)
      }
    } else if (w.t === 'taken') {
      if (w.to === this.tabId) this.identityTaken?.()
    } else if (w.t === 'sync') {
      if (w.to !== this.tabId || !this.onSync) return
      this.state = w.state
      w.blobs.forEach(([k, b]) => this.blobs.set(k, b))
      this.onSync()
      this.onSync = null
    } else if (w.t === 'op') {
      this.apply(w.op, false)
    }
  }

  private startLeaderElection(): void {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks
    if (!locks) {
      this.becomeLeader()
      return
    }
    // 只有一個分頁會拿到鎖；它關掉後，鎖會交給下一個分頁
    void locks.request('chat-mock-leader', () => {
      this.becomeLeader()
      return new Promise<void>(() => undefined)
    })
  }

  private restoreFromStorage(): void {
    try {
      const raw = localStorage.getItem(ROOM_KEY)
      if (raw) this.state = JSON.parse(raw) as RoomState
    } catch {
      /* 讀不到就從空的開始 */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(ROOM_KEY, JSON.stringify(this.state))
    } catch {
      /* 空間不夠就算了：只是少了重新整理後的還原 */
    }
  }

  // ---------- 狀態變更（所有分頁用同一套規則，所以內容會一致） ----------

  private commit(op: Op): void {
    this.apply(op, true)
    try {
      this.channel?.postMessage({ t: 'op', op } satisfies Wire)
    } catch (e) {
      // 其他分頁收不到只是少了同步，不該讓自己的操作失敗
      console.warn('[mock] 無法同步到其他分頁', e)
    }
  }

  private visibleToMe(m: Message): boolean {
    return !!this.me && m.createdAt >= this.me.joinedAt
  }

  private apply(op: Op, own: boolean): void {
    const s = this.state
    switch (op.t) {
      case 'join': {
        if (s.members.some((m) => m.id === op.member.id)) break
        s.members.push(op.member)
        this.beats.set(op.member.id, op.member.lastSeen)
        if (!own || op.member.bot) {
          const pub = this.publicMember(op.member)
          this.deliver(() => this.emit('member.joined', { member: pub }))
        }
        break
      }
      case 'leave': {
        const i = s.members.findIndex((m) => m.id === op.memberId)
        if (i < 0) break
        const [gone] = s.members.splice(i, 1)
        this.beats.delete(gone.id)
        if (this.me && gone.id === this.me.id) {
          this.me = null
          sessionStorage.removeItem(SESSION_KEY)
          if (op.reason === 'expired') this.deliver(() => this.emit('session.expired', {}))
        } else {
          this.deliver(() => this.emit('member.left', { memberId: gone.id, nickname: gone.nickname }))
        }
        if (!s.members.some((m) => !m.bot)) this.clearRoom()
        break
      }
      case 'presence': {
        const m = s.members.find((x) => x.id === op.memberId)
        if (!m || m.online === op.online) break
        m.online = op.online
        if (this.me && m.id === this.me.id) break
        this.deliver(() => this.emit('member.presence', { memberId: m.id, online: op.online }))
        break
      }
      case 'beat': {
        this.beats.set(op.memberId, op.at)
        const m = s.members.find((x) => x.id === op.memberId)
        if (m) m.lastSeen = op.at
        break
      }
      case 'msg': {
        if (s.messages.some((m) => m.id === op.message.id)) break
        s.messages.push(op.message)
        if (op.blob && op.message.file) this.blobs.set(op.message.file.path, op.blob)
        if (this.visibleToMe(op.message)) {
          this.deliver(() => this.emit('message.created', { message: op.message }))
        }
        break
      }
      case 'edit':
      case 'recall': {
        const i = s.messages.findIndex((m) => m.id === op.message.id)
        if (i < 0) break
        s.messages[i] = op.message
        if (op.t === 'edit') {
          ;(s.edits[op.message.id] ??= []).push(op.record)
        } else {
          delete s.edits[op.message.id]
          if (op.message.file) {
            // 收回時同步刪除檔案（第 6.2 節）
          }
        }
        if (this.visibleToMe(op.message)) {
          this.deliver(() => this.emit('message.updated', { message: op.message }))
        }
        break
      }
    }
    this.persist()
  }

  private clearRoom(): void {
    this.state.messages = []
    this.state.edits = {}
    this.blobs.forEach((_, k) => this.revoke(k))
    this.blobs.clear()
    this.state.members = this.state.members.filter((m) => m.bot)
    this.persist()
  }

  private revoke(path: string): void {
    const u = this.urls.get(path)
    if (u) URL.revokeObjectURL(u)
    this.urls.delete(path)
  }

  private publicMember(m: RoomMember): Member {
    return { id: m.id, nickname: m.nickname, avatar: m.avatar, online: m.online, joinedAt: m.joinedAt }
  }

  private snapshot(): Member[] {
    return this.state.members.map((m) => this.publicMember(m))
  }

  // ---------- 定時工作：心跳、線上狀態、清理 ----------

  private tick(): void {
    const now = Date.now()
    if (this.me && !this.offline) {
      this.me.lastSeen = now
      this.commit({ t: 'beat', memberId: this.me.id, at: now })
    }
    // 每個分頁用同樣的規則算出別人的線上／離線中
    for (const m of this.state.members) {
      if (m.bot) continue
      const last = this.beats.get(m.id) ?? m.lastSeen
      const online = m.id === this.me?.id ? !this.offline : now - last < OFFLINE_AFTER_MS
      if (m.online !== online) this.apply({ t: 'presence', memberId: m.id, online }, false)
    }
    if (this.isLeader) this.cleanup()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const m of [...this.state.members]) {
      if (m.bot) continue
      const last = this.beats.get(m.id) ?? m.lastSeen
      if (now - last > EXPIRE_AFTER_MS) this.commit({ t: 'leave', memberId: m.id, reason: 'expired' })
    }
  }

  // ---------- 機器人（只在領頭分頁跑） ----------

  private botTimer: number | undefined

  private becomeLeader(): void {
    this.isLeader = true
    if (!this.state.members.some((m) => m.bot)) {
      BOT_SEEDS.forEach((b, i) => {
        if (i < 4) this.addBot(b.nickname, b.icon)
      })
    }
    this.scheduleBot()
  }

  private addBot(nickname: string, avatar: Avatar): RoomMember {
    const bot: RoomMember = {
      id: uid(),
      nickname,
      avatar,
      online: true,
      joinedAt: new Date().toISOString(),
      lastSeen: Date.now(),
      bot: true,
    }
    this.commit({ t: 'join', member: bot })
    return bot
  }

  private scheduleBot(): void {
    window.clearTimeout(this.botTimer)
    this.botTimer = window.setTimeout(() => {
      this.botAct()
      this.scheduleBot()
    }, 9000 + Math.random() * 14000)
  }

  private botAct(): void {
    const bots = this.state.members.filter((m) => m.bot)
    const humans = this.state.members.filter((m) => !m.bot)
    if (humans.length === 0) return // 沒有真人時，機器人安靜待命
    const r = Math.random()
    const bot = bots.length ? pick(bots) : null
    if (r < 0.5 && bot) {
      this.botSay(bot, pick(BOT_LINES))
    } else if (r < 0.62 && bot) {
      void this.botSendImage(bot)
    } else if (r < 0.7 && bot) {
      this.botSendFile(bot)
    } else if (r < 0.82 && bot && bots.length > 2) {
      this.commit({ t: 'leave', memberId: bot.id, reason: 'left' })
    } else if (r < 0.92) {
      const taken = new Set(this.state.members.map((m) => m.nickname.toLowerCase()))
      const seed = BOT_SEEDS.find((b) => !taken.has(b.nickname.toLowerCase()))
      if (seed && this.state.members.length < ROOM_CAPACITY) this.addBot(seed.nickname, seed.icon)
    } else if (bot) {
      this.commit({ t: 'presence', memberId: bot.id, online: !bot.online })
    }
  }

  private botMessage(bot: RoomMember, partial: Partial<Message>): Message {
    const now = new Date().toISOString()
    return {
      id: uid(),
      memberId: bot.id,
      nickname: bot.nickname,
      avatar: bot.avatar,
      kind: 'text',
      text: null,
      mentions: [],
      replyTo: null,
      file: null,
      createdAt: now,
      updatedAt: now,
      edited: false,
      recalled: false,
      ...partial,
    }
  }

  private botSay(bot: RoomMember, text: string): void {
    const humans = this.state.members.filter((m) => !m.bot)
    if (humans.length > 0 && Math.random() < 0.2) {
      // 偶爾回覆某位真人的最新一則訊息，方便測試「回覆你」
      const target = [...this.state.messages].reverse().find((m) => !m.recalled && humans.some((h) => h.id === m.memberId))
      if (target) {
        this.commit({ t: 'msg', message: this.botMessage(bot, { text, replyTo: this.refOf(target) }) })
        return
      }
    }
    if (humans.length > 0 && Math.random() < 0.25) {
      // 偶爾 @ 一位真人，方便測試「提到你」
      const target = pick(humans)
      const mention: Mention = { memberId: target.id, nickname: target.nickname }
      this.commit({ t: 'msg', message: this.botMessage(bot, { text: `@${target.nickname} ${text}`, mentions: [mention] }) })
      return
    }
    this.commit({ t: 'msg', message: this.botMessage(bot, { text }) })
  }

  private async botSendImage(bot: RoomMember): Promise<void> {
    const canvas = document.createElement('canvas')
    canvas.width = 560
    canvas.height = 360
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const palette = ['#C9D3C6', '#D9C7BC', '#C3CEDA', '#D8CCD9']
    ctx.fillStyle = pick(palette)
    ctx.fillRect(0, 0, 560, 360)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(160 + Math.random() * 240, 130 + Math.random() * 100, 70, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(90,110,130,0.35)'
    ctx.fillRect(0, 250, 560, 110)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) return
    const file: FileInfo = { path: `bot/${uid()}.png`, name: '風景.png', size: blob.size, mime: 'image/png', isImage: true }
    this.commit({ t: 'msg', message: this.botMessage(bot, { kind: 'file', file }), blob })
  }

  private botSendFile(bot: RoomMember): void {
    const blob = new Blob(['這是機器人傳的示範檔案。\n'], { type: 'application/pdf' })
    const file: FileInfo = { path: `bot/${uid()}.bin`, name: '賽程表.pdf', size: 2_048_000, mime: 'application/pdf', isImage: false }
    this.commit({ t: 'msg', message: this.botMessage(bot, { kind: 'file', file }), blob })
  }

  // ---------- 測試工具 ----------

  private setOffline(v: boolean): void {
    if (v === this.offline) return
    this.offline = v
    if (v) this.holding = true
    const status: ConnectionStatus = v ? 'offline' : 'reconnecting'
    this.emit('connection.changed', { status })
    if (this.me) this.commit({ t: 'presence', memberId: this.me.id, online: !v })
    if (!v) {
      // 模擬重新連線需要一點時間
      window.setTimeout(() => {
        void this.catchUp().then(() => this.emit('connection.changed', { status: 'connected' }))
      }, 900)
    }
  }

  private refOf(m: Message): ReplyRef {
    return { messageId: m.id, memberId: m.memberId, nickname: m.nickname, ...describeMessage(m) }
  }

  private replyToMe(): void {
    const me = this.me
    if (!me) return
    const mine = [...this.state.messages].reverse().find((m) => m.memberId === me.id && !m.recalled)
    if (!mine) throw new Error('請先自己送出一則訊息，機器人才有東西可以回覆')
    const bot = this.state.members.find((m) => m.bot) ?? this.addBot('阿凱', BOT_SEEDS[0].icon)
    this.commit({ t: 'msg', message: this.botMessage(bot, { text: pick(BOT_LINES), replyTo: this.refOf(mine) }) })
  }

  private mentionMe(): void {
    const me = this.me
    if (!me) return
    const bot = this.state.members.find((m) => m.bot) ?? this.addBot('阿凱', BOT_SEEDS[0].icon)
    const mention: Mention = { memberId: me.id, nickname: me.nickname }
    const text = `@${me.nickname} ${pick(BOT_LINES)}`
    this.commit({ t: 'msg', message: this.botMessage(bot, { text, mentions: [mention] }) })
  }

  private expireMe(): void {
    if (!this.me) return
    this.commit({ t: 'leave', memberId: this.me.id, reason: 'expired' })
  }

  private fillRoom(): void {
    let n = 0
    while (this.state.members.length < ROOM_CAPACITY) {
      n += 1
      this.addBot(`路人${n}`, {
        kind: 'preset',
        icon: AVATAR_ICONS[n % AVATAR_ICONS.length],
        color: AVATAR_COLORS[n % AVATAR_COLORS.length],
      })
    }
  }

  // ---------- ChatService 動作 ----------

  private requireMe(): RoomMember {
    if (this.holding) throw new ChatError('OFFLINE')
    if (!this.me) throw new ChatError('NOT_A_MEMBER')
    return this.me
  }

  private checkRate(): void {
    const now = Date.now()
    if (now - this.lastSentAt < RATE_LIMIT_MS) throw new ChatError('RATE_LIMITED')
    this.lastSentAt = now
  }

  async uploadAvatar(file: File): Promise<Avatar> {
    checkAvatarFile(file)
    const blob = await processAvatarImage(file)
    // 假後端沒有 Storage：把處理好的小圖直接當作 data URL，這樣其他分頁也看得到
    return { kind: 'upload', path: await blobToDataUrl(blob) }
  }

  async join(nickname: string, avatar: Avatar): Promise<Member> {
    await this.ready
    await sleep(250)
    // 畫面傳來的可能是 Vue 的響應式代理物件，先複製成一般物件，才傳得給其他分頁
    avatar = { ...avatar }
    const name = normalizeNickname(nickname)
    if (avatar.kind === 'preset') {
      if (!AVATAR_ICONS.includes(avatar.icon) || !AVATAR_COLORS.includes(avatar.color)) {
        throw new ChatError('AVATAR_INVALID')
      }
    } else if (!avatar.path.startsWith('data:image/')) {
      throw new ChatError('AVATAR_INVALID')
    }
    if (this.state.members.some((m) => m.nickname.toLowerCase() === name.toLowerCase())) {
      throw new ChatError('NICKNAME_TAKEN')
    }
    if (this.state.members.length >= ROOM_CAPACITY) throw new ChatError('ROOM_FULL')
    const member: RoomMember = {
      id: uid(),
      nickname: name,
      avatar,
      online: true,
      joinedAt: new Date().toISOString(),
      lastSeen: Date.now(),
      bot: false,
    }
    this.me = member
    sessionStorage.setItem(SESSION_KEY, member.id)
    this.commit({ t: 'join', member })
    this.emit('room.snapshot', { members: this.snapshot() })
    return this.publicMember(member)
  }

  async resume(): Promise<Member> {
    await this.ready
    const id = sessionStorage.getItem(SESSION_KEY)
    let found = id ? this.state.members.find((m) => m.id === id && !m.bot) : undefined
    if (found && (await this.isIdentityInUse(found.id))) {
      // 「複製分頁」會連 sessionStorage 一起複製，變成兩個分頁用同一個身分。
      // 這裡讓後開的分頁重新選代號，這樣每個分頁才是不同的人（才能互相 @）。
      found = undefined
    }
    if (!found) {
      sessionStorage.removeItem(SESSION_KEY)
      throw new ChatError('NOT_A_MEMBER')
    }
    this.me = found
    found.lastSeen = Date.now()
    this.commit({ t: 'presence', memberId: found.id, online: true })
    this.emit('room.snapshot', { members: this.snapshot() })
    return this.publicMember(found)
  }

  /** 問其他分頁：這個身分是不是正在用？（重新整理的舊頁面已經不在了，所以不會有人回答） */
  private isIdentityInUse(memberId: string): Promise<boolean> {
    if (!this.channel) return Promise.resolve(false)
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        this.identityTaken = null
        resolve(v)
      }
      this.identityTaken = () => done(true)
      this.channel!.postMessage({ t: 'whohas', memberId, from: this.tabId } satisfies Wire)
      setTimeout(() => done(false), 250)
    })
  }

  async leave(): Promise<void> {
    if (!this.me) return
    const id = this.me.id
    this.commit({ t: 'leave', memberId: id, reason: 'left' })
    this.me = null
    sessionStorage.removeItem(SESSION_KEY)
  }

  private newMessage(me: RoomMember, partial: Partial<Message>): Message {
    const now = new Date().toISOString()
    return {
      id: uid(),
      memberId: me.id,
      nickname: me.nickname,
      avatar: me.avatar,
      kind: 'text',
      text: null,
      mentions: [],
      replyTo: null,
      file: null,
      createdAt: now,
      updatedAt: now,
      edited: false,
      recalled: false,
      ...partial,
    }
  }

  /** 伺服器端的把關：@ 的人必須真的在聊天室、文字裡真的寫著「@代號」，代號以伺服器上的為準 */
  private checkMentions(text: string, mentions: Mention[]): Mention[] {
    if (mentions.length > MENTION_MAX) throw new ChatError('MENTION_INVALID')
    const real: Mention[] = []
    for (const m of mentions) {
      const member = this.state.members.find((x) => x.id === m.memberId)
      if (member) real.push({ memberId: member.id, nickname: member.nickname })
    }
    return reconcileMentions(text, real)
  }

  /** 回覆對象必須是我看得到、還沒收回的訊息；引用的內容由伺服器依原訊息產生 */
  private buildReply(replyToId: string | undefined): ReplyRef | null {
    if (!replyToId) return null
    const original = this.state.messages.find((m) => m.id === replyToId)
    if (!original || original.recalled || !this.visibleToMe(original)) throw new ChatError('REPLY_INVALID')
    return this.refOf(original)
  }

  async sendText(text: string, options: SendOptions = {}): Promise<Message> {
    const me = this.requireMe()
    const value = checkText(text)
    const mentions = (options.mentions ?? []).map((m) => ({ memberId: m.memberId, nickname: m.nickname }))
    const checked = this.checkMentions(value, mentions)
    const replyTo = this.buildReply(options.replyToId)
    this.checkRate()
    await sleep(120)
    const message = this.newMessage(me, { text: value, mentions: checked, replyTo })
    this.commit({ t: 'msg', message })
    return message
  }

  async sendFile(
    file: File,
    onProgress?: (percent: number) => void,
    options: Pick<SendOptions, 'replyToId'> = {},
  ): Promise<Message> {
    const me = this.requireMe()
    checkFile(file)
    const replyTo = this.buildReply(options.replyToId)
    this.checkRate()
    for (let p = 10; p <= 100; p += 18) {
      onProgress?.(Math.min(p, 100))
      await sleep(90)
    }
    onProgress?.(100)
    const mime = file.type || 'application/octet-stream'
    const info: FileInfo = {
      path: `${me.id}/${uid()}`,
      name: file.name.replace(/[\\/]/g, '_').slice(0, 120),
      size: file.size,
      mime,
      isImage: isInlineImage(mime) && mime !== 'image/svg+xml',
    }
    const message = this.newMessage(me, { kind: 'file', file: info, replyTo })
    this.commit({ t: 'msg', message, blob: file })
    return message
  }

  private ownMessage(id: string): Message {
    const me = this.requireMe()
    const m = this.state.messages.find((x) => x.id === id)
    if (!m) throw new ChatError('NOT_OWNER')
    if (m.memberId !== me.id) throw new ChatError('NOT_OWNER')
    return m
  }

  async editMessage(id: string, newText: string): Promise<Message> {
    const m = this.ownMessage(id)
    if (m.recalled) throw new ChatError('MESSAGE_RECALLED')
    if (m.kind !== 'text') throw new ChatError('NOT_OWNER')
    const value = checkText(newText)
    if (value === m.text) return m
    const now = new Date().toISOString()
    const record: EditRecord = { messageId: id, oldText: m.text ?? '', editedAt: now }
    const message: Message = {
      ...m,
      text: value,
      mentions: reconcileMentions(value, m.mentions ?? []),
      edited: true,
      updatedAt: now,
    }
    this.commit({ t: 'edit', message, record })
    return message
  }

  async recallMessage(id: string): Promise<Message> {
    const m = this.ownMessage(id)
    if (m.recalled) return m
    const now = new Date().toISOString()
    const message: Message = { ...m, text: null, mentions: [], replyTo: null, file: null, recalled: true, edited: false, updatedAt: now }
    if (m.file) {
      this.blobs.delete(m.file.path)
      this.revoke(m.file.path)
    }
    this.commit({ t: 'recall', message })
    return message
  }

  async getEditHistory(id: string): Promise<EditRecord[]> {
    if (!this.me) throw new ChatError('NOT_A_MEMBER')
    const list = this.state.edits[id] ?? []
    return [...list].reverse()
  }

  async getFileUrl(path: string): Promise<string> {
    if (path.startsWith('data:')) return path
    const cached = this.urls.get(path)
    if (cached) return cached
    const blob = this.blobs.get(path)
    if (!blob) throw new ChatError('FILE_UNAVAILABLE')
    const url = URL.createObjectURL(blob)
    this.urls.set(path, url)
    return url
  }

  async loadMessages(): Promise<Message[]> {
    if (!this.me) throw new ChatError('NOT_A_MEMBER')
    return this.state.messages
      .filter((m) => this.visibleToMe(m))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async catchUp(): Promise<void> {
    // 離線太久被清掉的話，session.expired 也在排隊裡，照常播出即可
    const queued = this.queue.splice(0)
    this.holding = false
    queued.forEach((fn) => fn())
    if (this.me) this.emit('room.snapshot', { members: this.snapshot() })
  }
}
