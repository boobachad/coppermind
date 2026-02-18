/* eslint-disable @typescript-eslint/no-explicit-any */
// Type declarations for napchart library
declare module 'napchart' {
  export interface NapchartElement {
    start: number;
    end: number;
    text?: string;
    color?: string;
    lane?: number;
    id?: number;
  }

  export interface NapchartData {
    elements: NapchartElement[];
    shape: 'circle' | 'wide' | 'line';
    lanes: number;
    colorTags?: Array<{ color: string; tag: string }>;
    lanesConfig?: Record<number, { locked: boolean }>;
  }

  export interface NapchartConfig {
    interaction?: boolean;
    penMode?: boolean;
    background?: string;
    fontColor?: string;
    defaultColor?: string;
  }

  export interface NapchartInstance {
    data: NapchartData;
    draw: () => void;
    updateDimensions: () => void;
    onUpdate: () => void;
    onSetSelected: (id: number | false) => void;
    setElements: (elements: NapchartElement[]) => void;
    createElement: (element: NapchartElement) => NapchartElement;
    deleteElement: (id: number) => void;
    updateElement: (changes: Partial<NapchartElement> & { id: number }) => void;
    changeShape: (shape: 'circle' | 'wide' | 'line') => void;
  }

  export function init(
    ctx: CanvasRenderingContext2D,
    data: Partial<NapchartData>,
    config?: NapchartConfig
  ): NapchartInstance;
}

declare global {
  interface Window {
    Napchart: {
      init: (
        ctx: CanvasRenderingContext2D,
        data: Partial<import('napchart').NapchartData>,
        config?: import('napchart').NapchartConfig
      ) => import('napchart').NapchartInstance;
    };
  }
}

export {};
