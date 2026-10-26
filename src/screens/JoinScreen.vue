<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { DEFAULT_AVATAR } from '@/utils/avatar'
import { NICKNAME_MAX, charCount, isNicknameValid } from '@/utils/validate'
import type { Avatar } from '@/services/chatService'
import AvatarPicker from '@/components/AvatarPicker.vue'
import Icon from '@/components/Icon.vue'

const store = useChatStore()
const nickname = ref('')
const avatar = ref<Avatar>({ ...DEFAULT_AVATAR })

const count = computed(() => charCount(nickname.value.trim()))
const tooLong = computed(() => count.value > NICKNAME_MAX)
const valid = computed(() => isNicknameValid(nickname.value))

async function submit(): Promise<void> {
  if (!valid.value || store.joining) return
  await store.join(nickname.value, avatar.value)
}

const points = ['所有人都在同一個聊天室', '電腦、手機都能用', '最後一個人離開後，訊息就清空']
</script>

<template>
  <main class="join">
    <section class="panel on-accent" aria-label="關於這個聊天室">
      <div class="logo logo-on-accent"><Icon name="chat" :size="32" /></div>
      <h1>匿名聊天室</h1>
      <p class="intro">不用註冊，不用登入。取一個代號，就能加入大家的對話。</p>
      <ul class="points">
        <li v-for="p in points" :key="p"><Icon name="check" :size="18" :stroke="2" />{{ p }}</li>
      </ul>
    </section>

    <section class="form-side">
      <div class="card">
        <header class="brand-mobile">
          <div class="logo"><Icon name="chat" :size="26" /></div>
          <h1>匿名聊天室</h1>
          <p class="intro">不用註冊，不用登入。取一個代號，就能加入大家的對話。</p>
        </header>
        <h2 class="card-title">進入聊天室前</h2>

        <form @submit.prevent="submit">
          <AvatarPicker v-model="avatar" />

          <div class="field">
            <label for="nick">你的代號</label>
            <input
              id="nick"
              v-model="nickname"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              aria-describedby="nick-help"
              :aria-invalid="tooLong"
            />
            <div id="nick-help" class="help">
              <span>1 到 12 個字，中英文、數字都可以</span>
              <span :class="{ over: tooLong }">{{ count }} / {{ NICKNAME_MAX }}</span>
            </div>
          </div>

          <div class="messages">
            <div v-if="store.joinError" role="alert" class="note note-error">
              <Icon name="alert" :size="18" />{{ store.joinError }}
            </div>
            <div v-else-if="store.joinNotice" role="status" class="note note-info">
              <Icon name="alert" :size="18" />{{ store.joinNotice }}
            </div>
          </div>

          <button type="submit" class="btn btn-primary submit" :disabled="!valid || store.joining">
            {{ store.joining ? '進入中…' : '進入聊天室' }}
          </button>
        </form>
      </div>
    </section>
  </main>
</template>

<style scoped>
.join {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
  --ring-gap: var(--bg-page);
}

.panel {
  display: none;
}

.form-side {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 28px;
}

.card {
  width: 100%;
  max-width: 390px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.brand-mobile {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.logo {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--bg-raised);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

h1 {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.intro {
  font-size: 15px;
  line-height: 1.7;
  color: var(--muted);
}

.card-title {
  display: none;
  font-size: 22px;
  font-weight: 700;
}

form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

label {
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-2);
}

input[type='text'] {
  height: 52px;
  padding: 0 16px;
  border-radius: var(--radius-field);
  border: 1px solid var(--border-input);
  background: var(--bg-surface);
  font-size: 16px; /* 16px 以上，iPhone 才不會自動放大畫面 */
  color: var(--ink);
}

input[type='text'][aria-invalid='true'] {
  border-color: var(--danger);
}

.help {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--muted);
}

.help .over {
  color: var(--danger);
  font-weight: 500;
}

.messages {
  min-height: 46px;
}

.submit {
  height: 52px;
  font-size: 16px;
  border-radius: var(--radius-field);
}

@media (min-width: 860px) {
  .join {
    flex-direction: row;
    --ring-gap: var(--bg-surface);
  }

  .panel {
    flex: none;
    width: 520px;
    padding: 0 64px;
    background: var(--accent);
    color: var(--on-accent);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 20px;
  }

  .panel h1 {
    font-size: 44px;
  }

  .panel .intro {
    color: var(--on-accent-muted);
    font-size: 17px;
    line-height: 1.8;
  }

  .logo-on-accent {
    width: 60px;
    height: 60px;
    border-radius: 18px;
    background: rgba(245, 241, 234, 0.18);
    color: var(--on-accent);
  }

  .points {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .points li {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 16px;
  }

  .form-side {
    padding: 32px;
  }

  .card {
    max-width: 440px;
    padding: 36px 36px 32px;
    border-radius: 20px;
    background: var(--bg-surface);
  }

  .brand-mobile {
    display: none;
  }

  .card-title {
    display: block;
  }

  input[type='text'] {
    background: var(--bg-page);
  }
}

@media (max-width: 859px) {
  .points {
    display: none;
  }
}
</style>
