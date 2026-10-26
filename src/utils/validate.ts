// 代號、訊息、檔案、頭像的檢查規則。假後端與真後端共用這份規格（第 9 節）。
// 前端檢查只是為了好用；真正的把關在 Supabase 伺服器上。

import { ChatError } from '@/services/chatService'

export const NICKNAME_MAX = 12
export const MESSAGE_MAX = 1000
export const FILE_MAX_BYTES = 10 * 1024 * 1024
export const AVATAR_ORIGINAL_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_PROCESSED_MAX_BYTES = 200 * 1024
export const ROOM_CAPACITY = 50
export const RATE_LIMIT_MS = 1000
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const INLINE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

// 控制字元、零寬字元、改變閱讀方向的字元：拿來假冒別人的代號
const FORBIDDEN_RANGES: Array<[number, number]> = [
  [0x0000, 0x001f], // 控制字元
  [0x007f, 0x009f],
  [0x200b, 0x200f], // 零寬字元與方向標記
  [0x2028, 0x2029],
  [0x202a, 0x202e], // 改變閱讀方向
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
]

function hasForbiddenChar(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    if (FORBIDDEN_RANGES.some(([lo, hi]) => c >= lo && c <= hi)) return true
  }
  return false
}

export function charCount(text: string): number {
  return Array.from(text).length
}

/** 回傳整理過的代號（去前後空白）；格式不合時丟出 NICKNAME_INVALID。 */
export function normalizeNickname(raw: string): string {
  const value = raw.trim()
  const n = charCount(value)
  if (n < 1 || n > NICKNAME_MAX || hasForbiddenChar(value)) {
    throw new ChatError('NICKNAME_INVALID')
  }
  return value
}

export function isNicknameValid(raw: string): boolean {
  try {
    normalizeNickname(raw)
    return true
  } catch {
    return false
  }
}

export function checkText(text: string): string {
  const value = text.trim()
  if (!value) throw new ChatError('MESSAGE_EMPTY')
  if (charCount(value) > MESSAGE_MAX) throw new ChatError('MESSAGE_TOO_LONG')
  return value
}

export function checkFile(file: File): void {
  if (file.size > FILE_MAX_BYTES) throw new ChatError('FILE_TOO_LARGE')
}

export function isInlineImage(mime: string): boolean {
  return INLINE_IMAGE_MIME_TYPES.includes(mime)
}

export function checkAvatarFile(file: File): void {
  if (!AVATAR_MIME_TYPES.includes(file.type)) throw new ChatError('AVATAR_TYPE_INVALID')
  if (file.size > AVATAR_ORIGINAL_MAX_BYTES) throw new ChatError('AVATAR_TOO_LARGE')
}
