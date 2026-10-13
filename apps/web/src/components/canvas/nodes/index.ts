import { NodeTypes } from '@xyflow/react';
import { NoteNode } from './NoteNode';
import { ProcessNode } from './ProcessNode';
import { DecisionNode } from './DecisionNode';

export const nodeTypes: NodeTypes = {
  note: NoteNode,
  process: ProcessNode,
  decision: DecisionNode,
};

export { NoteNode, ProcessNode, DecisionNode };
