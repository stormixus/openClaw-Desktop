<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Editor } from "@tiptap/core";
  import { t } from "$lib/i18n";
  import StarterKit from "@tiptap/starter-kit";
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import {
    Bold,
    Italic,
    Heading1,
    Heading2,
    List,
    ListOrdered,
    Quote,
    Code2,
  } from "@lucide/svelte";

  interface Props {
    content?: string;
    editable?: boolean;
    onchange?: (content: string) => void;
  }

  const { content = "", editable = true, onchange }: Props = $props();

  let element: HTMLElement;
  let editor: Editor | null = $state.raw(null);
  let applyingExternal = false;
  let lastEmittedMd = "";
  let suppressInitialUpdate = true;

  const TEXT_NODE = typeof Node !== "undefined" ? Node.TEXT_NODE : 3;
  const ELEMENT_NODE = typeof Node !== "undefined" ? Node.ELEMENT_NODE : 1;

  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  async function markdownToHtml(markdown: string): Promise<string> {
    try {
      const parsed = await Promise.resolve(marked.parse(markdown ?? ""));
      return DOMPurify.sanitize(typeof parsed === "string" ? parsed : String(parsed ?? ""));
    } catch {
      return DOMPurify.sanitize(markdown ?? "");
    }
  }

  function escapeInline(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\*/g, "\\*")
      .replace(/_/g, "\\_")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  function collapseSpace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  function renderInline(node: Node): string {
    if (node.nodeType === TEXT_NODE) {
      return escapeInline(node.textContent ?? "");
    }
    if (node.nodeType !== ELEMENT_NODE) return "";

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const child = Array.from(element.childNodes).map(renderInline).join("");

    if (tag === "strong" || tag === "b") return `**${child}**`;
    if (tag === "em" || tag === "i") return `*${child}*`;
    if (tag === "code") return `\`${(element.textContent ?? "").replace(/`/g, "\\`")}\``;
    if (tag === "br") return "\n";
    if (tag === "a") {
      const href = element.getAttribute("href") ?? "";
      return `[${child}](${href})`;
    }
    return child;
  }

  function renderList(list: HTMLElement, depth: number): string {
    const ordered = list.tagName.toLowerCase() === "ol";
    const indent = "  ".repeat(depth);
    const items = Array.from(list.children).filter(
      (child): child is HTMLLIElement => child.tagName.toLowerCase() === "li",
    );

    return items
      .map((item, idx) => {
        const nested = Array.from(item.children).filter((child) => {
          const tag = child.tagName.toLowerCase();
          return tag === "ul" || tag === "ol";
        });

        const inlineClone = item.cloneNode(true) as HTMLElement;
        inlineClone.querySelectorAll("ul,ol").forEach((el) => el.remove());
        const text = collapseSpace(Array.from(inlineClone.childNodes).map(renderInline).join(""));
        const bullet = ordered ? `${idx + 1}.` : "-";
        const nestedText = nested
          .map((child) => renderList(child as HTMLElement, depth + 1))
          .filter(Boolean)
          .join("\n");
        if (!nestedText) {
          return `${indent}${bullet} ${text}`;
        }
        return `${indent}${bullet} ${text}\n${nestedText}`;
      })
      .join("\n");
  }

  function renderBlock(node: Node): string {
    if (node.nodeType === TEXT_NODE) {
      const text = collapseSpace(node.textContent ?? "");
      return text ? `${text}\n\n` : "";
    }
    if (node.nodeType !== ELEMENT_NODE) return "";

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (tag === "p") {
      const text = collapseSpace(Array.from(element.childNodes).map(renderInline).join(""));
      return text ? `${text}\n\n` : "\n";
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const text = collapseSpace(Array.from(element.childNodes).map(renderInline).join(""));
      return `${"#".repeat(level)} ${text}\n\n`;
    }

    if (tag === "pre") {
      const code = element.textContent ?? "";
      return `\`\`\`\n${code.replace(/\n+$/, "")}\n\`\`\`\n\n`;
    }

    if (tag === "blockquote") {
      const body = Array.from(element.childNodes).map(renderBlock).join("").trim();
      if (!body) return "";
      return (
        body
          .split("\n")
          .map((line) => (line.trim().length > 0 ? `> ${line}` : ">"))
          .join("\n") + "\n\n"
      );
    }

    if (tag === "ul" || tag === "ol") {
      const list = renderList(element, 0);
      return list ? `${list}\n\n` : "";
    }

    if (tag === "hr") {
      return "---\n\n";
    }

    const text = Array.from(element.childNodes).map(renderBlock).join("");
    return text;
  }

  function htmlToMarkdown(html: string): string {
    if (typeof window === "undefined") return html;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const markdown = Array.from(doc.body.childNodes).map(renderBlock).join("");
      return markdown
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
    } catch {
      return html ?? "";
    }
  }

  async function applyMarkdown(markdown: string): Promise<void> {
    if (!editor) return;
    const targetEditor = editor;
    const html = await markdownToHtml(markdown);
    const current = htmlToMarkdown(targetEditor.getHTML());
    if (current === (markdown ?? "").trim()) return;
    applyingExternal = true;
    try {
      targetEditor.commands.setContent(html);
    } finally {
      applyingExternal = false;
    }
  }

  onMount(async () => {
    suppressInitialUpdate = true;
    lastEmittedMd = content ?? "";
    try {
      const initialHtml = await markdownToHtml(content);
      editor = new Editor({
        element,
        extensions: [StarterKit],
        content: initialHtml,
        editable,
        onUpdate: ({ editor }) => {
          if (applyingExternal || suppressInitialUpdate) return;
          const md = htmlToMarkdown(editor.getHTML());
          lastEmittedMd = md;
          onchange?.(md);
        },
      });
    } finally {
      queueMicrotask(() => {
        suppressInitialUpdate = false;
      });
    }
  });

  onDestroy(() => {
    suppressInitialUpdate = true;
    editor?.destroy();
  });

  $effect(() => {
    if (!editor) return;
    const incoming = content ?? "";
    // Skip if the incoming content matches what we last emitted (prevents infinite loop)
    if (incoming === lastEmittedMd) return;
    if (!editor.isFocused) {
      lastEmittedMd = incoming;
      void applyMarkdown(incoming);
    }
  });

  $effect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  });

  function toggleBold() {
    editor?.chain().focus().toggleBold().run();
  }
  function toggleItalic() {
    editor?.chain().focus().toggleItalic().run();
  }
  function toggleH1() {
    editor?.chain().focus().toggleHeading({ level: 1 }).run();
  }
  function toggleH2() {
    editor?.chain().focus().toggleHeading({ level: 2 }).run();
  }
  function toggleBullet() {
    editor?.chain().focus().toggleBulletList().run();
  }
  function toggleOrdered() {
    editor?.chain().focus().toggleOrderedList().run();
  }
  function toggleQuote() {
    editor?.chain().focus().toggleBlockquote().run();
  }
  function toggleCode() {
    editor?.chain().focus().toggleCodeBlock().run();
  }
