<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, onMounted, ref } from 'vue';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { getCaptchaChallengeApi } from '#/api';
import { useAuthStore } from '#/store';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();
type CaptchaChallenge = Awaited<ReturnType<typeof getCaptchaChallengeApi>>;

const captchaAnswer = ref('');
const captchaChallenge = ref<CaptchaChallenge | null>(null);
const captchaLoading = ref(true);

function getCaptchaChars(text: string) {
  return text.split('');
}

function getCaptchaCharStyle(index: number, text: string) {
  const seed = `${text}-${index}`;
  const hash = Array.from(seed).reduce((acc, char) => {
    return (acc * 31 + char.charCodeAt(0)) % 9973;
  }, 17);
  const rotate = (hash % 21) - 10;
  const translateY = ((hash >> 3) % 13) - 6;
  const translateX = ((hash >> 5) % 11) - 5;
  const scale = 0.82 + (hash % 20) * 0.012;
  const colors = ['#1f2937', '#334155', '#475569', '#0f172a', '#111827', '#374151'];
  const skewX = ((hash >> 4) % 7) - 3;
  const skewY = ((hash >> 6) % 5) - 2;

  return {
    color: colors[hash % colors.length],
    fontSize: `${30 + (hash % 16)}px`,
    fontWeight: 600 + (hash % 3) * 100,
    opacity: 0.8 + ((hash >> 2) % 14) * 0.012,
    transform: `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg) skew(${skewX}deg, ${skewY}deg) scale(${scale})`,
  };
}

const captchaNoiseLines = computed(() => {
  const text = captchaChallenge.value?.captchaText ?? '';
  if (!text) return [];

  const seed = captchaChallenge.value?.captchaToken ?? text;
  return Array.from({ length: 6 }, (_, index) => {
    const hash = Array.from(`${seed}-line-${index}`).reduce((acc, char) => {
      return (acc * 37 + char.charCodeAt(0)) % 10007;
    }, 41);

    return {
      left: `${(hash % 900) / 10}%`,
      opacity: 0.18 + ((hash >> 3) % 6) * 0.06,
      top: `${((hash >> 5) % 700) / 10}%`,
      transform: `rotate(${(hash % 58) - 29}deg)`,
      width: `${30 + (hash % 120)}px`,
    };
  });
});

const captchaNoiseDots = computed(() => {
  const text = captchaChallenge.value?.captchaText ?? '';
  if (!text) return [];

  const seed = captchaChallenge.value?.captchaToken ?? text;
  return Array.from({ length: 28 }, (_, index) => {
    const hash = Array.from(`${seed}-${index}`).reduce((acc, char) => {
      return (acc * 33 + char.charCodeAt(0)) % 10007;
    }, 29);

    return {
      height: `${1 + (hash % 4)}px`,
      left: `${(hash % 1000) / 10}%`,
      opacity: 0.12 + ((hash >> 2) % 7) * 0.08,
      top: `${((hash >> 5) % 1000) / 10}%`,
      transform: `rotate(${(hash % 360) - 180}deg)`,
      width: `${4 + (hash % 14)}px`,
    };
  });
});

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
  ];
});

async function loadCaptchaChallenge() {
  captchaLoading.value = !captchaChallenge.value;
  try {
    const nextChallenge = await getCaptchaChallengeApi();
    captchaChallenge.value = nextChallenge;
    captchaAnswer.value = '';
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 429) {
      message.warning('验证码获取过于频繁，请稍后再试');
      return;
    }

    message.error($t('fallback.http.networkError'));
  } finally {
    captchaLoading.value = false;
  }
}

function handleCaptchaClick() {
  void loadCaptchaChallenge();
}

function handleCaptchaKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    void loadCaptchaChallenge();
  }
}

async function onSubmit(params: Recordable<any>) {
  if (!captchaChallenge.value || !captchaAnswer.value.trim()) {
    message.warning($t('ui.captcha.title'));
    return;
  }

  try {
    await authStore.authLogin({
      login: (params.username ?? params.login) as string,
      password: params.password as string,
      captcha_answer: captchaAnswer.value,
      captcha_token: captchaChallenge.value.captchaToken,
    });
  } catch {
    await loadCaptchaChallenge();
  }
}

onMounted(() => {
  void loadCaptchaChallenge();
});
</script>

<template>
  <AuthenticationLogin
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :show-code-login="false"
    :show-qrcode-login="false"
    :show-register="false"
    :show-forget-password="false"
    :show-remember-me="false"
    :show-third-party-login="false"
    @submit="onSubmit"
  >
    <template #third-party-login>
      <div class="mt-4 flex flex-col gap-3">
        <div
          v-if="captchaLoading && !captchaChallenge"
          class="text-muted-foreground text-center text-sm"
        >
          {{ $t('ui.captcha.loading') }}
        </div>
        <div
          v-else-if="captchaChallenge"
          class="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4"
        >
          <div
            class="relative flex select-none items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-background px-4 py-4 font-mono text-3xl font-semibold tracking-[0.35em] text-foreground cursor-pointer"
            name="captcha-text"
            role="button"
            tabindex="0"
            @click="handleCaptchaClick"
            @keydown="handleCaptchaKeydown"
          >
            <span class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.08),transparent_18%),radial-gradient(circle_at_80%_25%,rgba(16,185,129,0.07),transparent_16%),radial-gradient(circle_at_50%_80%,rgba(244,63,94,0.06),transparent_20%)]" />
            <span class="absolute inset-0 opacity-70">
              <span
                v-for="(line, index) in captchaNoiseLines"
                :key="`line-${index}`"
                class="absolute left-0 top-1/2 h-px origin-center bg-foreground/20"
                :style="line"
              />
              <span
                v-for="(dot, index) in captchaNoiseDots"
                :key="index"
                class="absolute rounded-full bg-foreground/20"
                :style="dot"
              />
            </span>
            <span
              v-for="(char, index) in getCaptchaChars(captchaChallenge.captchaText)"
              :key="`${char}-${index}`"
              class="relative z-10 inline-block"
              :style="getCaptchaCharStyle(index, captchaChallenge.captchaText)"
            >
              {{ char }}
            </span>
          </div>
          <input
            v-model="captchaAnswer"
            autocomplete="off"
            class="h-11 rounded-md border border-border bg-background px-3 text-center text-base tracking-[0.2em] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            name="captcha_answer"
            placeholder=""
            type="text"
          />
        </div>
        <div v-else class="text-muted-foreground flex flex-col items-center gap-2 text-sm">
          <span>{{ $t('ui.captcha.loading') }}</span>
        </div>
      </div>
    </template>
  </AuthenticationLogin>
</template>
