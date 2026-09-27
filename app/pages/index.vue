<script setup lang="ts">
const show = ref(false)
</script>

<template>
  <main>
    <h1>@nuxt/icon split provider repro</h1>

    <!-- Rendered during SSR -->
    <section id="ssr">
      <Icon name="lucide:house" size="32" />
      <Icon name="mdi:github" size="32" />
    </section>

    <!-- Rendered only in the browser: forces a client-side icon fetch -->
    <ClientOnly>
      <section id="client">
        <Icon name="lucide:rocket" size="32" />
        <Icon name="mdi:heart" size="32" />
      </section>
    </ClientOnly>

    <button id="toggle" @click="show = !show">toggle</button>
    <section v-if="show" id="toggled">
      <Icon name="lucide:star" size="32" />
      <Icon name="mdi:account" size="32" />
    </section>
  </main>
</template>
