import { useEffect, useRef, useState, useMemo, MouseEvent, PointerEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Ruler, X, Move, Compass, Camera, Eye } from "lucide-react";
import { ToolpathPoint, BoundingBox } from "../types";

interface ThreeCanvasProps {
  points: ToolpathPoint[];
  boundingBox: BoundingBox | null;
  currentSegmentIndex: number;
  onSelectPoint: (point: ToolpathPoint | null) => void;
  colorScheme: "speed" | "type";
  showGrid: boolean;
  showBoundingBox: boolean;
  showNozzle: boolean;
  onHoverPoint: (point: ToolpathPoint | null) => void;
  playbackProgress: number; // 0 to 1 representing position along the path
  cameraMode: "perspective" | "orthographic";
  setCameraMode: (mode: "perspective" | "orthographic") => void;
  showNumbers: boolean;
  gridSpacing: 1 | 5 | 10;
  speedColors?: string[];
  measurementPointA?: ToolpathPoint | null;
  measurementPointB?: ToolpathPoint | null;
  isMeasurementMode: boolean;
  setIsMeasurementMode: (val: boolean) => void;
  setMeasurementPointA: (point: ToolpathPoint | null) => void;
  setMeasurementPointB: (point: ToolpathPoint | null) => void;
  selectedPoint: ToolpathPoint | null;
  speedUnit?: "mm/min" | "mm/s";
  speedOpacities?: number[];
  cameraResetToken?: string;
}

interface DoubleVerticalSliderProps {
  uniqueZs: number[];
  minZIndex: number;
  maxZIndex: number;
  setMinZIndex: (val: number) => void;
  setMaxZIndex: (val: number) => void;
}

