<script lang="ts">
  import './layout.css';
  import { onMount } from 'svelte';
  import { Settings, BookOpen, KeyRound, Check, X, ShieldCheck, AlertCircle } from '@lucide/svelte';

  let { children } = $props();

  let showSettings = $state(false);
  let serverHasKey = $state(false);
  let serverModel = $state('dual-flash-lite');

  let customApiKey = $state('');
  let customModel = $state('dual-flash-lite');
  let saveSuccess = $state(false);

  onMount(async () => {
    // Strictly enforce clean monochrome light theme (remove any dark mode class)
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('linguabook_theme');

    // Load custom key from local storage if saved
    customApiKey = localStorage.getItem('linguabook_custom_api_key') || '';
    const savedModel = localStorage.getItem('linguabook_custom_model');
    const isObsolete = !savedModel || savedModel.includes('1.5') || savedModel.includes('2.0') || savedModel.includes('2.5') || savedModel.includes('3.8');
    if (savedModel && !isObsolete) {
      customModel = savedModel;
    } else {
      customModel = 'dual-flash-lite';
      localStorage.setItem('linguabook_custom_model', 'dual-flash-lite');
    }

    // Check server config
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        serverHasKey = data.hasServerApiKey;
        serverModel = data.defaultModel;
        if (!savedModel) customModel = serverModel;
      }
    } catch (e) {
      console.error('Failed to fetch config:', e);
    }
  });

  function saveSettings() {
    if (customApiKey.trim()) {
      localStorage.setItem('linguabook_custom_api_key', customApiKey.trim());
    } else {
      localStorage.removeItem('linguabook_custom_api_key');
    }
    localStorage.setItem('linguabook_custom_model', customModel);
    saveSuccess = true;
    setTimeout(() => {
      saveSuccess = false;
      showSettings = false;
    }, 800);
  }
</script>

<svelte:head>
  <title>LinguaBook — EPUB Translator & Reader</title>
  <meta name="description" content="Translate and read your EPUB books into natural Indonesian using Google Gemini API." />
</svelte:head>

<div class="min-h-screen flex flex-col bg-[#fafafa] text-zinc-900 transition-colors">
  <!-- Minimalist Monochrome Header -->
  <header class="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/95 backdrop-blur-md">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <!-- Brand -->
      <a href="/" class="flex items-center gap-3 group">
        <div class="w-10 h-10 rounded-xl bg-zinc-950 text-white flex items-center justify-center shadow-sm group-hover:bg-zinc-800 transition-colors">
          <BookOpen class="w-5 h-5" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-lg tracking-tight text-zinc-950">LinguaBook</span>
            <span class="text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-800 border border-zinc-300">
              Translator & Reader
            </span>
          </div>
          <p class="text-xs text-zinc-500 hidden sm:block">Translate and read EPUB books in Indonesian</p>
        </div>
      </a>

      <!-- Controls -->
      <div class="flex items-center gap-2 sm:gap-3">
        <!-- API Status Indicator -->
        <button
          onclick={() => showSettings = true}
          class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm"
          title="Klik untuk konfigurasi Gemini API Key"
        >
          <span class="w-2 h-2 rounded-full {serverHasKey || customApiKey ? 'bg-zinc-900' : 'bg-zinc-400'}"></span>
          <span class="hidden md:inline font-mono text-[11px] text-zinc-700">
            {serverHasKey ? 'API Siap' : customApiKey ? 'Key Kustom' : 'Atur API Key'}
          </span>
          <KeyRound class="w-3.5 h-3.5 text-zinc-500" />
        </button>

        <!-- Settings Button -->
        <button
          onclick={() => showSettings = true}
          class="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:text-black hover:bg-zinc-50 hover:border-zinc-300 transition-all shadow-sm"
          aria-label="Settings"
          title="Pengaturan Model & API"
        >
          <Settings class="w-4 h-4" />
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1 flex flex-col">
    {@render children()}
  </main>

  <!-- Footer -->
  <footer class="border-t border-zinc-200 bg-white py-6 text-center text-xs text-zinc-500">
    <div class="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-zinc-600">
        <ShieldCheck class="w-4 h-4 text-zinc-900" />
        <span>Privasi Aman: File buku diproses secara in-memory dan tidak disimpan permanen di server publik.</span>
      </div>
      <div class="text-zinc-400 text-[11px] font-mono">
        LinguaBook v0.1 • Monochrome Edition
      </div>
    </div>
  </footer>
