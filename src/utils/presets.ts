import { ToolpathPoint } from "../types";

/**
 * Helper to convert parsed ToolpathPoint array back into standard 5-column CSV
 */
export function pointsToCSV(points: ToolpathPoint[]): string {
  const headers = "line_type,X,Y,Z,speed\n";
  const rows = points.map(p => `${p.type},${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)},${p.speed.toFixed(1)}`);
  return headers + rows.join("\n");
}

/**
 * Preset 1: 0/90 Degree Bio-Scaffold Lattice Toolpath (Typical of tissue engineering scaffolds)
 * Mimics sequential orthogonal extrusion layers with rapid travel layer-transfers.
 */
export function generateScaffoldPreset(
  size: number = 30, // 30mm x 30mm
  spacing: number = 2.0, // 2mm fiber spacing
  numLayers: number = 12,
  layerHeight: number = 0.4
): ToolpathPoint[] {
  const points: ToolpathPoint[] = [];
  let index = 0;
  
  // Starting point (rapid down to origin clearance)
  points.push({ index: index++, type: "G0", x: 0, y: 0, z: 5.0, speed: 1800 });
  
  for (let layer = 0; layer < numLayers; layer++) {
    const z = (layer + 1) * layerHeight;
    const isEven = layer % 2 === 0;
    
    if (isEven) {
      // 0-degree layers: fibers parallel to X axis, spanning from Y=0 to Y=size
      for (let y = 0; y <= size; y += spacing) {
        const xStart = 0;
        const xEnd = size;
        const currentY = y;
        
        // Rapid travel to start of fiber
        points.push({ index: index++, type: "G0", x: xStart, y: currentY, z: z, speed: 2400 });
        // Slow plunge just before print
        points.push({ index: index++, type: "G1", x: xStart, y: currentY, z: z, speed: 600 });
        // Extrude filament
        points.push({ index: index++, type: "G1", x: xEnd, y: currentY, z: z, speed: 450 });
      }
    } else {
      // 90-degree layers: fibers parallel to Y axis, spanning from X=0 to X=size
      for (let x = 0; x <= size; x += spacing) {
        const yStart = 0;
        const yEnd = size;
        const currentX = x;
        
        // Rapid travel to start of fiber
        points.push({ index: index++, type: "G0", x: currentX, y: yStart, z: z, speed: 2400 });
        // Slow plunge
        points.push({ index: index++, type: "G1", x: currentX, y: yStart, z: z, speed: 600 });
        // Extrude filament
        points.push({ index: index++, type: "G1", x: currentX, y: yEnd, z: z, speed: 450 });
      }
    }
    
    // Retract/lift at layer end to look realistic
    points.push({ index: index++, type: "G0", x: size / 2, y: size / 2, z: z + 2.0, speed: 2400 });
  }
  
  return points;
}

/**
 * Preset 2: Double-Helix Spiral Vase (Variable diameter curves)
 * High density point-to-point feed moves.
 */
export function generateSpiralVasePreset(): ToolpathPoint[] {
  const points: ToolpathPoint[] = [];
  let index = 0;
  
  const totalHeight = 40.0;
  const layers = 160;
  const stepsPerLayer = 45;
  const maxRadius = 15.0;
  const center = { x: 15, y: 15 };
  
  // Starting point
  points.push({ index: index++, type: "G0", x: center.x + maxRadius, y: center.y, z: 0.1, speed: 2000 });
  
  for (let i = 0; i < layers * stepsPerLayer; i++) {
    const angle = (i / stepsPerLayer) * Math.PI * 2;
    const progress = i / (layers * stepsPerLayer);
    const z = progress * totalHeight;
    
    // Vase shape profile: starts narrow, swells out in center, tightens at neck, flares at lip
    const profileFactor = 0.5 + 0.4 * Math.sin(progress * Math.PI * 2.5) + 0.1 * Math.sin(progress * Math.PI * 10);
    const radius = maxRadius * profileFactor;
    
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    
    // Speed varies slightly with height and curvature to mimic printing dynamics
    const speed = 600 + Math.sin(angle * 3) * 120 + (1 - progress) * 150;
    
    points.push({
      index: index++,
      type: "G1",
      x: x,
      y: y,
      z: z,
      speed: Math.max(300, Math.round(speed))
    });
  }
  
  // Back to start/high clearance
  const finalZ = totalHeight + 5.0;
  points.push({ index: index++, type: "G0", x: center.x, y: center.y, z: finalZ, speed: 3000 });
  
  return points;
}

/**
 * Preset 3: CNC Machining Milling Pocket (Zigzag pocket mill with lift clearances)
 */
export function generateCNCPocketPreset(): ToolpathPoint[] {
  const points: ToolpathPoint[] = [];
  let index = 0;
  
  // Workpiece coordinates center at (0,0)
  // X from -25 to 25, Y from -25 to 25
  const size = 50;
  const stepOver = 2.5; 
  const safeZ = 6.0;
  const cutZ = -2.5; // Cutting depth
  
  // Start high at rapid motion
  points.push({ index: index++, type: "RAPID", x: -25, y: -25, z: safeZ, speed: 4000 });
  
  // Rapid to start Y=-25
  let cutting = false;
  
  for (let y = -25; y <= 25; y += stepOver) {
    if (!cutting) {
      // Rapid to beginning of cut column at safe height
      points.push({ index: index++, type: "RAPID", x: -25, y: y, z: safeZ, speed: 4000 });
      // Direct plunge (slow G1-like entry) to depth
      points.push({ index: index++, type: "PLUNGE", x: -25, y: y, z: cutZ, speed: 200 });
      cutting = true;
    }
    
    // Feed cut side-to-side (Alternating directions)
    const isYEvenOrdinal = Math.round((y + 25) / stepOver) % 2 === 0;
    const xDest = isYEvenOrdinal ? 25 : -25;
    
    points.push({ index: index++, type: "FEED", x: xDest, y: y, z: cutZ, speed: 1500 });
    
    // Stepover in Y
    if (y + stepOver <= 25) {
      const nextY = y + stepOver;
      points.push({ index: index++, type: "FEED", x: xDest, y: nextY, z: cutZ, speed: 1200 });
    }
  }
  
  // Retract back to safety
  points.push({ index: index++, type: "RAPID", x: 25, y: 25, z: safeZ, speed: 4000 });
  // Home position rapid
  points.push({ index: index++, type: "RAPID", x: 0, y: 0, z: safeZ + 15.0, speed: 4000 });
  
  return points;
}
