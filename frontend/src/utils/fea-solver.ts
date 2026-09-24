import type { FEAModel, FEAResult, Node, Element, MeshParams, MeshParamKey, PresetName } from '../types';

// ─── FEA Solver ─────────────────────────────────────────────────────────────
export function solve(model: FEAModel): FEAResult {
  const { nodes, elements, loads } = model;
  const N = nodes.length;
  const dof = N * 2;

  // Build node id -> index map
  const nodeIndex = new Map<number, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  // Initialize global stiffness matrix K and force vector F
  const K: number[][] = Array.from({ length: dof }, () => new Array(dof).fill(0));
  const F = new Array(dof).fill(0);

  // Assemble element stiffness matrices
  const elementStiffnesses: number[][][] = [];
  for (const el of elements) {
    const n1 = nodes[nodeIndex.get(el.nodeIds[0])!];
    const n2 = nodes[nodeIndex.get(el.nodeIds[1])!];
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    const c = dx / L;
    const s = dy / L;
    const k = (el.youngsModulus * el.area) / L;

    // 4x4 element stiffness matrix
    const ke = [
      [k * c * c, k * c * s, -k * c * c, -k * c * s],
      [k * c * s, k * s * s, -k * c * s, -k * s * s],
      [-k * c * c, -k * c * s, k * c * c, k * c * s],
      [-k * c * s, -k * s * s, k * c * s, k * s * s],
    ];
    elementStiffnesses.push(ke);

    const i1 = nodeIndex.get(el.nodeIds[0])!;
    const i2 = nodeIndex.get(el.nodeIds[1])!;
    const dofs = [i1 * 2, i1 * 2 + 1, i2 * 2, i2 * 2 + 1];

    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        K[dofs[a]][dofs[b]] += ke[a][b];
      }
    }
  }

  // Build force vector
  for (const load of loads) {
    const idx = nodeIndex.get(load.nodeId);
    if (idx === undefined) continue;
    F[idx * 2] += load.fx;
    F[idx * 2 + 1] += load.fy;
  }

  // Apply boundary conditions using penalty method
  const penalty = 1e15;
  const fixedDofs: number[] = [];
  for (const node of nodes) {
    if (node.fixed) {
      const idx = nodeIndex.get(node.id)!;
      fixedDofs.push(idx * 2, idx * 2 + 1);
    }
  }
  for (const d of fixedDofs) {
    K[d][d] += penalty;
  }

  // Solve K * U = F using Gaussian elimination
  const U = gaussianElimination(K, F);

  // Compute element stresses, strains, forces
  const stresses: number[] = [];
  const strains: number[] = [];
  const forces: number[] = [];

  for (let ei = 0; ei < elements.length; ei++) {
    const el = elements[ei];
    const n1 = nodes[nodeIndex.get(el.nodeIds[0])!];
    const n2 = nodes[nodeIndex.get(el.nodeIds[1])!];
    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    const c = dx / L;
    const s = dy / L;

    const i1 = nodeIndex.get(el.nodeIds[0])!;
    const i2 = nodeIndex.get(el.nodeIds[1])!;
    const u1 = U[i1 * 2];
    const v1 = U[i1 * 2 + 1];
    const u2 = U[i2 * 2];
    const v2 = U[i2 * 2 + 1];

    const strain = ((u2 - u1) * c + (v2 - v1) * s) / L;
    const stress = el.youngsModulus * strain;
    const force = stress * el.area;

    stresses.push(stress);
    strains.push(strain);
    forces.push(force);

    el.stress = stress;
    el.strain = strain;
    el.force = force;
  }

  // Update node displacements
  for (const node of nodes) {
    const idx = nodeIndex.get(node.id)!;
    node.displacementX = U[idx * 2];
    node.displacementY = U[idx * 2 + 1];
  }

  // Compute max values
  let maxDisplacement = 0;
  for (const node of nodes) {
    const d = Math.sqrt(node.displacementX ** 2 + node.displacementY ** 2);
    if (d > maxDisplacement) maxDisplacement = d;
  }
  const maxStress = Math.max(...stresses.map(Math.abs));

  // Compute reaction forces at fixed nodes
  const reactionForces: { nodeId: number; fx: number; fy: number }[] = [];
  for (const node of nodes) {
    if (!node.fixed) continue;
    const idx = nodeIndex.get(node.id)!;
    let rx = 0, ry = 0;
    for (let j = 0; j < dof; j++) {
      rx += K[idx * 2][j] * U[j];
      ry += K[idx * 2 + 1][j] * U[j];
    }
    // subtract applied loads
    for (const load of loads) {
      if (load.nodeId === node.id) {
        rx -= load.fx;
        ry -= load.fy;
      }
    }
    reactionForces.push({ nodeId: node.id, fx: rx, fy: ry });
  }

  return {
    displacements: U,
    stresses,
    strains,
    maxDisplacement,
    maxStress,
    reactionForces,
  };
}

