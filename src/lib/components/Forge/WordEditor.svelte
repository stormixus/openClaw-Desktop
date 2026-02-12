<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Editor, Extension, Mark, mergeAttributes } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Underline from "@tiptap/extension-underline";
  import { Table } from "@tiptap/extension-table";
  import TableRow from "@tiptap/extension-table-row";
  import TableCell from "@tiptap/extension-table-cell";
  import TableHeader from "@tiptap/extension-table-header";
  import {
    Bold,
    Italic,
    Heading1,
    Heading2,
    Heading3,
    Pilcrow,
    Quote,
    Strikethrough,
    Code2,
    Underline as UnderlineIcon,
    Superscript as SuperscriptIcon,
    Subscript as SubscriptIcon,
    List,
    ListOrdered,
    Table as TableIcon,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Type,
  } from "@lucide/svelte";

  const TextAlignExtension = Extension.create({
    name: "textAlign",
    addGlobalAttributes() {
      return [
        {
          types: ["heading", "paragraph"],
          attributes: {
            textAlign: {
              default: "left",
              parseHTML: (element) => element.style.textAlign || "left",
              renderHTML: (attrs) => {
                if (!attrs.textAlign || attrs.textAlign === "left") return {};
                return { style: `text-align:${attrs.textAlign}` };
              },
            },
          },
        },
      ];
    },
  });

  const SuperscriptMark = Mark.create({
    name: "superscript",
    excludes: "subscript",
    parseHTML() {
      return [{ tag: "sup" }];
    },
    renderHTML() {
      return ["sup", 0];
    },
  });

  const SubscriptMark = Mark.create({
    name: "subscript",
    excludes: "superscript",
    parseHTML() {
      return [{ tag: "sub" }];
    },
    renderHTML() {
      return ["sub", 0];
    },
  });

  const FontSizeMark = Mark.create({
    name: "fontSize",
    addAttributes() {
      return {
        size: {
          default: null,
          renderHTML: (attrs) => {
            if (!attrs.size) return {};
            return { style: `font-size:${attrs.size}` };
          },
        },
      };
    },
    parseHTML() {
      return [{
        style: "font-size",
        getAttrs: (value: string) => {
          if (!value || value === "inherit" || value === "initial") return false;
          return { size: value };
        },
      }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["span", mergeAttributes(HTMLAttributes), 0];
    },
  });

  const TextColorMark = Mark.create({
    name: "textColor",
    addAttributes() {
      return {
        color: {
          default: null,
          renderHTML: (attrs) => {
            if (!attrs.color) return {};
            return { style: `color:${attrs.color}` };
          },
        },
      };
    },
    parseHTML() {
      return [{
        style: "color",
        getAttrs: (value: string) => {
          if (!value || value === "inherit" || value === "initial") return false;
          return { color: value };
        },
      }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["span", mergeAttributes(HTMLAttributes), 0];
    },
  });

  const TextHighlightMark = Mark.create({
    name: "textHighlight",
    addAttributes() {
      return {
        color: {
          default: null,
          parseHTML: (element) => element.style.backgroundColor || null,
          renderHTML: (attrs) => {
            if (!attrs.color) return {};
            return { style: `background-color:${attrs.color}` };
          },
        },
      };
    },
    parseHTML() {
      return [
        { tag: "mark" },
        {
          style: "background-color",
          getAttrs: (value: string) => {
            if (!value || value === "inherit" || value === "initial" || value === "transparent") return false;
            return { color: value };
          },
        },
      ];
    },
    renderHTML({ HTMLAttributes }) {
      return ["mark", mergeAttributes(HTMLAttributes), 0];
    },
  });

  const FontFamilyMark = Mark.create({
    name: "fontFamily",
    addAttributes() {
      return {
        family: {
          default: null,
          renderHTML: (attrs) => {
            if (!attrs.family) return {};
            return { style: `font-family:${attrs.family}` };
          },
        },
      };
    },
    parseHTML() {
      return [{
        style: "font-family",
        getAttrs: (value: string) => {
          if (!value || value === "inherit" || value === "initial") return false;
          return { family: value };
        },
      }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["span", mergeAttributes(HTMLAttributes), 0];
    },
  });

  const FONT_FAMILY_OPTIONS = [
    { label: "기본", value: "" },
    { label: "맑은 고딕", value: "'Malgun Gothic','맑은 고딕',sans-serif" },
    { label: "나눔고딕", value: "'Nanum Gothic','나눔고딕',sans-serif" },
    { label: "바탕", value: "Batang,'바탕',serif" },
    { label: "돋움", value: "Dotum,'돋움',sans-serif" },
    { label: "굴림", value: "Gulim,'굴림',sans-serif" },
    { label: "Arial", value: "Arial,Helvetica,sans-serif" },
    { label: "Times New Roman", value: "'Times New Roman',Times,serif" },
    { label: "Georgia", value: "Georgia,serif" },
    { label: "Courier New", value: "'Courier New',Courier,monospace" },
  ];
  const FONT_SIZE_OPTIONS = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40];
  const DEFAULT_TEXT_COLOR = "#111827";
  const DEFAULT_HIGHLIGHT_COLOR = "#fff59d";

  interface Props {
    content?: string; // HTML or Markdown content
    editable?: boolean;
    onchange?: (content: string) => void;
  }

  const { content = "", editable = true, onchange }: Props = $props();

  let element: HTMLElement;
  let editor: Editor | null = $state(null);
  let applyingExternalContent = false;
  let lastExternalContent: string | null = null;
  let skipInitialUpdate = true;
  let currentAlign = $state<"left" | "center" | "right" | "justify">("left");
  let currentFontFamily = $state("");
  let currentFontSize = $state("14");
  let activeBold = $state(false);
  let activeItalic = $state(false);
  let activeUnderline = $state(false);
  let activeStrike = $state(false);
  let activeCode = $state(false);
  let activeBlockquote = $state(false);
  let activeH1 = $state(false);
  let activeH2 = $state(false);
  let activeH3 = $state(false);
  let activeParagraph = $state(true);
  let activeSuperscript = $state(false);
  let activeSubscript = $state(false);
  let activeTextColor = $state(false);
  let activeHighlight = $state(false);
  let currentTextColor = $state(DEFAULT_TEXT_COLOR);
  let currentHighlightColor = $state(DEFAULT_HIGHLIGHT_COLOR);

  function normalizeFontSize(raw: string | null | undefined): string {
    if (!raw) return "14";
    const num = Number.parseFloat(raw);
    if (!Number.isFinite(num)) return "14";
    if (raw.endsWith("pt")) {
      // 1pt = 1.333px (96dpi 기준)
      return `${Math.max(8, Math.round(num * (96 / 72)))}`;
    }
    return `${Math.max(8, Math.round(num))}`;
  }

  function normalizeHexColor(raw: string | null | undefined, fallback: string): string {
    if (!raw) return fallback;
    const value = raw.trim().toLowerCase();

    if (/^#[0-9a-f]{6}$/.test(value)) {
      return value;
    }
    if (/^#[0-9a-f]{3}$/.test(value)) {
      const r = value[1];
      const g = value[2];
      const b = value[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }

    const rgbMatch = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
    if (rgbMatch) {
      const r = Math.max(0, Math.min(255, Number.parseInt(rgbMatch[1], 10)));
      const g = Math.max(0, Math.min(255, Number.parseInt(rgbMatch[2], 10)));
      const b = Math.max(0, Math.min(255, Number.parseInt(rgbMatch[3], 10)));
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }

    return fallback;
  }

  function syncToolbarState(): void {
    if (!editor) return;
    const paraAlign = (editor.getAttributes("paragraph") as { textAlign?: string }).textAlign;
    const headingAlign = (editor.getAttributes("heading") as { textAlign?: string }).textAlign;
    const align = (headingAlign || paraAlign || "left").toLowerCase();
    if (align === "center" || align === "right" || align === "justify") {
      currentAlign = align;
    } else {
      currentAlign = "left";
    }

    const fontFamily = (editor.getAttributes("fontFamily") as { family?: string }).family;
    currentFontFamily = fontFamily || "";

    const fontSize = (editor.getAttributes("fontSize") as { size?: string }).size;
    currentFontSize = normalizeFontSize(fontSize);

    const textColor = (editor.getAttributes("textColor") as { color?: string }).color;
    currentTextColor = normalizeHexColor(textColor, DEFAULT_TEXT_COLOR);
    activeTextColor = Boolean(textColor);

    const highlightColor = (editor.getAttributes("textHighlight") as { color?: string }).color;
    currentHighlightColor = normalizeHexColor(highlightColor, DEFAULT_HIGHLIGHT_COLOR);
    activeHighlight = Boolean(highlightColor);

    activeBold = editor.isActive("bold");
    activeItalic = editor.isActive("italic");
    activeUnderline = editor.isActive("underline");
    activeStrike = editor.isActive("strike");
    activeCode = editor.isActive("code");
    activeBlockquote = editor.isActive("blockquote");
    activeH1 = editor.isActive("heading", { level: 1 });
    activeH2 = editor.isActive("heading", { level: 2 });
    activeH3 = editor.isActive("heading", { level: 3 });
    activeParagraph = editor.isActive("paragraph");
    activeSuperscript = editor.isActive("superscript");
    activeSubscript = editor.isActive("subscript");
  }

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        Underline,
        TextAlignExtension,
        FontSizeMark,
        TextColorMark,
        TextHighlightMark,
        FontFamilyMark,
        SuperscriptMark,
        SubscriptMark,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content,
      editable,
      onSelectionUpdate: () => {
        syncToolbarState();
      },
      onTransaction: () => {
        syncToolbarState();
      },
      onUpdate: ({ editor }) => {
        if (skipInitialUpdate) {
          skipInitialUpdate = false;
          return;
        }
        if (applyingExternalContent) return;
        const html = editor.getHTML();
        onchange?.(html);
      },
    });

    lastExternalContent = content ?? "";
    syncToolbarState();
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });

  // Reactive updates from props
  $effect(() => {
    if (!editor) return;
    const next = content ?? "";
    if (next === lastExternalContent) return;
    lastExternalContent = next;

    if (!editable) {
      applyingExternalContent = true;
      editor.commands.setContent(next);
      applyingExternalContent = false;
      return;
    }

    // For editable mode, only sync external changes when editor isn't actively focused.
    if (!editor.isFocused) {
      applyingExternalContent = true;
      editor.commands.setContent(next);
      applyingExternalContent = false;
    }
  });

  $effect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  });

  function applyAlignment(value: "left" | "center" | "right" | "justify"): void {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .updateAttributes("paragraph", { textAlign: value })
      .updateAttributes("heading", { textAlign: value })
      .run();
    currentAlign = value;
  }

  function applyFontFamily(event: Event): void {
    if (!editor) return;
    const target = event.currentTarget as HTMLSelectElement;
    const family = target.value;
    if (!family) {
      editor.chain().focus().unsetMark("fontFamily").run();
      currentFontFamily = "";
    } else {
      editor.chain().focus().setMark("fontFamily", { family }).run();
      currentFontFamily = family;
    }
  }

  function applyFontSize(event: Event): void {
    if (!editor) return;
    const target = event.currentTarget as HTMLSelectElement;
    const size = Number.parseInt(target.value, 10);
    const normalized = Number.isFinite(size) && size > 0 ? size : 14;
    editor
      .chain()
      .focus()
      .setMark("fontSize", { size: `${normalized}px` })
      .run();
    currentFontSize = `${normalized}`;
  }

  function applyTextColor(event: Event): void {
    if (!editor) return;
    const target = event.currentTarget as HTMLInputElement;
    const color = normalizeHexColor(target.value, DEFAULT_TEXT_COLOR);
    editor.chain().focus().setMark("textColor", { color }).run();
    currentTextColor = color;
    activeTextColor = true;
  }

  function clearTextColor(): void {
    if (!editor) return;
    editor.chain().focus().unsetMark("textColor").run();
    activeTextColor = false;
    currentTextColor = DEFAULT_TEXT_COLOR;
  }

  function applyHighlightColor(event: Event): void {
    if (!editor) return;
    const target = event.currentTarget as HTMLInputElement;
    const color = normalizeHexColor(target.value, DEFAULT_HIGHLIGHT_COLOR);
    editor.chain().focus().setMark("textHighlight", { color }).run();
    currentHighlightColor = color;
    activeHighlight = true;
  }

  function clearHighlight(): void {
    if (!editor) return;
    editor.chain().focus().unsetMark("textHighlight").run();
    activeHighlight = false;
    currentHighlightColor = DEFAULT_HIGHLIGHT_COLOR;
  }

  function toggleBold() { editor?.chain().focus().toggleBold().run(); }
  function toggleItalic() { editor?.chain().focus().toggleItalic().run(); }
  function toggleUnderline() { editor?.chain().focus().toggleUnderline().run(); }
  function toggleStrike() { editor?.chain().focus().toggleStrike().run(); }
  function toggleInlineCode() { editor?.chain().focus().toggleCode().run(); }
  function toggleBlockQuote() { editor?.chain().focus().toggleBlockquote().run(); }
  function setParagraph() { editor?.chain().focus().setParagraph().run(); }
  function toggleHeading(level: 1 | 2 | 3) { editor?.chain().focus().toggleHeading({ level }).run(); }
  function toggleSuperscript(): void {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (editor.isActive("superscript")) {
      chain.unsetMark("superscript").run();
    } else {
      chain.unsetMark("subscript").setMark("superscript").run();
    }
    syncToolbarState();
  }
  function toggleSubscript(): void {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (editor.isActive("subscript")) {
      chain.unsetMark("subscript").run();
    } else {
      chain.unsetMark("superscript").setMark("subscript").run();
    }
    syncToolbarState();
  }
  function toggleBulletList() { editor?.chain().focus().toggleBulletList().run(); }
  function toggleOrderedList() { editor?.chain().focus().toggleOrderedList().run(); }
  function insertTable() { editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }

