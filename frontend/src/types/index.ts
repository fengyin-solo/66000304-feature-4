export interface Node {
  id: number;
  x: number;
  y: number;
  fixed: boolean;       // boundary condition
  displacementX: number;
  displacementY: number;
}

export interface Element {
  id: number;
  nodeIds: [number, number];  // 2-node truss element
  area: number;               // cross-section area (m²)
  youngsModulus: number;      // Pa
  stress: number;             // computed
  strain: number;             // computed
  force: number;              // computed
}

export interface Load {
  nodeId: number;
  fx: number;   // force X component (N)
  fy: number;   // force Y component (N)
}

export interface FEAModel {
  nodes: Node[];
  elements: Element[];
  loads: Load[];
}

export interface FEAResult {
  displacements: number[];    // global displacement vector
  stresses: number[];          // per-element stress
  strains: number[];           // per-element strain
  maxDisplacement: number;
  maxStress: number;
  reactionForces: { nodeId: number; fx: number; fy: number }[];
}

// ─── Editable mesh parameters ───────────────────────────────────────────────
export type PresetName = 'cantilever' | 'bridge' | 'frame';

/** Keys the user can edit in the mesh control panel. */
export type MeshParamKey = 'spans' | 'layers' | 'spanLength' | 'storyHeight' | 'area';

export interface MeshParams {
  spans: number;        // number of bays/panels along X
  layers: number;       // number of cell layers along Y
  spanLength: number;   // length of one bay (m)
  storyHeight: number;  // height of one layer (m)
  area: number;         // cross-section area of chords/columns (mm²)
}