// ─── Gaussian Elimination ───────────────────────────────────────────────────
function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Augmented matrix
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) {
        maxVal = Math.abs(M[row][col]);
        maxRow = row;
      }
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    if (Math.abs(M[col][col]) < 1e-20) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-20) continue;
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = sum / M[i][i];
  }
  return x;
}

// ─── Mesh Generators ────────────────────────────────────────────────────────
export function buildTrussBeam(
  length: number,
  height: number,
  nDivX: number,
  nDivY: number,
  area = 0.001 // cross-section area in m² (default 1000 mm²)
): FEAModel {
  const nodes: Node[] = [];
  const elements: Element[] = [];
  let nodeId = 0;
  let elId = 0;

  const dx = length / nDivX;
  const dy = height / nDivY;
  const E = 200e9; // 200 GPa steel

  const nodeGrid: number[][] = [];
  for (let iy = 0; iy <= nDivY; iy++) {
    nodeGrid[iy] = [];
    for (let ix = 0; ix <= nDivX; ix++) {
      const id = nodeId++;
      nodes.push({
        id,
        x: ix * dx,
        y: iy * dy,
        fixed: ix === 0,
        displacementX: 0,
        displacementY: 0,
      });
      nodeGrid[iy][ix] = id;
    }
  }

  for (let iy = 0; iy <= nDivY; iy++) {
    for (let ix = 0; ix <= nDivX; ix++) {
      // Horizontal
      if (ix < nDivX) {
        elements.push({
          id: elId++,
          nodeIds: [nodeGrid[iy][ix], nodeGrid[iy][ix + 1]],
          area,
          youngsModulus: E,
          stress: 0, strain: 0, force: 0,
        });
      }
      // Vertical
      if (iy < nDivY) {
        elements.push({
          id: elId++,
          nodeIds: [nodeGrid[iy][ix], nodeGrid[iy + 1][ix]],
          area,
          youngsModulus: E,
          stress: 0, strain: 0, force: 0,
        });
      }
      // Diagonal (Warren pattern)
      if (ix < nDivX && iy < nDivY) {
        if ((ix + iy) % 2 === 0) {
          elements.push({
            id: elId++,
            nodeIds: [nodeGrid[iy][ix], nodeGrid[iy + 1][ix + 1]],
            area: area * 0.7,
            youngsModulus: E,
            stress: 0, strain: 0, force: 0,
          });
        } else {
          elements.push({
            id: elId++,
            nodeIds: [nodeGrid[iy][ix + 1], nodeGrid[iy + 1][ix]],
            area: area * 0.7,
            youngsModulus: E,
            stress: 0, strain: 0, force: 0,
          });
        }
      }
    }
  }

  return { nodes, elements, loads: [] };
}

// ─── Parameter ranges & validation ──────────────────────────────────────────
export interface ParamLimit {
  min: number;
  max: number;
  integer?: boolean;
  step: number;
}

export const MESH_PARAM_LIMITS: Record<MeshParamKey, ParamLimit> = {
  spans: { min: 1, max: 20, integer: true, step: 1 },
  layers: { min: 1, max: 10, integer: true, step: 1 },
  spanLength: { min: 0.1, max: 20, step: 0.1 },
  storyHeight: { min: 0.1, max: 10, step: 0.1 },
  area: { min: 10, max: 100000, step: 10 }, // 截面尺寸 (mm²)
};

export const MESH_PARAM_LABELS: Record<MeshParamKey, string> = {
  spans: '跨数',
  layers: '层数',
  spanLength: '跨长',
  storyHeight: '层高',
  area: '截面尺寸',
};

export const MESH_PARAM_UNITS: Record<MeshParamKey, string> = {
  spans: '跨',
  layers: '层',
  spanLength: 'm',
  storyHeight: 'm',
  area: 'mm²',
};

/** Baseline parameter sets for the three named cases. */
export const DEFAULT_MESH_PARAMS: Record<PresetName, MeshParams> = {
  cantilever: { spans: 8, layers: 2, spanLength: 0.5, storyHeight: 0.5, area: 1000 },
  bridge: { spans: 10, layers: 1, spanLength: 1, storyHeight: 2, area: 1000 },
  frame: { spans: 4, layers: 4, spanLength: 0.75, storyHeight: 0.75, area: 1000 },
};

