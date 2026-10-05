import { history, historyKeymap, standardKeymap } from "@codemirror/commands";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder as placeholderText,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";
import type { MessageFormat } from "../../api/generated/models.js";
import { type TokenKind, tokenize } from "./tokens.js";

export interface FieldHandle {
  /** Focuses the field with the caret after what is already there, so a keystroke adds to it. */
  focus: () => void;
}

const KINDS: readonly TokenKind[] = ["name", "type", "option", "hash", "punct"];
const MARKS = new Map(KINDS.map((kind) => [kind, Decoration.mark({ class: `syn syn--${kind}` })]));

const decorate = (text: string, format: MessageFormat): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  let offset = 0;
  for (const token of tokenize(text, format)) {
    const mark = MARKS.get(token.kind);
    if (mark) {
      builder.add(offset, offset + token.text.length, mark);
    }
    offset += token.text.length;
  }
  return builder.finish();
};

/** Re-tokenizes the whole message on every change. Messages are a sentence or two -- cheap. */
const highlighting = (format: MessageFormat) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorate(view.state.doc.toString(), format);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = decorate(update.state.doc.toString(), format);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );

/**
 * The field a translation is written in, with its syntax set apart from its words.
 *
 * Not a textarea. A textarea draws its text in one font, so the only way to colour it was a copy
 * drawn behind it with the real glyphs made transparent -- which ruled out the one change that
 * actually separates syntax from prose, setting the syntax in a different face, because both
 * layers had to break lines at the same characters. This lays out its own text, so the braces,
 * keywords and placeholder names can be monospace while the words stay in the reading face.
 *
 * Only the editing core: undo, the platform's ordinary editing keys, and wrapping. Nothing here
 * claims Mod-Enter or Escape, which belong to the editor around it (save, and close).
 */
export const MessageField = ({
  value,
  onChange,
  format,
  label,
  placeholder,
  invalid,
  describedBy,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  format: MessageFormat;
  label: string;
  placeholder: string;
  invalid: boolean;
  describedBy: string;
  ref?: Ref<FieldHandle>;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const attributes = useRef(new Compartment());
  // Read by the update listener, which is installed once and would otherwise call the first one.
  const latest = useRef(onChange);
  latest.current = onChange;

  const describe = () =>
    EditorView.contentAttributes.of({
      "aria-label": label,
      "aria-invalid": String(invalid),
      "aria-describedby": describedBy,
    });

  // biome-ignore lint/correctness/useExhaustiveDependencies: built once per field. The editor is keyed by the translation it shows, so a different message is a different field; value, format and the attributes are kept in step by the effects below rather than by rebuilding the editor and losing its undo history.
  useEffect(() => {
    if (!host.current) {
      return;
    }
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...standardKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          placeholderText(placeholder),
          highlighting(format),
          attributes.current.of(describe()),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              latest.current(update.state.doc.toString());
            }
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

  // Text set from outside -- the reference copied in, or a save settling the draft -- replaces
  // what is in the field. Text typed here arrives already equal and changes nothing.
  useEffect(() => {
    const editor = view.current;
    const current = editor?.state.doc.toString();
    if (editor && current !== undefined && current !== value) {
      editor.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor: value.length },
      });
    }
  }, [value]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: label, invalid and describedBy are what describe() reads; it is rebuilt from them on each render.
  useEffect(() => {
    view.current?.dispatch({ effects: attributes.current.reconfigure(describe()) });
  }, [label, invalid, describedBy]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const editor = view.current;
        if (editor) {
          editor.focus();
          editor.dispatch({ selection: { anchor: editor.state.doc.length } });
        }
      },
    }),
    []
  );

  return <div className={invalid ? "code code--invalid" : "code"} ref={host} />;
};
