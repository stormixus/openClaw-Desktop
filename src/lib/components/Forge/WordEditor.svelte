<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Editor } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import { Table } from "@tiptap/extension-table";
  import TableRow from "@tiptap/extension-table-row";
  import TableCell from "@tiptap/extension-table-cell";
  import TableHeader from "@tiptap/extension-table-header";
  import { t } from "$lib/i18n";
  import { Bold, Italic, List, ListOrdered, Table as TableIcon } from "@lucide/svelte";

  interface Props {
    content?: string; // HTML or Markdown content
    editable?: boolean;
    onchange?: (content: string) => void;
  }

  const { content = "", editable = true, onchange }: Props = $props();

  let element: HTMLElement;
  let editor: Editor | null = $state(null);

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content,
      editable,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        onchange?.(html);
      },
    });
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });

  // Reactive updates from props
  $effect(() => {
    if (editor && content !== editor.getHTML()) {
      // careful to avoid cursor jumps / loops
      // simple check: if length diff is large, replace content
      // better: use Y.js for real collaboration, but for now simple sync
      if (Math.abs(content.length - editor.getHTML().length) > 10) {
         editor.commands.setContent(content);
      }
    }
  });

  $effect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  });

  function toggleBold() { editor?.chain().focus().toggleBold().run(); }
  function toggleItalic() { editor?.chain().focus().toggleItalic().run(); }
  function toggleBulletList() { editor?.chain().focus().toggleBulletList().run(); }
  function toggleOrderedList() { editor?.chain().focus().toggleOrderedList().run(); }
  function insertTable() { editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }

</script>

<div class="word-editor">
  {#if editable}
    <div class="toolbar">
      <button class="tool-btn" onclick={toggleBold} title="Bold">
        <Bold size={16} />
      </button>
      <button class="tool-btn" onclick={toggleItalic} title="Italic">
        <Italic size={16} />
      </button>
      <div class="divider"></div>
      <button class="tool-btn" onclick={toggleBulletList} title="Bullet List">
        <List size={16} />
      </button>
      <button class="tool-btn" onclick={toggleOrderedList} title="Ordered List">
        <ListOrdered size={16} />
      </button>
      <div class="divider"></div>
      <button class="tool-btn" onclick={insertTable} title="Insert Table">
        <TableIcon size={16} />
      </button>
    </div>
  {/if}

  <div class="editor-content" bind:this={element}></div>
</div>

<style>
  .word-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-surface);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-elevated);
  }

  .tool-btn {
    padding: 6px;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    color: var(--color-text);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tool-btn:hover {
    background: var(--color-surface-hover);
  }

  .divider {
    width: 1px;
    height: 16px;
    background: var(--color-border);
    margin: 0 4px;
  }

  .editor-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  /* Tiptap default styles */
  :global(.ProseMirror) {
    outline: none;
    min-height: 100%;
  }

  :global(.ProseMirror p) {
    margin-bottom: 1em;
    line-height: 1.6;
  }

  :global(.ProseMirror table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0;
    overflow: hidden;
    table-layout: fixed;
  }

  :global(.ProseMirror td), :global(.ProseMirror th) {
    border: 1px solid var(--color-border);
    padding: 8px;
    position: relative;
    vertical-align: top;
  }

  :global(.ProseMirror th) {
    background-color: var(--color-surface-hover);
    font-weight: bold;
  }
</style>
