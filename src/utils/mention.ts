// @ 提及：輸入時偵測「@」、顯示時把文字切成一般字與標籤、送出前整理名單。

import type { Mention } from '@/services/chatService'

export const MENTION_MAX = 10

/** 一小段文字：一般字，或是一個被 @ 的人 */
export interface Segment {
  text: string
  mention?: Mention
}

/** 游標前面的字如果正在輸入「@某某」，回傳 @ 的位置與已輸入的搜尋字；否則回傳 null。
 *  「@」前面必須是開頭或空白，這樣 email（a@b.com）不會誤觸。 */
export function findMentionQuery(beforeCaret: string): { start: number; query: string } | null {
  const m = /(^|\s)@([^\s@]{0,12})$/u.exec(beforeCaret)
  if (!m) return null
  return { start: m.index + m[1].length, query: m[2] }
}

function token(m: Mention): string {
  return `@${m.nickname}`
}

/** 把訊息文字切成「一般字」與「@標籤」，供畫面顯示（只用文字節點，不產生 HTML） */
export function splitMentions(text: string, mentions: Mention[] | undefined): Segment[] {
  const list = [...(mentions ?? [])].sort((a, b) => b.nickname.length - a.nickname.length)
  if (!text || list.length === 0) return [{ text }]
  const out: Segment[] = []
  let plain = ''
  let i = 0
  while (i < text.length) {
    const hit = text[i] === '@' ? list.find((m) => text.startsWith(token(m), i)) : undefined
    if (hit) {
      if (plain) out.push({ text: plain })
      plain = ''
      out.push({ text: token(hit), mention: hit })
      i += token(hit).length
    } else {
      plain += text[i]
      i += 1
    }
  }
  if (plain) out.push({ text: plain })
  return out
}

/** 只留下文字裡真的還寫著「@代號」的提及，並去掉重複的人 */
export function reconcileMentions(text: string, mentions: Mention[]): Mention[] {
  const seen = new Set<string>()
  const kept: Mention[] = []
  for (const m of mentions) {
    if (seen.has(m.memberId)) continue
    if (text.includes(token(m))) {
      seen.add(m.memberId)
      kept.push({ memberId: m.memberId, nickname: m.nickname })
    }
  }
  return kept
}
