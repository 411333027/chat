// 「聊天服務」窗口：畫面只跟這份約定講話，不知道後面是假後端還是 Supabase。
// 動作、事件名稱與資料格式都對應 docs/architecture.md 第 5 節；改這裡就要同步改文件。

export const AVATAR_ICONS = ['star', 'moon', 'leaf', 'flame', 'heart', 'cloud'] as const
export const AVATAR_COLORS = ['blue', 'green', 'orange', 'pink', 'purple', 'teal'] as const
export type AvatarIcon = (typeof AVATAR_ICONS)[number]
export type AvatarColor = (typeof AVATAR_COLORS)[number]

export type Avatar =
  | { kind: 'preset'; icon: AvatarIcon; color: AvatarColor }
  | { kind: 'upload'; path: string }

export interface Member {
  id: string
  nickname: string
  avatar: Avatar
  online: boolean
  joinedAt: string
}

export interface FileInfo {
  path: string
  name: string
  size: number
  mime: string
  isImage: boolean
}

/** 訊息裡被 @ 的人。文字裡照樣寫出「@代號」，這裡記下是哪一位（代號是送出當下的快照）。 */
export interface Mention {
  memberId: string
  nickname: string
}

/** 這則訊息在回覆哪一則。由伺服器依「真正的原訊息」產生，不信任畫面傳來的內容。 */
export interface ReplyRef {
  messageId: string
  memberId: string
  nickname: string
  kind: 'text' | 'image' | 'file'
  /** 文字：前 80 字；圖片與檔案：檔名 */
  preview: string
}

export interface Message {
  id: string
  memberId: string
  nickname: string
  avatar: Avatar
  kind: 'text' | 'file'
  text: string | null
  mentions: Mention[]
  replyTo: ReplyRef | null
  file: FileInfo | null
  createdAt: string
  updatedAt: string
  edited: boolean
  recalled: boolean
}

export interface EditRecord {
  messageId: string
  oldText: string
  editedAt: string
}

export type ErrorCode =
  | 'NICKNAME_INVALID'
  | 'NICKNAME_TAKEN'
  | 'ROOM_FULL'
  | 'AVATAR_INVALID'
  | 'AVATAR_TYPE_INVALID'
  | 'AVATAR_TOO_LARGE'
  | 'NOT_A_MEMBER'
  | 'MESSAGE_EMPTY'
  | 'MESSAGE_TOO_LONG'
  | 'MESSAGE_RECALLED'
  | 'MENTION_INVALID'
  | 'REPLY_INVALID'
  | 'RATE_LIMITED'
  | 'FILE_TOO_LARGE'
  | 'FILE_UNAVAILABLE'
  | 'NOT_OWNER'
  | 'OFFLINE'

export const ERROR_TEXT: Record<ErrorCode, string> = {
  NICKNAME_INVALID: '代號要 1 到 12 個字，不能只有空白',
  NICKNAME_TAKEN: '這個代號已有人使用，請換一個',
  ROOM_FULL: '聊天室已滿（50 人），請稍後再試',
  AVATAR_INVALID: '頭像資料不正確，請重新選擇',
  AVATAR_TYPE_INVALID: '只能使用 png、jpg、webp 圖片',
  AVATAR_TOO_LARGE: '圖片不能超過 5MB',
  NOT_A_MEMBER: '你已離開聊天室，請重新輸入代號',
  MESSAGE_EMPTY: '請先輸入訊息',
  MESSAGE_TOO_LONG: '訊息不能超過 1000 字',
  MESSAGE_RECALLED: '這則訊息已收回，不能再編輯',
  MENTION_INVALID: '一則訊息最多可以 @ 10 個人',
  REPLY_INVALID: '要回覆的訊息已經不存在或已收回',
  RATE_LIMITED: '送得太快了，請稍等一下',
  FILE_TOO_LARGE: '檔案不能超過 10MB',
  FILE_UNAVAILABLE: '這個檔案已無法取得',
  NOT_OWNER: '只能操作自己的訊息',
  OFFLINE: '目前沒有連線，連線恢復後才能送出',
}

export class ChatError extends Error {
  code: ErrorCode
  constructor(code: ErrorCode) {
    super(ERROR_TEXT[code])
    this.code = code
    this.name = 'ChatError'
  }
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline'

/** 服務發出的事件（第 5.2 節）。 */
export interface ChatEvents {
  'connection.changed': { status: ConnectionStatus }
  'room.snapshot': { members: Member[] }
  'member.joined': { member: Member }
  'member.left': { memberId: string; nickname: string }
  'member.presence': { memberId: string; online: boolean }
  'message.created': { message: Message }
  'message.updated': { message: Message }
  'room.cleared': Record<string, never>
  'session.expired': Record<string, never>
}

export type ChatEventName = keyof ChatEvents
export type Unsubscribe = () => void

/** 只有假後端才有的測試按鈕（階段一用），真後端沒有這個欄位。 */
export interface DevTools {
  /** 模擬斷線（true）或恢復連線（false） */
  setOffline(offline: boolean): void
  /** 模擬「離線超過上限」：伺服器把我視為已離開 */
  expireMe(): void
  /** 加入機器人，直到聊天室滿 50 人 */
  fillRoom(): void
  /** 讓機器人馬上 @ 我一次，用來單獨測試「被提到」的畫面 */
  mentionMe(): void
  /** 讓機器人回覆我的上一則訊息，用來單獨測試「被回覆」的畫面 */
  replyToMe(): void
  /** 離線過久的上限（毫秒），只用來顯示在說明裡 */
  readonly expireAfterMs: number
}

export interface SendOptions {
  mentions?: Mention[]
  replyToId?: string
}

export interface ChatService {
  readonly devTools?: DevTools
  on<K extends ChatEventName>(name: K, handler: (payload: ChatEvents[K]) => void): Unsubscribe

  /** 進入前上傳自己的頭像圖片（瀏覽器端已裁切縮小），成功後得到頭像資料 */
  uploadAvatar(file: File): Promise<Avatar>
  join(nickname: string, avatar: Avatar): Promise<Member>
  /** 重新整理後，嘗試用原本的身分回到聊天室；已被視為離開時丟出 NOT_A_MEMBER */
  resume(): Promise<Member>
  leave(): Promise<void>

  /** options.mentions：文字裡用「@」挑出的人；options.replyToId：要回覆的訊息。
   *  伺服器都會再確認（人在不在聊天室、原訊息還在不在），不合的提及會被丟掉，回覆對象不合則失敗。 */
  sendText(text: string, options?: SendOptions): Promise<Message>
  sendFile(file: File, onProgress?: (percent: number) => void, options?: Pick<SendOptions, 'replyToId'>): Promise<Message>
  editMessage(id: string, newText: string): Promise<Message>
  recallMessage(id: string): Promise<Message>
  getEditHistory(id: string): Promise<EditRecord[]>
  /** 取得檔案或頭像的暫時顯示／下載連結 */
  getFileUrl(path: string): Promise<string>
  /** 取得「我加入之後」的所有訊息（重新整理後回到聊天室時用；加入前的訊息永遠拿不到） */
  loadMessages(): Promise<Message[]>
  /** 補上斷線期間錯過的訊息與變動（連線恢復時，由服務自己呼叫） */
  catchUp(): Promise<void>
}
