import { z } from 'zod';

export const CANVAS_NODE_TYPES = ['note', 'process', 'decision'] as const;
export type CanvasNodeType = (typeof CANVAS_NODE_TYPES)[number];

export const CanvasNodeTypeSchema = z.enum(CANVAS_NODE_TYPES);

export const CanvasNodeDataSchema = z.object({
  title: z.string().max(128),
  content: z.string().max(4096).default(''),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  status: z.enum(['idle', 'active', 'completed']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CanvasNodeData = z.infer<typeof CanvasNodeDataSchema>;

export const CanvasNodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export type CanvasNodePosition = z.infer<typeof CanvasNodePositionSchema>;

export const CanvasNodeSchema = z.object({
  id: z.string().min(1).max(128),
  type: CanvasNodeTypeSchema,
  position: CanvasNodePositionSchema,
  data: CanvasNodeDataSchema,
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  updatedAt: z.number().int().positive(),
  updatedBy: z.string().optional(),
});

export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export const CanvasEdgeSchema = z.object({
  id: z.string().min(1).max(128),
  source: z.string().min(1).max(128),
  target: z.string().min(1).max(128),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().max(64).optional(),
  type: z.string().max(32).optional(),
  animated: z.boolean().optional(),
  updatedAt: z.number().int().positive(),
});

export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const CanvasMetadataSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  title: z.string().max(128),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export type CanvasMetadata = z.infer<typeof CanvasMetadataSchema>;

/**
 * Validation functions
 */
export function validateCanvasNode(data: unknown): {
  success: boolean;
  data?: CanvasNode;
  error?: string;
} {
  const result = CanvasNodeSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
  };
}

export function validateCanvasEdge(data: unknown): {
  success: boolean;
  data?: CanvasEdge;
  error?: string;
} {
  const result = CanvasEdgeSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
  };
}

/**
 * Default node factory helpers with stable IDs
 */
export function createDefaultCanvasNode(
  type: CanvasNodeType,
  position: CanvasNodePosition,
  options?: { id?: string; title?: string; content?: string; color?: string; updatedBy?: string },
): CanvasNode {
  const id = options?.id ?? `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();

  const defaultTitles: Record<CanvasNodeType, string> = {
    note: 'Sticky Note',
    process: 'Process Step',
    decision: 'Decision Node',
  };

  const defaultColors: Record<CanvasNodeType, string> = {
    note: '#fef08a', // Amber/Yellow
    process: '#38bdf8', // Sky blue
    decision: '#a855f7', // Purple
  };

  return {
    id,
    type,
    position,
    data: {
      title: options?.title ?? defaultTitles[type],
      content: options?.content ?? '',
      color: options?.color ?? defaultColors[type],
    },
    updatedAt: now,
    updatedBy: options?.updatedBy,
  };
}

export function createDefaultCanvasEdge(
  source: string,
  target: string,
  options?: { id?: string; label?: string; animated?: boolean },
): CanvasEdge {
  const id = options?.id ?? `edge_${source}_${target}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    source,
    target,
    label: options?.label,
    animated: options?.animated ?? false,
    updatedAt: Date.now(),
  };
}
