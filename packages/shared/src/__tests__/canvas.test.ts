import { describe, it, expect } from 'vitest';
import {
  CanvasNodeSchema,
  CanvasEdgeSchema,
  validateCanvasNode,
  validateCanvasEdge,
  createDefaultCanvasNode,
  createDefaultCanvasEdge,
} from '../canvas.js';

describe('Canvas Document Schema Validation', () => {
  it('validates correct note node', () => {
    const node = createDefaultCanvasNode(
      'note',
      { x: 100, y: 200 },
      { title: 'Architecture idea' },
    );
    const result = CanvasNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('note');
      expect(result.data.position).toEqual({ x: 100, y: 200 });
      expect(result.data.data.title).toBe('Architecture idea');
    }
  });

  it('validates process and decision nodes', () => {
    const processNode = createDefaultCanvasNode('process', { x: 0, y: 0 });
    expect(validateCanvasNode(processNode).success).toBe(true);

    const decisionNode = createDefaultCanvasNode('decision', { x: 50, y: 50 });
    expect(validateCanvasNode(decisionNode).success).toBe(true);
  });

  it('rejects unsupported node types', () => {
    const invalid = {
      id: 'n1',
      type: 'invalid_type',
      position: { x: 0, y: 0 },
      data: { title: 'Test' },
      updatedAt: Date.now(),
    };
    const validation = validateCanvasNode(invalid);
    expect(validation.success).toBe(false);
    expect(validation.error).toBeDefined();
  });

  it('rejects infinite or non-numeric positions', () => {
    const invalid = {
      id: 'n2',
      type: 'note',
      position: { x: NaN, y: Infinity },
      data: { title: 'Test' },
      updatedAt: Date.now(),
    };
    const validation = validateCanvasNode(invalid);
    expect(validation.success).toBe(false);
  });

  it('validates edge connecting two nodes', () => {
    const edge = createDefaultCanvasEdge('node_1', 'node_2', { label: 'leads to' });
    const result = CanvasEdgeSchema.safeParse(edge);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('node_1');
      expect(result.data.target).toBe('node_2');
      expect(result.data.label).toBe('leads to');
    }
  });

  it('rejects edge with empty source or target', () => {
    const invalidEdge = {
      id: 'e1',
      source: '',
      target: 'node_2',
      updatedAt: Date.now(),
    };
    const validation = validateCanvasEdge(invalidEdge);
    expect(validation.success).toBe(false);
  });
});
