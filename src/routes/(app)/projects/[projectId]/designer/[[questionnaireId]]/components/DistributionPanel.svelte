<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import { X, Copy, Check, Globe, Lock, ExternalLink, Code, QrCode } from 'lucide-svelte';

  interface Props {
    isOpen?: boolean;
    onclose?: () => void;
  }

  let { isOpen = false, onclose }: Props = $props();

  let copiedField = $state<string | null>(null);
  let showQrCode = $state(false);
  let qrCanvas = $state<HTMLCanvasElement | undefined>(undefined);

  const questionnaireId = $derived(designerStore.questionnaire.id);

  const shareCode = $derived.by(() => {
    if (!questionnaireId) return '';
    return questionnaireId.replace(/-/g, '').substring(0, 8).toUpperCase();
  });

  const filloutUrl = $derived.by(() => {
    if (!shareCode) return '';
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/${shareCode}`;
  });

  const embedCode = $derived.by(() => {
    if (!filloutUrl) return '';
    return `<iframe src="${filloutUrl}" width="100%" height="600" frameborder="0" allow="clipboard-write"></iframe>`;
  });

  const isPublished = $derived.by(() => {
    const q = designerStore.questionnaire;
    const status = (q as any).status as string | undefined; // status is set by backend but not in frontend type
    const metaStatus = q.metadata?.status as string | undefined;
    return status === 'published' || metaStatus === 'published';
  });

  const questionCount = $derived(designerStore.questionnaire.questions.length);
  const pageCount = $derived(designerStore.questionnaire.pages.length);

  const accessSummary = $derived.by(() => {
    const settings = designerStore.questionnaire.settings;
    const items: string[] = [];
    if (settings.requireAuthentication) items.push('Login required');
    if (settings.allowAnonymous) items.push('Anonymous allowed');
    if (settings.requireConsent) items.push('Consent required');
    if (settings.saveProgress) items.push('Progress saved');
    if (items.length === 0) items.push('Open access');
    return items;
  });

  async function copyToClipboard(text: string, fieldId: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedField = fieldId;
      setTimeout(() => {
        copiedField = null;
      }, 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copiedField = fieldId;
      setTimeout(() => {
        copiedField = null;
      }, 2000);
    }
  }

  async function handlePublish() {
    const saved = await designerStore.saveQuestionnaire();
    if (!saved) return;
    await designerStore.publishQuestionnaire();
  }

  function handleClose() {
    showQrCode = false;
    onclose?.();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  $effect(() => {
    if (showQrCode && qrCanvas && filloutUrl) {
      renderQrCode(qrCanvas, filloutUrl);
    }
  });

  function renderQrCode(canvas: HTMLCanvasElement, data: string) {
    const modules = generateQrModules(data);
    const size = modules.length;
    const cellSize = 4;
    const margin = 4;
    const totalSize = (size + margin * 2) * cellSize;

    canvas.width = totalSize;
    canvas.height = totalSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalSize, totalSize);

    ctx.fillStyle = '#000000';
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (getCell(modules, row, col)) {
          ctx.fillRect(
            (col + margin) * cellSize,
            (row + margin) * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }
  }

  // --- QR code helpers with safe array access ---

  function getCell(grid: boolean[][], row: number, col: number): boolean {
    const r = grid[row];
    return r !== undefined ? (r[col] ?? false) : false;
  }

  function setCell(grid: boolean[][], row: number, col: number, value: boolean): void {
    const r = grid[row];
    if (r !== undefined && col >= 0 && col < r.length) {
      r[col] = value;
    }
  }

  // GF(256) lookup tables for Reed-Solomon error correction
  const GF_EXP: number[] = new Array<number>(512).fill(0);
  const GF_LOG: number[] = new Array<number>(256).fill(0);

  function initGaloisField(): void {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x = x << 1;
      if (x >= 256) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255] ?? 0;
    }
  }
  initGaloisField();

  function gfExp(i: number): number {
    return GF_EXP[i] ?? 0;
  }

  function gfLog(i: number): number {
    return GF_LOG[i] ?? 0;
  }

  function generateQrModules(data: string): boolean[][] {
    const encoded = encodeData(data);
    const version = selectVersion(data.length + 3);
    const size = 17 + version * 4;

    const modules: boolean[][] = Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false)
    );
    const reserved: boolean[][] = Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false)
    );

    placeFinder(modules, reserved, 0, 0);
    placeFinder(modules, reserved, size - 7, 0);
    placeFinder(modules, reserved, 0, size - 7);

    if (version >= 2) {
      const alignPos = getAlignmentPositions(version);
      for (const row of alignPos) {
        for (const col of alignPos) {
          if (getCell(reserved, row, col)) continue;
          placeAlignment(modules, reserved, row, col);
        }
      }
    }

    for (let i = 8; i < size - 8; i++) {
      setCell(modules, 6, i, i % 2 === 0);
      setCell(reserved, 6, i, true);
      setCell(modules, i, 6, i % 2 === 0);
      setCell(reserved, i, 6, true);
    }

    setCell(modules, size - 8, 8, true);
    setCell(reserved, size - 8, 8, true);

    for (let i = 0; i < 9; i++) {
      setCell(reserved, 8, i, true);
      setCell(reserved, i, 8, true);
    }
    for (let i = 0; i < 8; i++) {
      setCell(reserved, 8, size - 1 - i, true);
      setCell(reserved, size - 1 - i, 8, true);
    }

    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          setCell(reserved, i, size - 11 + j, true);
          setCell(reserved, size - 11 + j, i, true);
        }
      }
    }

    placeData(modules, reserved, encoded, size);

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (!getCell(reserved, row, col) && (row + col) % 2 === 0) {
          setCell(modules, row, col, !getCell(modules, row, col));
        }
      }
    }

    placeFormatInfo(modules, size, 0);

    if (version >= 7) {
      placeVersionInfo(modules, size, version);
    }

    return modules;
  }

  function encodeData(data: string): number[] {
    const bits: number[] = [];

    pushBits(bits, 0b0100, 4);
    pushBits(bits, data.length, 8);

    for (let i = 0; i < data.length; i++) {
      pushBits(bits, data.charCodeAt(i), 8);
    }

    pushBits(bits, 0, 4);

    while (bits.length % 8 !== 0) {
      bits.push(0);
    }

    const version = selectVersion(data.length + 3);
    const capacity = getDataCapacity(version);
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (bits.length < capacity * 8) {
      pushBits(bits, padBytes[padIdx % 2] ?? 0xec, 8);
      padIdx++;
    }

    const dataBytes = bitsToBytes(bits);
    const ecBytes = generateEC(dataBytes, version);

    const result: number[] = [];
    for (const b of dataBytes) {
      pushBits(result, b, 8);
    }
    for (const b of ecBytes) {
      pushBits(result, b, 8);
    }

    return result;
  }

  function selectVersion(dataLen: number): number {
    const capacities = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
    for (let v = 1; v < capacities.length; v++) {
      if (dataLen <= (capacities[v] ?? 0)) return v;
    }
    return 10;
  }

  function getDataCapacity(version: number): number {
    const capacities = [0, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274];
    return capacities[version] ?? 19;
  }

  function getEcCodewords(version: number): number {
    const ecCounts = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
    return ecCounts[version] ?? 7;
  }

  function pushBits(arr: number[], value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) {
      arr.push((value >> i) & 1);
    }
  }

  function bitsToBytes(bits: number[]): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8 && i + j < bits.length; j++) {
        byte = (byte << 1) | (bits[i + j] ?? 0);
      }
      bytes.push(byte);
    }
    return bytes;
  }

  function generateEC(data: number[], version: number): number[] {
    const ecCount = getEcCodewords(version);
    const gen = getGeneratorPolynomial(ecCount);
    const message = [...data, ...new Array<number>(ecCount).fill(0)];

    for (let i = 0; i < data.length; i++) {
      const coef = message[i] ?? 0;
      if (coef === 0) continue;
      const logCoef = gfLog(coef);
      for (let j = 0; j < gen.length; j++) {
        const current = message[i + j] ?? 0;
        message[i + j] = current ^ gfExp((logCoef + (gen[j] ?? 0)) % 255);
      }
    }

    return message.slice(data.length);
  }

  function getGeneratorPolynomial(degree: number): number[] {
    let gen = [0];
    for (let i = 0; i < degree; i++) {
      const newGen = new Array<number>(gen.length + 1).fill(0);
      for (let j = 0; j < gen.length; j++) {
        const a = gfExp(newGen[j] ?? 0);
        const b = gfExp(((gen[j] ?? 0) + i) % 255);
        const xored = a ^ b;
        newGen[j] = xored === 0 ? 0 : gfLog(xored);
        newGen[j + 1] = gen[j] ?? 0;
      }
      gen = newGen;
    }
    return gen;
  }

  function getAlignmentPositions(version: number): number[] {
    if (version <= 1) return [];
    const positions: number[][] = [
      [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
      [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
    ];
    return positions[version] ?? [];
  }

  function placeFinder(modules: boolean[][], reserved: boolean[][], row: number, col: number): void {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr < 0 || mc < 0 || mr >= modules.length || mc >= modules.length) continue;
        const isOuter = r === -1 || r === 7 || c === -1 || c === 7;
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setCell(modules, mr, mc, !isOuter && (isBorder || isInner));
        setCell(reserved, mr, mc, true);
      }
    }
  }

  function placeAlignment(modules: boolean[][], reserved: boolean[][], row: number, col: number): void {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr < 0 || mc < 0 || mr >= modules.length || mc >= modules.length) continue;
        const isOuter = Math.abs(r) === 2 || Math.abs(c) === 2;
        const isCenter = r === 0 && c === 0;
        setCell(modules, mr, mc, isOuter || isCenter);
        setCell(reserved, mr, mc, true);
      }
    }
  }

  function placeData(modules: boolean[][], reserved: boolean[][], data: number[], size: number): void {
    let idx = 0;
    let upward = true;

    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col = 5;

      const rows = upward
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i);

      for (const row of rows) {
        for (let c = 0; c < 2; c++) {
          const actualCol = col - c;
          if (getCell(reserved, row, actualCol)) continue;
          if (idx < data.length) {
            setCell(modules, row, actualCol, (data[idx] ?? 0) === 1);
            idx++;
          }
        }
      }

      upward = !upward;
    }
  }

  function placeFormatInfo(modules: boolean[][], size: number, mask: number): void {
    const formatData = (0b01 << 3) | mask;
    const formatBits = calculateFormatBits(formatData);

    const positions1: [number, number][] = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    ];
    for (let i = 0; i < 15; i++) {
      const pos = positions1[i];
      if (pos) setCell(modules, pos[0], pos[1], ((formatBits >> (14 - i)) & 1) === 1);
    }

    const positions2: [number, number][] = [
      [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
      [size - 5, 8], [size - 6, 8], [size - 7, 8],
      [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
      [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
    ];
    for (let i = 0; i < 15; i++) {
      const pos = positions2[i];
      if (pos) setCell(modules, pos[0], pos[1], ((formatBits >> (14 - i)) & 1) === 1);
    }
  }

  function calculateFormatBits(data: number): number {
    let format = data << 10;
    const generator = 0b10100110111;
    for (let i = 14; i >= 10; i--) {
      if ((format >> i) & 1) {
        format ^= generator << (i - 10);
      }
    }
    format = (data << 10) | format;
    format ^= 0b101010000010010;
    return format;
  }

  function placeVersionInfo(modules: boolean[][], size: number, version: number): void {
    if (version < 7) return;
    const versionBits = calculateVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((versionBits >> i) & 1) === 1;
      const row = Math.floor(i / 3);
      const col = size - 11 + (i % 3);
      setCell(modules, row, col, bit);
      setCell(modules, col, row, bit);
    }
  }

  function calculateVersionBits(version: number): number {
    let v = version << 12;
    const generator = 0b1111100100101;
    for (let i = 17; i >= 12; i--) {
      if ((v >> i) & 1) {
        v ^= generator << (i - 12);
      }
    }
    return (version << 12) | v;
  }
</script>

{#if isOpen}
  <div
    class="relative z-50"
    role="dialog"
    aria-modal="true"
    aria-labelledby="distribution-title"
    data-testid="distribution-panel"
  >
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/[var(--backdrop-opacity)] backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      onclick={handleBackdropClick}
      onkeydown={(e) => e.key === 'Enter' && handleBackdropClick(e as unknown as MouseEvent)}
      role="button"
      tabindex="-1"
      aria-label="Close distribution panel"
    ></div>

    <div class="fixed inset-0 z-10 overflow-y-auto">
      <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div
          class="relative transform overflow-hidden rounded-lg bg-layer-modal border border-border text-left shadow-xl transition-all animate-in fade-in zoom-in-95 duration-200 sm:my-8 sm:w-full sm:max-w-lg"
          data-testid="distribution-panel-content"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-border">
            <div class="flex items-center gap-2.5">
              <h2 id="distribution-title" class="text-base font-semibold text-foreground">Share Questionnaire</h2>
              {#if isPublished}
                <span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                  <Globe class="w-3 h-3" />
                  Published
                </span>
              {:else}
                <span class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                  <Lock class="w-3 h-3" />
                  Draft
                </span>
              {/if}
            </div>
            <button
              type="button"
              onclick={handleClose}
              class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150"
              aria-label="Close"
              data-testid="distribution-close"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- Body -->
          <div class="px-5 py-4 space-y-5">
            <!-- Publish prompt if draft -->
            {#if !isPublished}
              <div class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5">
                <p class="text-sm text-foreground font-medium mb-1">Questionnaire not published</p>
                <p class="text-xs text-muted-foreground mb-3">
                  Publish to make it accessible via the share link. Respondents cannot access draft questionnaires.
                </p>
                <button
                  type="button"
                  class="inline-flex items-center rounded-md bg-gradient-to-r from-primary to-[hsl(280,80%,60%)] px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:shadow-[var(--shadow-glow)] hover:brightness-110 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  onclick={handlePublish}
                  disabled={designerStore.isPublishing || designerStore.isSaving || questionCount === 0}
                  data-testid="distribution-publish"
                >
                  {designerStore.isPublishing ? 'Publishing...' : 'Publish Now'}
                </button>
              </div>
            {/if}

            <!-- Share URL -->
            {#if shareCode}
              <div>
                <span class="block text-xs font-medium text-muted-foreground mb-1.5">Fillout URL</span>
                <div class="flex items-center gap-2">
                  <div class="flex-1 flex items-center rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-mono text-foreground select-all overflow-hidden">
                    <span class="truncate">{filloutUrl}</span>
                  </div>
                  <button
                    type="button"
                    onclick={() => copyToClipboard(filloutUrl, 'url')}
                    class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors duration-150"
                    data-testid="distribution-copy-url"
                    title="Copy URL"
                  >
                    {#if copiedField === 'url'}
                      <Check class="w-3.5 h-3.5 text-emerald-500" />
                      <span class="text-emerald-500">Copied</span>
                    {:else}
                      <Copy class="w-3.5 h-3.5" />
                      <span>Copy</span>
                    {/if}
                  </button>
                  <a
                    href={filloutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="shrink-0 inline-flex items-center justify-center rounded-md border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150"
                    title="Open in new tab"
                    data-testid="distribution-open-url"
                  >
                    <ExternalLink class="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <!-- QR Code toggle -->
              <div>
                <button
                  type="button"
                  onclick={() => (showQrCode = !showQrCode)}
                  class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors duration-150"
                  data-testid="distribution-qr-toggle"
                >
                  <QrCode class="w-3.5 h-3.5" />
                  {showQrCode ? 'Hide QR Code' : 'Show QR Code'}
                </button>

                {#if showQrCode}
                  <div class="mt-3 flex justify-center">
                    <div class="rounded-lg border border-border bg-white p-3" data-testid="distribution-qr-code">
                      <canvas bind:this={qrCanvas} class="block" style="image-rendering: pixelated; width: 160px; height: 160px;"></canvas>
                    </div>
                  </div>
                {/if}
              </div>

              <!-- Embed Code -->
              <div>
                <span class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Code class="w-3.5 h-3.5" />
                  Embed Code
                </span>
                <div class="relative">
                  <pre class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">{embedCode}</pre>
                  <button
                    type="button"
                    onclick={() => copyToClipboard(embedCode, 'embed')}
                    class="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-md border border-border bg-background/80 backdrop-blur-sm px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors duration-150"
                    data-testid="distribution-copy-embed"
                    title="Copy embed code"
                  >
                    {#if copiedField === 'embed'}
                      <Check class="w-3 h-3 text-emerald-500" />
                      <span class="text-emerald-500">Copied</span>
                    {:else}
                      <Copy class="w-3 h-3" />
                      <span>Copy</span>
                    {/if}
                  </button>
                </div>
              </div>
            {:else}
              <div class="rounded-lg border border-border bg-muted/20 p-4 text-center">
                <p class="text-sm text-muted-foreground">Save the questionnaire first to generate a share link.</p>
              </div>
            {/if}

            <!-- Summary -->
            <div class="rounded-lg border border-border bg-muted/10 p-3.5">
              <h3 class="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Summary</h3>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="text-muted-foreground">Questions</div>
                <div class="text-foreground font-medium">{questionCount}</div>
                <div class="text-muted-foreground">Pages</div>
                <div class="text-foreground font-medium">{pageCount}</div>
                <div class="text-muted-foreground">Access</div>
                <div class="text-foreground font-medium">{accessSummary.join(', ')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
