'use client';

import React, { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { PlayCircle, Trash2, CheckCircle2, Clock } from 'lucide-react';
import { CanvasNode } from '@syncforge/shared';

interface ProcessNodeData extends Record<string, unknown> {
  title: string;
  content: string;
  status?: 'idle' | 'active' | 'completed';
  onUpdate?: (patch: Partial<CanvasNode>) => void;
  onDelete?: () => void;
  readOnly?: boolean;
}

export function ProcessNode({ data, selected }: NodeProps) {
  const nodeData = data as ProcessNodeData;
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(nodeData.title || 'Process Step');
  const [content, setContent] = useState(nodeData.content || '');
  const currentStatus = nodeData.status ?? 'idle';

  const handleBlur = () => {
    setIsEditing(false);
    if (nodeData.onUpdate) {
      nodeData.onUpdate({
        data: {
          title,
          content,
          status: currentStatus,
        },
      });
    }
  };

  const toggleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nodeData.readOnly) return;
    const nextStatus =
      currentStatus === 'idle' ? 'active' : currentStatus === 'active' ? 'completed' : 'idle';
    if (nodeData.onUpdate) {
      nodeData.onUpdate({
        data: {
          title,
          content,
          status: nextStatus,
        },
      });
    }
  };

  return (
    <div
      className={`group relative min-w-[220px] max-w-[280px] rounded-xl border p-4 shadow-xl transition-all ${
        selected
          ? 'border-sky-400 ring-2 ring-sky-400/30'
          : 'border-sky-500/30 hover:border-sky-400/60'
      } bg-[#081524]/90 backdrop-blur-md`}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-[#081524] !bg-sky-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !rounded-full !border-2 !border-[#081524] !bg-sky-400"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-2 !w-2 !rounded-full !border-2 !border-[#081524] !bg-sky-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2 !w-2 !rounded-full !border-2 !border-[#081524] !bg-sky-400"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-sky-500/20">
        <div className="flex items-center gap-1.5 text-sky-300">
          <PlayCircle className="h-4 w-4 shrink-0 text-sky-400" />
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleBlur}
              autoFocus
              className="w-full bg-black/40 px-1 py-0.5 text-xs font-semibold text-sky-200 outline-none rounded border border-sky-400/40"
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

        <div className="flex items-center gap-1">
          {/* Status Badge */}
          <button
            onClick={toggleStatus}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
              currentStatus === 'completed'
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400'
                : currentStatus === 'active'
                  ? 'border-amber-500/40 bg-amber-950/40 text-amber-400 animate-pulse'
                  : 'border-slate-700 bg-slate-900 text-slate-400'
            }`}
            title="Click to cycle status: Idle -> Active -> Completed"
          >
            {currentStatus === 'completed' ? (
              <CheckCircle2 className="h-2.5 w-2.5" />
            ) : currentStatus === 'active' ? (
              <Clock className="h-2.5 w-2.5" />
            ) : null}
            <span>{currentStatus}</span>
          </button>

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
      </div>

      {/* Content Body */}
      {isEditing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleBlur}
          rows={3}
          className="w-full bg-black/40 p-1.5 text-xs text-sky-100/90 outline-none rounded border border-sky-400/30 resize-none font-sans"
          placeholder="Describe action or process details..."
        />
      ) : (
        <div
          onClick={() => !nodeData.readOnly && setIsEditing(true)}
          className="min-h-[36px] text-xs text-sky-100/80 leading-relaxed cursor-pointer hover:bg-sky-500/5 p-1 rounded transition-colors whitespace-pre-wrap break-words"
          title="Click to edit details"
        >
          {content || (
            <span className="italic text-sky-400/40">No description. Click to add...</span>
          )}
        </div>
      )}
    </div>
  );
}
