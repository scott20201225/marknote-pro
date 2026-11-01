<script setup lang="ts">
const envType = window.marknotepro?.env?.type || ''
</script>

<template>
  <div id="app" :class="['app-root', envType ? `window-type-${envType}` : '']">
    <!-- This router-view will render either App component (/editor) or Preference component (/preference) -->
    <router-view />
  </div>
</template>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

#app.window-type-clipboard,
#app.window-type-capture,
#app.window-type-pin {
  background: transparent !important;
}
</style>