/** Validate one field; returns null when legal, otherwise a human-readable reason. */
export function validateMeshParam(key: MeshParamKey, value: number): string | null {
  const limit = MESH_PARAM_LIMITS[key];
  const label = MESH_PARAM_LABELS[key];
  if (!Number.isFinite(value)) return `${label}必须是数字`;
  if (limit.integer && !Number.isInteger(value)) {
    return `${label}必须为整数`;
  }
  if (value < limit.min || value > limit.max) {
    return `${label}超出可用范围（${limit.min} ~ ${limit.max} ${MESH_PARAM_UNITS[key]}）`;
  }
  return null;
}

/** Validate a full parameter set; returns the key + reason of the first illegal field. */
export function validateMeshParams(
  params: MeshParams
): { key: MeshParamKey; message: string } | null {
  for (const key of ['spans', 'layers', 'spanLength', 'storyHeight', 'area'] as MeshParamKey[]) {
    const message = validateMeshParam(key, params[key]);
    if (message) return { key, message };
  }
  return null;
}

// ─── Parameterized Model Builder ────────────────────────────────────────────
export function buildModel(preset: PresetName, params: MeshParams): FEAModel {
  const length = params.spans * params.spanLength;
  const height = params.layers * params.storyHeight;
  const areaM2 = params.area / 1e6; // mm² -> m²
  const model = buildTrussBeam(length, height, params.spans, params.layers, areaM2);

  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const nodeAt = (ix: number, iy: number) =>
    model.nodes.find(
      (n) => near(n.x, ix * params.spanLength) && near(n.y, iy * params.storyHeight)
    );

  if (preset === 'cantilever') {
    // Left edge (ix === 0) is already clamped by buildTrussBeam.
    // Downward loads at both right-end nodes.
    const rightTop = nodeAt(params.spans, params.layers);
    const rightBottom = nodeAt(params.spans, 0);
    if (rightTop) model.loads.push({ nodeId: rightTop.id, fx: 0, fy: -10000 });
    if (rightBottom) model.loads.push({ nodeId: rightBottom.id, fx: 0, fy: -10000 });
  } else if (preset === 'bridge') {
    // Simply supported: pin at the left-bottom node; the right-bottom node is
    // fixed in both DOFs as an approximation of a roller support.
    for (const node of model.nodes) node.fixed = false;
    const leftBottom = nodeAt(0, 0);
    const rightBottom = nodeAt(params.spans, 0);
    if (leftBottom) leftBottom.fixed = true;
    if (rightBottom) rightBottom.fixed = true;

    // Downward load at the center-bottom node
    const centerBottom = model.nodes.reduce((best, n) => {
      if (!near(n.y, 0)) return best;
      if (!best) return n;
      return Math.abs(n.x - length / 2) < Math.abs(best.x - length / 2) ? n : best;
    }, null as Node | null);
    if (centerBottom) model.loads.push({ nodeId: centerBottom.id, fx: 0, fy: -50000 });
  } else {
    // frame: buildTrussBeam already clamps the left edge (ix === 0);
    // additionally clamp the whole bottom row, matching the baseline case.
    for (const node of model.nodes) {
      if (near(node.y, 0)) node.fixed = true;
    }
    // Load at the top-center node
    const topCenter = model.nodes.reduce((best, n) => {
      if (!near(n.y, height)) return best;
      if (!best) return n;
      return Math.abs(n.x - length / 2) < Math.abs(best.x - length / 2) ? n : best;
    }, null as Node | null);
    if (topCenter) model.loads.push({ nodeId: topCenter.id, fx: 5000, fy: -20000 });
  }

  return model;
}

// ─── Preset Models (baseline cases) ─────────────────────────────────────────
export const presetCantileverBeam = (): FEAModel =>
  buildModel('cantilever', DEFAULT_MESH_PARAMS.cantilever);
export const presetBridgeTruss = (): FEAModel =>
  buildModel('bridge', DEFAULT_MESH_PARAMS.bridge);
export const presetSimpleFrame = (): FEAModel =>
  buildModel('frame', DEFAULT_MESH_PARAMS.frame);

// ─── Jet Colormap ───────────────────────────────────────────────────────────
export function jetColormap(value: number, min: number, max: number): string {
  const t = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));

  let r: number, g: number, b: number;
  if (t < 0.125) {
    r = 0; g = 0; b = 0.5 + t * 4;
  } else if (t < 0.375) {
    r = 0; g = (t - 0.125) * 4; b = 1;
  } else if (t < 0.625) {
    r = (t - 0.375) * 4; g = 1; b = 1 - (t - 0.375) * 4;
  } else if (t < 0.875) {
    r = 1; g = 1 - (t - 0.625) * 4; b = 0;
  } else {
    r = 1 - (t - 0.875) * 4; g = 0; b = 0;
  }

  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}
