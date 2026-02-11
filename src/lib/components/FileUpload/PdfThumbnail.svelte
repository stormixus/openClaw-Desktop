<script lang="ts">
  import { onMount } from "svelte";
  import * as pdfjs from "pdfjs-dist";
  import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

  // We need to set the worker source. In a Vite/SvelteKit context, this can be tricky.
  // Often it's best to point to a CDN or a local copy in static.
  // For now, we'll try standard import. If it fails, we might need a worker loader.

  // Set worker port to standard path (assuming copied to static or handled by vite plugin)
  // Or use the CDN for simplicity in this environment if local file not found
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  interface Props {
    file: File;
    size?: number;
  }

  const { file, size = 60 }: Props = $props();

  let canvas: HTMLCanvasElement;
  let thumbnailUrl = $state<string | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    if (!file || file.type !== "application/pdf") return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 1 });
      // Calculate scale to fit the requested size
      const scale = size / Math.min(viewport.width, viewport.height);
      const scaledViewport = page.getViewport({ scale });

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not get canvas context");

      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;

      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
        canvas, // Required by type definition in some versions
      }).promise;

      thumbnailUrl = canvas.toDataURL();
    } catch (e) {
      console.error("Error generating PDF thumbnail:", e);
      error = "Failed to load PDF";
    }
  });
</script>

<div class="pdf-thumbnail" style="width: {size}px; height: {size}px;">
  <canvas bind:this={canvas} style="display: none;"></canvas>
  {#if thumbnailUrl}
    <img src={thumbnailUrl} alt="PDF Thumbnail" />
  {:else if error}
    <div class="fallback error">PDF</div>
  {:else}
    <div class="fallback loading">...</div>
  {/if}
</div>

<style>
  .pdf-thumbnail {
    border-radius: 6px;
    overflow: hidden;
    background: var(--color-surface-elevated);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .fallback {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
</style>
