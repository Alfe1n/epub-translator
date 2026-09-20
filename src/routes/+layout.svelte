<script lang="ts">
  import './layout.css';
  import { onMount } from 'svelte';
  import { Sun, Moon, Settings, BookOpen, KeyRound, Check, X, ShieldCheck, AlertCircle } from '@lucide/svelte';

  let { children } = $props();

  let isDark = $state(false);
  let showSettings = $state(false);
  let serverHasKey = $state(false);
  let serverModel = $state('gemini-2.5-flash');

  let customApiKey = $state('');
  let customModel = $state('gemini-2.5-flash');
  let saveSuccess = $state(false);

  onMount(async () => {
    // Check dark mode preference
    const savedTheme = localStorage.getItem('linguabook_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      isDark = true;
      document.documentElement.classList.add('dark');
    } else {
      isDark = false;
      document.documentElement.classList.remove('dark');
    }

    // Load custom key from local storage if saved
    customApiKey = localStorage.getItem('linguabook_custom_api_key') || '';
    const savedModel = localStorage.getItem('linguabook_custom_model');
    if (savedModel) customModel = savedModel;

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

  function toggleTheme() {
    isDark = !isDark;
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('linguabook_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('linguabook_theme', 'light');
    }
  }

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
    }, 1000);
  }
</script>

<svelte:head>
  <title>LinguaBook - Translate EPUB to Indonesian</title>
  <meta name="description" content="Translate your EPUB books into natural Indonesian using Google Gemini API." />
</svelte:head>

<div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
  <!-- Header -->
  <header class="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
      <!-- Brand -->
      <a href="/" class="flex items-center gap-3 group">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20 group-hover:scale-105 transition-transform">
          <BookOpen class="w-5 h-5" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-xl tracking-tight text-slate-900 dark:text-white">LinguaBook</span>
            <span class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
              EPUB Translator
            </span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">Translate your EPUB books into Indonesian</p>
        </div>
      </a>

      <!-- Controls -->
      <div class="flex items-center gap-2 sm:gap-3">
        <!-- API Status Indicator -->
        <button
          onclick={() => showSettings = true}
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors {
            serverHasKey || customApiKey
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
          }"
          title="Click to configure Gemini API Key"
        >
          <span class="w-2 h-2 rounded-full {serverHasKey || customApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}"></span>
          <span class="hidden md:inline">
            {serverHasKey ? 'Gemini Ready' : customApiKey ? 'Custom Key Set' : 'Set Gemini Key'}
          </span>
          <KeyRound class="w-3.5 h-3.5" />
        </button>

        <!-- Settings Button -->
        <button
          onclick={() => showSettings = true}
          class="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Settings"
          title="Settings"
        >
          <Settings class="w-5 h-5" />
        </button>

        <!-- Dark/Light Mode Button -->
        <button
          onclick={toggleTheme}
          class="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Toggle theme"
          title="Toggle Dark / Light Mode"
        >
          {#if isDark}
            <Sun class="w-5 h-5 text-amber-400" />
          {:else}
            <Moon class="w-5 h-5 text-slate-600" />
          {/if}
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1 flex flex-col">
    {@render children()}
  </main>

  <!-- Footer -->
  <footer class="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 dark:text-slate-500">
    <div class="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div class="flex items-center gap-1.5">
        <ShieldCheck class="w-4 h-4 text-emerald-500" />
        <span>Privacy-first: In-memory session processing. Ebooks are never stored permanently.</span>
      </div>
      <div>
        <span>Powered by <strong>Google Gemini API</strong></span>
      </div>
    </div>
  </footer>
</div>

<!-- Settings Modal -->
{#if showSettings}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div class="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 relative">
      <button
        onclick={() => showSettings = false}
        class="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <X class="w-5 h-5" />
      </button>

      <div class="flex items-center gap-2.5 mb-5">
        <div class="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center">
          <KeyRound class="w-5 h-5" />
        </div>
        <div>
          <h3 class="font-bold text-lg text-slate-900 dark:text-white">API Configuration</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">Configure Gemini model and credentials</p>
        </div>
      </div>

      {#if serverHasKey}
        <div class="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <Check class="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Server has <strong>GEMINI_API_KEY</strong> configured via environment variable.</span>
        </div>
      {:else}
        <div class="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertCircle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span>No API key detected in server <code class="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900">.env</code>. You can enter one below or set <code class="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900">GEMINI_API_KEY</code> on your server.</span>
          </div>
        </div>
      {/if}

      <div class="space-y-4">
        <div>
          <label for="apikey-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            Gemini API Key (Optional override)
          </label>
          <input
            id="apikey-input"
            type="password"
            bind:value={customApiKey}
            placeholder={serverHasKey ? 'Using server key (leave blank to keep)' : 'AIzaSy...'}
            class="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
          <p class="text-[11px] text-slate-400 mt-1">Get an API key from <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" class="text-orange-500 hover:underline">Google AI Studio</a>. Saved only in your browser session.</p>
        </div>

        <div>
          <label for="model-select" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            Gemini Model
          </label>
          <select
            id="model-select"
            bind:value={customModel}
            class="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          >
            <option value="gemini-2.5-pro">gemini-2.5-pro (👑 Flagship - Kualitas Sastra Tertinggi)</option>
            <option value="gemini-1.5-pro">gemini-1.5-pro (🧠 Sastra Mendalam & Teks Kompleks)</option>
            <option value="gemini-2.5-flash">gemini-2.5-flash (⚡ Cepat & Hemat Kuota)</option>
            <option value="gemini-2.0-flash">gemini-2.0-flash (🚀 Kecepatan Kilat)</option>
          </select>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-2.5">
        <button
          onclick={() => showSettings = false}
          class="px-4 py-2 text-sm font-medium rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          onclick={saveSettings}
          class="px-4 py-2 text-sm font-medium rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-600/20 flex items-center gap-1.5 transition-all"
        >
          {#if saveSuccess}
            <Check class="w-4 h-4" />
            <span>Saved!</span>
          {:else}
            <span>Save Settings</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
