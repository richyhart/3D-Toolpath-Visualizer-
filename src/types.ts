export interface ToolpathPoint {
  index: number;
  type: string;    // 'G0', 'G1', 'Rapid', 'Feed', etc.
  x: number;
  y: number;
  z: number;
  speed: number;   // Speed/Feedrate
}

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

export interface ToolpathStats {
  pointCount: number;
  totalLength: number;
  estimatedDuration: number; // in seconds
  minSpeed: number;
  maxSpeed: number;
  boundingBox: BoundingBox;
  typeDistribution: Record<string, number>;
  averageSpeed: number;
}
