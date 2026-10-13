'use client';

import React, { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { StickyNote, Trash2 } from 'lucide-react';
import { CanvasNode } from '@syncforge/shared';

interface NoteNodeData extends Record<string, unknown> {
  title: string;
  content: string;
  color?: string;
  onUpdate?: (patch: Partial<CanvasNode>) => void;
  onDelete?: () => void;
  readOnly?: boolean;
}

export function NoteNode({ data, selected }: NodeProps) {
  const nodeData = data as NoteNodeData;
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(nodeData.title || 'Sticky Note');
  const [content, setContent] = useState(nodeData.content || '');

  const handleBlur = () => {
    setIsEditing(false);
    if (nodeData.onUpdate) {
      nodeData.onUpdate({
        data: {
          title,
          content,
          color: nodeData.color,
        },
      });
    }
  };

  return (
    <div
      className={`group relative min-w-[200px] max-w-[260px] rounded-xl border p-4 shadow-xl transition-all ${
        selected
          ? 'border-amber-400 ring-2 ring-amber-400/30'
          : 'border-amber-500/30 hover:border-amber-400/60'
      } bg-[#1a1708]/90 backdrop-blur-md`}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-[#1a1708] !bg-amber-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-[#1a1708] !bg-amber-400"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-amber-500/20">
        <div className="flex items-center gap-1.5 text-amber-300">
          <StickyNote className="h-4 w-4 shrink-0" />
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleBlur}
              autoFocus
              className="w-full bg-black/40 px-1 py-0.5 text-xs font-semibold text-amber-200 outline-none rounded border border-amber-400/40"
            />
          ) : (
            <span
              onClick={() => !nodeData.readOnly && setIsEditing(true)}
              className="text-xs font-semibold truncate cursor-pointer hover:underline"
              title="Click to edit title"
            >
              {title}
            </span>
          )}
        </div>

        {nodeData.onDelete && !nodeData.readOnly && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onDelete?.();
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-rose-400 rounded"
            title="Delete node"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Content Body */}
      {isEditing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleBlur}
          rows={3}
          className="w-full bg-black/40 p-1.5 text-xs text-amber-100/90 outline-none rounded border border-amber-400/30 resize-none font-sans"
          placeholder="Add notes or ideas..."
        />
      ) : (
        <div
          onClick={() => !nodeData.readOnly && setIsEditing(true)}
          className="min-h-[40px] text-xs text-amber-100/80 leading-relaxed cursor-pointer hover:bg-amber-500/5 p-1 rounded transition-colors whitespace-pre-wrap break-words"
          title="Click to edit content"
        >
          {content || (
            <span className="italic text-amber-400/40">Empty note. Click to write...</span>
          )}
        </div>
      )}
    </div>
  );
}
