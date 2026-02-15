<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getSystemFonts, loadSystemFonts } from "$lib/stores/fonts.svelte";
  import { t } from "$lib/i18n";
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

  const FONT_FAMILY_OPTIONS = $derived([
    { label: $t("forge.word.font_default"), value: "" },
    ...getSystemFonts().map((f) => ({
      label: f,
      value: f.includes(" ") ? `'${f}'` : f,
    })),
  ]);
  const FONT_SIZE_OPTIONS = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40];
  const DEFAULT_TEXT_COLOR = "#111827";
  const DEFAULT_HIGHLIGHT_COLOR = "#fff59d";

  interface Props {
    content?: string; // HTML or Markdown content
    editable?: boolean;
    onchange?: (content: string) => void;
    onInlinePrompt?: (selectedText: string, instruction: string) => Promise<string>;
  }

  const { content = "", editable = true, onchange, onInlinePrompt }: Props = $props();

  let element: HTMLElement;
  let editor: Editor | null = $state.raw(null);
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
  let inlinePromptOpen = $state(false);
  let inlinePromptX = $state(0);
  let inlinePromptY = $state(0);
  let inlinePromptInstruction = $state("");
  let inlinePromptError = $state<string | null>(null);
  let inlinePromptBusy = $state(false);
  let inlineSelectionFrom = $state(0);
  let inlineSelectionTo = $state(0);
  let inlineSelectedText = $state("");
  let inlinePromptEl = $state<HTMLDivElement | null>(null);
  let inlinePromptInputEl = $state<HTMLTextAreaElement | null>(null);

  const INLINE_PROMPT_WIDTH = 360;
  const INLINE_PROMPT_MIN_HEIGHT = 180;

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

  function closeInlinePrompt(): void {
    inlinePromptOpen = false;
    inlinePromptInstruction = "";
    inlinePromptError = null;
    inlinePromptBusy = false;
  }

  function positionInlinePrompt(clientX: number, clientY: number): void {
    if (typeof window === "undefined") {
      inlinePromptX = clientX;
      inlinePromptY = clientY;
      return;
    }
    const margin = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const preferredX = clientX + 10;
    const preferredY = clientY + 10;
    const openAbove = preferredY + INLINE_PROMPT_MIN_HEIGHT > viewportH - margin;

    inlinePromptX = Math.max(
      margin,
      Math.min(preferredX, viewportW - INLINE_PROMPT_WIDTH - margin),
    );
    inlinePromptY = Math.max(
      margin,
      Math.min(
        openAbove ? clientY - INLINE_PROMPT_MIN_HEIGHT - 10 : preferredY,
        viewportH - INLINE_PROMPT_MIN_HEIGHT - margin,
      ),
    );
  }

  function selectedPreviewText(): string {
    const trimmed = inlineSelectedText.trim();
    if (trimmed.length <= 120) return trimmed;
    return `${trimmed.slice(0, 120)}...`;
  }

  function handleEditorContextMenu(event: MouseEvent): void {
    if (!editable || !onInlinePrompt || !editor) return;
    const selection = editor.state.selection;
    if (!selection || selection.empty || selection.to <= selection.from) return;
    const selected = editor.state.doc.textBetween(selection.from, selection.to, "\n", "\n").trim();
    if (!selected) return;

    event.preventDefault();
    inlineSelectionFrom = selection.from;
    inlineSelectionTo = selection.to;
    inlineSelectedText = selected;
    inlinePromptInstruction = "";
    inlinePromptError = null;
    inlinePromptBusy = false;
    positionInlinePrompt(event.clientX, event.clientY);
    inlinePromptOpen = true;
    requestAnimationFrame(() => {
      inlinePromptInputEl?.focus();
    });
  }

  async function submitInlinePrompt(): Promise<void> {
    if (!editor || !onInlinePrompt || inlinePromptBusy) return;
    const instruction = inlinePromptInstruction.trim();
    if (!instruction) {
      inlinePromptError = $t("forge.inline.error.no_instruction");
      return;
    }

    inlinePromptBusy = true;
    inlinePromptError = null;
    try {
      const rewritten = (await onInlinePrompt(inlineSelectedText, instruction)).trim();
      if (!rewritten) {
        throw new Error($t("forge.inline.error.empty_response"));
      }

      const from = inlineSelectionFrom;
      const to = inlineSelectionTo;
      editor
        .chain()
        .focus()
        .command(({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.insertText(rewritten, from, to));
          }
          return true;
        })
        .run();
      closeInlinePrompt();
    } catch (err: unknown) {
      inlinePromptError = err instanceof Error ? err.message : $t("forge.inline.error.request_failed");
    } finally {
      inlinePromptBusy = false;
    }
  }

  function handleInlinePromptKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitInlinePrompt();
    }
  }

  function handleWindowPointerDown(event: MouseEvent): void {
    if (!inlinePromptOpen) return;
    const target = event.target as Node | null;
    if (target && inlinePromptEl?.contains(target)) return;
    closeInlinePrompt();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (!inlinePromptOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeInlinePrompt();
    }
  }

  onMount(() => {
    loadSystemFonts();
    window.addEventListener("mousedown", handleWindowPointerDown, true);
    window.addEventListener("keydown", handleWindowKeydown);
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
    window.removeEventListener("mousedown", handleWindowPointerDown, true);
    window.removeEventListener("keydown", handleWindowKeydown);
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
      <button class="tool-btn" class:active={activeParagraph} onclick={setParagraph} title={$t("forge.word.tool.paragraph")}>
        <Pilcrow size={16} />
      </button>
      <button class="tool-btn" class:active={activeH1} onclick={() => toggleHeading(1)} title={$t("forge.word.tool.heading1")}>
        <Heading1 size={16} />
      </button>
      <button class="tool-btn" class:active={activeH2} onclick={() => toggleHeading(2)} title={$t("forge.word.tool.heading2")}>
        <Heading2 size={16} />
      </button>
      <button class="tool-btn" class:active={activeH3} onclick={() => toggleHeading(3)} title={$t("forge.word.tool.heading3")}>
        <Heading3 size={16} />
      </button>
      <div class="divider"></div>
      <button class="tool-btn" class:active={activeBold} onclick={toggleBold} title={$t("forge.word.tool.bold")}>
        <Bold size={16} />
      </button>
      <button class="tool-btn" class:active={activeItalic} onclick={toggleItalic} title={$t("forge.word.tool.italic")}>
        <Italic size={16} />
      </button>
      <button class="tool-btn" class:active={activeUnderline} onclick={toggleUnderline} title={$t("forge.word.tool.underline")}>
        <UnderlineIcon size={16} />
      </button>
      <button class="tool-btn" class:active={activeStrike} onclick={toggleStrike} title={$t("forge.word.tool.strike")}>
        <Strikethrough size={16} />
      </button>
      <button class="tool-btn" class:active={activeCode} onclick={toggleInlineCode} title={$t("forge.word.tool.inline_code")}>
        <Code2 size={16} />
      </button>
      <button class="tool-btn" class:active={activeSuperscript} onclick={toggleSuperscript} title={$t("forge.word.tool.superscript")}>
        <SuperscriptIcon size={16} />
      </button>
      <button class="tool-btn" class:active={activeSubscript} onclick={toggleSubscript} title={$t("forge.word.tool.subscript")}>
        <SubscriptIcon size={16} />
      </button>
      <button class="tool-btn" class:active={activeBlockquote} onclick={toggleBlockQuote} title={$t("forge.word.tool.blockquote")}>
        <Quote size={16} />
      </button>
      <div class="divider"></div>
      <div class="font-family-control">
        <select value={currentFontFamily} onchange={applyFontFamily} aria-label={$t("forge.word.aria.font_family")}>
          {#each FONT_FAMILY_OPTIONS as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
      <div class="font-size-control">
        <Type size={14} />
        <select value={currentFontSize} onchange={applyFontSize} aria-label={$t("forge.word.aria.font_size")}>
          {#each FONT_SIZE_OPTIONS as size}
            <option value={`${size}`}>{size}</option>
          {/each}
        </select>
      </div>
      <div class="color-control" class:active={activeTextColor}>
        <span class="color-label">A</span>
        <input type="color" value={currentTextColor} onchange={applyTextColor} aria-label={$t("forge.word.aria.text_color")} />
        <button class="color-reset" type="button" onclick={clearTextColor} title={$t("forge.word.tool.clear_text_color")}>
          x
        </button>
      </div>
      <div class="color-control" class:active={activeHighlight}>
        <span class="color-label">HL</span>
        <input type="color" value={currentHighlightColor} onchange={applyHighlightColor} aria-label={$t("forge.word.aria.highlight_color")} />
        <button class="color-reset" type="button" onclick={clearHighlight} title={$t("forge.word.tool.clear_highlight")}>
          x
        </button>
      </div>
      <div class="divider"></div>
      <button
        class="tool-btn"
        class:active={currentAlign === "left"}
        onclick={() => applyAlignment("left")}
        title={$t("forge.word.tool.align_left")}
      >
        <AlignLeft size={16} />
      </button>
      <button
        class="tool-btn"
        class:active={currentAlign === "center"}
        onclick={() => applyAlignment("center")}
        title={$t("forge.word.tool.align_center")}
      >
        <AlignCenter size={16} />
      </button>
      <button
        class="tool-btn"
        class:active={currentAlign === "right"}
        onclick={() => applyAlignment("right")}
        title={$t("forge.word.tool.align_right")}
      >
        <AlignRight size={16} />
      </button>
      <button
        class="tool-btn"
        class:active={currentAlign === "justify"}
        onclick={() => applyAlignment("justify")}
        title={$t("forge.word.tool.align_justify")}
      >
        <AlignJustify size={16} />
      </button>
      <div class="divider"></div>
      <button class="tool-btn" onclick={toggleBulletList} title={$t("forge.word.tool.bullet_list")}>
        <List size={16} />
      </button>
      <button class="tool-btn" onclick={toggleOrderedList} title={$t("forge.word.tool.ordered_list")}>
        <ListOrdered size={16} />
      </button>
      <div class="divider"></div>
      <button class="tool-btn" onclick={insertTable} title={$t("forge.word.tool.insert_table")}>
        <TableIcon size={16} />
      </button>
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="editor-content" bind:this={element} oncontextmenu={handleEditorContextMenu}></div>

  {#if inlinePromptOpen}
    <div
      class="inline-agent-prompt"
      bind:this={inlinePromptEl}
      style={`left:${inlinePromptX}px; top:${inlinePromptY}px;`}
    >
      <div class="inline-agent-head">
        <strong>{$t("forge.inline.header")}</strong>
        <span>{selectedPreviewText()}</span>
      </div>
      <textarea
        class="inline-agent-input"
        bind:this={inlinePromptInputEl}
        bind:value={inlinePromptInstruction}
        placeholder={$t("forge.inline.placeholder")}
        onkeydown={handleInlinePromptKeydown}
      ></textarea>
      {#if inlinePromptError}
        <div class="inline-agent-error">{inlinePromptError}</div>
      {/if}
      <div class="inline-agent-actions">
        <button type="button" class="inline-btn secondary" onclick={closeInlinePrompt} disabled={inlinePromptBusy}>
          {$t("forge.inline.cancel")}
        </button>
        <button type="button" class="inline-btn primary" onclick={submitInlinePrompt} disabled={inlinePromptBusy}>
          {inlinePromptBusy ? $t("forge.inline.processing") : $t("forge.inline.apply")}
        </button>
      </div>
    </div>
  {/if}
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

  .inline-agent-prompt {
    position: fixed;
    width: min(360px, calc(100vw - 24px));
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-surface-elevated) 94%, #0f172a);
    box-shadow: 0 18px 34px rgba(2, 6, 23, 0.28);
    z-index: 1600;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .inline-agent-head {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .inline-agent-head strong {
    font-size: 12px;
    color: var(--color-text);
  }

  .inline-agent-head span {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inline-agent-input {
    width: 100%;
    min-height: 72px;
    max-height: 140px;
    resize: vertical;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 12px;
    line-height: 1.45;
    padding: 8px 10px;
    outline: none;
  }

  .inline-agent-input:focus {
    border-color: color-mix(in srgb, var(--color-primary) 65%, var(--color-border));
  }

  .inline-agent-error {
    font-size: 11px;
    color: #ef4444;
  }

  .inline-agent-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .inline-btn {
    border-radius: 7px;
    border: 1px solid transparent;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .inline-btn.secondary {
    border-color: var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .inline-btn.secondary:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  .inline-btn.primary {
    background: var(--color-primary);
    color: #ffffff;
  }

  .inline-btn.primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .inline-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
