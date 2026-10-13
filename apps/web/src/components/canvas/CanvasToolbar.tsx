'use client';

import React from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  StickyNote,
  PlayCircle,
  HelpCircle,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { CanvasNodeType } from '@syncforge/shared';

interface CanvasToolbarProps {
  onAddNode: (type: CanvasNodeType) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  disabled?: boolean;
}

export function CanvasToolbar({
  onAddNode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  disabled = false,
}: CanvasToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-[#0c1220]/90 p-1.5 shadow-2xl backdrop-blur-md">
      {/* Node Creation Tools */}
      <div className="flex items-center gap-1 pr-1 border-r border-slate-800">
        <button
          onClick={() => onAddNode('note')}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10 active:bg-amber-500/20 transition-colors disabled:opacity-50"
          title="Add Sticky Note"
        >
          <StickyNote className="h-4 w-4" />
          <span className="hidden sm:inline">Note</span>
        </button>

        <button
          onClick={() => onAddNode('process')}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/10 active:bg-sky-500/20 transition-colors disabled:opacity-50"
          title="Add Process Step"
        >
          <PlayCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Process</span>
        </button>

        <button
          onClick={() => onAddNode('decision')}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/10 active:bg-purple-500/20 transition-colors disabled:opacity-50"
          title="Add Decision Node"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Decision</span>
        </button>
      </div>

      {/* History (Undo / Redo) */}
      <div className="flex items-center gap-1 px-1 border-r border-slate-800">
        <button
          onClick={onUndo}
          disabled={disabled || !canUndo}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Undo local edit (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={disabled || !canRedo}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Redo local edit (Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* Viewport Zoom & Fit Controls */}
      <div className="flex items-center gap-1 pl-1">
        <button
          onClick={() => zoomIn({ duration: 200 })}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => zoomOut({ duration: 200 })}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => fitView({ padding: 0.2, duration: 250 })}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          title="Fit View"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
