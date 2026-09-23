<script lang="ts">
  import { onMount } from 'svelte';
  import {
    UploadCloud,
    BookOpen,
    FileText,
    RefreshCw,
    Download,
    X,
    ChevronLeft,
    ChevronRight,
    Languages,
    Search,
    AlignLeft,
    AlignJustify,
    ArrowLeft,
    List,
    Type,
    Maximize2,
    Minimize2,
    Columns,
    AlertCircle,
    ArrowRight,
    Sparkles,
    Check
  } from '@lucide/svelte';

  // Mode: 'landing' (show reader landing page) | 'reading' (full reading canvas)
  let mode = $state<'landing' | 'reading'>('landing');

  // Session & Book State
  let sessionId = $state<string | null>(null);
  let filename = $state('');
  let bookTitle = $state('Untitled Book');
  let bookAuthor = $state('Unknown Author');
  let bookLanguage = $state('en');
  let bookCoverBase64 = $state<string | null>(null);
  let totalWords = $state(0);
  let totalBatches = $state(0);
  let totalChapters = $state(0);
  let bookStatus = $state<string>('uploaded');
  let chaptersList = $state<Array<{ index: number; title: string; wordCount: number; batchesCount: number; isTranslated?: boolean }>>([]);

  // Upload state
  let isDragging = $state(false);
  let isUploading = $state(false);
  let uploadError = $state<string | null>(null);

  // Recent book in localStorage (if any)
  let recentSessionId = $state<string | null>(null);
  let recentBookTitle = $state<string | null>(null);
  let recentBookAuthor = $state<string | null>(null);
  let isLoadingRecent = $state(false);

  // Reader Canvas State
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

  onMount(async () => {
    // Enforce light monochrome
    document.documentElement.classList.remove('dark');

    // Load typography preferences
    const savedFont = localStorage.getItem('linguabook_reader_font');
    if (savedFont === 'serif' || savedFont === 'sans' || savedFont === 'mono') {
      readerFontFamily = savedFont;
    }
    const savedSize = localStorage.getItem('linguabook_reader_size');
    if (savedSize) {
      readerFontSize = parseInt(savedSize, 10) || 18;
    }

    // Check URL parameters for ?sessionId=...
    const urlParams = new URLSearchParams(window.location.search);
    const sidParam = urlParams.get('sessionId');
    const chParam = urlParams.get('chapter');
    const initialChapter = chParam ? parseInt(chParam, 10) : 0;

    if (sidParam) {
      await loadBookSession(sidParam, initialChapter);
    } else {
      // Check for recent session in localStorage
      const storedSid = localStorage.getItem('linguabook_last_session_id');
      const storedTitle = localStorage.getItem('linguabook_last_book_title');
      const storedAuthor = localStorage.getItem('linguabook_last_book_author');
      if (storedSid && storedTitle) {
        recentSessionId = storedSid;
        recentBookTitle = storedTitle;
        recentBookAuthor = storedAuthor || 'Unknown Author';
      }
    }
  });

  // Load an existing session into the reader
  async function loadBookSession(sid: string, chapterIndex: number = 0) {
    isLoadingRecent = true;
    try {
      const res = await fetch(`/api/book?sessionId=${sid}`);
      if (!res.ok) {
        throw new Error('Sesi buku tidak ditemukan.');
      }
      const data = await res.json();
      sessionId = data.sessionId;
      filename = data.filename;
      bookTitle = data.title;
      bookAuthor = data.author;
      bookLanguage = data.language;
      bookCoverBase64 = data.coverBase64;
      totalWords = data.totalWords;
      totalBatches = data.totalBatches;
      totalChapters = data.totalChapters;
      bookStatus = data.status;
      chaptersList = data.chapters || [];

      // Save as recent
      localStorage.setItem('linguabook_last_session_id', data.sessionId);
      localStorage.setItem('linguabook_last_book_title', data.title);
      localStorage.setItem('linguabook_last_book_author', data.author);

      // Default view mode: if any chapter is translated, prefer 'translated', otherwise 'original'
      const hasTranslations = chaptersList.some(c => c.isTranslated);
      if (!hasTranslations) {
        readerViewMode = 'original';
      } else {
        readerViewMode = 'translated';
      }

      mode = 'reading';
      await loadChapterContent(chapterIndex);
    } catch (err: any) {
      console.error('Failed to load session:', err);
      uploadError = err.message || 'Gagal memuat buku.';
      mode = 'landing';
    } finally {
      isLoadingRecent = false;
    }
  }

  // Handle direct file upload in reader landing
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

      sessionId = data.sessionId;
      filename = data.filename;
      bookTitle = data.metadata?.title || 'Untitled Book';
      bookAuthor = data.metadata?.creator || 'Unknown Author';
      bookLanguage = data.metadata?.language || 'en';
      bookCoverBase64 = data.metadata?.coverBase64 || null;
      totalWords = data.totalWords || 0;
      totalBatches = data.totalBatches || 0;
      totalChapters = data.totalChapters || 0;
      chaptersList = data.chapters || [];
      bookStatus = 'uploaded';

      // Save as recent session
      localStorage.setItem('linguabook_last_session_id', data.sessionId);
      localStorage.setItem('linguabook_last_book_title', bookTitle);
      localStorage.setItem('linguabook_last_book_author', bookAuthor);

      // Books uploaded directly in Reader start in 'original' mode (clean instant reading)
      readerViewMode = 'original';
      mode = 'reading';
      await loadChapterContent(0);
    } catch (err: any) {
      console.error('Upload error in reader:', err);
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

  function downloadEpub() {
    if (!sessionId) return;
    window.location.href = `/api/download?sessionId=${sessionId}`;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (mode !== 'reading') return;
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
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>{mode === 'reading' ? `${bookTitle} — EPUB Reader` : 'EPUB Reader — Pembaca Buku Digital Bebas Distraksi'}</title>
</svelte:head>

<!-- ================= 1. DEDICATED EPUB READER LANDING PAGE ================= -->
{#if mode === 'landing'}
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 flex-1 flex flex-col justify-center space-y-12 animate-in fade-in duration-200">
    
    <!-- Hero Header -->
    <div class="text-center max-w-2xl mx-auto space-y-4">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-white text-zinc-900 text-xs font-mono shadow-sm">
        <BookOpen class="w-3.5 h-3.5" />
        <span>Dedicated In-App Reader</span>
      </div>
      <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-950">
        EPUB Reader Modern
      </h1>
      <p class="text-base sm:text-lg text-zinc-600 leading-relaxed font-normal">
        Baca novel dan buku digital berformat <span class="font-mono text-zinc-900 font-semibold">.epub</span> langsung di browser Anda dengan tipografi buku yang elegan, navigasi bab instan, dan bebas distraksi.
      </p>
    </div>

    <!-- Quick Action: Recent Book (if exists) -->
    {#if recentSessionId && recentBookTitle}
      <div class="max-w-xl mx-auto w-full p-4 sm:p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm flex items-center justify-between gap-4">
        <div class="flex items-center gap-3.5 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 shrink-0">
            <BookOpen class="w-5 h-5" />
          </div>
          <div class="min-w-0">
            <span class="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block">Buku Terakhir Dibuka</span>
            <h4 class="font-bold text-sm text-zinc-900 truncate">{recentBookTitle}</h4>
            <p class="text-xs text-zinc-500 truncate">{recentBookAuthor}</p>
          </div>
        </div>
        <button
          onclick={() => loadBookSession(recentSessionId!)}
          disabled={isLoadingRecent}
          class="shrink-0 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
        >
          {#if isLoadingRecent}
            <RefreshCw class="w-3.5 h-3.5 animate-spin" />
            <span>Memuat...</span>
          {:else}
            <span>Lanjutkan Membaca</span>
            <ArrowRight class="w-3.5 h-3.5" />
          {/if}
        </button>
      </div>
    {/if}

    <!-- Reader Dropzone -->
    <div class="max-w-xl mx-auto w-full">
      <button
        type="button"
        aria-label="Upload EPUB to read immediately"
        class="w-full relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer bg-white shadow-sm {
          isDragging
            ? 'border-zinc-950 bg-zinc-50 scale-[1.01]'
            : 'border-zinc-300 hover:border-zinc-900 hover:bg-zinc-50/50'
        }"
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
        onclick={() => document.getElementById('reader-file-input')?.click()}
      >
        <input
          id="reader-file-input"
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
              {isUploading ? 'Membuka dan memuat isi buku...' : 'Tarik & lepas file .epub untuk langsung membaca'}
            </p>
            <p class="text-xs text-zinc-500">
              atau <span class="text-zinc-950 font-semibold underline underline-offset-4">pilih file dari perangkat</span>
            </p>
          </div>

          <div class="pt-2 flex items-center gap-3 text-xs text-zinc-400 font-mono">
            <span>Buku langsung dibuka seketika</span>
            <span>•</span>
            <span>Maksimal 50 MB</span>
          </div>
        </div>
      </button>

      <!-- Upload Error -->
      {#if uploadError}
        <div class="mt-4 p-4 rounded-2xl bg-zinc-100 border border-zinc-300 text-zinc-900 text-xs flex items-center gap-2.5">
          <AlertCircle class="w-4 h-4 text-zinc-900 shrink-0" />
          <p>{uploadError}</p>
        </div>
      {/if}
    </div>

    <!-- Reader Feature Highlights (4 Grid) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto pt-2">
      <div class="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-2">
        <div class="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900">
          <Type class="w-4 h-4" />
        </div>
        <h3 class="font-bold text-sm text-zinc-900">Tipografi Buku Sejati</h3>
        <p class="text-xs text-zinc-500 leading-relaxed">
          Pilihan huruf Serif klasik, Sans-serif modern, ukuran font fleksibel, spasi baris, dan indentasi buku cetak.
        </p>
      </div>

      <div class="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-2">
        <div class="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900">
          <List class="w-4 h-4" />
        </div>
        <h3 class="font-bold text-sm text-zinc-900">Daftar Isi & Cari Bab</h3>
        <p class="text-xs text-zinc-500 leading-relaxed">
          Sidebar daftar isi interaktif dengan fitur filter pencarian cepat judul bab dan estimasi kata per bab.
        </p>
      </div>

      <div class="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-2">
        <div class="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900">
          <Columns class="w-4 h-4" />
        </div>
        <h3 class="font-bold text-sm text-zinc-900">Mode Bilingual Berdampingan</h3>
        <p class="text-xs text-zinc-500 leading-relaxed">
          Tampilan dua kolom sejajar (English asli vs Terjemahan Indonesia) untuk membandingkan teks secara paralel.
        </p>
      </div>

      <div class="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-2">
        <div class="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900">
          <Sparkles class="w-4 h-4" />
        </div>
        <h3 class="font-bold text-sm text-zinc-900">Terjemahkan Kapan Saja</h3>
        <p class="text-xs text-zinc-500 leading-relaxed">
          Buku yang sedang dibaca dapat diterjemahkan ke Bahasa Indonesia menggunakan AI Gemini hanya dengan satu klik.
        </p>
      </div>
    </div>

    <!-- Switcher to Translator Tool -->
    <div class="text-center pt-2">
      <a
        href="/"
        class="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 underline underline-offset-4"
      >
        <Languages class="w-3.5 h-3.5" />
        <span>Ingin menerjemahkan naskah buku terlebih dahulu? Buka Halaman Penerjemah &rarr;</span>
      </a>
    </div>

  </div>
{/if}

<!-- ================= 2. IMMERSIVE IN-APP EPUB READER CANVAS ================= -->
{#if mode === 'reading'}
  <div class="fixed inset-0 z-50 flex flex-col bg-[#fafafa] text-zinc-900 animate-in fade-in duration-150">
    
    <!-- Top Bar Navigation Header -->
    <header class="h-16 px-4 sm:px-6 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0 z-20">
      
      <!-- Left: Back & TOC -->
      <div class="flex items-center gap-2">
        <button
          onclick={() => mode = 'landing'}
          class="p-2 rounded-xl text-zinc-600 hover:text-black hover:bg-zinc-100 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          title="Kembali ke Landing Page Reader"
        >
          <ArrowLeft class="w-4 h-4" />
          <span class="hidden sm:inline">Landing Reader</span>
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
          title="Tampilkan terjemahan Bahasa Indonesia"
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
          title="Bandingkan Teks Asli dan Terjemahan berdampingan"
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
          title="Baca teks asli bahasa Inggris"
        >
          Original (EN)
        </button>
      </div>

      <!-- Right: Reader Controls -->
      <div class="flex items-center gap-1 sm:gap-2">
        
        <!-- Button: Translate this book with AI (Link to /) -->
        <a
          href="/?sessionId={sessionId}"
          class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-800 transition-colors shadow-sm"
          title="Terjemahkan buku ini menggunakan Gemini AI"
        >
          <Languages class="w-3.5 h-3.5 text-zinc-900" />
          <span>Terjemahkan (AI)</span>
        </a>

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

              <!-- Reading Width Selector -->
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
          title="Unduh EPUB"
        >
          <Download class="w-4 h-4" />
        </button>

        <!-- Exit Reader Mode -->
        <button
          onclick={() => mode = 'landing'}
          class="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          title="Tutup Pembaca"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </header>

    <!-- Reader Workspace (Sidebar + Canvas) -->
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
