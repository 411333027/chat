import type { ChatService } from './chatService'
import { MockChatService } from './mockChatService'
import { SupabaseChatService } from './supabaseChatService'

/** 依 VITE_CHAT_BACKEND 決定用假後端（mock，預設）或真後端（supabase）。畫面不需要知道是哪一個。 */
export function createChatService(): ChatService {
  if (import.meta.env.VITE_CHAT_BACKEND === 'supabase') {
    return new SupabaseChatService() as unknown as ChatService
  }
  return new MockChatService()
}
