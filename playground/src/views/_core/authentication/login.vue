<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, ref, useTemplateRef } from 'vue';

import {
  AuthenticationLogin,
  SliderCaptcha,
  type SliderCaptchaActionType,
  z,
} from '@vben/common-ui';
import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { useAuthStore } from '#/store';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();

const captchaPassed = ref(false);
const captchaRef = useTemplateRef<SliderCaptchaActionType>('captchaRef');

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

async function onSubmit(params: Recordable<any>) {
  if (!captchaPassed.value) {
    message.warning($t('ui.captcha.title'));
    captchaRef.value?.resume();
    return;
  }

  try {
    await authStore.authLogin({
      login: (params.username ?? params.login) as string,
      password: params.password as string,
    });
  } catch {
    captchaPassed.value = false;
    captchaRef.value?.resume();
  }
}
</script>

<template>
  <AuthenticationLogin
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :show-code-login="false"
    :show-qrcode-login="false"
    :show-register="false"
    :show-third-party-login="false"
    @submit="onSubmit"
  >
    <template #third-party-login>
      <div class="mt-4 flex flex-col gap-3">
        <div class="text-muted-foreground text-center text-sm">
          {{ $t('ui.captcha.title') }}
        </div>
        <SliderCaptcha
          ref="captchaRef"
          v-model="captchaPassed"
          class="w-full"
        />
      </div>
    </template>
  </AuthenticationLogin>
</template>