</div>

<!-- ================= SETTINGS MODAL ================= -->
{#if showSettings}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-150">
    <div class="w-full max-w-md bg-white border border-zinc-200 rounded-3xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-zinc-100">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-900 flex items-center justify-center">
            <KeyRound class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-bold text-base text-zinc-900">Konfigurasi API & Model</h3>
            <p class="text-[11px] text-zinc-500">Atur kunci API dan model penerjemah</p>
          </div>
        </div>
        <button
          onclick={() => showSettings = false}
          class="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          aria-label="Tutup"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Server Key Status -->
      {#if serverHasKey}
        <div class="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 flex items-center gap-2.5">
          <Check class="w-4 h-4 text-zinc-900 shrink-0" />
          <span>Server telah memiliki <strong>GEMINI_API_KEY</strong> aktif di environment.</span>
        </div>
      {:else}
        <div class="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 flex items-start gap-2.5">
          <AlertCircle class="w-4 h-4 text-zinc-900 shrink-0 mt-0.5" />
          <div>
            <span>Belum ada API key di server. Masukkan API key Gemini gratis Anda di bawah:</span>
          </div>
        </div>
      {/if}

      <!-- Form Inputs -->
      <div class="space-y-4">
        <div>
          <label for="apikey-input" class="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
            Gemini API Key (Opsional)
          </label>
          <input
            id="apikey-input"
            type="password"
            bind:value={customApiKey}
            placeholder={serverHasKey ? 'Menggunakan key server (kosongkan jika tidak diubah)' : 'AIzaSy...'}
            class="w-full px-3.5 py-2.5 rounded-xl text-sm border border-zinc-300 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:bg-white transition-all font-mono"
          />
          <p class="text-[11px] text-zinc-500 mt-1">
            Dapatkan API key gratis di <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" class="text-zinc-900 font-semibold underline underline-offset-2">Google AI Studio</a>.
          </p>
        </div>

        <div>
          <label for="model-select" class="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
            Model Mesin Penerjemah
          </label>
          <select
            id="model-select"
            bind:value={customModel}
            class="w-full px-3.5 py-2.5 rounded-xl text-sm border border-zinc-300 bg-zinc-50 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:bg-white transition-all"
          >
            <optgroup label="🚀 Dual-Engine Anti Limit (1.000 Request/Hari - Rekomendasi)">
              <option value="dual-flash-lite">dual-flash-lite (Rotasi Otomatis 3.5 + 3.1 Lite — 1.000 RPD, Bebas Limit)</option>
            </optgroup>
            <optgroup label="🌟 Super Kuota (500 Request/Hari)">
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Kuota 500 RPD, 15 RPM)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Kuota 500 RPD, 15 RPM)</option>
            </optgroup>
            <optgroup label="⚡ Frontier Flash (Batas 20 Request/Hari)">
              <option value="gemini-3.5-flash">gemini-3.5-flash (Cepat & Stabil — 20 RPD)</option>
              <option value="gemini-3.8-flash">gemini-3.8-flash (Model Tercerdas — 20 RPD)</option>
              <option value="gemini-3.7-flash">gemini-3.7-flash (Andal & Presisi — 20 RPD)</option>
              <option value="gemini-3.6-flash">gemini-3.6-flash (Seimbang — 20 RPD)</option>
            </optgroup>
          </select>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center justify-end gap-2.5 pt-2">
        <button
          onclick={() => showSettings = false}
          class="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
        >
          Batal
        </button>
        <button
          onclick={saveSettings}
          class="px-5 py-2 rounded-xl text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 text-white flex items-center gap-1.5 transition-all shadow-sm"
        >
          {#if saveSuccess}
            <Check class="w-3.5 h-3.5" />
            <span>Tersimpan!</span>
          {:else}
            <span>Simpan Pengaturan</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