function DoubleVerticalSlider({
  uniqueZs,
  minZIndex,
  maxZIndex,
  setMinZIndex,
  setMaxZIndex,
}: DoubleVerticalSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const total = uniqueZs.length;
  
  const minVal = minZIndex === -1 ? 0 : minZIndex;
  const maxVal = maxZIndex === -1 ? total - 1 : maxZIndex;

  const maxLimit = total > 1 ? total - 1 : 1;
  const minPct = (minVal / maxLimit) * 100;
  const maxPct = (maxVal / maxLimit) * 100;

  const [activeThumb, setActiveThumb] = useState<"min" | "max" | null>(null);

  const calculateIndexFromEvent = (clientY: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeY = 1 - (clientY - rect.top) / rect.height;
    const clampedY = Math.max(0, Math.min(1, relativeY));
    const rawVal = clampedY * maxLimit;
    return Math.round(rawVal);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    containerRef.current.setPointerCapture(e.pointerId);

    const targetIdx = calculateIndexFromEvent(e.clientY);
    
    const distToMin = Math.abs(targetIdx - minVal);
    const distToMax = Math.abs(targetIdx - maxVal);
    
    let thumbToDrag: "min" | "max" = "min";
    if (distToMax < distToMin) {
      thumbToDrag = "max";
    } else if (distToMin < distToMax) {
      thumbToDrag = "min";
    } else {
      if (minVal === maxVal) {
        if (minVal === 0) {
          thumbToDrag = "max";
        } else if (minVal === maxLimit) {
          thumbToDrag = "min";
        } else if (targetIdx > maxVal) {
          thumbToDrag = "max";
        } else if (targetIdx < minVal) {
          thumbToDrag = "min";
        } else {
          thumbToDrag = "max";
        }
      } else {
        if (targetIdx >= maxVal) {
          thumbToDrag = "max";
        } else {
          thumbToDrag = "min";
        }
      }
    }

    setActiveThumb(thumbToDrag);
    
    if (thumbToDrag === "min") {
      if (targetIdx <= maxVal) {
        setMinZIndex(targetIdx);
      } else {
        setMinZIndex(maxVal);
      }
    } else {
      if (targetIdx >= minVal) {
        setMaxZIndex(targetIdx);
      } else {
        setMaxZIndex(minVal);
      }
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!activeThumb) return;
    const targetIdx = calculateIndexFromEvent(e.clientY);

    if (activeThumb === "min") {
      if (targetIdx <= maxVal) {
        setMinZIndex(targetIdx);
      } else {
        setActiveThumb("max");
        setMaxZIndex(targetIdx);
      }
    } else if (activeThumb === "max") {
      if (targetIdx >= minVal) {
        setMaxZIndex(targetIdx);
      } else {
        setActiveThumb("min");
        setMinZIndex(targetIdx);
      }
    }
  };

  const handlePointerUp = () => {
    setActiveThumb(null);
  };

  return (
    <div className="flex flex-col items-center h-full py-1">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative w-7 h-72 bg-slate-900/60 hover:bg-slate-900/80 border border-slate-800 rounded-full cursor-ns-resize select-none touch-none flex justify-center transition-colors"
        title="Drag either selector to set the slice range"
      >
        {/* Track Line */}
        <div className="absolute top-3 bottom-3 w-1.5 bg-slate-850 rounded-full overflow-hidden">
          <div
            className="absolute left-0 right-0 bg-cyan-500 rounded-full opacity-80"
            style={{
              bottom: `${(minVal / maxLimit) * 100}%`,
              top: `${100 - (maxVal / maxLimit) * 100}%`,
            }}
          />
        </div>

        {/* Max Handle */}
        <div
          className={`absolute w-5 h-5 rounded-full border shadow-lg flex items-center justify-center transition-transform duration-75 ${
            activeThumb === "max"
              ? "bg-cyan-400 border-cyan-300 scale-125 shadow-cyan-500/30"
              : "bg-slate-700 hover:bg-slate-600 border-slate-600"
          }`}
          style={{
            bottom: `calc(${maxPct}% - 10px)`,
            zIndex: activeThumb === "max" ? 25 : minVal === maxVal && maxVal === 0 ? 20 : 10,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white opacity-90" />
        </div>

        {/* Min Handle */}
        <div
          className={`absolute w-5 h-5 rounded-full border shadow-lg flex items-center justify-center transition-transform duration-75 ${
            activeThumb === "min"
              ? "bg-cyan-400 border-cyan-300 scale-125 shadow-cyan-500/20"
              : "bg-slate-700 hover:bg-slate-600 border-slate-600"
          }`}
          style={{
            bottom: `calc(${minPct}% - 10px)`,
            zIndex: activeThumb === "min" ? 25 : minVal === maxVal && maxVal === maxLimit ? 20 : 10,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white opacity-90" />
        </div>
      </div>
      <div className="flex gap-2 mt-2 text-[8px] text-slate-500 uppercase font-bold tracking-wide select-none pointer-events-none">
        <span>min</span>
        <span>&bull;</span>
        <span>max</span>
      </div>
    </div>
  );
}

interface SingleVerticalSliderProps {
  uniqueZs: number[];
  maxZIndex: number;
  setMaxZIndex: (val: number) => void;
}

function SingleVerticalSlider({
  uniqueZs,
  maxZIndex,
  setMaxZIndex,
}: SingleVerticalSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const total = uniqueZs.length;
  
  const val = maxZIndex === -1 ? total - 1 : maxZIndex;
  const maxLimit = total > 1 ? total - 1 : 1;
  const pct = (val / maxLimit) * 100;

  const [activeDrag, setActiveDrag] = useState<boolean>(false);

  const calculateIndexFromEvent = (clientY: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeY = 1 - (clientY - rect.top) / rect.height;
    const clampedY = Math.max(0, Math.min(1, relativeY));
    const rawVal = clampedY * maxLimit;
    return Math.round(rawVal);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    containerRef.current.setPointerCapture(e.pointerId);
    setActiveDrag(true);
    const targetIdx = calculateIndexFromEvent(e.clientY);
    setMaxZIndex(targetIdx);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!activeDrag) return;
    const targetIdx = calculateIndexFromEvent(e.clientY);
    setMaxZIndex(targetIdx);
  };

  const handlePointerUp = () => {
    setActiveDrag(false);
  };

  return (
    <div className="flex flex-col items-center h-full py-1">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative w-7 h-72 bg-slate-900/60 hover:bg-slate-900/80 border border-slate-800 rounded-full cursor-ns-resize select-none touch-none flex justify-center transition-colors"
        title="Drag the selector to set the exact slice layer"
      >
        {/* Track Line */}
        <div className="absolute top-3 bottom-3 w-1.5 bg-slate-850 rounded-full overflow-hidden">
          <div
            className="absolute left-0 right-0 bg-cyan-500 rounded-full opacity-80"
            style={{
              bottom: "0%",
              height: `${pct}%`,
            }}
          />
        </div>

        {/* Handle */}
        <div
          className={`absolute w-5 h-5 rounded-full border shadow-lg flex items-center justify-center transition-transform duration-75 ${
            activeDrag
              ? "bg-cyan-400 border-cyan-300 scale-125 z-20 shadow-cyan-500/20"
              : "bg-slate-700 hover:bg-slate-600 border-slate-600 z-10"
          }`}
          style={{
            bottom: `calc(${pct}% - 10px)`,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white opacity-90" />
        </div>
      </div>
      <div className="mt-2 text-[8px] text-slate-500 uppercase font-bold tracking-wide select-none pointer-events-none">
        Layer
      </div>
    </div>
  );
}

export default function ThreeCanvas({
  points,
  boundingBox,
  currentSegmentIndex,
  onSelectPoint,
  colorScheme,
  showGrid,
  showBoundingBox,
  showNozzle,
  onHoverPoint,
  playbackProgress,
  cameraMode,
  setCameraMode,
  showNumbers,
  gridSpacing,
  speedColors,
  measurementPointA,
  measurementPointB,
  isMeasurementMode,
  setIsMeasurementMode,
  setMeasurementPointA,
  setMeasurementPointB,
  selectedPoint,
  speedUnit = "mm/s",
  speedOpacities,
  cameraResetToken,
}: ThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Keep refs of Three.js objects to update them dynamically without full recreation
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const nozzleRef = useRef<THREE.Mesh | null>(null);
  const pathLinesRef = useRef<THREE.LineSegments[]>([]);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const bboxHelperRef = useRef<THREE.BoxHelper | null>(null);
  const bboxMeshRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mouseRef = useRef<THREE.Vector2 | null>(null);
  const pointsMeshesRef = useRef<THREE.Points[]>([]);
  const startMarkerRef = useRef<THREE.Mesh | null>(null);
  const endMarkerRef = useRef<THREE.Mesh | null>(null);
  const axesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastResetTokenRef = useRef<string | null>(null);

  // Measurement tool Three.js visual objects
  const measureLineRef = useRef<THREE.Line | null>(null);
  const measureLineXRef = useRef<THREE.Line | null>(null);
  const measureLineYRef = useRef<THREE.Line | null>(null);
  const measureLineZRef = useRef<THREE.Line | null>(null);
  const measureMarkerARef = useRef<THREE.Mesh | null>(null);
  const measureMarkerBRef = useRef<THREE.Mesh | null>(null);

  // Projected 2D coordinates for point numbers
  const [projectedPoints, setProjectedPoints] = useState<{ index: number; x: number; y: number; val: string }[]>([]);

  // Projected 2D coordinates for measurement distance labels
  const [projectedMeasurements, setProjectedMeasurements] = useState<{
    axis: "X" | "Y" | "Z" | "Direct";
    x: number;
    y: number;
    val: string;
    colorClass: string;
  }[]>([]);

  const updateProjectedPositionsRef = useRef<() => void>();

  // Draggable selected coordinates popup position
  const [coordinatePos, setCoordinatePos] = useState<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  // Initialize position when selectedPoint changes from null
  useEffect(() => {
    if (selectedPoint) {
      setCoordinatePos({ x: 270, y: 56 });
    } else {
      setCoordinatePos(null);
    }
  }, [selectedPoint]);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!coordinatePos) return;
    if (!(e.target as HTMLElement).closest(".drag-handle")) {
      return;
    }
    // Prevent dragging when clicking a button/interactive element inside the handle
    if ((e.target as HTMLElement).closest("button")) {
      return;
    }
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch (err) {}
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: coordinatePos.x,
      posY: coordinatePos.y,
    };
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !coordinatePos) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    
    let newX = dragStartRef.current.posX + dx;
    let newY = dragStartRef.current.posY + dy;
    
    if (containerRef.current) {
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      newX = Math.max(10, Math.min(width - 120, newX));
      newY = Math.max(10, Math.min(height - 80, newY));
    }
    
    setCoordinatePos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    dragStartRef.current = null;
  };

  // Unique sorted Z axis coordinate heights grouped together (rounded slightly for grouping safety)
  const uniqueZs = useMemo(() => {
    const list = Array.from(new Set(points.map((p) => Number(p.z.toFixed(4)))));
    return list.sort((a, b) => a - b);
  }, [points]);

  // Unique sorted speed values
  const uniqueSpeeds = useMemo(() => {
    const list = Array.from(new Set(points.map((p) => Number(p.speed.toFixed(1)))));
    return list.sort((a, b) => a - b);
  }, [points]);

  const [minZIndex, setMinZIndex] = useState<number>(-1);
  const [maxZIndex, setMaxZIndex] = useState<number>(-1);
  const [zFilterMode, setZFilterMode] = useState<"cumulative" | "single">("cumulative");
  const [zGapMultiplier, setZGapMultiplier] = useState<number>(1.0);

  // Automatically clear filter when a new coordinate preset/file is loaded
  useEffect(() => {
    setMinZIndex(-1);
    setMaxZIndex(-1);
  }, [points]);

  // Determine actual coordinates list to trace visually based on the Z axis limit sliders
  const filteredPoints = useMemo(() => {
    return points.filter((p) => {
      if (uniqueZs.length === 0) return true;
      const pZ = Number(p.z.toFixed(4));
      
      if (zFilterMode === "single") {
        const valIndex = maxZIndex === -1 ? uniqueZs.length - 1 : maxZIndex;
        const selectedZ = uniqueZs[valIndex];
        if (selectedZ === undefined) return true;
        return Math.abs(pZ - selectedZ) < 0.0001;
      } else {
        // Range (Cumulative group) mode: allow selection of any group of Z layers
        const startIdx = minZIndex === -1 ? 0 : minZIndex;
        const endIdx = maxZIndex === -1 ? uniqueZs.length - 1 : maxZIndex;
        
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        
        const lowZ = uniqueZs[minIdx];
        const highZ = uniqueZs[maxIdx];
        
        if (lowZ === undefined || highZ === undefined) return true;
        return pZ >= lowZ - 0.0001 && pZ <= highZ + 0.0001;
      }
    });
  }, [points, minZIndex, maxZIndex, zFilterMode, uniqueZs]);

  // Screenshot Mode state: hides all on-canvas buttons, sliders, and endpoint markers for clean screenshots
  const [isScreenshotMode, setIsScreenshotMode] = useState(false);

  // Reactively update start/end marker and nozzle 3D visibility when screenshot mode toggles
  useEffect(() => {
    if (startMarkerRef.current) {
      startMarkerRef.current.visible = !isScreenshotMode;
    }
    if (endMarkerRef.current) {
      endMarkerRef.current.visible = !isScreenshotMode;
    }
    if (nozzleRef.current) {
      nozzleRef.current.visible = showNozzle && !isScreenshotMode;
    }
  }, [isScreenshotMode, showNozzle]);

  // Selective XY Angle Filter state (0°, 60°, 90°, 120°, Other)
  const [enabledAngles, setEnabledAngles] = useState<{
    deg0: boolean;
    deg60: boolean;
    deg90: boolean;
    deg120: boolean;
    degOther: boolean;
  }>({
    deg0: true,
    deg60: true,
    deg90: true,
    deg120: true,
    degOther: true,
  });

  const isAllAnglesActive = useMemo(() => {
    return enabledAngles.deg0 && enabledAngles.deg60 && enabledAngles.deg90 && enabledAngles.deg120 && enabledAngles.degOther;
  }, [enabledAngles]);

  const handleToggleAngle = (angleKey: "0" | "60" | "90" | "120" | "other") => {
    const keyMap = {
      "0": "deg0",
      "60": "deg60",
      "90": "deg90",
      "120": "deg120",
      other: "degOther",
    } as const;
    const targetProp = keyMap[angleKey];
    setEnabledAngles((prev) => ({
      ...prev,
      [targetProp]: !prev[targetProp],
    }));
  };

  // Helper function to calculate XY angle category by sampling 2 adjacent coordinates relative to the Y axis
  const getSegmentVectorAngleCategory = (
    pStart: ToolpathPoint,
    pEnd: ToolpathPoint,
    tol = 5.0
  ): "0" | "60" | "90" | "120" | "other" => {
    const dx = pEnd.x - pStart.x;
    const dy = pEnd.y - pStart.y;
    const len = Math.hypot(dx, dy);

    if (len < 0.001) {
      return "other";
    }

    // Angle of vector (dx, dy) relative to the Y axis line (atan2(dx, dy))
    const rad = Math.atan2(dx, dy);
    const deg = (rad * 180) / Math.PI;
    // Normalize undirected line orientation to [0, 180) degrees
    let norm = ((deg % 180) + 180) % 180;
    if (Math.abs(norm - 180) < 0.001) norm = 0;

    if (Math.abs(norm - 0) <= tol || Math.abs(norm - 180) <= tol) {
      return "0";
    }
    if (Math.abs(norm - 60) <= tol) {
      return "60";
    }
    if (Math.abs(norm - 90) <= tol) {
      return "90";
    }
    if (Math.abs(norm - 120) <= tol) {
      return "120";
    }

    return "other";
  };

  // Calculate segment count by angle category for filteredPoints
  const angleCounts = useMemo(() => {
    let cnt0 = 0;
    let cnt60 = 0;
    let cnt90 = 0;
    let cnt120 = 0;
    let cntOther = 0;

    for (let i = 0; i < filteredPoints.length - 1; i++) {
      const category = getSegmentVectorAngleCategory(filteredPoints[i], filteredPoints[i + 1]);
      if (category === "0") cnt0++;
      else if (category === "60") cnt60++;
      else if (category === "90") cnt90++;
      else if (category === "120") cnt120++;
      else cntOther++;
    }

    return { cnt0, cnt60, cnt90, cnt120, cntOther };
  }, [filteredPoints]);

  // Mapping speed colors using dynamically-sized discrete solid colors with NO continuous interpolation
  const getSpeedColor = (speed: number, min: number, max: number): THREE.Color => {
    const color = new THREE.Color();
    const activeColors = speedColors && speedColors.length > 0 ? speedColors : [
      "#3b82f6", // Cool Blue
      "#06b6d4", // Cool Teal
      "#10b981", // Speed Green
      "#eab308", // Medium Gold
      "#ef4444", // Fast Red
    ];
    
    const count = activeColors.length;

    // Case 1: Less than or equal to 6 unique speeds -> direct 1:1 speed mapping
    if (uniqueSpeeds.length <= 6 && uniqueSpeeds.length > 0) {
      const sVal = Number(speed.toFixed(1));
      let idx = uniqueSpeeds.findIndex(u => Number(u.toFixed(1)) === sVal);
      if (idx === -1) {
        // Fallback to closest match
        let minDiff = Infinity;
        idx = 0;
        for (let i = 0; i < uniqueSpeeds.length; i++) {
          const diff = Math.abs(uniqueSpeeds[i] - speed);
          if (diff < minDiff) {
            minDiff = diff;
            idx = i;
          }
        }
      }
      color.set(activeColors[Math.min(idx, count - 1)] || "#cccccc");
      return color;
    }

    // Case 2: Greater than 6 unique speeds -> map based on relative factor of range (dynamic buckets)
    const range = max - min;
    const factor = range > 0 ? (speed - min) / range : 0.5;
    const idx = Math.min(Math.floor(factor * count), count - 1);
    color.set(activeColors[idx] || "#cccccc");
    return color;
  };

  const getSpeedIndex = (speed: number, min: number, max: number): number => {
    const activeColors = speedColors && speedColors.length > 0 ? speedColors : [
      "#3b82f6",
      "#06b6d4",
      "#10b981",
      "#eab308",
      "#ef4444",
    ];
    const count = activeColors.length;

    if (uniqueSpeeds.length <= 6 && uniqueSpeeds.length > 0) {
      const sVal = Number(speed.toFixed(1));
      let idx = uniqueSpeeds.findIndex(u => Number(u.toFixed(1)) === sVal);
      if (idx === -1) {
        let minDiff = Infinity;
        idx = 0;
        for (let i = 0; i < uniqueSpeeds.length; i++) {
          const diff = Math.abs(uniqueSpeeds[i] - speed);
          if (diff < minDiff) {
            minDiff = diff;
            idx = i;
          }
        }
      }
      return Math.min(idx, count - 1);
    }

    const range = max - min;
    const factor = range > 0 ? (speed - min) / range : 0.5;
    const idx = Math.min(Math.floor(factor * count), count - 1);
    return idx;
  };

  // Mapping Z axis layer colors
  const getZColor = (z: number): THREE.Color => {
    const roundedZ = Number(z.toFixed(4));
    const index = uniqueZs.findIndex((v) => Math.abs(v - roundedZ) < 0.0001);
    if (index === -1) return new THREE.Color("#06b6d4"); // Default fallback
    
    // Cyclical set of 8 premium high-contrast colors to show distinct bands
    const palette = [
      "#3b82f6", // Blue
      "#ec4899", // Pink
      "#10b981", // Emerald Green
      "#a855f7", // Purple
      "#eab308", // Yellow / Gold
      "#f97316", // Orange
      "#06b6d4", // Cyan
      "#84cc16", // Lime
    ];
    
    const colorHex = palette[index % palette.length];
    return new THREE.Color(colorHex);
  };

  // 1. Initialize Scene, Camera, Renderer, Controls
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Create Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f172a"); // Dark slate slate-900 background
    sceneRef.current = scene;

    // Set Up Cameras with custom upright perspective (Z points UP)
    const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
    
    const persCam = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    persCam.up.set(0, 0, 1);
    persCam.position.set(45, -45, 45);
    perspectiveCameraRef.current = persCam;

    const frustumSize = 80;
    const orthoCam = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );
    orthoCam.up.set(0, 0, 1);
    orthoCam.position.set(45, -45, 45);
    orthographicCameraRef.current = orthoCam;

    const initialCamera = cameraMode === "perspective" ? persCam : orthoCam;
    cameraRef.current = initialCamera;

    // Create Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    // Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(20, 40, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x3b82f6, 0.4); // soft blue fill light
    dirLight2.position.set(-20, -40, -50);
    scene.add(dirLight2);

    // Set Up Controls
    const controls = new OrbitControls(initialCamera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI / 2 + 0.1; // Limit panning too far below grid floor
    controls.addEventListener("change", () => {
      if (updateProjectedPositionsRef.current) {
        updateProjectedPositionsRef.current();
      }
    });
    controlsRef.current = controls;

    // Custom wheel handler to require Ctrl key for zooming
    const canvasElement = renderer.domElement;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        // If CTRL is not pressed, stop immediate propagation so OrbitControls doesn't zoom.
        // Also do NOT call preventDefault(), so that the event propagates and scrolls the page.
        event.stopImmediatePropagation();
      }
    };
    canvasElement.addEventListener("wheel", handleWheel, { capture: true, passive: false });

    // Raycaster & Mouse tracking for toolpath interactions
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.5 };
    raycasterRef.current = raycaster;
    const mouse = new THREE.Vector2();
    mouseRef.current = mouse;

    // Golden Cone Nozzer indicator
    const nozzleGeometry = new THREE.ConeGeometry(1.2, 3.5, 12);
    nozzleGeometry.rotateX(Math.PI); // rotate so the cone point points down
    nozzleGeometry.translate(0, 0, 1.75); // offsets base so nozzle tip sits exactly at vertex
    const nozzleMaterial = new THREE.MeshStandardMaterial({
      color: 0xeab308, // rich bronze amber-500
      roughness: 0.2,
      metalness: 0.8,
    });
    const nozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
    nozzle.visible = showNozzle;
    scene.add(nozzle);
    nozzleRef.current = nozzle;

    // Custom drawing helper for the floating 3D axes orientation gizmo
    const drawAxesGizmo = () => {
      const canvas = axesCanvasRef.current;
      const camera = cameraRef.current;
      if (!canvas || !camera) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const len = 12; // length of axes line in pixels

      // Define direction vectors (Z is up in our CNC/3D printing scene)
      // Red = X, Green = Y, Blue = Z
      const axes = [
        { dir: new THREE.Vector3(1, 0, 0), color: "#ef4444", label: "X" }, // red-500
        { dir: new THREE.Vector3(0, 1, 0), color: "#22c55e", label: "Y" }, // green-500
        { dir: new THREE.Vector3(0, 0, 1), color: "#3b82f6", label: "Z" }, // blue-500
      ];

      // Extract camera's view rotation matrix
      const viewMatrixInverse = camera.matrixWorldInverse;
      const rotMatrix = new THREE.Matrix4().extractRotation(viewMatrixInverse);

      // Rotate each axis and store projected 2D coordinates and depth
      const projected = axes.map((a) => {
        const rotated = a.dir.clone().applyMatrix4(rotMatrix);
        return {
          x: cx + rotated.x * len,
          y: cy - rotated.y * len, // flip y since canvas 2D draws downwards
          z: rotated.z,
          color: a.color,
          label: a.label
        };
      });

      // Sort by depth (draw back-most things first)
      projected.sort((a, b) => a.z - b.z);

      // Draw lines and labels
      projected.forEach((a) => {
        ctx.beginPath();
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.moveTo(cx, cy);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = a.color;
        ctx.arc(a.x, a.y, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const dx = a.x - cx;
        const dy = a.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const offsetFactor = 1.45;
        const lx = cx + (dx / dist) * (len * offsetFactor);
        const ly = cy + (dy / dist) * (len * offsetFactor);

        ctx.fillText(a.label, lx, ly);
      });
    };

    // Animation Loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      drawAxesGizmo();
    };
    animate();

    // Resize Handling
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      const aspect = width / height;

      if (perspectiveCameraRef.current) {
        perspectiveCameraRef.current.aspect = aspect;
        perspectiveCameraRef.current.updateProjectionMatrix();
      }

      if (orthographicCameraRef.current) {
        const frustumSize = 80;
        orthographicCameraRef.current.left = (frustumSize * aspect) / -2;
        orthographicCameraRef.current.right = (frustumSize * aspect) / 2;
        orthographicCameraRef.current.top = frustumSize / 2;
         orthographicCameraRef.current.bottom = frustumSize / -2;
        orthographicCameraRef.current.updateProjectionMatrix();
      }

      rendererRef.current.setSize(width, height);
    };

    let resizeFrameId: number;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrameId);
      resizeFrameId = requestAnimationFrame(() => {
        handleResize();
      });
    });
    resizeObserver.observe(containerRef.current);

    // Cleanup functions
    return () => {
      cancelAnimationFrame(animationId);
      cancelAnimationFrame(resizeFrameId);
      resizeObserver.disconnect();
      canvasElement.removeEventListener("wheel", handleWheel, { capture: true });
      if (controlsRef.current) controlsRef.current.dispose();
      // Dispose materials/geometries
      nozzleGeometry.dispose();
      nozzleMaterial.dispose();
    };
  }, []);

  // 1b. Update camera mode on change dynamically, keeping spatial sync
  useEffect(() => {
    if (!controlsRef.current || !perspectiveCameraRef.current || !orthographicCameraRef.current) return;

    const currentCamera = cameraRef.current;
    const newCamera = cameraMode === "perspective" ? perspectiveCameraRef.current : orthographicCameraRef.current;

    if (currentCamera && currentCamera !== newCamera) {
      // Synchronize exact camera locations and spatial structures before rotation
      newCamera.position.copy(currentCamera.position);
      newCamera.rotation.copy(currentCamera.rotation);
      newCamera.zoom = currentCamera.zoom;
      newCamera.updateProjectionMatrix();

      cameraRef.current = newCamera;
      controlsRef.current.object = newCamera;
      controlsRef.current.update();
    }
  }, [cameraMode]);

  // 1c. Center camera target to the loaded bounding box center only when a new design is loaded
  useEffect(() => {
    if (controlsRef.current && cameraRef.current && boundingBox) {
      if (lastResetTokenRef.current !== cameraResetToken) {
        const targetZ = boundingBox.sizeZ / 4;
        controlsRef.current.target.set(0, 0, targetZ);
        cameraRef.current.position.set(45, -45, 45 + targetZ);
        controlsRef.current.update();
        lastResetTokenRef.current = cameraResetToken || null;
      }
    }
  }, [cameraResetToken, boundingBox]);

  // 2. Load / Update Toolpath Lines & Point Geometries
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || filteredPoints.length === 0) return;

    // Clean up previous lines or box helpers from the scene before rebuilding
    if (pathLinesRef.current) {
      pathLinesRef.current.forEach((line) => scene.remove(line));
      pathLinesRef.current = [];
    }
    if (pointsMeshesRef.current) {
      pointsMeshesRef.current.forEach((mesh) => scene.remove(mesh));
      pointsMeshesRef.current = [];
    }
    if (bboxMeshRef.current) scene.remove(bboxMeshRef.current);
    if (startMarkerRef.current) scene.remove(startMarkerRef.current);
    if (endMarkerRef.current) scene.remove(endMarkerRef.current);

    // Find min and max speed
    const speeds = filteredPoints.map(p => p.speed).filter(s => s > 0);
    const minSpeed = Math.min(...speeds, 1);
    const maxSpeed = Math.max(...speeds, 100);

    const activeColorsCount = speedColors && speedColors.length > 0 ? speedColors.length : 5;

    // Create positions and colors grouped by speed level index
    const segmentsBySpeed: { positions: number[]; colors: number[] }[] = Array.from(
      { length: activeColorsCount },
      () => ({ positions: [], colors: [] })
    );

    const pointsBySpeed: { positions: number[]; colors: number[]; originalIndices: number[] }[] = Array.from(
      { length: activeColorsCount },
      () => ({ positions: [], colors: [], originalIndices: [] })
    );

    // Calculate center offsets to keep geometry centered around (0,0) in grid helper
    const centerOffsetX = boundingBox ? (boundingBox.minX + boundingBox.maxX) / 2 : 0;
    const centerOffsetY = boundingBox ? (boundingBox.minY + boundingBox.maxY) / 2 : 0;
    const centerOffsetZ = boundingBox ? boundingBox.minZ : 0; // Bed surface sits at Z=0

    // Track point indices that belong to visible line segments
    const visiblePointIndices = new Set<number>();

    // Group segments by speed index & angle filter
    for (let i = 0; i < filteredPoints.length - 1; i++) {
      const pStart = filteredPoints[i];
      const pEnd = filteredPoints[i + 1];

      const category = getSegmentVectorAngleCategory(pStart, pEnd);

      let isVisible = true;
      if (!isAllAnglesActive) {
        if (category === "0" && !enabledAngles.deg0) isVisible = false;
        if (category === "60" && !enabledAngles.deg60) isVisible = false;
        if (category === "90" && !enabledAngles.deg90) isVisible = false;
        if (category === "120" && !enabledAngles.deg120) isVisible = false;
        if (category === "other" && !enabledAngles.degOther) isVisible = false;
      }

      if (isVisible) {
        visiblePointIndices.add(i);
        visiblePointIndices.add(i + 1);

        const x1 = pStart.x - centerOffsetX;
        const y1 = pStart.y - centerOffsetY;
        const z1 = (pStart.z - centerOffsetZ) * zGapMultiplier;

        const x2 = pEnd.x - centerOffsetX;
        const y2 = pEnd.y - centerOffsetY;
        const z2 = (pEnd.z - centerOffsetZ) * zGapMultiplier;

        let c: THREE.Color;
        if (colorScheme === "speed") {
          c = getSpeedColor(pEnd.speed, minSpeed, maxSpeed);
        } else {
          c = getZColor(pEnd.z);
        }

        const speedIdx = getSpeedIndex(pEnd.speed, minSpeed, maxSpeed);
        const speedGroup = segmentsBySpeed[speedIdx];
        if (speedGroup) {
          speedGroup.positions.push(x1, y1, z1);
          speedGroup.positions.push(x2, y2, z2);
          speedGroup.colors.push(c.r, c.g, c.b);
          speedGroup.colors.push(c.r, c.g, c.b);
        }
      }
    }

    // Group points by speed index (only include points involved in visible segments, or all if all angles enabled)
    for (let i = 0; i < filteredPoints.length; i++) {
      if (!isAllAnglesActive && !visiblePointIndices.has(i)) {
        continue;
      }

      const p = filteredPoints[i];
      const px = p.x - centerOffsetX;
      const py = p.y - centerOffsetY;
      const pz = (p.z - centerOffsetZ) * zGapMultiplier;

      let c: THREE.Color;
      if (colorScheme === "speed") {
        c = getSpeedColor(p.speed, minSpeed, maxSpeed);
      } else {
        c = getZColor(p.z);
      }

      const speedIdx = getSpeedIndex(p.speed, minSpeed, maxSpeed);
      const speedGroup = pointsBySpeed[speedIdx];
      if (speedGroup) {
        speedGroup.positions.push(px, py, pz);
        speedGroup.colors.push(c.r, c.g, c.b);
        speedGroup.originalIndices.push(i);
      }
    }

    // Build line segments for each speed band
    const pathLines: THREE.LineSegments[] = [];
    segmentsBySpeed.forEach((group, speedIdx) => {
      if (group.positions.length === 0) return;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(group.positions, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(group.colors, 3));

      const op = speedOpacities && speedOpacities[speedIdx] !== undefined ? speedOpacities[speedIdx] : 1.0;

      const lineMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2,
        transparent: true,
        opacity: op,
        visible: op > 0,
      });

      const pathLine = new THREE.LineSegments(geo, lineMaterial);
      scene.add(pathLine);
      pathLines.push(pathLine);
    });
    pathLinesRef.current = pathLines;

    // Build points representation for each speed band
    const pointsMeshes: THREE.Points[] = [];
    pointsBySpeed.forEach((group, speedIdx) => {
      if (group.positions.length === 0) return;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(group.positions, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(group.colors, 3));

      const op = speedOpacities && speedOpacities[speedIdx] !== undefined ? speedOpacities[speedIdx] : 1.0;

      const pointsMaterial = new THREE.PointsMaterial({
        size: cameraMode === "perspective" ? 0.0001 : 3.5,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: cameraMode === "perspective" ? 0 : 0.8 * op,
        visible: op > 0,
      });

      const mesh = new THREE.Points(geo, pointsMaterial);
      mesh.userData = { originalIndices: group.originalIndices };
      scene.add(mesh);
      pointsMeshes.push(mesh);
    });
    pointsMeshesRef.current = pointsMeshes;

    // Add distinct Start & End Toolpath Terminus Spheres (Emerald Green for start, Crimson Red for end)
    if (filteredPoints.length > 0) {
      // Scale markers dynamically based on the model geometry bounding dimensions (make start and end node smaller)
      const markerSize = Math.max(0.2, Math.min(0.6, boundingBox ? (boundingBox.sizeX + boundingBox.sizeY) / 2 * 0.008 : 0.3));
      
      const startPoint = filteredPoints[0];
      const startGeo = new THREE.SphereGeometry(markerSize, 16, 16);
      const startMat = new THREE.MeshPhongMaterial({
        color: 0x10b981, // Emerald green
        emissive: 0x064e43,
        shininess: 90,
      });
      const startMesh = new THREE.Mesh(startGeo, startMat);
      startMesh.position.set(
        startPoint.x - centerOffsetX,
        startPoint.y - centerOffsetY,
        (startPoint.z - centerOffsetZ) * zGapMultiplier
      );
      startMesh.visible = !isScreenshotMode;
      scene.add(startMesh);
      startMarkerRef.current = startMesh;

      const endPoint = filteredPoints[filteredPoints.length - 1];
      const endGeo = new THREE.SphereGeometry(markerSize, 16, 16);
      const endMat = new THREE.MeshPhongMaterial({
        color: 0xef4444, // Crimson Red
        emissive: 0x7f1d1d,
        shininess: 90,
      });
      const endMesh = new THREE.Mesh(endGeo, endMat);
      endMesh.position.set(
        endPoint.x - centerOffsetX,
        endPoint.y - centerOffsetY,
        (endPoint.z - centerOffsetZ) * zGapMultiplier
      );
      endMesh.visible = !isScreenshotMode;
      scene.add(endMesh);
      endMarkerRef.current = endMesh;
    }
  }, [filteredPoints, colorScheme, boundingBox, showBoundingBox, cameraMode, speedColors, speedOpacities, zGapMultiplier, enabledAngles, isAllAnglesActive, isScreenshotMode]);

  // 2b. Load / Update Measurement Line & Marker Geometries in 3D Space
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !boundingBox) return;

    // Clean up previous measurement visual helpers
    if (measureLineRef.current) {
      scene.remove(measureLineRef.current);
      measureLineRef.current = null;
    }
    if (measureLineXRef.current) {
      scene.remove(measureLineXRef.current);
      measureLineXRef.current = null;
    }
    if (measureLineYRef.current) {
      scene.remove(measureLineYRef.current);
      measureLineYRef.current = null;
    }
    if (measureLineZRef.current) {
      scene.remove(measureLineZRef.current);
      measureLineZRef.current = null;
    }
    if (measureMarkerARef.current) {
      scene.remove(measureMarkerARef.current);
      measureMarkerARef.current = null;
    }
    if (measureMarkerBRef.current) {
      scene.remove(measureMarkerBRef.current);
      measureMarkerBRef.current = null;
    }

    const centerOffsetX = boundingBox ? (boundingBox.minX + boundingBox.maxX) / 2 : 0;
    const centerOffsetY = boundingBox ? (boundingBox.minY + boundingBox.maxY) / 2 : 0;
    const centerOffsetZ = boundingBox ? boundingBox.minZ : 0; // Bed surface sits at Z=0

    const markerSize = Math.max(0.2, Math.min(0.6, boundingBox ? (boundingBox.sizeX + boundingBox.sizeY) / 2 * 0.008 : 0.3));

    // Render Marker for Point A
    if (measurementPointA) {
      const geoA = new THREE.SphereGeometry(markerSize, 16, 16);
      const matA = new THREE.MeshPhongMaterial({
        color: 0x22d3ee, // Bright Cyan / Sky Blue
        emissive: 0x0891b2,
        shininess: 100,
        flatShading: true,
      });
      const meshA = new THREE.Mesh(geoA, matA);
      meshA.position.set(
        measurementPointA.x - centerOffsetX,
        measurementPointA.y - centerOffsetY,
        (measurementPointA.z - centerOffsetZ) * zGapMultiplier
      );
      scene.add(meshA);
      measureMarkerARef.current = meshA;
    }

    // Render Marker for Point B
    if (measurementPointB) {
      const geoB = new THREE.SphereGeometry(markerSize, 16, 16);
      const matB = new THREE.MeshPhongMaterial({
        color: 0xfacc15, // Bright Yellow / Amber
        emissive: 0xca8a04,
        shininess: 100,
        flatShading: true,
      });
      const meshB = new THREE.Mesh(geoB, matB);
      meshB.position.set(
        measurementPointB.x - centerOffsetX,
        measurementPointB.y - centerOffsetY,
        (measurementPointB.z - centerOffsetZ) * zGapMultiplier
      );
      scene.add(meshB);
      measureMarkerBRef.current = meshB;
    }

    // Render connecting dashed line between Point A and Point B
    if (measurementPointA && measurementPointB) {
      const x1 = measurementPointA.x - centerOffsetX;
      const y1 = measurementPointA.y - centerOffsetY;
      const z1 = (measurementPointA.z - centerOffsetZ) * zGapMultiplier;

      const x2 = measurementPointB.x - centerOffsetX;
      const y2 = measurementPointB.y - centerOffsetY;
      const z2 = (measurementPointB.z - centerOffsetZ) * zGapMultiplier;

      // Direct direct-line connection
      const linePoints = [];
      linePoints.push(new THREE.Vector3(x1, y1, z1));
      linePoints.push(new THREE.Vector3(x2, y2, z2));

      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x38bdf8, // Sky Blue
        dashSize: 1.0,
        gapSize: 0.5,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      scene.add(line);
      measureLineRef.current = line;

      // 1. X Axis Delta component path segment: (x1, y1, z1) -> (x2, y1, z1)
      const ptsX = [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y1, z1)];
      const geoX = new THREE.BufferGeometry().setFromPoints(ptsX);
      const matX = new THREE.LineDashedMaterial({
        color: 0xef4444, // Red for X
        dashSize: 0.6,
        gapSize: 0.3,
      });
      const lineX = new THREE.Line(geoX, matX);
      lineX.computeLineDistances();
      scene.add(lineX);
      measureLineXRef.current = lineX;

      // 2. Y Axis Delta component path segment: (x2, y1, z1) -> (x2, y2, z1)
      const ptsY = [new THREE.Vector3(x2, y1, z1), new THREE.Vector3(x2, y2, z1)];
      const geoY = new THREE.BufferGeometry().setFromPoints(ptsY);
      const matY = new THREE.LineDashedMaterial({
        color: 0x22c55e, // Green for Y
        dashSize: 0.6,
        gapSize: 0.3,
      });
      const lineY = new THREE.Line(geoY, matY);
      lineY.computeLineDistances();
      scene.add(lineY);
      measureLineYRef.current = lineY;

      // 3. Z Axis Delta component path segment: (x2, y2, z1) -> (x2, y2, z2)
      const ptsZ = [new THREE.Vector3(x2, y2, z1), new THREE.Vector3(x2, y2, z2)];
      const geoZ = new THREE.BufferGeometry().setFromPoints(ptsZ);
      const matZ = new THREE.LineDashedMaterial({
        color: 0x06b6d4, // Cyan for Z
        dashSize: 0.6,
        gapSize: 0.3,
      });
      const lineZ = new THREE.Line(geoZ, matZ);
      lineZ.computeLineDistances();
      scene.add(lineZ);
      measureLineZRef.current = lineZ;
    }
  }, [measurementPointA, measurementPointB, boundingBox, zGapMultiplier]);

  // 3. Dynamic Grid Spacing & Visibility updates
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (gridHelperRef.current) {
      scene.remove(gridHelperRef.current);
      gridHelperRef.current.geometry.dispose();
      (gridHelperRef.current.material as THREE.Material).dispose();
      gridHelperRef.current = null;
    }

    if (showGrid) {
      const size = 200;
      const divisions = Math.round(size / gridSpacing);
      const gridHelper = new THREE.GridHelper(size, divisions, "#06b6d4", "#334155"); // Cyan center axes, Slate slate-700 segments
      gridHelper.rotateX(Math.PI / 2); // z is up
      scene.add(gridHelper);
      gridHelperRef.current = gridHelper;
    }
  }, [showGrid, gridSpacing]);

  useEffect(() => {
    if (nozzleRef.current) {
      nozzleRef.current.visible = showNozzle;
    }
  }, [showNozzle]);

  // Projection logic for coordinate indices numbers, XYZ axes orientation labels, and point measurement guides
  updateProjectedPositionsRef.current = () => {
    if (!cameraRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const halfW = width / 2;
    const halfH = height / 2;
    const tempV = new THREE.Vector3();

    // 1. Coordinates point numbers
    if (showNumbers && filteredPoints && filteredPoints.length > 0 && boundingBox) {
      const centerOffsetX = (boundingBox.minX + boundingBox.maxX) / 2;
      const centerOffsetY = (boundingBox.minY + boundingBox.maxY) / 2;
      const centerOffsetZ = boundingBox.minZ;

      // Cap the displayed labels at 150 points maximum to prevent browser lag.
      // We step cleanly through the coordinates.
      const step = Math.max(1, Math.ceil(filteredPoints.length / 150));
      const list: { index: number; x: number; y: number; val: string }[] = [];

      for (let i = 0; i < filteredPoints.length; i += step) {
        const p = filteredPoints[i];
        tempV.set(
          p.x - centerOffsetX,
          p.y - centerOffsetY,
          (p.z - centerOffsetZ) * zGapMultiplier
        );
        tempV.project(cameraRef.current);

        // Verify the point is in front of camera lens clipping frustum
        const inFront = tempV.z >= -1 && tempV.z <= 1;
        if (!inFront) continue;

        const x = (tempV.x * halfW) + halfW;
        const y = -(tempV.y * halfH) + halfH;

        // Keep tags inside viewport with safe margins
        if (x >= 12 && x <= width - 12 && y >= 12 && y <= height - 12) {
          list.push({
            index: p.index,
            x,
            y,
            val: `${p.index}`,
          });
        }
      }
      setProjectedPoints(list);
    } else {
      if (projectedPoints.length > 0) setProjectedPoints([]);
    }

    // 2. Midpoints of Delta Segments for active Point-to-Point measurement
    if (measurementPointA && measurementPointB && boundingBox) {
      const centerOffsetX = (boundingBox.minX + boundingBox.maxX) / 2;
      const centerOffsetY = (boundingBox.minY + boundingBox.maxY) / 2;
      const centerOffsetZ = boundingBox.minZ;

      const p1 = measurementPointA;
      const p2 = measurementPointB;

      // Positions matching actual visual rendering in 3D (offset and scaled Z spacing gap)
      const X1 = p1.x - centerOffsetX;
      const Y1 = p1.y - centerOffsetY;
      const Z1 = (p1.z - centerOffsetZ) * zGapMultiplier;

      const X2 = p2.x - centerOffsetX;
      const Y2 = p2.y - centerOffsetY;
      const Z2 = (p2.z - centerOffsetZ) * zGapMultiplier;

      const listM: {
        axis: "X" | "Y" | "Z" | "Direct";
        x: number;
        y: number;
        val: string;
        colorClass: string;
      }[] = [];

      // We define 4 midpoints corresponding to: Direct connecting line, X offset, Y offset, Z offset
      const midPoints = [
        {
          axis: "Direct" as const,
          pos: new THREE.Vector3((X1 + X2) / 2, (Y1 + Y2) / 2, (Z1 + Z2) / 2),
          val: `D: ${Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2)).toFixed(3)} mm`,
          colorClass: "bg-indigo-950/95 text-white border-indigo-400/80 shadow-md font-bold px-1.5 py-0.5 rounded text-[12px] tracking-wider",
        },
        {
          axis: "X" as const,
          pos: new THREE.Vector3((X1 + X2) / 2, Y1, Z1),
          val: `dX: ${Math.abs(p1.x - p2.x).toFixed(2)} mm`,
          colorClass: "bg-rose-950/95 text-rose-300 border-rose-500/60 shadow-sm font-medium px-1 py-0.5 rounded text-[12px]",
        },
        {
          axis: "Y" as const,
          pos: new THREE.Vector3(X2, (Y1 + Y2) / 2, Z1),
          val: `dY: ${Math.abs(p1.y - p2.y).toFixed(2)} mm`,
          colorClass: "bg-emerald-950/95 text-emerald-300 border-emerald-500/60 shadow-sm font-medium px-1 py-0.5 rounded text-[12px]",
        },
        {
          axis: "Z" as const,
          pos: new THREE.Vector3(X2, Y2, (Z1 + Z2) / 2),
          val: `dZ: ${Math.abs(p1.z - p2.z).toFixed(2)} mm`,
          colorClass: "bg-cyan-950/95 text-cyan-300 border-cyan-500/60 shadow-sm font-medium px-1 py-0.5 rounded text-[12px]",
        },
      ];

      for (const item of midPoints) {
        tempV.copy(item.pos).project(cameraRef.current);
        const inFront = tempV.z >= -1 && tempV.z <= 1;
        if (!inFront) continue;

        const x = (tempV.x * halfW) + halfW;
        const y = -(tempV.y * halfH) + halfH;

        if (x >= 12 && x <= width - 12 && y >= 12 && y <= height - 12) {
          listM.push({
            axis: item.axis,
            x,
            y,
            val: item.val,
            colorClass: item.colorClass,
          });
        }
      }
      setProjectedMeasurements(listM);
    } else {
      if (projectedMeasurements.length > 0) setProjectedMeasurements([]);
    }
  };

  // Camera layout shortcut controls mapping view angles
  const applyShortcutView = (viewIndex: number) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const targetZ = boundingBox ? boundingBox.sizeZ / 2 : 0;
    const target = new THREE.Vector3(0, 0, targetZ);
    const D = 70; // comfort projection depth

    const cam = cameraRef.current;
    
    // Set default standard up, then specialize specifically for straight horizontal views
    cam.up.set(0, 0, 1);

    switch (viewIndex) {
      case 1: // Top
        cam.position.set(target.x, target.y, target.z + D);
        cam.up.set(0, 1, 0);
        break;
      case 2: // Bottom (Down)
        cam.position.set(target.x, target.y, target.z - D);
        cam.up.set(0, 1, 0);
        break;
      case 3: // Left
        cam.position.set(target.x - D, target.y, target.z);
        break;
      case 4: // Right
        cam.position.set(target.x + D, target.y, target.z);
        break;
      case 5: // Front
        cam.position.set(target.x, target.y - D, target.z);
        break;
      case 6: // Back
        cam.position.set(target.x, target.y + D, target.z);
        break;
      case 7: // Isometric
      default:
        cam.position.set(target.x + 45, target.y - 45, target.z + 45);
        break;
    }

    controlsRef.current.target.copy(target);
    controlsRef.current.update();

    if (updateProjectedPositionsRef.current) {
      updateProjectedPositionsRef.current();
    }
  };

  // 3c. Hook Keyboard Shortcuts (1-7) for viewport views
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Excludes inputs and text fields
      if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") {
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 7) {
        e.preventDefault();
        applyShortcutView(num);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [boundingBox, cameraMode]);

  useEffect(() => {
    if (updateProjectedPositionsRef.current) {
      updateProjectedPositionsRef.current();
    }
  }, [filteredPoints, showNumbers, boundingBox, cameraMode, showGrid, zGapMultiplier, measurementPointA, measurementPointB]);

  // 4. Update playhead Nozzle position according to playback timeline
  useEffect(() => {
    if (points.length === 0 || !nozzleRef.current || !boundingBox) return;

    // Use currentSegmentIndex to extract active position
    const activeIdx = Math.min(Math.max(0, currentSegmentIndex), points.length - 1);
    const activePoint = points[activeIdx];

    const centerOffsetX = (boundingBox.minX + boundingBox.maxX) / 2;
    const centerOffsetY = (boundingBox.minY + boundingBox.maxY) / 2;
    const centerOffsetZ = boundingBox.minZ;

    // Coordinates in the offset Three.js view
    const x = activePoint.x - centerOffsetX;
    const y = activePoint.y - centerOffsetY;
    const z = (activePoint.z - centerOffsetZ) * zGapMultiplier;

    nozzleRef.current.position.set(x, y, z);
  }, [points, currentSegmentIndex, boundingBox, zGapMultiplier]);

  // 5. Track Mouse Movement on the Canvas for point hovering & selection
  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !raycasterRef.current || !cameraRef.current || !pointsMeshesRef.current || pointsMeshesRef.current.length === 0 || !boundingBox) return;

    // Get exact canvas bounds
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    // Raycast against the point cloud
    const intersects = raycaster.intersectObjects(pointsMeshesRef.current);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const pointIndexInMesh = hit.index;
      const mesh = hit.object as THREE.Points;
      const originalIndices = mesh.userData?.originalIndices as number[];

      if (pointIndexInMesh !== undefined && originalIndices && pointIndexInMesh < originalIndices.length) {
        const originalIndex = originalIndices[pointIndexInMesh];
        if (originalIndex >= 0 && originalIndex < filteredPoints.length) {
          const matchedPoint = filteredPoints[originalIndex];
          onHoverPoint(matchedPoint);
          return;
        }
      }
    }
    // Fade hover stats if no matches
    onHoverPoint(null);
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !raycasterRef.current || !cameraRef.current || !pointsMeshesRef.current || pointsMeshesRef.current.length === 0 || !boundingBox) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    const intersects = raycaster.intersectObjects(pointsMeshesRef.current);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const pointIndexInMesh = hit.index;
      const mesh = hit.object as THREE.Points;
      const originalIndices = mesh.userData?.originalIndices as number[];

      if (pointIndexInMesh !== undefined && originalIndices && pointIndexInMesh < originalIndices.length) {
        const originalIndex = originalIndices[pointIndexInMesh];
        if (originalIndex >= 0 && originalIndex < filteredPoints.length) {
          onSelectPoint(filteredPoints[originalIndex]);
        }
      }
    }
  };

  // 6. Camera Helper Trigger: Automatically centers and focuses view on path
  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    const targetZ = boundingBox ? boundingBox.sizeZ / 4 : 0;
    controlsRef.current.target.set(0, 0, targetZ);
    cameraRef.current.position.set(45, -45, 45 + targetZ);
    controlsRef.current.update();
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[480px]">
      <canvas
        id="toolpath-view"
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair focus:outline-none"
        onMouseMove={handleMouseMove}
        onClick={handleCanvasClick}
      />

      {/* Floating View Angle Shortcuts (Hotkey 1-7) & Controls Panel */}
      {!isScreenshotMode && (
        <div className="absolute left-4 top-4 flex flex-col gap-2 pointer-events-auto z-10 select-none">
          <div className="bg-slate-900/95 border border-slate-700/80 p-1.5 rounded-lg shadow-xl flex items-center gap-2 backdrop-blur-md">
            <span className="text-[9px] text-cyan-400 font-extrabold uppercase px-1">Views (1-7)</span>
            <div className="flex gap-1.5">
              {[
                { id: 1, label: "Top" },
                { id: 2, label: "Bottom" },
                { id: 3, label: "Left" },
                { id: 4, label: "Right" },
                { id: 5, label: "Front" },
                { id: 6, label: "Back" },
                { id: 7, label: "Isometric" },
              ].map((v) => (
                <button
                  key={v.id}
                  id={`btn-shortcut-view-${v.id}`}
                  onClick={() => applyShortcutView(v.id)}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white px-2 py-1 text-[9px] font-bold rounded border border-slate-700/60 transition"
                  title={`Camera View Shortcut: Press ${v.id}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Z Visual Spacing Gap Slider */}
          <div className="bg-slate-900/95 border border-slate-700/80 p-2.5 rounded-lg shadow-xl flex flex-col gap-1.5 backdrop-blur-md max-w-[240px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[9px] text-cyan-400 font-extrabold uppercase px-1">Z Gap Spacing</span>
              <span className="text-[12px] font-mono font-bold text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded leading-none">
                {zGapMultiplier.toFixed(1)}x
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <input
                id="z-gap-slider"
                type="range"
                min={1.0}
                max={8.0}
                step={0.1}
                value={zGapMultiplier}
                onChange={(e) => setZGapMultiplier(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-slate-800"
                title="Drag to visually exaggerate or isolate the separation between Z height layers"
              />
              {zGapMultiplier > 1.0 && (
                <button
                  id="btn-reset-z-gap"
                  onClick={() => setZGapMultiplier(1.0)}
                  className="text-[8px] text-slate-500 hover:text-cyan-400 font-black uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                  title="Reset to raw physical G-code coordinate values"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Measuring Mode Dynamic Controls Overlay */}
          <div className="bg-slate-900/95 border border-slate-700/80 p-2.5 rounded-lg shadow-xl flex flex-col gap-2 backdrop-blur-md max-w-[240px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-cyan-400 font-extrabold uppercase px-1 flex items-center gap-1">
                <Ruler className="h-3 w-3" /> Measure Tool
              </span>
              {(measurementPointA || measurementPointB) && (
                <button
                  onClick={() => {
                    setMeasurementPointA(null);
                    setMeasurementPointB(null);
                  }}
                  className="text-[8px] text-rose-400 hover:text-rose-300 transition uppercase font-black tracking-wider cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Mode Toggle Button styled with active status */}
            <button
              id="toggle-measure-mode"
              onClick={() => setIsMeasurementMode(!isMeasurementMode)}
              className={`w-full py-1.5 px-2.5 rounded text-[10px] font-bold transition flex items-center justify-between border cursor-pointer select-none ${
                isMeasurementMode
                  ? "bg-cyan-950/40 border-cyan-500 text-cyan-300"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
              title="When active: Clicking clean coordinates sets Point A, and subsequent click sets Point B"
            >
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isMeasurementMode ? "bg-cyan-400 animate-pulse" : "bg-slate-600"}`}></span>
                <span>{isMeasurementMode ? "Active Measuring" : "Standard Selection"}</span>
              </div>
              <span className="text-[8px] uppercase px-1 bg-slate-900 text-slate-400 border border-slate-800 rounded">
                {isMeasurementMode ? "ON" : "OFF"}
              </span>
            </button>

            {/* Points Status Display */}
            {(measurementPointA || measurementPointB) ? (
              <div className="grid grid-cols-2 gap-1.5 text-[12px] font-mono mt-0.5">
                {/* Point A */}
                <div className={`p-1.5 rounded border leading-tight flex flex-col gap-0.5 text-[12px] ${
                  measurementPointA ? "bg-cyan-950/20 border-cyan-500/30" : "bg-slate-950/40 border-slate-850 text-slate-500"
                }`}>
                  <span className="text-[12px] text-cyan-400 font-extrabold uppercase">Pt A</span>
                  {measurementPointA ? (
                    <>
                      <span className="text-slate-100 font-bold truncate">#{measurementPointA.index}</span>
                      <span className="text-slate-400">X:{measurementPointA.x.toFixed(1)}</span>
                      <span className="text-slate-400">Y:{measurementPointA.y.toFixed(1)}</span>
                      <span className="text-slate-400">Z:{measurementPointA.z.toFixed(1)}</span>
                    </>
                  ) : (
                    <span className="italic text-slate-600">Assign Pt A</span>
                  )}
                </div>

                {/* Point B */}
                <div className={`p-1.5 rounded border leading-tight flex flex-col gap-0.5 text-[12px] ${
                  measurementPointB ? "bg-amber-950/20 border-amber-500/30" : "bg-slate-950/40 border-slate-850 text-slate-500"
                }`}>
                  <span className="text-[12px] text-amber-400 font-extrabold uppercase">Pt B</span>
                  {measurementPointB ? (
                    <>
                      <span className="text-slate-100 font-bold truncate">#{measurementPointB.index}</span>
                      <span className="text-slate-400">X:{measurementPointB.x.toFixed(1)}</span>
                      <span className="text-slate-400">Y:{measurementPointB.y.toFixed(1)}</span>
                      <span className="text-slate-400">Z:{measurementPointB.z.toFixed(1)}</span>
                    </>
                  ) : (
                    <span className="italic text-slate-600">Assign Pt B</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-[8px] text-slate-500 text-center leading-normal italic bg-slate-950/30 p-1.5 rounded border border-dashed border-slate-800">
                * Click points to measure
              </div>
            )}
          </div>

          {/* XY Angle Selective Filter Overlay */}
          <div className="bg-slate-900/95 border border-slate-700/80 p-2.5 rounded-lg shadow-xl flex flex-col gap-2 backdrop-blur-md max-w-[260px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-cyan-400 font-extrabold uppercase px-1 flex items-center gap-1">
                <Compass className="h-3 w-3 text-cyan-400" /> XY Line Angle
              </span>
              {!isAllAnglesActive && (
                <button
                  id="btn-angle-show-all"
                  onClick={() => setEnabledAngles({ deg0: true, deg60: true, deg90: true, deg120: true, degOther: true })}
                  className="text-[8px] text-slate-400 hover:text-cyan-300 transition uppercase font-black tracking-wider cursor-pointer"
                >
                  Show All
                </button>
              )}
            </div>

            <div className="grid grid-cols-5 gap-1">
              <button
                id="btn-angle-filter-0"
                onClick={() => handleToggleAngle("0")}
                className={`py-1.5 px-0.5 rounded text-[9px] font-mono font-bold transition flex flex-col items-center justify-center border cursor-pointer select-none leading-tight ${
                  enabledAngles.deg0
                    ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-sm"
                    : "bg-slate-950/80 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
                title="Selectively show 0° lines (parallel to Y axis)"
              >
                <span className="font-extrabold text-[9.5px]">0°</span>
                <span className="text-[7px] opacity-75 font-normal">{angleCounts.cnt0}</span>
              </button>

              <button
                id="btn-angle-filter-60"
                onClick={() => handleToggleAngle("60")}
                className={`py-1.5 px-0.5 rounded text-[9px] font-mono font-bold transition flex flex-col items-center justify-center border cursor-pointer select-none leading-tight ${
                  enabledAngles.deg60
                    ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-sm"
                    : "bg-slate-950/80 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
                title="Selectively show 60° lines"
              >
                <span className="font-extrabold text-[9.5px]">60°</span>
                <span className="text-[7px] opacity-75 font-normal">{angleCounts.cnt60}</span>
              </button>

              <button
                id="btn-angle-filter-90"
                onClick={() => handleToggleAngle("90")}
                className={`py-1.5 px-0.5 rounded text-[9px] font-mono font-bold transition flex flex-col items-center justify-center border cursor-pointer select-none leading-tight ${
                  enabledAngles.deg90
                    ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-sm"
                    : "bg-slate-950/80 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
                title="Selectively show 90° lines (perpendicular to Y axis / parallel to X axis)"
              >
                <span className="font-extrabold text-[9.5px]">90°</span>
                <span className="text-[7px] opacity-75 font-normal">{angleCounts.cnt90}</span>
              </button>

              <button
                id="btn-angle-filter-120"
                onClick={() => handleToggleAngle("120")}
                className={`py-1.5 px-0.5 rounded text-[9px] font-mono font-bold transition flex flex-col items-center justify-center border cursor-pointer select-none leading-tight ${
                  enabledAngles.deg120
                    ? "bg-cyan-950/60 border-cyan-500 text-cyan-300 shadow-sm"
                    : "bg-slate-950/80 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
                title="Selectively show 120° lines"
              >
                <span className="font-extrabold text-[9.5px]">120°</span>
                <span className="text-[7px] opacity-75 font-normal">{angleCounts.cnt120}</span>
              </button>

              <button
                id="btn-angle-filter-other"
                onClick={() => handleToggleAngle("other")}
                className={`py-1.5 px-0.5 rounded text-[9px] font-mono font-bold transition flex flex-col items-center justify-center border cursor-pointer select-none leading-tight ${
                  enabledAngles.degOther
                    ? "bg-slate-800 border-slate-600 text-slate-200 shadow-sm"
                    : "bg-slate-950/80 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
                title="Selectively show other angles or vertical jumps"
              >
                <span className="font-extrabold text-[9.5px]">Other</span>
                <span className="text-[7px] opacity-75 font-normal">{angleCounts.cntOther}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coordinate Number Label Tags */}
      {!isScreenshotMode && showNumbers && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 select-none">
          {projectedPoints.map((pt) => (
            <div
              key={pt.index}
              className="absolute bg-slate-950/80 text-[8px] font-mono font-bold text-cyan-300 px-1 py-0.5 rounded border border-cyan-500/30 shadow-md leading-none -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${pt.x}px`,
                top: `${pt.y}px`,
              }}
            >
              {pt.val}
            </div>
          ))}
        </div>
      )}

      {/* Measurement Midpoint Dimension Labels */}
      {!isScreenshotMode && projectedMeasurements.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 select-none">
          {projectedMeasurements.map((m, idx) => (
            <div
              key={`${m.axis}-${idx}`}
              className={`absolute border px-1.5 py-0.5 rounded shadow-xl leading-none -translate-x-1/2 -translate-y-1/2 font-mono whitespace-nowrap transition-all border-slate-700/85 backdrop-blur-sm ${m.colorClass}`}
              style={{
                left: `${m.x}px`,
                top: `${m.y}px`,
                zIndex: m.axis === "Direct" ? 12 : 11,
              }}
            >
              {m.val}
            </div>
          ))}
        </div>
      )}

      {/* Floating Canvas UI Controls Overlay */}
      <div className="absolute right-4 top-4 flex flex-col gap-2 pointer-events-auto z-20 items-end select-none">
        {isScreenshotMode ? (
          <button
            id="btn-toggle-screenshot-mode"
            onClick={() => setIsScreenshotMode(false)}
            className="h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400 rounded-xl px-3.5 text-[11px] font-black transition shadow-2xl backdrop-blur-md flex items-center justify-center gap-1.5 cursor-pointer opacity-90 hover:opacity-100"
            title="Exit clean screenshot mode and restore all buttons & controls"
          >
            <Eye className="h-4 w-4" />
            <span>Show Controls</span>
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                id="btn-toggle-screenshot-mode"
                onClick={() => setIsScreenshotMode(true)}
                className="h-10 bg-slate-800/95 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700/80 rounded-xl px-3 text-[11px] font-bold transition shadow-lg backdrop-blur-md flex items-center justify-center gap-1.5 cursor-pointer"
                title="Hide all on-screen buttons, sliders, and endpoint markers to take a clean screenshot"
              >
                <Camera className="h-4 w-4" />
                <span>Screenshot Mode</span>
              </button>

              <div className="bg-slate-900/95 border border-slate-700/80 p-1 rounded-lg shadow-xl flex gap-1 backdrop-blur-md">
                <button
                  id="camera-mode-perspective"
                  onClick={() => setCameraMode("perspective")}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition flex items-center gap-1.5 ${
                    cameraMode === "perspective"
                      ? "bg-cyan-500 text-slate-950 font-extrabold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                  title="Perspective View (depth projection)"
                >
                  Perspective
                </button>
                <button
                  id="camera-mode-orthographic"
                  onClick={() => setCameraMode("orthographic")}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition flex items-center gap-1.5 ${
                    cameraMode === "orthographic"
                      ? "bg-cyan-500 text-slate-950 font-extrabold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                  title="Orthogonal View (parallel projection)"
                >
                  Orthogonal
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Floating orientation indicator/Axes Helper widget */}
              <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-1 shadow-xl flex items-center justify-center backdrop-blur-md w-10 h-10" title="Orientation Axes (Red=X, Green=Y, Blue=Z)">
                <canvas ref={axesCanvasRef} width={40} height={40} className="w-9 h-9" />
              </div>

              <button
                id="btn-reset-camera"
                onClick={handleResetCamera}
                className="h-10 bg-slate-800/95 hover:bg-slate-700 hover:text-white border border-slate-700 rounded-xl px-3 text-[11px] text-slate-200 transition shadow-lg backdrop-blur-md flex items-center justify-center gap-1.5 font-bold"
                title="Reset Camera Orientation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Reset Camera
              </button>
            </div>
          </>
        )}
      </div>

      {/* Vertical Z-Height Selective Slider Panel on the right */}
      {!isScreenshotMode && uniqueZs.length > 0 && (
        <div className="absolute right-4 top-28 bottom-28 flex items-center gap-3 pointer-events-auto z-10 select-none">
          {/* Detailed vertical slider control */}
          <div className="bg-slate-905/95 border border-slate-700/80 p-3 rounded-2xl shadow-2xl flex flex-col items-center h-full gap-2.5 backdrop-blur-md">
            <span className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-wide text-center block max-w-[40px] leading-tight select-none">
              Z Limit
            </span>
            
            {/* Filter mode controller */}
            <div className="flex flex-col gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                id="btn-z-filter-range"
                onClick={() => setZFilterMode("cumulative")}
                className={`px-1.5 py-1.5 rounded text-[9px] font-bold uppercase transition-all whitespace-nowrap ${
                  zFilterMode === "cumulative"
                    ? "bg-cyan-500 text-slate-950 font-black shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Range display mode (select starting and ending Z heights/groups)"
              >
                &harr; Range
              </button>
              <button
                id="btn-z-filter-single"
                onClick={() => setZFilterMode("single")}
                className={`px-1.5 py-1.5 rounded text-[9px] font-bold uppercase transition-all whitespace-nowrap ${
                  zFilterMode === "single"
                    ? "bg-cyan-500 text-slate-950 font-black shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Isolate layer mode (shows only points at the exact selected Z height)"
              >
                &equiv; Layer
              </button>
            </div>

            {/* Vertical slider input range */}
            {zFilterMode === "cumulative" ? (
              <DoubleVerticalSlider
                uniqueZs={uniqueZs}
                minZIndex={minZIndex}
                maxZIndex={maxZIndex}
                setMinZIndex={setMinZIndex}
                setMaxZIndex={setMaxZIndex}
              />
            ) : (
              <SingleVerticalSlider
                uniqueZs={uniqueZs}
                maxZIndex={maxZIndex}
                setMaxZIndex={setMaxZIndex}
              />
            )}

            {/* Selected Value Indicator */}
            <div className="flex flex-col items-center max-w-[100px]">
              <span className="text-[8px] text-slate-400 uppercase font-black tracking-wide">Z level</span>
              {zFilterMode === "cumulative" ? (
                <div className="bg-slate-950 px-1.5 py-1 rounded border border-slate-800 text-[10px] font-mono font-bold text-cyan-400 w-full text-center shadow-inner flex flex-col leading-tight mt-0.5 min-w-[65px]">
                  {minZIndex === -1 && maxZIndex === -1 ? (
                    <span>ALL</span>
                  ) : (
                    <>
                      <span>
                        L{minZIndex === -1 ? 1 : minZIndex + 1}&ndash;{maxZIndex === -1 ? uniqueZs.length : maxZIndex + 1}
                      </span>
                      <span className="text-[8px] text-slate-400 font-normal">
                        {(uniqueZs[minZIndex === -1 ? 0 : minZIndex] || 0).toFixed(1)} to {(uniqueZs[maxZIndex === -1 ? uniqueZs.length - 1 : maxZIndex] || 0).toFixed(1)} mm
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-slate-950 px-1.5 py-1 rounded border border-slate-800 text-[10px] font-mono font-bold text-cyan-400 w-full text-center shadow-inner flex flex-col leading-tight mt-0.5 min-w-[65px]">
                  <span>
                    L{maxZIndex === -1 ? uniqueZs.length : maxZIndex + 1}
                  </span>
                  <span className="text-[8px] text-slate-400 font-normal">
                    {(uniqueZs[maxZIndex === -1 ? uniqueZs.length - 1 : maxZIndex] || 0).toFixed(2)} mm
                  </span>
                </div>
              )}
            </div>

            {/* Reset Button */}
            {(minZIndex !== -1 || maxZIndex !== -1) && (
              <button
                id="btn-reset-z-filter"
                onClick={() => {
                  setMinZIndex(-1);
                  setMaxZIndex(-1);
                }}
                className="bg-slate-850 hover:bg-cyan-500 hover:text-slate-950 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded transition text-slate-300"
                title="Display all Z heights"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Draggable Selected Coordinate inspection panel */}
      {!isScreenshotMode && selectedPoint && coordinatePos && (
        <div
          id="point-inspector-overlay"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute z-30 bg-slate-900 border border-slate-700/80 rounded-xl p-4 shadow-2xl backdrop-blur-md w-72 flex flex-col gap-3 font-mono text-xs text-slate-300 select-none pointer-events-auto touch-none"
          style={{
            left: `${coordinatePos.x}px`,
            top: `${coordinatePos.y}px`,
          }}
        >
          {/* Header (Drag handle) */}
          <div className="drag-handle flex justify-between items-center pb-2 border-b border-slate-850 cursor-move active:cursor-grabbing hover:bg-slate-800/30 -mx-1 px-1 rounded transition-colors flex-wrap gap-2">
            <span className="font-bold text-white text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <Move className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
              <span>Selected Coordinate #{selectedPoint.index}</span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectPoint(null);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="hover:text-white transition-colors bg-slate-800/80 hover:bg-slate-700/80 p-1 rounded-md cursor-pointer pointer-events-auto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          
          {/* Content Coordinates Grid */}
          <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 pt-1 text-[11px] leading-relaxed">
            <span className="text-slate-400">Line Type:</span>
            <span className="font-bold text-cyan-400 truncate">{selectedPoint.type}</span>

            <span className="text-slate-400">X Position:</span>
            <span className="font-bold text-white">{selectedPoint.x.toFixed(3)} mm</span>

            <span className="text-slate-400">Y Position:</span>
            <span className="font-bold text-white">{selectedPoint.y.toFixed(3)} mm</span>

            <span className="text-slate-400">Z Position:</span>
            <span className="font-bold text-white">{selectedPoint.z.toFixed(3)} mm</span>

            <span className="text-slate-400">Speed:</span>
            <span className="font-semibold text-amber-400">{selectedPoint.speed} {speedUnit}</span>
          </div>

          {/* Quick set buttons for Point distance measurement */}
          <div className="border-t border-slate-800/60 pt-2.5 flex flex-col gap-1.5 mt-0.5">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Set Distance Measurement Ref</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setMeasurementPointA(selectedPoint);
                }}
                className={`py-1.5 px-2 rounded text-[10px] uppercase font-bold transition flex items-center justify-center gap-1 cursor-pointer pointer-events-auto select-none ${
                  measurementPointA?.index === selectedPoint.index
                    ? "bg-cyan-500 text-slate-950 font-black"
                    : "bg-slate-950 hover:bg-slate-800 text-cyan-455 hover:text-white border border-slate-850"
                }`}
              >
                <span>Use Pt A</span>
              </button>
              <button
                onClick={() => {
                  setMeasurementPointB(selectedPoint);
                }}
                className={`py-1.5 px-2 rounded text-[10px] uppercase font-bold transition flex items-center justify-center gap-1 cursor-pointer pointer-events-auto select-none ${
                  measurementPointB?.index === selectedPoint.index
                    ? "bg-amber-500 text-slate-950 font-black"
                    : "bg-slate-950 hover:bg-slate-800 text-amber-405 hover:text-white border border-slate-850"
                }`}
              >
                <span>Use Pt B</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
