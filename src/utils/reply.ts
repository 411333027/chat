// 回覆：把一則訊息整理成「引用」要顯示的樣子。

import type { Message, ReplyRef } from '@/services/chatService'

export const REPLY_PREVIEW_MAX = 80

export interface QuoteView {
  kind: 'text' | 'image' | 'file'
  preview: string
}

/** 文字取前 80 字（換行與連續空白縮成一個空格）；圖片與檔案用檔名 */
export function describeMessage(m: Message): QuoteView {
  if (m.kind === 'file' && m.file) {
    return { kind: m.file.isImage ? 'image' : 'file', preview: m.file.name }
  }
  const flat = (m.text ?? '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return {
    kind: 'text',
    preview: chars.length > REPLY_PREVIEW_MAX ? chars.slice(0, REPLY_PREVIEW_MAX).join('') + '…' : flat,
  }
}

/** 畫面端先暫時組一份（送出中的訊息要馬上顯示引用）；正式的以伺服器回傳為準 */
export function makeReplyRef(m: Message): ReplyRef {
  return { messageId: m.id, memberId: m.memberId, nickname: m.nickname, ...describeMessage(m) }
}
