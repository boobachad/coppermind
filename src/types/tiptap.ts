// TipTap Editor Types
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Editor } from '@tiptap/core';

export interface NodeViewProps {
    node: ProseMirrorNode;
    updateAttributes: (attributes: Record<string, unknown>) => void;
    deleteNode?: () => void;
    editor: Editor;
    getPos: () => number;
    selected: boolean;
}

export interface MindMapNode {
    id: string;
    text: string;
    children: MindMapNode[];
}

export interface TableState {
    rows: number;
    cols: number;
}

export interface UploadProgress {
    loaded: number;
    total: number;
}

export interface CommandItem {
    title: string;
    description?: string;
    icon?: React.ComponentType;
    command: (props: { editor: Editor; range: { from: number; to: number } }) => void;
}

export interface SuggestionProps {
    editor: Editor;
    range: { from: number; to: number };
    query: string;
    text: string;
    clientRect?: () => DOMRect | null;
    decorationNode: Element | null;
    command: (item: CommandItem) => void;
}
