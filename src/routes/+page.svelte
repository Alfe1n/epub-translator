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
    Sparkles,
    Check,
    Languages,
    Clock,
    Layers,
    Columns,
    Maximize2,
    Minimize2,
    Crown,
    Zap,
    Brain
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
  let selectedModel = $state('gemini-3.8-flash');
  let modelCategoryFilter = $state<'all' | 'frontier' | 'efficiency' | 'classic'>('all');

  interface ModelOption {
    id: string;
    name: string;
    category: 'frontier' | 'efficiency' | 'classic';
    badge: string;
    badgeStyle: string;
    borderActive: string;
    ringActive: string;
    description: string;
    usageNote: string;
  }

  const availableModelOptions: ModelOption[] = [
    {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
      category: 'frontier',
      badge: '👑 Tercerdas',
      badgeStyle: 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800',
      borderActive: 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/30',
      ringActive: 'ring-purple-500/50 text-purple-600',
      description: 'Model Flash tercerdas untuk alur kerja kompleks, rekayasa software & sastra tingkat tinggi.',
      usageNote: '⚡ Usage sangat hemat (kelas Flash)'
    },
    {
      id: 'gemini-3.7-flash',
      name: 'Gemini 3.7 Flash',
      category: 'frontier',
      badge: '🎯 Andal & Presisi',
      badgeStyle: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
      borderActive: 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30',
      ringActive: 'ring-indigo-500/50 text-indigo-600',
      description: 'Model generasi 3.7 untuk akurasi tinggi dan eksekusi multi-langkah yang konsisten.',
      usageNote: '⚡ Hemat kuota token'
    },
    {
      id: 'gemini-3.6-flash',
      name: 'Gemini 3.6 Flash',
      category: 'frontier',
      badge: '⚖️ Seimbang',
      badgeStyle: 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800',
      borderActive: 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30',
      ringActive: 'ring-blue-500/50 text-blue-600',
      description: 'Menyeimbangkan kecepatan kilat dan kemampuan multimodal untuk tugas harian.',
      usageNote: '⚡ Cepat & efisien'
    },
    {
      id: 'gemini-3.5-flash',
      name: 'Gemini 3.5 Flash',
      category: 'frontier',
      badge: '⚡ Cepat & Stabil',
      badgeStyle: 'bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
      borderActive: 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30',
      ringActive: 'ring-cyan-500/50 text-cyan-600',
      description: 'Memberikan kecepatan dasar dan performa untuk beban kerja rutin.',
      usageNote: '⚡ Ringan & andal'
    },
    {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash-Lite',
      category: 'efficiency',
      badge: '🌿 Super Hemat Kuota',
      badgeStyle: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      borderActive: 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30',
      ringActive: 'ring-emerald-500/50 text-emerald-600',
      description: 'Model multimodal paling hemat dan tercepat di kelasnya. Cocok untuk novel sangat tebal.',
      usageNote: '🌿 Biaya token minimal (mendekati Rp 0)'
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      category: 'classic',
      badge: '📖 Sastra Pro',
      badgeStyle: 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      borderActive: 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30',
      ringActive: 'ring-amber-500/50 text-amber-600',
      description: 'Model flagship klasik dengan kecerdasan sastra tinggi, pemahaman subteks dan dialog puitis.',
      usageNote: '👑 Diksi novel sastra'
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      category: 'classic',
      badge: '🚀 Kilat 2.0',
      badgeStyle: 'bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-800',
      borderActive: 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/30',
      ringActive: 'ring-teal-500/50 text-teal-600',
      description: 'Model generasi 2.0 dengan latensi respons paling singkat.',
      usageNote: '🚀 Latensi sangat cepat'
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      category: 'classic',
      badge: '🛡️ Klasik Teruji',
      badgeStyle: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
      borderActive: 'border-slate-500 bg-slate-50/50 dark:bg-slate-900/30',
      ringActive: 'ring-slate-500/50 text-slate-600',
      description: 'Model paling stabil dan teruji untuk kuota terbatas.',
      usageNote: '🛡️ Sangat stabil'
    }
  ];

  onMount(() => {
    const savedModel = localStorage.getItem('linguabook_custom_model');
    if (savedModel && savedModel !== 'gemini-2.5-pro') {
      selectedModel = savedModel;
    } else {
      selectedModel = 'gemini-3.8-flash';
      localStorage.setItem('linguabook_custom_model', 'gemini-3.8-flash');
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

  // SSE EventSource & Polling
  let eventSource: EventSource | null = null;
  let pollingInterval: any = null;

  // Reader / Preview State
  let showReader = $state(false);
  let readerChapterIndex = $state(0);
  let readerChapterTitle = $state('');
  let readerOriginalHtml = $state('');
  let readerTranslatedHtml = $state('');
  let readerIsTranslated = $state(false);
  let isLoadingChapter = $state(false);

  // Reader Settings
  let readerFontSize = $state(18); // px
  let readerLineHeight = $state('1.8');
  let readerTheme = $state<'light' | 'sepia' | 'dark'>('sepia');
  let readerViewMode = $state<'translated' | 'side-by-side'>('translated');

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num);
  }

  // --- Upload Handler ---
  async function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      await uploadFile(target.files[0]);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  }

  async function uploadFile(file: File) {
    uploadError = null;

    if (!file.name.toLowerCase().endsWith('.epub')) {
      uploadError = 'Please select a valid .epub ebook file.';
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      uploadError = 'File size exceeds 50 MB limit.';
      return;
    }

    isUploading = true;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload and parse EPUB.');
      }

      sessionId = data.sessionId;
      filename = data.filename;
      fileSizeBytes = data.fileSizeBytes;
      bookTitle = data.metadata.title;
      bookAuthor = data.metadata.creator;
      bookLanguage = data.metadata.language;
      bookCoverBase64 = data.metadata.coverBase64 || null;
      totalWords = data.totalWords;
      totalBatches = data.totalBatches;
      totalChapters = data.totalChapters;
      chaptersList = data.chapters;

      appState = 'overview';
    } catch (err: any) {
      uploadError = err.message || 'An error occurred while reading the EPUB.';
    } finally {
      isUploading = false;
    }
  }

  // --- Start Translation ---
  async function startTranslation() {
    if (!sessionId) return;

    const customKey = localStorage.getItem('linguabook_custom_api_key') || undefined;
    const customModel = selectedModel || localStorage.getItem('linguabook_custom_model') || 'gemini-3.8-flash';

    try {
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start translation.');
      }

      appState = 'translating';
      listenToProgress();
    } catch (err: any) {
      alert(err.message || 'Failed to start translation.');
    }
  }

  // --- SSE & Polling Progress Listener ---
  function listenToProgress() {
    if (!sessionId) return;
    cleanupProgressListeners();

    // Use Server-Sent Events (SSE)
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
        // If SSE fails or drops, start fallback polling
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

  // --- Cancel Translation ---
  async function cancelCurrentTranslation() {
    if (!sessionId || isCancelling) return;
    isCancelling = true;

    try {
      await fetch('/api/translate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      progressMessage = 'Translation cancelled.';
    } catch (e) {
      console.error(e);
    } finally {
      isCancelling = false;
    }
  }

  // --- Retry Failed Batch ---
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
      if (!res.ok) throw new Error(data.error || 'Retry failed');

      // Refresh status
      failedBatches = failedBatches.filter(
        (b) => !(b.chapterIndex === chapterIndex && b.batchIndex === batchIndex)
      );
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    } finally {
      isRetryingBatch = false;
    }
  }

  // --- Reader Preview ---
  async function openReader(initialChapterIndex: number = 0) {
    showReader = true;
    await loadChapterContent(initialChapterIndex);
  }

  async function loadChapterContent(chapterIndex: number) {
    if (!sessionId) return;
    isLoadingChapter = true;
    readerChapterIndex = chapterIndex;

    try {
      const res = await fetch(`/api/preview?sessionId=${sessionId}&chapterIndex=${chapterIndex}`);
      if (!res.ok) throw new Error('Failed to load chapter');
      const data = await res.json();
      readerChapterTitle = data.title;
      readerOriginalHtml = data.originalHtml;
      readerTranslatedHtml = data.translatedHtml;
      readerIsTranslated = data.isTranslated;
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
  }

  onDestroy(() => {
    cleanupProgressListeners();
  });
</script>

<div class="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">

  <!-- ================= STATE 1: UPLOAD AREA ================= -->
  {#if appState === 'upload'}
    <div class="max-w-2xl mx-auto text-center space-y-6">
      <div class="space-y-2">
        <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Translate EPUB to Natural Indonesian
        </h1>
        <p class="text-base sm:text-lg text-slate-600 dark:text-slate-400">
          Upload any English <code class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-sm font-semibold">.epub</code> book. LinguaBook translates chapter-by-chapter while preserving 100% of formatting, typography, images, and styling.
        </p>
      </div>

      <!-- Drag and Drop Dropzone -->
      <div
        role="region"
        aria-label="EPUB File Upload Dropzone"
        ondragover={(e) => { e.preventDefault(); isDragging = true; }}
        ondragleave={() => isDragging = false}
        ondrop={handleDrop}
        class="relative border-2 border-dashed rounded-3xl p-8 sm:p-12 transition-all duration-200 text-center {
          isDragging
            ? 'border-orange-500 bg-orange-50/60 dark:bg-orange-950/20 scale-[1.01]'
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 hover:border-orange-400 hover:bg-slate-50/50 dark:hover:bg-slate-900'
        } shadow-sm shadow-slate-200/50 dark:shadow-none"
      >
        <input
          id="file-upload"
          type="file"
          accept=".epub,application/epub+zip"
          onchange={handleFileInput}
          class="hidden"
          disabled={isUploading}
        />

        {#if isUploading}
          <div class="flex flex-col items-center justify-center space-y-4 py-4">
            <div class="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 flex items-center justify-center animate-spin">
              <RefreshCw class="w-7 h-7" />
            </div>
            <div class="space-y-1">
              <p class="font-semibold text-slate-900 dark:text-white text-base">Reading and analyzing EPUB...</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Extracting chapters, metadata, and calculating batches</p>
            </div>
          </div>
        {:else}
          <label for="file-upload" class="cursor-pointer flex flex-col items-center justify-center space-y-4 py-2">
            <div class="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center border border-orange-100 dark:border-orange-900/50 group-hover:scale-105 transition-transform">
              <UploadCloud class="w-8 h-8" />
            </div>

            <div class="space-y-1">
              <p class="text-lg font-semibold text-slate-900 dark:text-white">
                Drop your EPUB here
              </p>
              <p class="text-sm text-slate-500 dark:text-slate-400">
                or <span class="text-orange-600 dark:text-orange-400 font-medium hover:underline">Choose EPUB file</span> from your computer
              </p>
            </div>

            <div class="flex items-center gap-2 pt-2 text-xs text-slate-400 dark:text-slate-500">
              <span>Supports EPUB 2 & EPUB 3</span>
              <span>•</span>
              <span>Max 50 MB</span>
            </div>
          </label>
        {/if}
      </div>

      <!-- Error alert -->
      {#if uploadError}
        <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-3 text-left">
          <AlertCircle class="w-5 h-5 shrink-0 text-rose-500" />
          <p>{uploadError}</p>
        </div>
      {/if}

      <!-- Feature Highlights -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 text-left">
        <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2.5">
            <Sparkles class="w-4 h-4" />
          </div>
          <h4 class="font-semibold text-sm text-slate-900 dark:text-white mb-1">Literary Quality</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400">Natural Indonesian prose tailored for novels, dialogue, character voice, and nuances.</p>
        </div>

        <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2.5">
            <Layers class="w-4 h-4" />
          </div>
          <h4 class="font-semibold text-sm text-slate-900 dark:text-white mb-1">Preserve Structure</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400">HTML tags, CSS styles, images, font styling, and metadata are 100% preserved.</p>
        </div>

        <div class="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2.5">
            <BookOpen class="w-4 h-4" />
          </div>
          <h4 class="font-semibold text-sm text-slate-900 dark:text-white mb-1">Calibre & ReadEra Ready</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400">Repackaged strictly following EPUB standards with uncompressed mimetype.</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- ================= STATE 2: BOOK OVERVIEW & CONFIG ================= -->
  {#if appState === 'overview'}
    <div class="space-y-6 animate-in fade-in duration-300">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">Book Detected</span>
          <h2 class="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Ready for Translation</h2>
        </div>
        <button
          onclick={resetToUpload}
          class="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline"
        >
          Choose another file
        </button>
      </div>

      <!-- Book Card -->
      <div class="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-6 sm:gap-8 items-start">
        <!-- Book Cover Preview -->
        <div class="w-36 sm:w-44 aspect-[2/3] rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center relative group">
          {#if bookCoverBase64}
            <img src={bookCoverBase64} alt={bookTitle} class="w-full h-full object-cover" />
          {:else}
            <div class="p-4 text-center flex flex-col items-center justify-center space-y-2 text-slate-400 dark:text-slate-500">
              <BookOpen class="w-10 h-10 stroke-[1.5]" />
              <span class="text-xs font-medium leading-tight line-clamp-3">{bookTitle}</span>
            </div>
          {/if}
        </div>

        <!-- Book Details & Options -->
        <div class="flex-1 space-y-5 w-full">
          <div>
            <h3 class="text-2xl font-bold text-slate-900 dark:text-white leading-tight">{bookTitle}</h3>
            <p class="text-base text-slate-600 dark:text-slate-400 mt-1 font-medium">{bookAuthor}</p>
          </div>

          <!-- Metadata Badges -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Chapters</span>
              <span class="text-base font-bold text-slate-900 dark:text-white">{totalChapters} chapters</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Estimated Text</span>
              <span class="text-base font-bold text-slate-900 dark:text-white">~{formatNumber(totalWords)} words</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Translation Batches</span>
              <span class="text-base font-bold text-slate-900 dark:text-white">{totalBatches} batches</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span class="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Direction</span>
              <span class="text-base font-bold text-orange-600 dark:text-orange-400">English → ID</span>
            </div>
          </div>

          <!-- AI Model Selector (Pilih Kualitas Model) -->
          <div class="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Model Gemini (Pilihan Kualitas & Kuota)
                </span>
                <span class="text-[11px] text-slate-500 dark:text-slate-400">
                  Model terpilih: <strong class="text-orange-600 dark:text-orange-400">{selectedModel}</strong>
                </span>
              </div>

              <!-- Category filter tabs -->
              <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-[11px] font-semibold">
                <button
                  type="button"
                  onclick={() => modelCategoryFilter = 'all'}
                  class="px-2.5 py-1 rounded-lg transition-all {modelCategoryFilter === 'all' ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}"
                >
                  Semua (8)
                </button>
                <button
                  type="button"
                  onclick={() => modelCategoryFilter = 'frontier'}
                  class="px-2.5 py-1 rounded-lg transition-all {modelCategoryFilter === 'frontier' ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}"
                >
                  👑 3.x Flash
                </button>
                <button
                  type="button"
                  onclick={() => modelCategoryFilter = 'efficiency'}
                  class="px-2.5 py-1 rounded-lg transition-all {modelCategoryFilter === 'efficiency' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}"
                >
                  🌿 Super Hemat
                </button>
                <button
                  type="button"
                  onclick={() => modelCategoryFilter = 'classic'}
                  class="px-2.5 py-1 rounded-lg transition-all {modelCategoryFilter === 'classic' ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}"
                >
                  🏛️ Klasik
                </button>
              </div>
            </div>

            <!-- Model Cards Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
              {#each availableModelOptions.filter(m => modelCategoryFilter === 'all' || m.category === modelCategoryFilter) as opt}
                <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all {
                  selectedModel === opt.id
                    ? opt.borderActive + ' ring-1 ' + opt.ringActive
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white/50 dark:bg-slate-800/40'
                }">
                  <input
                    type="radio"
                    name="model"
                    value={opt.id}
                    bind:group={selectedModel}
                    onchange={() => setModel(opt.id)}
                    class="mt-1"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">{opt.name}</span>
                      <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold border {opt.badgeStyle}">
                        {opt.badge}
                      </span>
                    </div>
                    <span class="text-[11px] text-slate-600 dark:text-slate-300 block mt-1 leading-snug">
                      {opt.description}
                    </span>
                    <span class="inline-block mt-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                      {opt.usageNote}
                    </span>
                  </div>
                </label>
              {/each}
            </div>
          </div>

          <!-- Translation Style Selector -->
          <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Gaya Terjemahan (Translation Style)
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all {
                selectedStyle === 'literary'
                  ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }">
                <input type="radio" name="style" value="literary" bind:group={selectedStyle} class="mt-0.5 text-orange-600" />
                <div>
                  <span class="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white block">Natural / Literary (Default)</span>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Best for novels and fiction. Natural Indonesian phrasing and dialogue voice.</span>
                </div>
              </label>

              <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all {
                selectedStyle === 'nonfiction'
                  ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }">
                <input type="radio" name="style" value="nonfiction" bind:group={selectedStyle} class="mt-0.5 text-orange-600" />
                <div>
                  <span class="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white block">Non-Fiction</span>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Clear, structured for essays, self-help, biographies, and articles.</span>
                </div>
              </label>

              <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all {
                selectedStyle === 'academic'
                  ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }">
                <input type="radio" name="style" value="academic" bind:group={selectedStyle} class="mt-0.5 text-orange-600" />
                <div>
                  <span class="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white block">Academic</span>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Formal standard Indonesian (PUEBI), preserves scholarly citations and terms.</span>
                </div>
              </label>

              <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all {
                selectedStyle === 'technical'
                  ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }">
                <input type="radio" name="style" value="technical" bind:group={selectedStyle} class="mt-0.5 text-orange-600" />
                <div>
                  <span class="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white block">Technical</span>
                  <span class="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">Precise terminology, preserves code keywords and parameters.</span>
                </div>
              </label>
            </div>
          </div>

          <!-- Cost Protection Advisory -->
          <div class="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
            <AlertCircle class="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p class="font-semibold">Cost & Quota Protection</p>
              <p class="mt-0.5 opacity-90">
                This book will be translated across {totalBatches} batches (~{formatNumber(totalWords)} words). Large books consume Gemini API token quota. You can cancel at any time.
              </p>
            </div>
          </div>

          <!-- Start Button -->
          <div class="pt-2 flex items-center gap-3">
            <button
              onclick={startTranslation}
              class="flex-1 px-6 py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 hover:from-orange-500 hover:to-amber-500 shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 text-base transition-all transform hover:scale-[1.01] active:scale-[0.99]"
            >
              <Play class="w-5 h-5 fill-current" />
              <span>Start Translation</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Chapter Outline -->
      <div class="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h4 class="font-bold text-base text-slate-900 dark:text-white mb-3">Detected Chapters ({chaptersList.length})</h4>
        <div class="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto pr-2 text-xs">
          {#each chaptersList as ch}
            <div class="py-2 flex items-center justify-between">
              <span class="font-medium text-slate-800 dark:text-slate-200 truncate max-w-md">{ch.title}</span>
              <div class="flex items-center gap-4 text-slate-400 shrink-0">
                <span>{formatNumber(ch.wordCount)} words</span>
                <span>{ch.batchesCount} batches</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- ================= STATE 3: LIVE TRANSLATION DASHBOARD ================= -->
  {#if appState === 'translating'}
    <div class="space-y-6 animate-in fade-in duration-300">
      <!-- Dashboard Card -->
      <div class="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 mb-1">
              <span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
              Translating in progress
            </span>
            <h2 class="text-2xl font-bold text-slate-900 dark:text-white">Translating your book...</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">{bookTitle} by {bookAuthor}</p>
          </div>

          <div class="flex items-center gap-2">
            {#if completedChaptersCount > 0}
              <button
                onclick={() => openReader(0)}
                class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
              >
                <Eye class="w-4 h-4" />
                <span>Read Completed ({completedChaptersCount})</span>
              </button>
            {/if}

            <button
              onclick={cancelCurrentTranslation}
              disabled={isCancelling}
              class="px-4 py-2 rounded-xl text-xs font-semibold border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
            >
              {isCancelling ? 'Stopping...' : 'Cancel Translation'}
            </button>
          </div>
        </div>

        <!-- Big Progress Bar -->
        <div class="space-y-2">
          <div class="flex items-baseline justify-between">
            <span class="text-4xl font-extrabold text-orange-600 dark:text-orange-400">{progressPercent}%</span>
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">
              Chapter {currentChapterIndex + 1} of {totalChapters}
            </span>
          </div>
          <div class="w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              class="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500"
              style="width: {progressPercent}%;"
            ></div>
          </div>
        </div>

        <!-- Progress Metrics -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span class="text-slate-400 block font-medium">Current Chapter</span>
            <span class="font-bold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
              {currentChapterTitle || `Chapter ${currentChapterIndex + 1}`}
            </span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span class="text-slate-400 block font-medium">Chapter Batches</span>
            <span class="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
              Batch {currentBatchIndex + 1} / {totalBatchesInChapter || 1}
            </span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span class="text-slate-400 block font-medium">Completed</span>
            <span class="font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
              {completedChaptersCount} chapters
            </span>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span class="text-slate-400 block font-medium">Remaining</span>
            <span class="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
              {Math.max(0, totalChapters - completedChaptersCount)} chapters
            </span>
          </div>
        </div>

        <!-- Live Activity Message -->
        <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
          <RefreshCw class="w-4 h-4 text-orange-500 animate-spin shrink-0" />
          <span class="font-mono">{progressMessage}</span>
        </div>

        <!-- Failed Batches & Retry UI -->
        {#if failedBatches.length > 0}
          <div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-3">
            <div class="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-xs">
              <AlertCircle class="w-4 h-4" />
              <span>Failed Batches ({failedBatches.length})</span>
            </div>
            <div class="space-y-2">
              {#each failedBatches as fb}
                <div class="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-950 text-xs">
                  <div>
                    <span class="font-semibold text-slate-900 dark:text-white">Chapter {fb.chapterIndex + 1}, Batch {fb.batchIndex + 1}</span>
                    <span class="text-rose-500 dark:text-rose-400 block text-[11px] truncate max-w-sm">{fb.error}</span>
                  </div>
                  <button
                    onclick={() => handleRetryBatch(fb.chapterIndex, fb.batchIndex)}
                    disabled={isRetryingBatch}
                    class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw class="w-3.5 h-3.5 {isRetryingBatch ? 'animate-spin' : ''}" />
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
    <div class="max-w-2xl mx-auto space-y-6 text-center animate-in fade-in duration-300">
      <div class="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-md shadow-emerald-500/10">
        <CheckCircle2 class="w-9 h-9" />
      </div>

      <div class="space-y-2">
        <span class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Success</span>
        <h2 class="text-3xl font-extrabold text-slate-900 dark:text-white">Translation Complete!</h2>
        <p class="text-base text-slate-600 dark:text-slate-400">{bookTitle}</p>
        <p class="text-xs text-slate-400">
          English → Indonesian • {totalChapters} / {totalChapters} chapters translated
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <button
          onclick={downloadEpub}
          class="w-full py-4 px-6 rounded-2xl font-bold text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 text-lg transition-all transform hover:scale-[1.01]"
        >
          <Download class="w-5 h-5" />
          <span>Download Indonesian EPUB</span>
        </button>

        <button
          onclick={() => openReader(0)}
          class="w-full py-3 px-6 rounded-2xl font-semibold text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center gap-2 text-base transition-colors"
        >
          <BookOpen class="w-5 h-5 text-orange-500" />
          <span>Read Online (Reader Mode)</span>
        </button>

        <button
          onclick={resetToUpload}
          class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline pt-2"
        >
          Translate another book
        </button>
      </div>
    </div>
  {/if}

</div>

<!-- ================= MODAL: IN-APP READER / PREVIEW ================= -->
{#if showReader}
  <div class="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
    <!-- Reader Header -->
    <div class="h-16 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
      <!-- Left: Chapter Selector & Navigation -->
      <div class="flex items-center gap-2">
        <button
          onclick={prevChapter}
          disabled={readerChapterIndex === 0}
          class="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
          title="Previous Chapter"
        >
          <ChevronLeft class="w-5 h-5" />
        </button>

        <select
          value={readerChapterIndex}
          onchange={(e) => loadChapterContent(parseInt((e.target as HTMLSelectElement).value, 10))}
          class="text-xs sm:text-sm font-semibold max-w-[200px] sm:max-w-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white truncate"
        >
          {#each chaptersList as ch, i}
            <option value={i}>{ch.title}</option>
          {/each}
        </select>

        <button
          onclick={nextChapter}
          disabled={readerChapterIndex >= totalChapters - 1}
          class="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
          title="Next Chapter"
        >
          <ChevronRight class="w-5 h-5" />
        </button>
      </div>

      <!-- Middle: Status Badge -->
      <div class="hidden md:flex items-center gap-2">
        {#if readerIsTranslated}
          <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            Translated (ID)
          </span>
        {:else}
          <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            Original English
          </span>
        {/if}
      </div>

      <!-- Right: Reader Settings & Download -->
      <div class="flex items-center gap-1 sm:gap-2">
        <!-- View mode toggle: Translated only vs Side-by-side -->
        <button
          onclick={() => readerViewMode = readerViewMode === 'translated' ? 'side-by-side' : 'translated'}
          class="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Toggle Side-by-Side View"
        >
          <Columns class="w-3.5 h-3.5" />
          <span>{readerViewMode === 'translated' ? 'Compare' : 'Single'}</span>
        </button>

        <!-- Font size - -->
        <button
          onclick={() => readerFontSize = Math.max(14, readerFontSize - 2)}
          class="p-1.5 px-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Decrease Font Size"
        >
          A-
        </button>

        <!-- Font size + -->
        <button
          onclick={() => readerFontSize = Math.min(26, readerFontSize + 2)}
          class="p-1.5 px-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Increase Font Size"
        >
          A+
        </button>

        <!-- Reader Theme: Light, Sepia, Dark -->
        <div class="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 p-0.5">
          <button
            onclick={() => readerTheme = 'light'}
            class="w-6 h-6 rounded-lg bg-white border border-slate-200 {readerTheme === 'light' ? 'ring-2 ring-orange-500' : ''}"
            title="Light theme"
          ></button>
          <button
            onclick={() => readerTheme = 'sepia'}
            class="w-6 h-6 rounded-lg bg-[#fbf0d9] border border-[#ebd4a8] mx-0.5 {readerTheme === 'sepia' ? 'ring-2 ring-orange-500' : ''}"
            title="Sepia theme"
          ></button>
          <button
            onclick={() => readerTheme = 'dark'}
            class="w-6 h-6 rounded-lg bg-slate-900 border border-slate-700 {readerTheme === 'dark' ? 'ring-2 ring-orange-500' : ''}"
            title="Dark theme"
          ></button>
        </div>

        <!-- Download EPUB -->
        <button
          onclick={downloadEpub}
          class="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
          title="Download Indonesian EPUB"
        >
          <Download class="w-4 h-4" />
        </button>

        <!-- Close Reader -->
        <button
          onclick={() => showReader = false}
          class="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Close Reader"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Reader Paper Content Area -->
    <div class="flex-1 overflow-y-auto p-4 sm:p-8 {
      readerTheme === 'sepia'
        ? 'reader-theme-sepia'
        : readerTheme === 'dark'
          ? 'bg-slate-950 text-slate-100'
          : 'bg-slate-100 text-slate-900'
    }">
      {#if isLoadingChapter}
        <div class="flex flex-col items-center justify-center h-64 space-y-3">
          <RefreshCw class="w-8 h-8 text-orange-500 animate-spin" />
          <p class="text-sm font-medium text-slate-500">Loading chapter content...</p>
        </div>
      {:else}
        <div class="max-w-4xl mx-auto {readerViewMode === 'side-by-side' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : ''}">
          <!-- Indonesian (Translated) Column -->
          <div
            class="p-6 sm:p-12 rounded-3xl shadow-md border reader-content reader-paper {
              readerTheme === 'sepia'
                ? 'bg-[#f5e6c8] border-[#e5cb9b] text-[#42301c]'
                : readerTheme === 'dark'
                  ? 'bg-slate-900 border-slate-800 text-slate-100'
                  : 'bg-white border-slate-200 text-slate-900'
            }"
            style="font-size: {readerFontSize}px; line-height: {readerLineHeight};"
          >
            {#if readerViewMode === 'side-by-side'}
              <div class="text-xs font-bold uppercase tracking-wider text-orange-600 mb-4 pb-2 border-b">
                Bahasa Indonesia
              </div>
            {/if}
            {@html readerTranslatedHtml}
          </div>

          <!-- English (Original) Column (if Side-by-side mode) -->
          {#if readerViewMode === 'side-by-side'}
            <div
              class="p-6 sm:p-12 rounded-3xl shadow-md border reader-content opacity-90 {
                readerTheme === 'sepia'
                  ? 'bg-[#eddcb8] border-[#e5cb9b] text-[#42301c]'
                  : readerTheme === 'dark'
                    ? 'bg-slate-900/60 border-slate-800 text-slate-300'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
              }"
              style="font-size: {readerFontSize}px; line-height: {readerLineHeight};"
            >
              <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 pb-2 border-b">
                Original English
              </div>
              {@html readerOriginalHtml}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