</script>

<div class="word-editor">
  {#if editable}
    <div class="toolbar">
      <button class="tool-btn" class:active={activeParagraph} onclick={setParagraph} title="Paragraph">
        <Pilcrow size={16} />
      </button>
      <button class="tool-btn" class:active={activeH1} onclick={() => toggleHeading(1)} title="Heading 1">
        <Heading1 size={16} />
      </button>
      <button class="tool-btn" class:active={activeH2} onclick={() => toggleHeading(2)} title="Heading 2">
        <Heading2 size={16} />
      </button>
      <button class="tool-btn" class:active={activeH3} onclick={() => toggleHeading(3)} title="Heading 3">
        <Heading3 size={16} />
      </button>
      <div class="divider"></div>
      <button class="tool-btn" class:active={activeBold} onclick={toggleBold} title="Bold">
        <Bold size={16} />
      </button>
      <button class="tool-btn" class:active={activeItalic} onclick={toggleItalic} title="Italic">
        <Italic size={16} />
      </button>
      <button class="tool-btn" class:active={activeUnderline} onclick={toggleUnderline} title="Underline">
        <UnderlineIcon size={16} />
      </button>
      <button class="tool-btn" class:active={activeStrike} onclick={toggleStrike} title="Strike">
        <Strikethrough size={16} />
      </button>
      <button class="tool-btn" class:active={activeCode} onclick={toggleInlineCode} title="Inline Code">
        <Code2 size={16} />
      </button>
      <button class="tool-btn" class:active={activeSuperscript} onclick={toggleSuperscript} title="Superscript">
        <SuperscriptIcon size={16} />
      </button>
      <button class="tool-btn" class:active={activeSubscript} onclick={toggleSubscript} title="Subscript">
        <SubscriptIcon size={16} />
      </button>
      <button class="tool-btn" class:active={activeBlockquote} onclick={toggleBlockQuote} title="Blockquote">
        <Quote size={16} />
      </button>
      <div class="divider"></div>
      <div class="font-family-control">
        <select value={currentFontFamily} onchange={applyFontFamily} aria-label="Font family">
          {#each FONT_FAMILY_OPTIONS as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
      <div class="font-size-control">
        <Type size={14} />
        <select value={currentFontSize} onchange={applyFontSize} aria-label="Font size">
          {#each FONT_SIZE_OPTIONS as size}
            <option value={`${size}`}>{size}</option>
          {/each}
        </select>
      </div>
      <div class="color-control" class:active={activeTextColor}>
        <span class="color-label">A</span>
        <input type="color" value={currentTextColor} onchange={applyTextColor} aria-label="Text color" />
        <button class="color-reset" type="button" onclick={clearTextColor} title="Clear text color">
          x
        </button>
      </div>
      <div class="color-control" class:active={activeHighlight}>
        <span class="color-label">HL</span>
        <input type="color" value={currentHighlightColor} onchange={applyHighlightColor} aria-label="Highlight color" />
        <button class="color-reset" type="button" onclick={clearHighlight} title="Clear highlight">
          x
        </button>
      </div>
      <div class="divider"></div>
      <button
        class="tool-btn"
        class:active={currentAlign === "left"}
        onclick={() => applyAlignment("left")}
        title="Align Left"
      >
        <AlignLeft size={16} />
      </button>
      <button
        class="tool-btn"
        class:active={currentAlign === "center"}
        onclick={() => applyAlignment("center")}
        title="Align Center"
      >
        <AlignCenter size={16} />
      </button>
      <button
        class="tool-btn"
        class:active={currentAlign === "right"}
        onclick={() => applyAlignment("right")}
        title="Align Right"
      >
        <AlignRight size={16} />
      </button>
      <button
        class="tool-btn"
        class:active={currentAlign === "justify"}
        onclick={() => applyAlignment("justify")}
        title="Justify"
      >
        <AlignJustify size={16} />
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
    background: color-mix(in srgb, var(--color-surface) 72%, #d7dce5);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
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

  .tool-btn.active {
    background: color-mix(in srgb, var(--color-primary) 16%, transparent);
    color: var(--color-primary);
  }

  .divider {
    width: 1px;
    height: 16px;
    background: var(--color-border);
    margin: 0 4px;
  }

  .font-family-control {
    display: inline-flex;
    align-items: center;
    padding: 0 4px;
  }

  .font-family-control select {
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 12px;
    line-height: 1;
    padding: 4px 6px;
    min-width: 100px;
    max-width: 140px;
  }

  .font-size-control {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px;
    color: var(--color-text-muted);
  }

  .font-size-control select {
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 12px;
    line-height: 1;
    padding: 4px 6px;
    min-width: 60px;
  }

  .color-control {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--color-text-muted);
  }

  .color-control.active {
    border-color: color-mix(in srgb, var(--color-primary) 50%, var(--color-border));
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  }

  .color-label {
    font-size: 11px;
    font-weight: 700;
    min-width: 16px;
    text-align: center;
  }

  .color-control input[type="color"] {
    width: 26px;
    height: 22px;
    border: 1px solid var(--color-border);
    border-radius: 5px;
    padding: 0;
    background: var(--color-surface);
    cursor: pointer;
  }

  .color-reset {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-muted);
    border-radius: 5px;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .color-reset:hover {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  .editor-content {
    flex: 1;
    overflow-y: auto;
    padding: 32px 24px;
  }

  /* Word-like page canvas */
  .word-editor :global(.ProseMirror) {
    outline: none;
    min-height: calc(100% - 24px);
    max-width: 860px;
    margin: 0 auto;
    background: #ffffff;
    color: #111827;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.15);
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 56px 64px;
    line-height: 1.65;
  }

  .word-editor :global(.ProseMirror p) {
    margin: 0 0 0.95em 0;
  }

  .word-editor :global(.ProseMirror .hwp-root p) {
    margin: 0 0 0.42em 0;
    line-height: 1.45;
  }

  .word-editor :global(.ProseMirror h1),
  .word-editor :global(.ProseMirror h2),
  .word-editor :global(.ProseMirror h3) {
    margin: 1.2em 0 0.5em 0;
    line-height: 1.25;
    color: #111827;
  }

  .word-editor :global(.ProseMirror h1) {
    font-size: 28px;
    font-weight: 700;
  }

  .word-editor :global(.ProseMirror h2) {
    font-size: 22px;
    font-weight: 700;
  }

  .word-editor :global(.ProseMirror h3) {
    font-size: 18px;
    font-weight: 700;
  }

  .word-editor :global(.ProseMirror ul),
  .word-editor :global(.ProseMirror ol) {
    padding-left: 1.4rem;
    margin: 0.4em 0 1em 0;
  }

  .word-editor :global(.ProseMirror table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.75em 0 1em 0;
    overflow: hidden;
    table-layout: fixed;
  }

  .word-editor :global(.ProseMirror td), .word-editor :global(.ProseMirror th) {
    border: 1px solid #d1d5db;
    padding: 8px 10px;
    position: relative;
    vertical-align: top;
    color: #111827;
    background: #ffffff;
  }

  .word-editor :global(.ProseMirror th) {
    background-color: #f3f4f6;
    font-weight: bold;
  }

  .word-editor :global(.ProseMirror sup) {
    vertical-align: super;
    font-size: 0.75em;
  }

  .word-editor :global(.ProseMirror sub) {
    vertical-align: sub;
    font-size: 0.75em;
  }
</style>
