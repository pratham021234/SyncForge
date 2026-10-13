'use client';

import React, { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { HelpCircle, Trash2 } from 'lucide-react';
import { CanvasNode } from '@syncforge/shared';

interface DecisionNodeData extends Record<string, unknown> {
  title: string;
  content: string;
  onUpdate?: (patch: Partial<CanvasNode>) => void;
  onDelete?: () => void;
  readOnly?: boolean;
}

export function DecisionNode({ data, selected }: NodeProps) {
  const nodeData = data as DecisionNodeData;
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(nodeData.title || 'Decision Point');
  const [content, setContent] = useState(nodeData.content || '');

  const handleBlur = () => {
    setIsEditing(false);
    if (nodeData.onUpdate) {
      nodeData.onUpdate({
        data: {
          title,
          content,
        },
      });
    }
  };

  return (
    <div
      className={`group relative min-w-[210px] max-w-[270px] rounded-xl border p-4 shadow-xl transition-all ${
        selected
          ? 'border-purple-400 ring-2 ring-purple-400/30'
          : 'border-purple-500/30 hover:border-purple-400/60'
      } bg-[#180826]/90 backdrop-blur-md`}
    >
      {/* 4 Handles for branch decisions */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-[#180826] !bg-purple-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-[#180826] !bg-purple-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-[#180826] !bg-purple-400"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-[#180826] !bg-purple-400"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-purple-500/20">
        <div className="flex items-center gap-1.5 text-purple-300">
          <HelpCircle className="h-4 w-4 shrink-0 text-purple-400" />
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleBlur}
              autoFocus
              className="w-full bg-black/40 px-1 py-0.5 text-xs font-semibold text-purple-200 outline-none rounded border border-purple-400/40"
            />
          ) : (
            <span
              onClick={() => !nodeData.readOnly && setIsEditing(true)}
              className="text-xs font-semibold truncate cursor-pointer hover:underline"
              title="Click to edit condition"
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
          rows={2}
          className="w-full bg-black/40 p-1.5 text-xs text-purple-100/90 outline-none rounded border border-purple-400/30 resize-none font-sans"
          placeholder="Condition rules / outputs..."
        />
      ) : (
        <div
          onClick={() => !nodeData.readOnly && setIsEditing(true)}
          className="min-h-[30px] text-xs text-purple-100/80 leading-relaxed cursor-pointer hover:bg-purple-500/5 p-1 rounded transition-colors whitespace-pre-wrap break-words"
          title="Click to edit condition details"
        >
          {content || <span className="italic text-purple-400/40">Condition criteria...</span>}
        </div>
      )}

      {/* Port Labels for Clarity */}
      <div className="mt-2 pt-1 border-t border-purple-500/10 flex justify-between text-[9px] font-mono text-purple-300/50">
        <span>◀ Alt</span>
        <span>▼ No</span>
        <span>Yes ▶</span>
      </div>
    </div>
  );
}
