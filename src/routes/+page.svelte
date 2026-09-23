<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    UploadCloud,
    BookOpen,
    FileText,
    Play,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    Download,
    Eye,
    X,
    ChevronLeft,
    ChevronRight,
    Sliders,
    Check,
    Languages,
    Clock,
    Layers,
    Columns,
    Maximize2,
    Minimize2,
    Zap,
    Search,
    AlignLeft,
    AlignJustify,
    ArrowLeft,
    List,
    Type,
    ArrowRight
  } from '@lucide/svelte';
  import type { TranslationStyle, TranslationProgressEvent } from '$lib/epub/types';

  // Application States: 'upload' | 'overview' | 'translating' | 'completed'
  let appState = $state<'upload' | 'overview' | 'translating' | 'completed'>('upload');

  // Upload & Session Data
  let isDragging = $state(false);
  let isUploading = $state(false);
  let uploadError = $state<string | null>(null);

  let sessionId = $state<string | null>(null);
  let filename = $state('');
  let fileSizeBytes = $state(0);
  let bookTitle = $state('Untitled Book');
  let bookAuthor = $state('Unknown Author');
  let bookLanguage = $state('en');
  let bookCoverBase64 = $state<string | null>(null);
  let totalWords = $state(0);
  let totalBatches = $state(0);
  let totalChapters = $state(0);
  let chaptersList = $state<Array<{ index: number; title: string; wordCount: number; batchesCount: number }>>([]);

  // Translation Configuration
  let selectedStyle = $state<TranslationStyle>('literary');
  let selectedModel = $state('dual-flash-lite');
  let modelCategoryFilter = $state<'all' | 'efficiency' | 'frontier'>('all');

  interface ModelOption {
    id: string;
    name: string;
    category: 'efficiency' | 'frontier';
    badge: string;
    description: string;
    usageNote: string;
  }

  const availableModelOptions: ModelOption[] = [
    {
      id: 'dual-flash-lite',
      name: 'Dual-Engine Lite (3.5 + 3.1)',
      category: 'efficiency',
      badge: '👑 Kuota 1.000 RPD (Paling Direkomendasikan)',
      description: 'Otomatis membagi panggilan antara Gemini 3.5 & 3.1 Flash-Lite per bab. Membagi beban RPM agar tidak macet, kuota gabungan 1.000 request/hari.',
      usageNote: 'Bisa menerjemahkan 70-100 novel utuh per hari tanpa terkena batas'
    },
    {
      id: 'gemini-3.5-flash-lite',
      name: 'Gemini 3.5 Flash-Lite',
      category: 'efficiency',
      badge: '🥇 Kuota 500 RPD',
      description: 'Model resmi Google dengan kuota harian besar (500 request/hari, 15 RPM). Cepat, teruji, dan stabil.',
      usageNote: 'Kuota 500 request/hari (Cukup untuk 35-50 novel per hari)'
    },
    {
      id: 'gemini-3.1-flash-lite',
      name: 'Gemini 3.1 Flash-Lite',
      category: 'efficiency',
      badge: '🥈 Kuota 500 RPD (Cadangan Segar)',
      description: 'Model generasi 3.1 dengan kuota harian 500 request/hari dan 15 RPM. Cadangan berkuota besar yang masih segar.',
      usageNote: 'Kuota 500 request/hari (Cadangan saat model 3.5 sedang sibuk)'
    },
    {
      id: 'gemini-3.5-flash',
      name: 'Gemini 3.5 Flash',
      category: 'frontier',
      badge: '⚡ Cepat & Standar',
      description: 'Memberikan kecepatan tinggi untuk beban kerja rutin.',
      usageNote: 'Batas 20 request/hari (5 RPM)'
    },
    {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
      category: 'frontier',
      badge: 'Tercerdas',
      description: 'Model Flash tercerdas untuk alur kerja rumit & diksi sastra.',
      usageNote: 'Batas 20 request/hari (5 RPM)'
    },
    {
      id: 'gemini-3.7-flash',
      name: 'Gemini 3.7 Flash',
      category: 'frontier',
      badge: 'Andal & Presisi',
      description: 'Model generasi 3.7 untuk akurasi tinggi dan konsistensi.',
      usageNote: 'Batas 20 request/hari (5 RPM)'
    },
    {
      id: 'gemini-3.6-flash',
      name: 'Gemini 3.6 Flash',
      category: 'frontier',
      badge: 'Seimbang',
      description: 'Menyeimbangkan kecepatan kilat dan pemahaman teks.',
      usageNote: 'Batas 20 request/hari (5 RPM)'
    }
  ];

  onMount(() => {
    // Strictly light monochrome
    document.documentElement.classList.remove('dark');

    const savedModel = localStorage.getItem('linguabook_custom_model');
    const isObsolete = !savedModel || savedModel.includes('1.5') || savedModel.includes('2.0') || savedModel.includes('2.5') || savedModel.includes('3.8');
    if (savedModel && !isObsolete) {
      selectedModel = savedModel;
    } else {
      selectedModel = 'dual-flash-lite';
      localStorage.setItem('linguabook_custom_model', 'dual-flash-lite');
    }

    // Load reader preferences from local storage if any
    const savedFont = localStorage.getItem('linguabook_reader_font');
    if (savedFont === 'serif' || savedFont === 'sans' || savedFont === 'mono') {
      readerFontFamily = savedFont;
    }
    const savedSize = localStorage.getItem('linguabook_reader_size');
    if (savedSize) {
      readerFontSize = parseInt(savedSize, 10) || 18;
    }
  });

  function setModel(model: string) {
    selectedModel = model;
    localStorage.setItem('linguabook_custom_model', model);
  }

  // Translation Progress
  let progressPercent = $state(0);
  let currentChapterIndex = $state(0);
  let currentChapterTitle = $state('');
  let currentBatchIndex = $state(0);
  let totalBatchesInChapter = $state(0);
  let completedBatchesTotal = $state(0);
  let completedChaptersCount = $state(0);
  let progressMessage = $state('Initializing translation...');
  let failedBatches = $state<Array<{ chapterIndex: number; batchIndex: number; error: string }>>([]);
  let isRetryingBatch = $state(false);
  let isCancelling = $state(false);
  let translationQueueStatus = $state<string>('idle');

  // SSE EventSource & Polling
  let eventSource: EventSource | null = null;
  let pollingInterval: any = null;

  // ================= READER STATE =================
  let showReader = $state(false);
  let showTocSidebar = $state(false);
  let showTypeSettings = $state(false);
  let readerSearchQuery = $state('');
  let readerChapterIndex = $state(0);
  let readerChapterTitle = $state('');
  let readerOriginalHtml = $state('');
  let readerTranslatedHtml = $state('');
  let readerIsTranslated = $state(false);
  let isLoadingChapter = $state(false);
  let readerViewMode = $state<'translated' | 'side-by-side' | 'original'>('translated');
  let readerFontFamily = $state<'serif' | 'sans' | 'mono'>('serif');
  let readerFontSize = $state(18);
  let readerLineHeight = $state('1.75');
  let readerMaxWidth = $state<'compact' | 'normal' | 'wide'>('normal');
  let readerTextAlign = $state<'left' | 'justify'>('left');
  let readerIndent = $state(true);
  let readerIsFullscreen = $state(false);

  function setReaderFont(font: 'serif' | 'sans' | 'mono') {
    readerFontFamily = font;
    localStorage.setItem('linguabook_reader_font', font);
  }

  function adjustFontSize(delta: number) {
    readerFontSize = Math.min(28, Math.max(14, readerFontSize + delta));
    localStorage.setItem('linguabook_reader_size', readerFontSize.toString());
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      readerIsFullscreen = true;
    } else {
      document.exitFullscreen().catch(() => {});
      readerIsFullscreen = false;
    }
  }

  // --- File Upload Handler ---
  async function handleFileUpload(file: File) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.epub')) {
      uploadError = 'File harus berformat .epub yang valid.';
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      uploadError = 'Ukuran file melebihi batas maksimal 50 MB.';
      return;
    }

    uploadError = null;
    isUploading = true;

    try {
      const formData = new FormData();
      formData.append('epub', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memproses file EPUB.');
      }

      // Initialize session data
      sessionId = data.sessionId;
      filename = data.filename;
      fileSizeBytes = data.fileSizeBytes;
      bookTitle = data.title || 'Untitled Book';
      bookAuthor = data.author || 'Unknown Author';
      bookLanguage = data.language || 'en';
      bookCoverBase64 = data.coverBase64;
      totalWords = data.totalWords || 0;
      totalBatches = data.totalBatches || 0;
      totalChapters = data.totalChapters || 0;
      chaptersList = data.chapters || [];

      appState = 'overview';
    } catch (err: any) {
      console.error('Upload error:', err);
      uploadError = err.message || 'Terjadi kesalahan saat mengunggah EPUB.';
    } finally {
      isUploading = false;
    }
  }

  function onFileInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      handleFileUpload(target.files[0]);
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    isDragging = true;
  }

  function onDragLeave() {
    isDragging = false;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }

  // --- Translation Controls ---
  async function handleStartTranslation() {
    if (!sessionId) return;

    try {
      appState = 'translating';
      progressPercent = 0;
      completedChaptersCount = 0;
      completedBatchesTotal = 0;
      progressMessage = 'Menyiapkan antrean penerjemahan...';

      const customKey = localStorage.getItem('linguabook_custom_api_key') || undefined;
      const customModel = localStorage.getItem('linguabook_custom_model') || selectedModel;

      const res = await fetch('/api/translate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          style: selectedStyle,
          apiKey: customKey,
          model: customModel
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal memulai terjemahan');
      }

      listenToProgress();
    } catch (err: any) {
      console.error('Start translation error:', err);
      alert(`Gagal memulai: ${err.message}`);
      appState = 'overview';
    }
  }

  function listenToProgress() {
    if (!sessionId) return;
    cleanupProgressListeners();

    if (typeof EventSource !== 'undefined') {
      eventSource = new EventSource(`/api/translate/status?sessionId=${sessionId}`);

      eventSource.onmessage = (event) => {
        try {
          const progress: TranslationProgressEvent = JSON.parse(event.data);
          updateProgressUI(progress);
        } catch (e) {
          console.error('Error parsing SSE event:', e);
        }
      };

      eventSource.onerror = () => {
        cleanupProgressListeners();
        startPollingFallback();
      };
    } else {
      startPollingFallback();
    }
  }

  function startPollingFallback() {
    pollingInterval = setInterval(async () => {
      if (!sessionId) return;
      try {
        const res = await fetch(`/api/translate/status?sessionId=${sessionId}`);
        if (res.ok) {
          const progress: TranslationProgressEvent = await res.json();
          updateProgressUI(progress);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000);
  }

  function updateProgressUI(progress: TranslationProgressEvent) {
    progressPercent = progress.percent;
    currentChapterIndex = progress.currentChapterIndex;
    currentChapterTitle = progress.currentChapterTitle;
    currentBatchIndex = progress.currentBatchIndex;
    totalBatchesInChapter = progress.totalBatchesInChapter;
    completedBatchesTotal = progress.completedBatchesTotal;
    completedChaptersCount = progress.completedChapters;
    progressMessage = progress.message;
    failedBatches = progress.failedBatches || [];
    translationQueueStatus = progress.status || 'translating';

    if (progress.status === 'completed') {
      appState = 'completed';
      cleanupProgressListeners();
    } else if (progress.status === 'cancelled') {
      cleanupProgressListeners();
    }
  }

  function cleanupProgressListeners() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  async function cancelCurrentTranslation() {
    if (!sessionId || isCancelling) return;
    isCancelling = true;

    try {
      await fetch('/api/translate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      progressMessage = 'Terjemahan dibatalkan oleh pengguna.';
    } catch (e) {
      console.error(e);
    } finally {
      isCancelling = false;
    }
  }

  function formatBatchError(errorText: string): string {
    if (!errorText) return 'Terjadi kendala jaringan atau server.';
    try {
      const parsed = JSON.parse(errorText);
      if (parsed?.error?.message) {
        errorText = parsed.error.message;
      }
    } catch {}

    if (errorText.includes('503') || errorText.includes('high demand') || errorText.includes('UNAVAILABLE')) {
      return 'Server Google sedang mengalami lonjakan beban (503). Sistem otomatis melakukan rotasi model.';
    }
    if (errorText.includes('429') || errorText.includes('RESOURCE_EXHAUSTED') || errorText.includes('quota')) {
      return 'Batas request per menit terlampaui (429). Sistem sedang menyesuaikan pacing antrean.';
    }
    return errorText;
  }

  async function handleRetryBatch(chapterIndex: number, batchIndex: number) {
    if (!sessionId || isRetryingBatch) return;
    isRetryingBatch = true;

    const customKey = localStorage.getItem('linguabook_custom_api_key') || undefined;
    const customModel = localStorage.getItem('linguabook_custom_model') || undefined;

    try {
      const res = await fetch('/api/translate/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          chapterIndex,
          batchIndex,
          apiKey: customKey,
          model: customModel
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry gagal');

      failedBatches = failedBatches.filter(
        (b) => !(b.chapterIndex === chapterIndex && b.batchIndex === batchIndex)
      );
    } catch (err: any) {
      alert(`Retry gagal: ${formatBatchError(err.message)}`);
    } finally {
      isRetryingBatch = false;
    }
  }

  async function resumeTranslation() {
    if (!sessionId) return;
    try {
      const customKey = localStorage.getItem('linguabook_custom_api_key') || undefined;
      const customModel = localStorage.getItem('linguabook_custom_model') || selectedModel;

      progressMessage = 'Melanjutkan antrean terjemahan...';
      translationQueueStatus = 'translating';

      await fetch('/api/translate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          style: selectedStyle,
          apiKey: customKey,
          model: customModel
        })
      });

      listenToProgress();
    } catch (err: any) {
      console.error('Error resuming translation:', err);
      alert(`Gagal melanjutkan antrean: ${err.message}`);
    }
  }

  async function retryAllFailedBatches() {
    if (!sessionId || isRetryingBatch || failedBatches.length === 0) return;
    const toRetry = [...failedBatches];
    for (const fb of toRetry) {
      await handleRetryBatch(fb.chapterIndex, fb.batchIndex);
    }
    await resumeTranslation();
  }

  // --- Reader Functions ---
  async function openReader(initialChapterIndex: number = 0) {
    showReader = true;
    showTocSidebar = false;
    showTypeSettings = false;
    await loadChapterContent(initialChapterIndex);
  }

  async function loadChapterContent(chapterIndex: number) {
    if (!sessionId) return;
    isLoadingChapter = true;
    readerChapterIndex = chapterIndex;

    try {
      const res = await fetch(`/api/preview?sessionId=${sessionId}&chapterIndex=${chapterIndex}`);
      if (!res.ok) throw new Error('Gagal memuat isi bab');
      const data = await res.json();
      readerChapterTitle = data.title;
      readerOriginalHtml = data.originalHtml;
      readerTranslatedHtml = data.translatedHtml;
      readerIsTranslated = data.isTranslated;

      // Scroll reader canvas to top
      const canvas = document.getElementById('reader-scroll-canvas');
      if (canvas) canvas.scrollTop = 0;
    } catch (err) {
      console.error('Error loading chapter preview:', err);
    } finally {
      isLoadingChapter = false;
    }
  }

  function nextChapter() {
    if (readerChapterIndex < totalChapters - 1) {
      loadChapterContent(readerChapterIndex + 1);
    }
  }

  function prevChapter() {
    if (readerChapterIndex > 0) {
      loadChapterContent(readerChapterIndex - 1);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!showReader) return;
    // Don't trigger if user is typing in search or inputs
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevChapter();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextChapter();
    } else if (e.key === 'Escape') {
      if (showTypeSettings) {
        showTypeSettings = false;
      } else if (showTocSidebar) {
        showTocSidebar = false;
      } else {
        showReader = false;
      }
    }
  }

  function downloadEpub() {
    if (!sessionId) return;
    window.location.href = `/api/download?sessionId=${sessionId}`;
  }

  function resetToUpload() {
    cleanupProgressListeners();
    appState = 'upload';
    sessionId = null;
    uploadError = null;
    failedBatches = [];
    showReader = false;
  }

  onDestroy(() => {
    cleanupProgressListeners();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col justify-center">

  <!-- ================= STATE 1: UPLOAD SCREEN ================= -->
  {#if appState === 'upload'}
    <div class="space-y-12 animate-in fade-in duration-200">
      <!-- Minimalist Hero Header -->
      <div class="text-center max-w-2xl mx-auto space-y-4">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-white text-zinc-900 text-xs font-mono shadow-sm">
          <span>EPUB 3.0+ & EPUB 2.0 Engine</span>
        </div>
        <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-950">
          Penerjemah & Pembaca EPUB
        </h1>
        <p class="text-base sm:text-lg text-zinc-600 leading-relaxed font-normal">
          Terjemahkan buku digital berbahasa Inggris ke Bahasa Indonesia dengan gaya sastra alami. Format, gambar, CSS, dan struktur buku 100% utuh.
        </p>
      </div>

      <!-- Monochrome Dropzone -->
      <div class="max-w-xl mx-auto">
        <button
          type="button"
          aria-label="EPUB File Drop Area"
          class="w-full relative border-2 border-dashed rounded-3xl p-8 sm:p-14 text-center transition-all cursor-pointer bg-white shadow-sm {
            isDragging
              ? 'border-zinc-950 bg-zinc-50 scale-[1.01]'
              : 'border-zinc-300 hover:border-zinc-900 hover:bg-zinc-50/50'
          }"
          ondragover={onDragOver}
          ondragleave={onDragLeave}
          ondrop={onDrop}
          onclick={() => document.getElementById('epub-file-input')?.click()}
        >
          <input
            id="epub-file-input"
            type="file"
            accept=".epub,application/epub+zip"
            class="hidden"
            onchange={onFileInputChange}
          />

          <div class="flex flex-col items-center justify-center space-y-4">
            <div class="w-16 h-16 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-900 flex items-center justify-center transition-transform group-hover:scale-110">
              {#if isUploading}
                <RefreshCw class="w-7 h-7 text-zinc-900 animate-spin" />
              {:else}
                <UploadCloud class="w-7 h-7 text-zinc-900" />
              {/if}
            </div>

            <div class="space-y-1">
              <p class="text-base font-semibold text-zinc-900">
                {isUploading ? 'Memproses dan membaca struktur buku...' : 'Tarik & lepas file .epub ke sini'}
              </p>
              <p class="text-xs text-zinc-500">
                atau <span class="text-zinc-950 font-semibold underline underline-offset-4">pilih file dari perangkat</span>
              </p>
            </div>

            <div class="pt-2 flex items-center gap-3 text-xs text-zinc-400 font-mono">
              <span>Hanya format .epub</span>
              <span>•</span>
              <span>Maksimal 50 MB</span>
            </div>
          </div>
        </button>

        <!-- Upload Error Notice -->
        {#if uploadError}
          <div class="mt-4 p-4 rounded-2xl bg-zinc-100 border border-zinc-300 text-zinc-900 text-xs flex items-center gap-2.5">
            <AlertCircle class="w-4 h-4 text-zinc-900 shrink-0" />
            <p>{uploadError}</p>
          </div>
        {/if}
      </div>

      <!-- Feature Badges (3-Column Minimal Grid) -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto pt-4">
        <div class="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-2">
          <div class="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 font-bold text-xs">
            1
          </div>
          <h3 class="font-bold text-sm text-zinc-900">100% Struktur Utuh</h3>
          <p class="text-xs text-zinc-500 leading-relaxed">
            Format HTML, tag inline (&lt;em&gt;, &lt;b&gt;, &lt;a&gt;), CSS layout, dan gambar tersimpan presisi sesuai standar EPUB 3.
          </p>
        </div>

        <div class="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-2">
          <div class="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 font-bold text-xs">
            2
          </div>
          <h3 class="font-bold text-sm text-zinc-900">Diksi Sastra Alami</h3>
          <p class="text-xs text-zinc-500 leading-relaxed">
            Didukung prompt sastra Gemini teruji untuk dialog novel yang hidup, luwes, dan tidak kaku seperti mesin terjemahan biasa.
          </p>
        </div>

        <div class="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-2">
          <div class="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 font-bold text-xs">
            3
          </div>
          <h3 class="font-bold text-sm text-zinc-900">Pembaca Buku Terintegrasi</h3>
          <p class="text-xs text-zinc-500 leading-relaxed">
            Baca buku langsung di web dengan reader monokrom yang nyaman, lengkap dengan mode perbandingan berdampingan (bilingual).
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- ================= STATE 2: BOOK OVERVIEW ================= -->
  {#if appState === 'overview'}
    <div class="max-w-3xl mx-auto w-full space-y-6 animate-in fade-in duration-200">
      <!-- Book Identity Card -->
      <div class="p-6 sm:p-8 rounded-3xl bg-white border border-zinc-200 shadow-sm space-y-6">
        <div class="flex flex-col sm:flex-row gap-6 items-start">
          <!-- Cover Art -->
          {#if bookCoverBase64}
            <img
              src={bookCoverBase64}
              alt="Cover Buku {bookTitle}"
              class="w-32 h-44 object-cover rounded-2xl shadow-md border border-zinc-200 shrink-0 mx-auto sm:mx-0"
            />
          {:else}
            <div class="w-32 h-44 rounded-2xl bg-zinc-100 border border-zinc-200 flex flex-col items-center justify-center text-zinc-400 shrink-0 mx-auto sm:mx-0">
              <BookOpen class="w-8 h-8 mb-2 text-zinc-400" />
              <span class="text-[10px] uppercase font-mono">Tanpa Sampul</span>
            </div>
          {/if}

          <!-- Book Metadata -->
          <div class="flex-1 space-y-3 text-center sm:text-left">
            <div>
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-zinc-100 text-zinc-800 border border-zinc-300 mb-1.5">
                Buku Terdeteksi
              </span>
              <h2 class="text-2xl font-bold text-zinc-950 leading-tight">{bookTitle}</h2>
              <p class="text-sm text-zinc-500 mt-0.5">Penulis: <span class="font-medium text-zinc-800">{bookAuthor}</span></p>
            </div>

            <!-- Stats Pills -->
            <div class="flex flex-wrap gap-2 justify-center sm:justify-start pt-1 text-xs font-mono">
              <span class="px-3 py-1 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-700">
                📖 {totalChapters} Bab
              </span>
              <span class="px-3 py-1 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-700">
                📝 ±{totalWords.toLocaleString()} Kata
              </span>
              <span class="px-3 py-1 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-700">
                📦 {totalBatches} Batch
              </span>
            </div>
          </div>
        </div>

        <hr class="border-zinc-200" />

        <!-- Style Selection -->
        <div class="space-y-3">
          <span class="block text-xs font-bold text-zinc-900 uppercase tracking-wider">
            Gaya Penerjemahan
          </span>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {#each [
              { id: 'literary', name: 'Sastra & Novel', desc: 'Diksi kaya & dialog hidup' },
              { id: 'nonfiction', name: 'Non-Fiksi', desc: 'Jelas & persuasif' },
              { id: 'academic', name: 'Akademik', desc: 'Baku sesuai PUEBI' },
              { id: 'technical', name: 'Teknis', desc: 'Terminologi presisi' }
            ] as styleOpt}
              <button
                type="button"
                onclick={() => selectedStyle = styleOpt.id as TranslationStyle}
                class="p-3 rounded-2xl text-left border transition-all text-xs {
                  selectedStyle === styleOpt.id
                    ? 'border-zinc-950 bg-zinc-950 text-white shadow-sm'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
                }"
              >
                <div class="font-bold">{styleOpt.name}</div>
                <div class="text-[11px] mt-0.5 opacity-80">{styleOpt.desc}</div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Model Selection -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="block text-xs font-bold text-zinc-900 uppercase tracking-wider">
              Mesin Model Gemini
            </span>
            <div class="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-xl text-[11px] font-mono border border-zinc-200">
              <button
                type="button"
                onclick={() => modelCategoryFilter = 'all'}
                class="px-2.5 py-1 rounded-lg transition-all {modelCategoryFilter === 'all' ? 'bg-white text-zinc-950 shadow-sm font-bold' : 'text-zinc-500 hover:text-zinc-800'}"
              >
                Semua ({availableModelOptions.length})
              </button>
              <button
                type="button"
                onclick={() => modelCategoryFilter = 'efficiency'}
                class="px-2.5 py-1 rounded-lg transition-all {modelCategoryFilter === 'efficiency' ? 'bg-white text-zinc-950 shadow-sm font-bold' : 'text-zinc-500 hover:text-zinc-800'}"
              >
                Super Kuota (1.000 / 500 RPD)
              </button>
              <button
                type="button"
                onclick={() => modelCategoryFilter = 'frontier'}
                class="px-2.5 py-1 rounded-lg transition-all {modelCategoryFilter === 'frontier' ? 'bg-white text-zinc-950 shadow-sm font-bold' : 'text-zinc-500 hover:text-zinc-800'}"
              >
                Frontier (20 RPD)
              </button>
            </div>
          </div>

          <!-- Model Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
            {#each availableModelOptions.filter(m => modelCategoryFilter === 'all' || m.category === modelCategoryFilter) as opt}
              <label class="flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all {
                selectedModel === opt.id
                  ? 'border-zinc-950 ring-2 ring-zinc-950 bg-zinc-50'
                  : 'border-zinc-200 hover:border-zinc-400 bg-white'
              }">
                <input
                  type="radio"
                  name="model"
                  value={opt.id}
                  bind:group={selectedModel}
                  onchange={() => setModel(opt.id)}
                  class="mt-1 accent-zinc-950"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-xs text-zinc-900">{opt.name}</span>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border border-zinc-300 bg-white text-zinc-800">
                      {opt.badge}
                    </span>
                  </div>
                  <p class="text-[11px] text-zinc-500 mt-1 leading-snug">{opt.description}</p>
                  <p class="text-[10px] font-mono text-zinc-600 mt-1">{opt.usageNote}</p>
                </div>
              </label>
            {/each}
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="pt-4 flex flex-col sm:flex-row items-center gap-3">
          <button
            onclick={handleStartTranslation}
            class="w-full sm:flex-1 py-3.5 px-6 rounded-2xl font-bold text-white bg-zinc-950 hover:bg-zinc-800 shadow-sm flex items-center justify-center gap-2 text-sm transition-all"
          >
            <Play class="w-4 h-4 fill-current" />
            <span>Mulai Terjemahan</span>
          </button>

          <button
            onclick={() => openReader(0)}
            class="w-full sm:w-auto py-3.5 px-5 rounded-2xl font-semibold text-zinc-800 bg-white border border-zinc-300 hover:bg-zinc-100 flex items-center justify-center gap-2 text-sm transition-all"
            title="Buka pembaca untuk membaca langsung bab asli sebelum atau tanpa terjemahan"
          >
            <BookOpen class="w-4 h-4" />
            <span>Baca EPUB Ini Sekarang</span>
          </button>

          <button
            onclick={resetToUpload}
            class="text-xs text-zinc-400 hover:text-zinc-700 underline underline-offset-4 px-2"
          >
            Ganti Buku
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ================= STATE 3: LIVE TRANSLATING ================= -->
  {#if appState === 'translating'}
    <div class="max-w-3xl mx-auto w-full space-y-6 animate-in fade-in duration-200">
      <div class="p-6 sm:p-8 rounded-3xl bg-white border border-zinc-200 shadow-sm space-y-6">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            {#if translationQueueStatus === 'error'}
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-900 border border-zinc-300 mb-1">
                <AlertCircle class="w-3.5 h-3.5" />
                Antrean Dijeda (Perlu Aksi)
              </span>
            {:else}
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-900 border border-zinc-300 mb-1">
                <span class="w-2 h-2 rounded-full bg-zinc-900 animate-pulse"></span>
                Penerjemahan Sedang Berjalan
              </span>
            {/if}
            <h2 class="text-2xl font-bold text-zinc-950">Menerjemahkan Buku...</h2>
            <p class="text-xs text-zinc-500">{bookTitle} oleh {bookAuthor}</p>
          </div>

          <!-- Controls in Translate Header -->
          <div class="flex items-center gap-2 flex-wrap">
            {#if translationQueueStatus === 'error'}
              <button
                onclick={resumeTranslation}
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 text-white flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Play class="w-3.5 h-3.5 fill-current" />
                <span>Lanjutkan Antrean</span>
              </button>
            {/if}

            {#if completedChaptersCount > 0}
              <button
                onclick={() => openReader(0)}
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-100 text-zinc-900 border border-zinc-200 hover:bg-zinc-200 flex items-center gap-1.5 transition-colors"
              >
                <BookOpen class="w-3.5 h-3.5" />
                <span>Baca Bab Selesai ({completedChaptersCount})</span>
              </button>
            {/if}

            <button
              onclick={cancelCurrentTranslation}
              disabled={isCancelling}
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              {isCancelling ? 'Menghentikan...' : 'Batalkan'}
            </button>
          </div>
        </div>

        <!-- Big Minimalist Progress Bar -->
        <div class="space-y-2">
          <div class="flex items-baseline justify-between font-mono">
            <span class="text-4xl font-extrabold text-zinc-950">{progressPercent}%</span>
            <span class="text-xs text-zinc-500">
              Bab {currentChapterIndex + 1} dari {totalChapters}
            </span>
          </div>
          <div class="w-full h-3 bg-zinc-100 rounded-full overflow-hidden p-0.5 border border-zinc-200">
            <div
              class="h-full bg-zinc-950 rounded-full transition-all duration-300"
              style="width: {progressPercent}%;"
            ></div>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div class="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200">
            <span class="text-zinc-400 block font-sans">Bab Berjalan</span>
            <span class="font-bold text-zinc-900 truncate block mt-0.5">
              {currentChapterTitle || `Bab ${currentChapterIndex + 1}`}
            </span>
          </div>
          <div class="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200">
            <span class="text-zinc-400 block font-sans">Batch Bab</span>
            <span class="font-bold text-zinc-900 block mt-0.5">
              {currentBatchIndex + 1} / {totalBatchesInChapter || 1}
            </span>
          </div>
          <div class="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200">
            <span class="text-zinc-400 block font-sans">Bab Selesai</span>
            <span class="font-bold text-zinc-900 block mt-0.5">
              {completedChaptersCount} Bab
            </span>
          </div>
          <div class="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200">
            <span class="text-zinc-400 block font-sans">Sisa Bab</span>
            <span class="font-bold text-zinc-900 block mt-0.5">
              {Math.max(0, totalChapters - completedChaptersCount)} Bab
            </span>
          </div>
        </div>

        <!-- Live Activity Message -->
        <div class="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center gap-2.5 text-xs text-zinc-700">
          <RefreshCw class="w-3.5 h-3.5 text-zinc-900 animate-spin shrink-0" />
          <span class="font-mono truncate">{progressMessage}</span>
        </div>

        <!-- Failed Batches Notice -->
        {#if failedBatches.length > 0}
          <div class="p-4 rounded-2xl bg-zinc-100 border border-zinc-300 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-zinc-900 font-bold text-xs">
                <AlertCircle class="w-4 h-4" />
                <span>Batch Tertunda ({failedBatches.length})</span>
              </div>
              {#if failedBatches.length > 1}
                <button
                  onclick={retryAllFailedBatches}
                  disabled={isRetryingBatch}
                  class="px-3 py-1 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs flex items-center gap-1 transition-all"
                >
                  <RefreshCw class="w-3 h-3 {isRetryingBatch ? 'animate-spin' : ''}" />
                  <span>Retry Semua ({failedBatches.length})</span>
                </button>
              {/if}
            </div>
            <div class="space-y-2">
              {#each failedBatches as fb}
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white border border-zinc-200 text-xs">
                  <div class="flex-1 min-w-0 pr-2">
                    <span class="font-semibold text-zinc-900">Bab {fb.chapterIndex + 1}, Batch {fb.batchIndex + 1}</span>
                    <span class="text-zinc-500 block text-[11px] mt-0.5">
                      {formatBatchError(fb.error)}
                    </span>
                  </div>
                  <button
                    onclick={() => handleRetryBatch(fb.chapterIndex, fb.batchIndex)}
                    disabled={isRetryingBatch}
                    class="self-start sm:self-center shrink-0 px-3 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium flex items-center gap-1.5 text-xs transition-colors"
                  >
                    <RefreshCw class="w-3 h-3 {isRetryingBatch ? 'animate-spin' : ''}" />
                    <span>Retry</span>
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ================= STATE 4: TRANSLATION COMPLETE ================= -->
  {#if appState === 'completed'}
    <div class="max-w-2xl mx-auto w-full space-y-6 text-center animate-in fade-in duration-200">
      <div class="w-16 h-16 rounded-3xl bg-zinc-950 text-white flex items-center justify-center mx-auto shadow-md">
        <CheckCircle2 class="w-9 h-9" />
      </div>

      <div class="space-y-2">
        <span class="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Selesai 100%</span>
        <h2 class="text-3xl font-extrabold text-zinc-950">Terjemahan Lengkap!</h2>
        <p class="text-base text-zinc-600 font-medium">{bookTitle}</p>
        <p class="text-xs font-mono text-zinc-400">
          Semua {totalChapters} dari {totalChapters} bab telah siap dibaca dan diunduh.
        </p>
      </div>

      <!-- Action Card -->
      <div class="p-6 sm:p-8 rounded-3xl bg-white border border-zinc-200 shadow-sm space-y-3.5">
        <!-- Primary Button: Open Reader -->
        <button
          onclick={() => openReader(0)}
          class="w-full py-4 px-6 rounded-2xl font-bold text-white bg-zinc-950 hover:bg-zinc-800 shadow-md flex items-center justify-center gap-2.5 text-base transition-all transform hover:scale-[1.005]"
        >
          <BookOpen class="w-5 h-5" />
          <span>Baca Buku Sekarang (Online Reader)</span>
        </button>

        <!-- Secondary Button: Download EPUB -->
        <button
          onclick={downloadEpub}
          class="w-full py-3.5 px-6 rounded-2xl font-semibold text-zinc-900 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 flex items-center justify-center gap-2 text-sm transition-colors"
        >
          <Download class="w-4 h-4" />
          <span>Download File EPUB (.epub)</span>
        </button>

        <button
          onclick={resetToUpload}
          class="text-xs text-zinc-400 hover:text-zinc-700 underline underline-offset-4 pt-2"
        >
          Terjemahkan buku lain
        </button>
      </div>
    </div>
  {/if}

</div>

<!-- ================= DEDICATED IN-APP EPUB READER ================= -->
{#if showReader}
  <div class="fixed inset-0 z-50 flex flex-col bg-[#fafafa] text-zinc-900 animate-in fade-in duration-150">
    
    <!-- Top Navigation Header -->
    <header class="h-16 px-4 sm:px-6 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0 z-20">
      <!-- Left: Back & TOC Toggle -->
      <div class="flex items-center gap-2">
        <button
          onclick={() => showReader = false}
          class="p-2 rounded-xl text-zinc-600 hover:text-black hover:bg-zinc-100 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          title="Kembali ke Dashboard"
        >
          <ArrowLeft class="w-4 h-4" />
          <span class="hidden sm:inline">Kembali</span>
        </button>

        <button
          onclick={() => showTocSidebar = !showTocSidebar}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-semibold hover:bg-zinc-100 transition-colors {
            showTocSidebar ? 'bg-zinc-950 text-white hover:bg-zinc-800' : 'bg-white text-zinc-800'
          }"
          title="Buka Daftar Isi Bab"
        >
          <List class="w-4 h-4" />
          <span class="hidden sm:inline">Daftar Isi</span>
          <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-full {showTocSidebar ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-700'}">
            {totalChapters}
          </span>
        </button>

        <!-- Chapter Title in Header -->
        <span class="text-xs font-bold text-zinc-800 truncate max-w-[120px] sm:max-w-xs md:max-w-sm ml-2 hidden md:inline">
          {readerChapterTitle || `Bab ${readerChapterIndex + 1}`}
        </span>
      </div>

      <!-- Middle: View Mode Tabs (Single / Bilingual / Original) -->
      <div class="flex items-center bg-zinc-100 p-1 rounded-2xl border border-zinc-200 text-xs font-medium">
        <button
          onclick={() => readerViewMode = 'translated'}
          class="px-3 py-1 rounded-xl transition-all {
            readerViewMode === 'translated'
              ? 'bg-white text-zinc-950 font-bold shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900'
          }"
        >
          Indonesia
        </button>
        <button
          onclick={() => readerViewMode = 'side-by-side'}
          class="px-3 py-1 rounded-xl transition-all flex items-center gap-1 {
            readerViewMode === 'side-by-side'
              ? 'bg-white text-zinc-950 font-bold shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900'
          }"
          title="Bandingkan Teks Asli dan Terjemahan secara berdampingan"
        >
          <Columns class="w-3.5 h-3.5" />
          <span>Bilingual</span>
        </button>
        <button
          onclick={() => readerViewMode = 'original'}
          class="px-3 py-1 rounded-xl transition-all {
            readerViewMode === 'original'
              ? 'bg-white text-zinc-950 font-bold shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900'
          }"
        >
          Original (EN)
        </button>
      </div>

      <!-- Right: Reader Controls -->
      <div class="flex items-center gap-1 sm:gap-2">
        <!-- Typography Settings Toggle -->
        <div class="relative">
          <button
            onclick={() => showTypeSettings = !showTypeSettings}
            class="p-2 rounded-xl border border-zinc-200 text-zinc-700 hover:text-black hover:bg-zinc-100 transition-colors {
              showTypeSettings ? 'bg-zinc-100' : 'bg-white'
            }"
            title="Pengaturan Tipografi Teks"
          >
            <Type class="w-4 h-4" />
          </button>

          <!-- Typography Popover -->
          {#if showTypeSettings}
            <div class="absolute right-0 top-12 w-72 bg-white border border-zinc-200 rounded-3xl p-4 shadow-xl space-y-4 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div class="flex items-center justify-between pb-2 border-b border-zinc-100 text-xs font-bold text-zinc-900">
                <span>Pengaturan Teks</span>
                <button onclick={() => showTypeSettings = false} class="text-zinc-400 hover:text-zinc-900">
                  <X class="w-4 h-4" />
                </button>
              </div>

              <!-- Font Family -->
              <div class="space-y-1.5">
                <span class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Jenis Huruf</span>
                <div class="grid grid-cols-3 gap-1">
                  <button
                    onclick={() => setReaderFont('serif')}
                    class="py-1.5 px-2 rounded-xl text-xs border font-book-serif text-center {
                      readerFontFamily === 'serif' ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800'
                    }"
                  >
                    Serif Buku
                  </button>
                  <button
                    onclick={() => setReaderFont('sans')}
                    class="py-1.5 px-2 rounded-xl text-xs border font-book-sans text-center {
                      readerFontFamily === 'sans' ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800'
                    }"
                  >
                    Sans Modern
                  </button>
                  <button
                    onclick={() => setReaderFont('mono')}
                    class="py-1.5 px-2 rounded-xl text-xs border font-book-mono text-center {
                      readerFontFamily === 'mono' ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800'
                    }"
                  >
                    Mono
                  </button>
                </div>
              </div>

              <!-- Font Size -->
              <div class="space-y-1.5">
                <div class="flex justify-between items-center text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <span>Ukuran Huruf</span>
                  <span class="font-mono text-zinc-900">{readerFontSize}px</span>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    onclick={() => adjustFontSize(-2)}
                    class="flex-1 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-xs font-bold"
                  >
                    A-
                  </button>
                  <button
                    onclick={() => adjustFontSize(2)}
                    class="flex-1 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-xs font-bold"
                  >
                    A+
                  </button>
                </div>
              </div>

              <!-- Line Height & Text Alignment -->
              <div class="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-100">
                <div class="space-y-1.5">
                  <span class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Spasi Baris</span>
                  <div class="flex gap-1">
                    <button
                      onclick={() => readerLineHeight = '1.5'}
                      class="flex-1 py-1 rounded-lg text-xs font-mono border {readerLineHeight === '1.5' ? 'bg-zinc-950 text-white' : 'border-zinc-200'}"
                    >
                      1.5
                    </button>
                    <button
                      onclick={() => readerLineHeight = '1.75'}
                      class="flex-1 py-1 rounded-lg text-xs font-mono border {readerLineHeight === '1.75' ? 'bg-zinc-950 text-white' : 'border-zinc-200'}"
                    >
                      1.8
                    </button>
                    <button
                      onclick={() => readerLineHeight = '2.0'}
                      class="flex-1 py-1 rounded-lg text-xs font-mono border {readerLineHeight === '2.0' ? 'bg-zinc-950 text-white' : 'border-zinc-200'}"
                    >
                      2.0
                    </button>
                  </div>
                </div>

                <div class="space-y-1.5">
                  <span class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Perataan</span>
                  <div class="flex gap-1">
                    <button
                      onclick={() => readerTextAlign = 'left'}
                      class="flex-1 py-1 rounded-lg text-xs flex justify-center items-center border {readerTextAlign === 'left' ? 'bg-zinc-950 text-white' : 'border-zinc-200'}"
                      title="Rata Kiri"
                    >
                      <AlignLeft class="w-3.5 h-3.5" />
                    </button>
                    <button
                      onclick={() => readerTextAlign = 'justify'}
                      class="flex-1 py-1 rounded-lg text-xs flex justify-center items-center border {readerTextAlign === 'justify' ? 'bg-zinc-950 text-white' : 'border-zinc-200'}"
                      title="Rata Kanan-Kiri (Justify)"
                    >
                      <AlignJustify class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Paragraph Indent Toggle -->
              <div class="pt-2 border-t border-zinc-100 flex items-center justify-between">
                <span class="text-xs font-medium text-zinc-700">Indent Paragraf Buku</span>
                <input
                  type="checkbox"
                  bind:checked={readerIndent}
                  class="w-4 h-4 accent-zinc-950 rounded cursor-pointer"
                />
              </div>

              <!-- Width Selector -->
              <div class="space-y-1.5 pt-1 border-t border-zinc-100">
                <span class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Lebar Baca</span>
                <div class="grid grid-cols-3 gap-1">
                  <button
                    onclick={() => readerMaxWidth = 'compact'}
                    class="py-1 rounded-lg text-[11px] font-mono border {readerMaxWidth === 'compact' ? 'bg-zinc-950 text-white' : 'border-zinc-200'}"
                  >
                    Fokus
                  </button>
                  <button
                    onclick={() => readerMaxWidth = 'normal'}
                    class="py-1 rounded-lg text-[11px] font-mono border {readerMaxWidth === 'normal' ? 'bg-zinc-950 text-white' : 'border-zinc-200'}"
                  >
                    Standar
                  </button>
                  <button
                    onclick={() => readerMaxWidth = 'wide'}
                    class="py-1 rounded-lg text-[11px] font-mono border {readerMaxWidth === 'wide' ? 'bg-zinc-950 text-white' : 'border-zinc-200'}"
                  >
                    Lebar
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Fullscreen Toggle -->
        <button
          onclick={toggleFullscreen}
          class="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:text-black hover:bg-zinc-100 transition-colors hidden sm:block"
          title="Layar Penuh"
        >
          {#if readerIsFullscreen}
            <Minimize2 class="w-4 h-4" />
          {:else}
            <Maximize2 class="w-4 h-4" />
          {/if}
        </button>

        <!-- Download EPUB -->
        <button
          onclick={downloadEpub}
          class="p-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white shadow-sm transition-colors"
          title="Unduh EPUB Terjemahan"
        >
          <Download class="w-4 h-4" />
        </button>

        <!-- Close Reader -->
        <button
          onclick={() => showReader = false}
          class="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          title="Tutup Pembaca"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </header>

    <!-- Main Reader Workspace (Sidebar + Canvas) -->
    <div class="flex-1 flex overflow-hidden relative">

      <!-- Table of Contents (TOC) Sidebar -->
      {#if showTocSidebar}
        <aside class="w-80 border-r border-zinc-200 bg-white flex flex-col shrink-0 z-10 shadow-lg animate-in slide-in-from-left duration-200">
          <div class="p-4 border-b border-zinc-200 flex items-center justify-between">
            <div>
              <h3 class="font-bold text-sm text-zinc-900">Daftar Isi Bab</h3>
              <p class="text-[11px] text-zinc-500 font-mono">{totalChapters} Bab Terdeteksi</p>
            </div>
            <button
              onclick={() => showTocSidebar = false}
              class="p-1 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- TOC Search -->
          <div class="p-3 border-b border-zinc-100">
            <div class="relative">
              <Search class="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
              <input
                type="text"
                bind:value={readerSearchQuery}
                placeholder="Cari judul bab..."
                class="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
          </div>

          <!-- Chapters List -->
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            {#each chaptersList.filter(ch => !readerSearchQuery || ch.title.toLowerCase().includes(readerSearchQuery.toLowerCase())) as ch}
              <button
                onclick={() => {
                  loadChapterContent(ch.index);
                  if (window.innerWidth < 768) showTocSidebar = false;
                }}
                class="w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start gap-2.5 {
                  readerChapterIndex === ch.index
                    ? 'bg-zinc-950 text-white font-semibold shadow-sm'
                    : 'text-zinc-700 hover:bg-zinc-100'
                }"
              >
                <span class="font-mono text-[11px] opacity-60 mt-0.5 shrink-0">
                  #{ch.index + 1}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="truncate">{ch.title}</div>
                  <div class="text-[10px] font-mono mt-0.5 opacity-60">
                    ±{ch.wordCount} kata
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </aside>
      {/if}

      <!-- Reading Canvas Area -->
      <div
        id="reader-scroll-canvas"
        class="flex-1 overflow-y-auto bg-zinc-100/60 p-4 sm:p-8 md:p-12"
      >
        {#if isLoadingChapter}
          <div class="flex flex-col items-center justify-center h-80 space-y-3">
            <RefreshCw class="w-8 h-8 text-zinc-900 animate-spin" />
            <p class="text-xs font-mono text-zinc-500">Memuat konten bab...</p>
          </div>
        {:else}
          <!-- Paper Container -->
          <div class="mx-auto {
            readerViewMode === 'side-by-side'
              ? 'max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6'
              : readerMaxWidth === 'compact'
                ? 'max-w-2xl'
                : readerMaxWidth === 'wide'
                  ? 'max-w-5xl'
                  : 'max-w-3xl'
          }">

            <!-- COLUMN 1: Translated Indonesian (or Single Content) -->
            {#if readerViewMode === 'translated' || readerViewMode === 'side-by-side'}
              <article
                class="bg-white p-6 sm:p-14 md:p-16 rounded-3xl shadow-sm border border-zinc-200 text-zinc-900 reader-content {
                  readerFontFamily === 'serif' ? 'font-book-serif' : readerFontFamily === 'sans' ? 'font-book-sans' : 'font-book-mono'
                } {readerIndent ? 'reader-indent' : ''} {readerTextAlign === 'justify' ? 'text-justify' : 'text-left'}"
                style="font-size: {readerFontSize}px; line-height: {readerLineHeight};"
              >
                <!-- Chapter Header Badge -->
                <div class="mb-8 pb-4 border-b border-zinc-100 flex items-center justify-between no-indent text-xs font-mono text-zinc-400">
                  <span>Bab {readerChapterIndex + 1} dari {totalChapters}</span>
                  <span class="px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700">
                    {readerIsTranslated ? 'Bahasa Indonesia' : 'Teks Asli (Belum Diterjemahkan)'}
                  </span>
                </div>

                {@html readerTranslatedHtml}
              </article>
            {/if}

            <!-- COLUMN 2: Original English (Side-by-side or Original Only) -->
            {#if readerViewMode === 'original' || readerViewMode === 'side-by-side'}
              <article
                class="bg-white p-6 sm:p-14 md:p-16 rounded-3xl shadow-sm border border-zinc-200 text-zinc-800 reader-content {
                  readerViewMode === 'side-by-side' ? 'opacity-95 bg-zinc-50/50' : ''
                } {readerFontFamily === 'serif' ? 'font-book-serif' : readerFontFamily === 'sans' ? 'font-book-sans' : 'font-book-mono'} {
                  readerIndent ? 'reader-indent' : ''
                } {readerTextAlign === 'justify' ? 'text-justify' : 'text-left'}"
                style="font-size: {readerFontSize}px; line-height: {readerLineHeight};"
              >
                <!-- Chapter Header Badge -->
                <div class="mb-8 pb-4 border-b border-zinc-100 flex items-center justify-between no-indent text-xs font-mono text-zinc-400">
                  <span>Chapter {readerChapterIndex + 1} of {totalChapters}</span>
                  <span class="px-2 py-0.5 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700">
                    Original English
                  </span>
                </div>

                {@html readerOriginalHtml}
              </article>
            {/if}
          </div>

          <!-- Bottom Chapter Pagination Controls -->
          <div class="max-w-2xl mx-auto mt-10 pb-16 flex items-center justify-between gap-3 text-xs font-medium">
            <button
              onclick={prevChapter}
              disabled={readerChapterIndex === 0}
              class="px-4 py-2.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-900 flex items-center gap-2 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
            >
              <ChevronLeft class="w-4 h-4" />
              <span>Bab Sebelumnya</span>
            </button>

            <!-- Chapter dropdown selector -->
            <select
              value={readerChapterIndex}
              onchange={(e) => loadChapterContent(parseInt((e.target as HTMLSelectElement).value, 10))}
              class="px-3 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-900 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-zinc-950"
            >
              {#each chaptersList as ch, i}
                <option value={i}>#{i + 1}: {ch.title}</option>
              {/each}
            </select>

            <button
              onclick={nextChapter}
              disabled={readerChapterIndex >= totalChapters - 1}
              class="px-4 py-2.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-900 flex items-center gap-2 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm"
            >
              <span>Bab Berikutnya</span>
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
