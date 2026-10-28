import { useSyncExternalStore } from "react";
import { editor } from "../core/editor";
export function useEditor() {
  useSyncExternalStore(editor.subscribe, editor.getSnapshot);
  return editor;
}
