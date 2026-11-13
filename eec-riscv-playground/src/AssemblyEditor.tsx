import { useEffect, useRef } from "react";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  gutter,
  GutterMarker,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Diagnostic } from "./types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  activeLine?: number;
  diagnostics?: Diagnostic[];
}
const setActiveLine = StateEffect.define<number>();
const setDiagnostics = StateEffect.define<Diagnostic[]>();
const currentLine = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes);
    for (const effect of transaction.effects)
      if (effect.is(setActiveLine)) {
        const line = Math.min(effect.value, transaction.state.doc.lines);
        decorations =
          line > 0
            ? Decoration.set([
                Decoration.line({ class: "cm-executingLine" }).range(
                  transaction.state.doc.line(line).from,
                ),
              ])
            : Decoration.none;
      }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});
const diagnosticsField = StateField.define<Diagnostic[]>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setDiagnostics)) return effect.value;
    return transaction.docChanged ? [] : value;
  },
});
class ErrorMarker extends GutterMarker {
  constructor(private message: string) {
    super();
  }
  toDOM() {
    const element = document.createElement("span");
    element.textContent = "●";
    element.title = this.message;
    element.className = "cm-errorMarker";
    return element;
  }
}
const assembly = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^[#;].*/)) return "comment";
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^\.[a-zA-Z_]+/)) return "meta";
    if (stream.match(/^[a-zA-Z_][\w.]*:/)) return "labelName";
    if (
      stream.match(
        /^(?:x(?:[12]?\d|3[01])|zero|ra|sp|gp|tp|t[0-6]|s(?:\d|10|11)|a[0-7])\b/,
      )
    )
      return "variableName";
    if (stream.match(/^-?(?:0x[\da-fA-F]+|\d+)\b/)) return "number";
    if (stream.match(/^[a-zA-Z][\w.]*/))
      return stream.column() < 8 ? "keyword" : "variableName";
    stream.next();
    return null;
  },
});

export default function AssemblyEditor({
  value,
  onChange,
  activeLine,
  diagnostics = [],
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          highlightActiveLine(),
          currentLine,
          diagnosticsField,
          gutter({
            class: "cm-diagnostics",
            lineMarker: (editorView, line) => {
              const lineNumber = editorView.state.doc.lineAt(line.from).number;
              const diagnostic = editorView.state
                .field(diagnosticsField)
                .find((item) => item.line === lineNumber);
              return diagnostic ? new ErrorMarker(diagnostic.message) : null;
            },
            lineMarkerChange: (update) =>
              update.transactions.some((t) =>
                t.effects.some((e) => e.is(setDiagnostics)),
              ),
          }),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          assembly,
          syntaxHighlighting(
            HighlightStyle.define([
              { tag: tags.comment, color: "#7d8da4", fontStyle: "italic" },
              { tag: tags.keyword, color: "#5ee0f5" },
              { tag: tags.variableName, color: "#9cd3ff" },
              { tag: tags.number, color: "#f4c185" },
              { tag: tags.string, color: "#87dcb1" },
              { tag: tags.labelName, color: "#c8b5ff" },
              { tag: tags.meta, color: "#b3c0d4" },
            ]),
          ),
          EditorView.contentAttributes.of({
            "aria-label": "RISC-V assembly source",
            spellcheck: "false",
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              fontSize: "13px",
              background: "#10151e",
              color: "#e9eef6",
            },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: '"IBM Plex Mono", monospace',
              lineHeight: "1.9",
            },
            ".cm-content": { padding: "15px 0 24px" },
            ".cm-line": { padding: "0 14px" },
            ".cm-gutters": {
              background: "#10151e",
              color: "#677991",
              border: "none",
              fontSize: "10px",
            },
            ".cm-lineNumbers .cm-gutterElement": { padding: "0 4px 0 12px" },
            ".cm-activeLineGutter": { background: "#1d3041", color: "#5ee0f5" },
            ".cm-activeLine": { background: "#24364b33" },
            ".cm-executingLine": {
              background: "#16394b",
              boxShadow: "inset 3px 0 #5ee0f5",
            },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              background: "#234b65 !important",
            },
            ".cm-cursor": { borderLeftColor: "#5ee0f5" },
            "&.cm-focused": { outline: "none" },
            ".cm-diagnostics": { width: "9px" },
            ".cm-errorMarker": { color: "#ff9e8d", fontSize: "8px" },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
      });
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({ effects: setActiveLine.of(activeLine ?? 0) });
  }, [activeLine]);
  useEffect(() => {
    view.current?.dispatch({ effects: setDiagnostics.of(diagnostics) });
  }, [diagnostics]);
  return <div className="assembly-editor" ref={host} />;
}
