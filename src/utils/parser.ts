import { ToolpathPoint, ToolpathStats, BoundingBox } from "../types";

/**
 * Parses raw CSV string to ToolpathPoint array.
 * Cleans headers, handles multiple delimiters, and falls back to safe coordinates.
 */
export function parseToolpathCSV(rawText: string): ToolpathPoint[] {
  if (!rawText || rawText.trim() === "") {
    return [];
  }

  const lines = rawText.split(/\r?\n/);
  const parsedPoints: ToolpathPoint[] = [];
  let index = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (rawLine === "") continue;

    // Split on commas, semicolons, tabs, or bars
    const cols = rawLine.split(/[,;\t|]+/);
    if (cols.length < 4) continue; // Must have at least type, X, Y, Z

    const val0 = cols[0].trim();
    const val1 = cols[1].trim();
    const val2 = cols[2].trim();
    const val3 = cols[3].trim();
    const val4 = cols[4] ? cols[4].trim() : "";

    // Header Detection Rule: Skip if coordinates are highly non-numeric
    const isHeader = 
      isNaN(Number(val1)) || 
      isNaN(Number(val2)) || 
      isNaN(Number(val3)) ||
      val1.toLowerCase() === "x" || 
      val2.toLowerCase() === "y" || 
      val3.toLowerCase() === "z";
      
    if (isHeader) {
      continue; // Skip header row
    }

    const type = val0 || "G1";
    const x = Number(val1);
    const y = Number(val2);
    const z = Number(val3);
    const speed = val4 !== "" && !isNaN(Number(val4)) ? Number(val4) : 600.0; // default safe speed G1

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      continue; // Skip invalid geometry coordinates
    }

    parsedPoints.push({
      index: index++,
      type,
      x,
      y,
      z,
      speed
    });
  }

  return parsedPoints;
}

/**
 * Computes ToolpathStats from Point sequence.
 * Supports configurable speed metrics (mm/min or mm/s) for estimation of tool cycle duration.
 */
export function computeToolpathStats(points: ToolpathPoint[], speedUnit: "mm/min" | "mm/s" = "mm/s"): ToolpathStats {
  if (points.length === 0) {
    return {
      pointCount: 0,
      totalLength: 0,
      estimatedDuration: 0,
      minSpeed: 0,
      maxSpeed: 0,
      boundingBox: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, sizeX: 0, sizeY: 0, sizeZ: 0 },
      typeDistribution: {},
      averageSpeed: 0
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  let totalLength = 0;
  let estimatedDuration = 0;
  let totalSpeed = 0;
  let speedCount = 0;
  
  const speeds = points.map(p => p.speed).filter(s => s > 0);
  const minSpeed = speeds.length > 0 ? Math.min(...speeds) : 0;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

  const typeDistribution: Record<string, number> = {};

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    
    // Bounds check
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;

    // Movement types count
    const cleanType = p.type.toUpperCase().trim();
    typeDistribution[cleanType] = (typeDistribution[cleanType] || 0) + 1;

    if (p.speed > 0) {
      totalSpeed += p.speed;
      speedCount++;
    }

    // Direct segmentation
    if (i > 0) {
      const prev = points[i - 1];
      const dist = Math.sqrt(
        Math.pow(p.x - prev.x, 2) +
        Math.pow(p.y - prev.y, 2) +
        Math.pow(p.z - prev.z, 2)
      );
      totalLength += dist;

      // Speed unit conversion
      const speedValue = p.speed > 0 ? p.speed : 600; // prevent divide by polar zero
      const speedInSeconds = speedUnit === "mm/min" ? speedValue / 60 : speedValue;
      
      if (speedInSeconds > 0) {
        estimatedDuration += dist / speedInSeconds;
      }
    }
  }

  // Fallbacks if single coordinate limit
  const isFiniteOrZero = (val: number) => isFinite(val) ? val : 0;

  const bbox: BoundingBox = {
    minX: isFiniteOrZero(minX),
    maxX: isFiniteOrZero(maxX),
    minY: isFiniteOrZero(minY),
    maxY: isFiniteOrZero(maxY),
    minZ: isFiniteOrZero(minZ),
    maxZ: isFiniteOrZero(maxZ),
    sizeX: isFiniteOrZero(maxX - minX),
    sizeY: isFiniteOrZero(maxY - minY),
    sizeZ: isFiniteOrZero(maxZ - minZ)
  };

  return {
    pointCount: points.length,
    totalLength: parseFloat(totalLength.toFixed(2)),
    estimatedDuration: parseFloat(estimatedDuration.toFixed(1)),
    minSpeed: parseFloat(minSpeed.toFixed(1)),
    maxSpeed: parseFloat(maxSpeed.toFixed(1)),
    boundingBox: bbox,
    typeDistribution,
    averageSpeed: speedCount > 0 ? parseFloat((totalSpeed / speedCount).toFixed(1)) : 0
  };
}
