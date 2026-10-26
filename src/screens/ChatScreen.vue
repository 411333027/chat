<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { ROOM_CAPACITY } from '@/utils/validate'
import { useIsDesktop } from '@/composables/useIsDesktop'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ConnectionBanner from '@/components/ConnectionBanner.vue'
import Icon from '@/components/Icon.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import MemberList from '@/components/MemberList.vue'
import MessageInput from '@/components/MessageInput.vue'
import MessageList from '@/components/MessageList.vue'
import MembersScreen from './MembersScreen.vue'

const store = useChatStore()
const isDesktop = useIsDesktop()
const confirmLeave = ref(false)
const viewer = ref<{ url: string; name: string } | null>(null)

async function leave(): Promise<void> {
  confirmLeave.value = false
  await store.leave()
}
</script>

<template>
  <MembersScreen v-if="!isDesktop && store.view === 'members'" />

  <div v-else class="chat">
    <section class="main">
      <header class="bar on-accent">
        <div class="title">
          <h1>匿名聊天室</h1>
          <span class="online"><span class="dot" aria-hidden="true" />{{ store.onlineCount }} 人在線</span>
        </div>
        <div class="tools">
          <button v-if="!isDesktop" type="button" class="icon-btn" aria-label="成員名單" @click="store.showMembers()">
            <Icon name="users" :size="22" />
          </button>
          <button v-if="!isDesktop" type="button" class="icon-btn leave-icon" aria-label="離開聊天室" @click="confirmLeave = true">
            <Icon name="exit" :size="22" />
          </button>
          <button v-else type="button" class="leave" @click="confirmLeave = true">
            <Icon name="exit" :size="18" />離開
          </button>
        </div>
      </header>

      <ConnectionBanner />
      <MessageList @open-image="viewer = $event" />
      <MessageInput />
    </section>

    <aside v-if="isDesktop" class="side" aria-label="成員名單">
      <div class="side-head">
        <h2>成員</h2>
        <span>{{ store.members.length }} / {{ ROOM_CAPACITY }}</span>
      </div>
      <div class="side-body"><MemberList /></div>
    </aside>

    <ConfirmDialog
      v-if="confirmLeave"
      title="確定要離開嗎？"
      message="離開後，你的代號會釋出，也看不到目前的訊息。"
      confirm-label="離開"
      @confirm="leave"
      @cancel="confirmLeave = false"
    />
    <ImageViewer v-if="viewer" :url="viewer.url" :name="viewer.name" @close="viewer = null" />
  </div>
</template>

<style scoped>
.chat {
  height: 100%;
  display: flex;
  background: var(--bg-page);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.bar {
  flex: none;
  height: var(--header-h);
  padding: 0 8px 0 16px;
  background: var(--accent);
  color: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

h1 {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
}

.online {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--on-accent-muted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--online);
}

.tools {
  display: flex;
  align-items: center;
}

.icon-btn {
  width: var(--tap);
  height: var(--tap);
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: rgba(245, 241, 234, 0.12);
}

.leave-icon {
  color: var(--danger-on-accent);
}

.leave {
  height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--danger-on-accent-border);
  background: transparent;
  color: var(--danger-on-accent);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.leave:hover {
  background: rgba(245, 241, 234, 0.1);
}

.side {
  flex: none;
  width: var(--sidebar-w);
  border-left: 1px solid var(--line);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
}

.side-head {
  flex: none;
  height: var(--header-h);
  padding: 0 20px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.side-head h2 {
  font-size: 16px;
  font-weight: 700;
}

.side-head span {
  font-size: 14px;
  color: var(--muted);
}

.side-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

@media (min-width: 860px) {
  .bar {
    padding: 0 24px 0 32px;
  }

  h1 {
    font-size: 18px;
  }
  .title {
    flex-direction: row;
    align-items: center;
    gap: 16px;
  }
  .online {
    font-size: 14px;
  }
}
</style>
