// 階段二才會實作：用 Supabase 做真正的後端（匿名登入、資料庫、Realtime、Storage）。
// 階段一刻意留空——這一階段不安裝、也不連接 Supabase。
// 它必須遵守 chatService.ts 的同一份約定，畫面才不用改（docs/architecture.md 第 4 節）。

import type { ChatService } from './chatService'

export class SupabaseChatService {
  constructor() {
    throw new Error(
      '尚未實作 Supabase 後端（階段二）。請把 VITE_CHAT_BACKEND 設為 mock，或先完成階段二。',
    )
  }
}

// 讓編譯器確認：將來真正的實作必須符合 ChatService 約定
export type _SupabaseChatServiceContract = ChatService