</script>

<div class="markdown-editor">
  {#if editable}
    <div class="toolbar">
      <button class="tool-btn" onclick={toggleBold} title={$t("forge.markdown.tool.bold")}>
        <Bold size={16} />
      </button>
      <button class="tool-btn" onclick={toggleItalic} title={$t("forge.markdown.tool.italic")}>
        <Italic size={16} />
      </button>
      <div class="divider"></div>
      <button class="tool-btn" onclick={toggleH1} title={$t("forge.markdown.tool.heading1")}>
        <Heading1 size={16} />
      </button>
      <button class="tool-btn" onclick={toggleH2} title={$t("forge.markdown.tool.heading2")}>
        <Heading2 size={16} />
      </button>
      <div class="divider"></div>
      <button class="tool-btn" onclick={toggleBullet} title={$t("forge.markdown.tool.bullet_list")}>
        <List size={16} />
      </button>
      <button class="tool-btn" onclick={toggleOrdered} title={$t("forge.markdown.tool.ordered_list")}>
        <ListOrdered size={16} />
      </button>
      <button class="tool-btn" onclick={toggleQuote} title={$t("forge.markdown.tool.quote")}>
        <Quote size={16} />
      </button>
      <button class="tool-btn" onclick={toggleCode} title={$t("forge.markdown.tool.code_block")}>
        <Code2 size={16} />
      </button>
    </div>
  {/if}

  <div class="editor-content" bind:this={element}></div>
</div>

<style>
  .markdown-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: color-mix(in srgb, var(--color-surface) 72%, #d7dce5);
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 1px solid var(--color-border);
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

  .markdown-editor :global(.ProseMirror) {
    outline: none;
    min-height: calc(100% - 16px);
    max-width: 880px;
    margin: 0 auto;
    background: #ffffff;
    color: #111827;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.15);
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 44px 56px;
    line-height: 1.65;
  }

  .markdown-editor :global(.ProseMirror p) {
    margin: 0 0 0.9em 0;
  }

  .markdown-editor :global(.ProseMirror h1),
  .markdown-editor :global(.ProseMirror h2),
  .markdown-editor :global(.ProseMirror h3) {
    margin: 1.2em 0 0.5em 0;
    line-height: 1.25;
    color: #111827;
  }

  .markdown-editor :global(.ProseMirror h1) {
    font-size: 28px;
    font-weight: 700;
  }

  .markdown-editor :global(.ProseMirror h2) {
    font-size: 22px;
    font-weight: 700;
  }

  .markdown-editor :global(.ProseMirror ul),
  .markdown-editor :global(.ProseMirror ol) {
    padding-left: 1.4rem;
    margin: 0.4em 0 1em 0;
  }

  .markdown-editor :global(.ProseMirror blockquote) {
    border-left: 3px solid #d1d5db;
    margin: 0.8em 0;
    padding-left: 0.9em;
    color: #4b5563;
  }

  .markdown-editor :global(.ProseMirror pre) {
    background: #0f172a;
    color: #f8fafc;
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
  }
</style>
