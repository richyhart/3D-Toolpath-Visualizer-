import { useState, useEffect, useMemo, ChangeEvent, DragEvent } from "react";
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  FileText,
  Activity,
  Printer,
  Sparkles,
  Layers,
  Wrench,
  Boxes,
  FileCode,
  Sliders,
  ChevronRight,
  TrendingUp,
  HelpCircle,
  Eye,
  Settings,
  X,
  RefreshCw,
  ChevronsUpDown,
  Ruler
} from "lucide-react";

import { ToolpathPoint, ToolpathStats } from "./types";
import { parseToolpathCSV, computeToolpathStats } from "./utils/parser";
import {
  pointsToCSV,
  generateScaffoldPreset,
  generateSpiralVasePreset,
  generateCNCPocketPreset
} from "./utils/presets";
import ThreeCanvas from "./components/ThreeCanvas";

const invertZPoints = (rawPoints: ToolpathPoint[]): ToolpathPoint[] => {
  if (rawPoints.length === 0) return rawPoints;
  const zCoords = rawPoints.map((p) => p.z);
  const minZ = Math.min(...zCoords);
  const maxZ = Math.max(...zCoords);
  return rawPoints.map((p) => ({
    ...p,
    z: maxZ + minZ - p.z,
  }));
};

export default function App() {
  // --- Core Toolpath States ---
  const [points, setPoints] = useState<ToolpathPoint[]>([]);
  const [csvText, setCsvText] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<string>("scaffold");
  const [speedUnit, setSpeedUnit] = useState<"mm/min" | "mm/s">("mm/s");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --- Animation Playback States ---
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(5);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(0);

  // --- Canvas Settings States ---
  const [colorScheme, setColorScheme] = useState<"speed" | "type">("speed");
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showBoundingBox, setShowBoundingBox] = useState<boolean>(false);
  const [cameraResetToken, setCameraResetToken] = useState<string>("init");
  const [showNozzle, setShowNozzle] = useState<boolean>(true);
  const [cameraMode, setCameraMode] = useState<"perspective" | "orthographic">("orthographic");
  const [isPlaybackDrawerOpen, setIsPlaybackDrawerOpen] = useState<boolean>(true);
  const [showNumbers, setShowNumbers] = useState<boolean>(false);
  const [gridSpacing, setGridSpacing] = useState<1 | 5 | 10>(5);
  const [speedColors, setSpeedColors] = useState<string[]>([
    "#3b82f6", // Level 1 (very slow)
    "#06b6d4", // Level 2 (slow)
    "#10b981", // Level 3 (normal)
    "#eab308", // Level 4 (fast)
    "#ef4444", // Level 5 (rapid)
  ]);
  const [speedOpacities, setSpeedOpacities] = useState<number[]>([
    1.0, // Level 1
    1.0, // Level 2
    1.0, // Level 3
    1.0, // Level 4
    1.0, // Level 5
  ]);

  // --- Hover and Interaction States ---
  const [hoveredPoint, setHoveredPoint] = useState<ToolpathPoint | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<ToolpathPoint | null>(null);
  const [measurementPointA, setMeasurementPointA] = useState<ToolpathPoint | null>(null);
  const [measurementPointB, setMeasurementPointB] = useState<ToolpathPoint | null>(null);
  const [isMeasurementMode, setIsMeasurementMode] = useState<boolean>(false);

  const handleSelectPoint = (pt: ToolpathPoint | null) => {
    setSelectedPoint(pt);
    if (pt) {
      if (isMeasurementMode) {
        if (!measurementPointA) {
          setMeasurementPointA(pt);
        } else if (!measurementPointB) {
          setMeasurementPointB(pt);
        } else {
          // Both are occupied, restart selection cycle
          setMeasurementPointA(pt);
          setMeasurementPointB(null);
        }
      }
    }
  };

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"visualizer" | "dataDetail" | "rawEditor">("visualizer");

  // Automatically clear selection / measurements when points list changes
  useEffect(() => {
    setSelectedPoint(null);
    setMeasurementPointA(null);
    setMeasurementPointB(null);
  }, [points]);

  // Load Scaffold Preset on Mount
  useEffect(() => {
    loadPreset("scaffold");
  }, []);

  // Compute stats reactively when points or unit metrics alter
  const stats: ToolpathStats = useMemo(() => {
    return computeToolpathStats(points, speedUnit);
  }, [points, speedUnit]);

  // Compute measurement distance and dimensional breakdowns
  const measurementData = useMemo(() => {
    if (!measurementPointA || !measurementPointB) return null;
    const dx = measurementPointA.x - measurementPointB.x;
    const dy = measurementPointA.y - measurementPointB.y;
    const dz = measurementPointA.z - measurementPointB.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return {
      distance,
      dx: Math.abs(dx),
      dy: Math.abs(dy),
      dz: Math.abs(dz),
    };
  }, [measurementPointA, measurementPointB]);

  // Unique sorted Z axis coordinate heights grouped together
  const uniqueZs = useMemo(() => {
    const list = Array.from(new Set(points.map((p) => Number(p.z.toFixed(4)))));
    return list.sort((a: number, b: number) => a - b);
  }, [points]);

  // Unique sorted speed values
  const uniqueSpeeds = useMemo(() => {
    const list = Array.from(new Set(points.map((p) => Number(p.speed.toFixed(1)))));
    return list.sort((a: number, b: number) => a - b);
  }, [points]);

  // Dynamically adjust number of colors when uniqueSpeeds changes
  useEffect(() => {
    if (uniqueSpeeds.length === 0) return;

    // If ≤ 6 distinct speeds exist, map colors 1-to-1. Otherwise fall back to 5 buckets.
    const count = uniqueSpeeds.length <= 6 ? uniqueSpeeds.length : 5;

    const PRESET_PALETTE = [
      "#3b82f6", // Level 1 (very slow)
      "#06b6d4", // Level 2 (slow)
      "#10b981", // Level 3 (normal)
      "#eab308", // Level 4 (fast)
      "#ef4444", // Level 5 (rapid)
      "#a855f7", // Level 6
      "#ec4899", // Level 7
    ];

    setSpeedColors((prev) => {
      const next: string[] = [];
      for (let i = 0; i < count; i++) {
        if (prev[i]) {
          next.push(prev[i]);
        } else {
          next.push(PRESET_PALETTE[i % PRESET_PALETTE.length]);
        }
      }
      return next;
    });

    setSpeedOpacities((prev) => {
      const next: number[] = [];
      for (let i = 0; i < count; i++) {
        if (prev[i] !== undefined) {
          next.push(prev[i]);
        } else {
          next.push(1.0); // Default to 100% opaque
        }
      }
      return next;
    });
  }, [uniqueSpeeds]);

  // Handle preset switching
  const loadPreset = (presetName: string) => {
    let generatedPoints: ToolpathPoint[] = [];
    if (presetName === "scaffold") {
      generatedPoints = generateScaffoldPreset(30, 2.0, 10, 0.4);
    } else if (presetName === "helix") {
      generatedPoints = generateSpiralVasePreset();
    } else if (presetName === "cnc") {
      generatedPoints = generateCNCPocketPreset();
    }

    if (generatedPoints.length > 0) {
      const inverted = invertZPoints(generatedPoints);
      const csv = pointsToCSV(inverted);
      setPoints(inverted);
      setCsvText(csv);
      setSelectedPreset(presetName);
      setErrorMessage(null);
      setCurrentSegmentIndex(0);
      setIsPlaying(false);
      setCameraResetToken(Math.random().toString());
      setSuccessMessage(`Loaded ${presetName === "scaffold" ? "Bio-Resorbable Scaffold Layer" : presetName === "helix" ? "Double-Helix Spiral Vase" : "CNC Pocket Face Milling"} with ${generatedPoints.length} coordinates successfully (Z-axis inverted by default).`);
      
      // Auto dismiss success toast
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  // --- File Reader Upload handler ---
  const handleFileLoad = (text: string, filename: string) => {
    try {
      const parsed = parseToolpathCSV(text);
      if (parsed.length === 0) {
        throw new Error("Unable to parse points. Verify that the file has numeric coordinates in columns 2, 3, 4.");
      }
      const inverted = invertZPoints(parsed);
      setPoints(inverted);
      setCsvText(pointsToCSV(inverted));
      setSelectedPreset("uploaded");
      setErrorMessage(null);
      setCurrentSegmentIndex(0);
      setIsPlaying(false);
      setCameraResetToken(Math.random().toString());
      setSuccessMessage(`Successfully uploaded ${filename} with ${parsed.length} coords (Z-axis inverted by default)!`);
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err.message || "Parsing failed. Ensure your file is a valid 5-column space/comma-separated document.");
      setTimeout(() => setErrorMessage(null), 6000);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleFileLoad(text, file.name);
    };
    reader.readAsText(file);
  };

  // --- Drag and Drop Handlers ---
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        handleFileLoad(text, file.name);
      };
      reader.readAsText(file);
    }
  };

  // --- Textarea direct updates ---
  const handleCSVTextareaChange = (text: string) => {
    setCsvText(text);
    try {
      const parsed = parseToolpathCSV(text);
      setPoints(parsed);
      setErrorMessage(null);
    } catch (err) {
      // Don't crash while typing, just buffer
    }
  };

  // --- Coordinate Transformations ---
  const handleFlipXY = () => {
    if (points.length === 0) {
      setErrorMessage("No coordinates loaded to transform.");
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }
    const updated = points.map((p) => ({
      ...p,
      x: p.y,
      y: p.x,
    }));
    setPoints(updated);
    setCsvText(pointsToCSV(updated));
    setCurrentSegmentIndex(0);
    setIsPlaying(false);
    setSelectedPoint(null);
    setSuccessMessage("Coordinate axes flipped successfully (X ↔ Y)!");
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleInvertZ = () => {
    if (points.length === 0) {
      setErrorMessage("No coordinates loaded to transform.");
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }
    const zCoords = points.map((p) => p.z);
    const minZ = Math.min(...zCoords);
    const maxZ = Math.max(...zCoords);
    const updated = points.map((p) => ({
      ...p,
      z: maxZ + minZ - p.z,
    }));
    setPoints(updated);
    setCsvText(pointsToCSV(updated));
    setCurrentSegmentIndex(0);
    setIsPlaying(false);
    setSelectedPoint(null);
    setSuccessMessage("Inverted Z-axis layers successfully (Top-Down Mirroring)!");
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // --- Playback animation thread ---
  useEffect(() => {
    if (!isPlaying) return;

    // Tick speed based on multiplier
    const timer = setInterval(() => {
      setCurrentSegmentIndex((prev) => {
        if (prev >= points.length - 1) {
          setIsPlaying(false);
          return 0; // wrap around
        }
        return prev + speedMultiplier;
      });
    }, 40);

    return () => clearInterval(timer);
  }, [isPlaying, speedMultiplier, points.length]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Dynamic Notifications */}
      {successMessage && (
        <div id="toast-success" className="fixed top-4 right-4 z-50 bg-emerald-950 border border-emerald-500/80 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 max-w-md animate-bounce">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <p className="text-xs font-semibold">{successMessage}</p>
          <button onClick={() => setSuccessMessage(null)} className="ml-auto hover:text-white p-0.5"><X className="h-4 w-4" /></button>
        </div>
      )}

      {errorMessage && (
        <div id="toast-error" className="fixed top-4 right-4 z-50 bg-rose-950 border border-rose-500/80 text-rose-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 max-w-md animate-shake">
          <span className="w-2 h-2 rounded-full bg-rose-400"></span>
          <p className="text-xs font-semibold">{errorMessage}</p>
          <button onClick={() => setErrorMessage(null)} className="ml-auto hover:text-white p-0.5"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Main App Bar Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-cyan-500 to-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-500/10">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
              3D Toolpath Visualizer
            </h1>
          </div>
        </div>

        {/* Primary Calibration Switch */}
        <div className="flex items-center gap-4 bg-slate-950 border border-slate-800 rounded-xl p-1.5">
          <span className="text-xs text-slate-400 font-medium px-2">Speed Unit:</span>
          <button
            id="unit-mm-min"
            onClick={() => setSpeedUnit("mm/min")}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              speedUnit === "mm/min"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            mm/min
          </button>
          <button
            id="unit-mm-s"
            onClick={() => setSpeedUnit("mm/s")}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              speedUnit === "mm/s"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            mm/s
          </button>
        </div>
      </header>

      {/* Main Split Interface Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-[calc(100vh-76px)]">
        
        {/* Left Side: Controls & Data Configurations Dashboard */}
        <div className="lg:col-span-4 border-r border-slate-800 bg-slate-900/50 flex flex-col divide-y divide-slate-800 h-full overflow-y-auto">
          
          {/* Section 1: Presets & Drag-Drop Files */}
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Printer className="h-4 w-4 text-cyan-400" /> Layer Data Source
              </h2>
              <span className="text-xs text-indigo-400 font-mono">5-Column (CSV)</span>
            </div>

            {/* Advanced Drag & Drop File Loader */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center transition ${
                isDragging
                  ? "border-cyan-500 bg-cyan-950/20"
                  : "border-slate-800 bg-slate-950 hover:bg-slate-900/60"
              }`}
            >
              <Upload className={`h-8 w-8 mb-2 ${isDragging ? "text-cyan-400 animate-bounce" : "text-slate-500"}`} />
              <p className="text-xs font-semibold text-slate-300">Drag & Drop toolpath CSV file</p>
              <p className="text-[10px] text-slate-500 mt-1 mb-3">Expected: line_type, X, Y, Z, speed</p>
              
              <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium px-4 py-1.5 rounded-lg border border-slate-700 transition">
                Choose Local CSV
                <input
                  id="csv-file-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>

          {/* Section 2: Render Configurations */}
          <div className="p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-cyan-400" /> Visualization Options
            </h2>

            {/* Colorization Toggle */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase">Path Color Mapping Mode</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  id="color-speed"
                  onClick={() => setColorScheme("speed")}
                  className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
                    colorScheme === "speed"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-405 hover:text-slate-200"
                  }`}
                >
                  By Speed
                </button>
                <button
                  id="color-type"
                  onClick={() => setColorScheme("type")}
                  className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
                    colorScheme === "type"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  By Z Axis Layer
                </button>
              </div>
            </div>

            {/* Visibility Toggle Switch Panel */}
            <div className="grid grid-cols-3 gap-2">
              <button
                id="toggle-grid"
                onClick={() => setShowGrid(!showGrid)}
                className={`py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition border ${
                  showGrid
                    ? "bg-slate-800/80 border-slate-700 text-white"
                    : "bg-slate-950 border-slate-900 text-slate-500"
                }`}
                title="Toggle bed grid floor helper visibility"
              >
                <div className={`w-2 h-2 rounded-full ${showGrid ? "bg-cyan-400" : "bg-slate-700"}`}></div>
                <span className="text-[10px] font-bold">XY Grid</span>
              </button>

              <button
                id="toggle-nozzle"
                onClick={() => setShowNozzle(!showNozzle)}
                className={`py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition border ${
                  showNozzle
                    ? "bg-slate-800/80 border-slate-700 text-white"
                    : "bg-slate-950 border-slate-900 text-slate-500"
                }`}
                title="Toggle simulated printer nozzle guide cones visibility"
              >
                <div className={`w-2 h-2 rounded-full ${showNozzle ? "bg-cyan-400" : "bg-slate-700"}`}></div>
                <span className="text-[10px] font-bold">Nozzle</span>
              </button>

              <button
                id="toggle-numbers"
                onClick={() => setShowNumbers(!showNumbers)}
                className={`py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition border ${
                  showNumbers
                    ? "bg-slate-800/80 border-slate-750 text-white border-cyan-500/40"
                    : "bg-slate-950 border-slate-900 text-slate-500"
                }`}
                title="Toggle on/off sequence index label numbers on each coordinate point"
              >
                <div className={`w-2 h-2 rounded-full ${showNumbers ? "bg-cyan-400 animate-pulse" : "bg-slate-700"}`}></div>
                <span className="text-[10px] font-bold">Indices</span>
              </button>
            </div>

            {/* Grid Spacing Control */}
            <div className="flex flex-col gap-1.5 mt-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">XY Grid Block Spacing</label>
              <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {[1, 5, 10].map((size) => (
                  <button
                    key={size}
                    id={`grid-spacing-${size}`}
                    onClick={() => setGridSpacing(size as 1 | 5 | 10)}
                    className={`py-1 text-xs font-bold rounded-lg transition-all ${
                      gridSpacing === size
                        ? "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {size} mm
                  </button>
                ))}
              </div>
            </div>

            {/* Coordinate Transformations */}
            <div className="flex flex-col gap-1.5 mt-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Coordinate Tools</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="btn-flip-xy"
                  onClick={handleFlipXY}
                  className="py-2.5 px-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-slate-200 transition-all hover:text-white group"
                  title="Flip coordinate values for X and Y axes (X ↔ Y)"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400 transition-transform group-hover:rotate-180 duration-500" />
                  <span>Flip X ↔ Y</span>
                </button>

                <button
                  id="btn-invert-z"
                  onClick={handleInvertZ}
                  className="py-2.5 px-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-slate-200 transition-all hover:text-white group"
                  title="Invert Z-axis layers (Top-down Mirroring)"
                >
                  <ChevronsUpDown className="w-3.5 h-3.5 text-cyan-400 transition-transform group-hover:scale-y-[-1] duration-500" />
                  <span>Invert Z</span>
                </button>
              </div>
            </div>

            {/* Interactive Color Legend */}
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Color Scheme Legend</span>
                {colorScheme === "speed" ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Low Speed ({stats.minSpeed} {speedUnit})</span>
                      <span>High Speed ({stats.maxSpeed} {speedUnit})</span>
                    </div>
                    {/* Segmented discrete blocks */}
                    <div className="grid gap-1.5 h-2.5" style={{ gridTemplateColumns: `repeat(${speedColors.length}, minmax(0, 1fr))` }}>
                      {speedColors.map((color, idx) => (
                        <div key={idx} style={{ backgroundColor: color, opacity: speedOpacities[idx] !== undefined ? speedOpacities[idx] : 1.0 }} className="rounded animate-pulse" title={`Level ${idx + 1}`}></div>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-900">
                      <span className="text-[9px] font-extrabold text-cyan-400 uppercase tracking-wider">Customize Speed Bands</span>
                      <button
                        id="btn-reset-speed-colors"
                        onClick={() => {
                          const count = uniqueSpeeds.length <= 6 ? uniqueSpeeds.length : 5;
                          const PRESET_PALETTE = ["#3b82f6", "#06b6d4", "#10b981", "#eab308", "#ef4444", "#a855f7", "#ec4899"];
                          setSpeedColors(PRESET_PALETTE.slice(0, count));
                          setSpeedOpacities(Array(count).fill(1.0));
                        }}
                        className="text-[9px] text-slate-500 hover:text-cyan-400 font-extrabold transition-colors uppercase tracking-wider cursor-pointer"
                        title="Reset speed swatches and opacities to defaults"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 mt-1">
                      {speedColors.map((color, idx) => {
                        let speedLabelValue = "";
                        let titleText = "";
                        
                        if (uniqueSpeeds.length <= 6) {
                          const speedVal = uniqueSpeeds[idx];
                          if (speedVal !== undefined) {
                            speedLabelValue = `${speedVal.toFixed(0)}`;
                            titleText = `Speed: ${speedVal.toFixed(1)} ${speedUnit}`;
                          } else {
                            speedLabelValue = "—";
                            titleText = "N/A";
                          }
                        } else {
                          const min = stats.minSpeed;
                          const max = stats.maxSpeed;
                          const r = max - min;
                          const count = speedColors.length;
                          
                          if (r <= 0) {
                            speedLabelValue = idx === 0 ? `${min.toFixed(0)}` : "—";
                            titleText = idx === 0 ? `Speed: ${min.toFixed(1)} ${speedUnit}` : "Unused speed band";
                          } else {
                            const lowerFrac = idx / count;
                            const upperFrac = (idx + 1) / count;
                            const lower = min + lowerFrac * r;
                            const upper = min + upperFrac * r;
                            speedLabelValue = `${lower.toFixed(0)}-${upper.toFixed(0)}`;
                            titleText = `Speed ${lower.toFixed(1)} to ${upper.toFixed(1)} ${speedUnit}`;
                          }
                        }

                        const currentOpacity = speedOpacities[idx] !== undefined ? speedOpacities[idx] : 1.0;

                        return (
                          <div key={idx} className="flex items-center gap-2.5 bg-slate-900/60 p-2 rounded-xl border border-slate-800/80 hover:border-slate-700/80 transition-colors" title={titleText}>
                            {/* Color Picker Swatch */}
                            <div className="relative w-6 h-6 rounded border border-slate-700 hover:border-slate-500 transition-all cursor-pointer overflow-hidden flex items-center justify-center shrink-0">
                              <input
                                type="color"
                                value={color}
                                onChange={(e) => {
                                  const nextColors = [...speedColors];
                                  nextColors[idx] = e.target.value;
                                  setSpeedColors(nextColors);
                                }}
                                className="absolute inset-0 w-full h-full p-0 border-0 cursor-pointer scale-150 bg-transparent opacity-0"
                              />
                              <div className="w-full h-full" style={{ backgroundColor: color }} />
                            </div>

                            {/* Speed Label */}
                            <div className="flex flex-col min-w-[55px] shrink-0">
                              <span className="text-[10px] text-slate-300 font-bold truncate">
                                {speedLabelValue}
                              </span>
                              <span className="text-[8px] text-slate-500 leading-none">
                                {speedUnit}
                              </span>
                            </div>

                            {/* Opacity Range Slider */}
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round(currentOpacity * 100)}
                                onChange={(e) => {
                                  const nextOps = [...speedOpacities];
                                  nextOps[idx] = parseFloat(e.target.value) / 100;
                                  setSpeedOpacities(nextOps);
                                }}
                                className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                                style={{
                                  background: `linear-gradient(to right, ${color} 0%, ${color} ${Math.round(currentOpacity * 100)}%, #1e293b ${Math.round(currentOpacity * 100)}%, #1e293b 100%)`
                                }}
                              />
                              <span className="text-[9px] text-slate-400 font-mono w-8 text-right shrink-0 font-semibold">
                                {Math.round(currentOpacity * 100)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-slate-500 mt-1 italic">Discrete color and opacity mapping based on speed intervals.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Z-Height Groupings</span>
                      <span className="font-semibold text-cyan-400 font-mono text-[10px] bg-slate-900 border border-slate-800 px-1 py-0.5 rounded">
                        {uniqueZs.length} Layers
                      </span>
                    </div>
                    {/* Display cyclical palette indicators */}
                    <div className="grid grid-cols-8 gap-1 h-3 mt-1">
                      <div className="bg-[#3b82f6] rounded-sm" title="Layer Index 0, 8, ..."></div>
                      <div className="bg-[#ec4899] rounded-sm" title="Layer Index 1, 9, ... font-bold"></div>
                      <div className="bg-[#10b981] rounded-sm" title="Layer Index 2, 10, ..."></div>
                      <div className="bg-[#a855f7] rounded-sm" title="Layer Index 3, 11, ..."></div>
                      <div className="bg-[#eab308] rounded-sm" title="Layer Index 4, 12, ..."></div>
                      <div className="bg-[#f97316] rounded-sm" title="Layer Index 5, 13, ..."></div>
                      <div className="bg-[#06b6d4] rounded-sm" title="Layer Index 6, 14, ..."></div>
                      <div className="bg-[#84cc16] rounded-sm" title="Layer Index 7, 15, ..."></div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5 italic leading-snug">
                      Toolpath segments are colored cyclically from our custom high-contrast palette based on their discrete Z-axis group.
                    </p>
                  </div>
                )}
              </div>

              {/* Path Terminus Indicators */}
              <div className="border-t border-slate-900 pt-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Endpoint Markers</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 font-medium text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block ring-2 ring-emerald-500/20"></span>
                    <span>Start node (Green)</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-medium text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block ring-2 ring-red-500/20"></span>
                    <span>End node (Red)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Toolpath Stats HUD */}
          <div className="p-5 flex flex-col gap-3.5">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-cyan-400" /> Bounding Stats
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Estimated Cycle Time</span>
                <span className="text-base font-extrabold text-white">
                  {Math.floor(stats.estimatedDuration / 60)}m {(stats.estimatedDuration % 60).toFixed(0)}s
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Based on specified speed profile</span>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Extruded Length</span>
                <span className="text-base font-extrabold text-emerald-400">
                  {stats.totalLength.toLocaleString()} mm
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Linear coordinate sum</span>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 col-span-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Coordinate Geometry Cage</span>
                  <span className="text-[9px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-indigo-300 font-mono rounded">
                    {stats.pointCount} points
                  </span>
                </div>
                <div className="grid grid-cols-3 text-center divide-x divide-slate-800/80 pt-1.5 border-t border-slate-900">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">X Size</span>
                    <p className="text-xs font-bold text-slate-200">{stats.boundingBox.sizeX.toFixed(1)} mm</p>
                    <p className="text-[9px] text-slate-500">[{stats.boundingBox.minX.toFixed(0)}, {stats.boundingBox.maxX.toFixed(0)}]</p>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">Y Size</span>
                    <p className="text-xs font-bold text-slate-200">{stats.boundingBox.sizeY.toFixed(1)} mm</p>
                    <p className="text-[9px] text-slate-500">[{stats.boundingBox.minY.toFixed(0)}, {stats.boundingBox.maxY.toFixed(0)}]</p>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">Z Size</span>
                    <p className="text-xs font-bold text-slate-200">{stats.boundingBox.sizeZ.toFixed(1)} mm</p>
                    <p className="text-[9px] text-slate-500">[{stats.boundingBox.minZ.toFixed(0)}, {stats.boundingBox.maxZ.toFixed(0)}]</p>
                  </div>
                </div>
              </div>

              {/* Interactive Canvas Instructions Card */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/60 col-span-2 flex flex-col gap-2 mt-1">
                <div className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase border-b border-slate-900 pb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block animate-pulse"></span>
                  Interactive Canvas Instructions
                </div>
                <div className="flex flex-col gap-1.5 text-[11px] text-slate-300">
                  <div className="flex justify-between items-center bg-slate-900/40 px-2 py-1 rounded">
                    <span>Rotate Model</span>
                    <span className="text-[10px] font-semibold text-white bg-slate-800 px-1.5 py-0.5 rounded">Left Click + Drag</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-900/40 px-2 py-1 rounded">
                    <span>Pan Camera</span>
                    <span className="text-[10px] font-semibold text-white bg-slate-800 px-1.5 py-0.5 rounded">Right Click + Drag</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-900/40 px-2 py-1 rounded">
                    <span>Zoom In / Out</span>
                    <span className="text-[10px] font-semibold text-white bg-slate-800 px-1.5 py-0.5 rounded">Scroll Wheel</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-900/40 px-2 py-1 rounded">
                    <span>Angle Presets</span>
                    <span className="text-[10px] font-semibold text-cyan-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">Keys [1] - [7]</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-900/40 px-2 py-1 rounded">
                    <span>Inspect Coordinates</span>
                    <span className="text-[10px] font-semibold text-white bg-slate-800 px-1.5 py-0.5 rounded">Hover Over Nodes</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right Side: Interactive Visualizer & Code Editor Tab Console */}
        <div className="lg:col-span-8 flex flex-col h-full bg-slate-950">
          
          {/* Navigation Control Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-900 justify-between items-center px-4 pr-6">
            <div className="flex">
              <button
                id="tab-visualizer"
                onClick={() => setActiveTab("visualizer")}
                className={`flex items-center gap-1.5 px-5 py-3.5 text-xs font-bold transition border-b-2 ${
                  activeTab === "visualizer"
                    ? "border-cyan-500 text-white bg-slate-950/40"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-950/20"
                }`}
              >
                <Activity className="h-4 w-4 text-cyan-400" />
                3D Interactive Viewer
              </button>
              
              <button
                id="tab-data-detail"
                onClick={() => setActiveTab("dataDetail")}
                className={`flex items-center gap-1.5 px-5 py-3.5 text-xs font-bold transition border-b-2 ${
                  activeTab === "dataDetail"
                    ? "border-cyan-500 text-white bg-slate-950/40"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-950/20"
                }`}
              >
                <FileText className="h-4 w-4 text-indigo-400" />
                Parsed Coordinates Table
              </button>

              <button
                id="tab-raw-editor"
                onClick={() => setActiveTab("rawEditor")}
                className={`flex items-center gap-1.5 px-5 py-3.5 text-xs font-bold transition border-b-2 ${
                  activeTab === "rawEditor"
                    ? "border-cyan-500 text-white bg-slate-950/40"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-950/20"
                }`}
              >
                <FileCode className="h-4 w-4 text-emerald-400" />
                Raw CSV Source Code
              </button>
            </div>

            {/* Displaying Live Coordinates Tracking indicator */}
            {hoveredPoint && (
              <div className="hidden md:flex items-center gap-3 bg-slate-950/80 border border-slate-700/60 rounded-lg py-1 px-3.5 font-mono text-[10px] text-slate-300">
                <span className="text-cyan-400 font-bold uppercase">{hoveredPoint.type}</span>
                <span>X: <strong className="text-white">{hoveredPoint.x.toFixed(2)}</strong></span>
                <span>Y: <strong className="text-white">{hoveredPoint.y.toFixed(2)}</strong></span>
                <span>Z: <strong className="text-white">{hoveredPoint.z.toFixed(2)}</strong></span>
                <span>Speed: <strong className="text-amber-400">{hoveredPoint.speed}</strong></span>
              </div>
            )}
          </div>

          {/* Tab Display Panel Switcher */}
          <div className="flex-1 overflow-hidden relative">

            {/* TAB 1: Real-time Three.js Visualizer Panel */}
            {activeTab === "visualizer" && (
              <div className="w-full h-full flex flex-col relative bg-slate-950">
                <div className="flex-1 w-full h-[500px]">
                  <ThreeCanvas
                    points={points}
                    boundingBox={stats.boundingBox}
                    currentSegmentIndex={currentSegmentIndex}
                    onSelectPoint={handleSelectPoint}
                    colorScheme={colorScheme}
                    showGrid={showGrid}
                    showBoundingBox={showBoundingBox}
                    showNozzle={showNozzle}
                    onHoverPoint={(p) => setHoveredPoint(p)}
                    playbackProgress={points.length > 0 ? currentSegmentIndex / points.length : 0}
                    cameraMode={cameraMode}
                    setCameraMode={setCameraMode}
                    showNumbers={showNumbers}
                    gridSpacing={gridSpacing}
                    speedColors={speedColors}
                    measurementPointA={measurementPointA}
                    measurementPointB={measurementPointB}
                    isMeasurementMode={isMeasurementMode}
                    setIsMeasurementMode={setIsMeasurementMode}
                    setMeasurementPointA={setMeasurementPointA}
                    setMeasurementPointB={setMeasurementPointB}
                    selectedPoint={selectedPoint}
                    speedUnit={speedUnit}
                    speedOpacities={speedOpacities}
                    cameraResetToken={cameraResetToken}
                  />
                </div>

                {/* Collapsed view toggle button floating over the viewer */}
                {!isPlaybackDrawerOpen && (
                  <button
                    id="btn-show-playback-drawer"
                    onClick={() => setIsPlaybackDrawerOpen(true)}
                    className="absolute bottom-4 left-4 bg-slate-900/95 hover:bg-slate-800 text-slate-200 px-4 py-3 rounded-2xl border border-slate-700/80 shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-bold transition-all z-10 duration-200 hover:scale-105 active:scale-95 group cursor-pointer"
                    title="Open Simulation Playback Drawer"
                  >
                    <Play className="h-4 w-4 fill-indigo-400 text-indigo-400 group-hover:text-white transition-colors" />
                    <span className="tracking-wide">Playback Controls</span>
                  </button>
                )}

                {/* Simulated playback tracking drawer controller */}
                <div className={`border-t border-slate-800/80 bg-slate-900/95 absolute bottom-0 inset-x-0 p-4 shadow-2xl backdrop-blur-md flex flex-col gap-3 transition-all duration-300 transform origin-bottom ${
                  isPlaybackDrawerOpen
                    ? "translate-y-0 opacity-100 z-10"
                    : "translate-y-full opacity-0 pointer-events-none z-0"
                }`}>
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* Media playback buttons group */}
                    <div className="flex items-center gap-2">
                      <button
                        id="play-button"
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`p-2.5 rounded-xl transition ${
                          isPlaying
                            ? "bg-rose-600 hover:bg-rose-500 text-white shrink-0"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 shadow-lg shadow-indigo-600/30"
                        }`}
                        title={isPlaying ? "Pause nozzle movement" : "Live trajectory simulation print"}
                      >
                        {isPlaying ? <Pause className="h-4.5 w-4.5 fill-current" /> : <Play className="h-4.5 w-4.5 fill-current ml-0.5" />}
                      </button>

                      <button
                        id="reset-simulation"
                        onClick={() => {
                          setIsPlaying(false);
                          setCurrentSegmentIndex(0);
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 rounded-xl border border-slate-700 transition"
                        title="Return extrusion nozzle back to start"
                      >
                        <RotateCcw className="h-4.5 w-4.5" />
                      </button>

                      {/* Speed Multipliers selection */}
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-1 flex items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase px-2">Speed:</span>
                        {[1, 5, 10, 20, 50].map((mult) => (
                          <button
                            key={mult}
                            onClick={() => setSpeedMultiplier(mult)}
                            className={`px-2 py-0.5 text-[9px] font-bold rounded-lg transition-all ${
                              speedMultiplier === mult
                                ? "bg-cyan-500 text-slate-950"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                            }`}
                          >
                            {mult}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Live Segment Status feedback info & Drawer close trigger */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-xs text-slate-300 font-mono">
                        <span>Nozzle Position:</span>
                        <strong className="text-white bg-slate-950 border border-slate-850 px-2 py-1 rounded">
                          {currentSegmentIndex} / {Math.max(0, points.length - 1)}
                        </strong>
                      </div>

                      <button
                        id="btn-hide-playback-drawer"
                        onClick={() => setIsPlaybackDrawerOpen(false)}
                        className="bg-slate-850 hover:bg-slate-700 text-slate-400 hover:text-slate-200 p-2 rounded-xl border border-slate-700 transition flex items-center justify-center gap-1 text-[10px] font-bold uppercase cursor-pointer"
                        title="Collapse Playback Controls Drawer"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Hide</span>
                      </button>
                    </div>
                  </div>

                  {/* Manual Horizontal Timeline playback slider */}
                  <div className="flex items-center gap-4 w-full">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">Timeline Progress</span>
                    <input
                      id="timeline-slider"
                      type="range"
                      min={0}
                      max={Math.max(0, points.length - 1)}
                      value={currentSegmentIndex}
                      onChange={(e) => {
                        setIsPlaying(false);
                        setCurrentSegmentIndex(Number(e.target.value));
                      }}
                      className="flex-1 h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500 border border-slate-800"
                    />
                    <span className="text-[11px] text-indigo-400 font-bold font-mono min-w-[32px] text-right">
                      {points.length > 0 ? ((currentSegmentIndex / Math.max(1, points.length - 1)) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Parsed Coordinate Data Table Panel */}
            {activeTab === "dataDetail" && (
              <div className="w-full h-full flex flex-col overflow-hidden">
                <div className="p-4 bg-slate-900/40 border-b border-slate-800/85 flex sm:flex-row items-center gap-4 justify-between flex-wrap">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Processed Coordinate Logbook</h3>
                    <p className="text-[11px] text-slate-500">Sequential points extracted after cleaning headers & null bounds.</p>
                  </div>
                  <div className="text-xs font-mono text-slate-400">
                    Total: <strong className="text-indigo-400">{points.length} coordinates</strong>
                  </div>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead className="bg-slate-900 sticky top-0 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-2.5 px-4 font-bold uppercase text-[9px] tracking-wider">Index</th>
                        <th className="py-2.5 px-4 font-bold uppercase text-[9px] tracking-wider">G-Code Type</th>
                        <th className="py-2.5 px-4 font-bold uppercase text-[9px] tracking-wider text-right">X Coordinate (mm)</th>
                        <th className="py-2.5 px-4 font-bold uppercase text-[9px] tracking-wider text-right">Y Coordinate (mm)</th>
                        <th className="py-2.5 px-4 font-bold uppercase text-[9px] tracking-wider text-right">Z Coordinate (mm)</th>
                        <th className="py-2.5 px-4 font-bold uppercase text-[9px] tracking-wider text-right">Speed ({speedUnit})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                      {points.map((pt, idx) => (
                        <tr
                          key={pt.index}
                          className={`hover:bg-indigo-950/20 transition cursor-pointer ${
                            currentSegmentIndex === idx ? "bg-indigo-500/10 font-semibold" : ""
                          }`}
                          onClick={() => {
                            setCurrentSegmentIndex(idx);
                            setActiveTab("visualizer");
                          }}
                        >
                          <td className="py-2 px-4 text-slate-500">#{pt.index}</td>
                          <td className="py-2 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              pt.type.toUpperCase() === "G0" || pt.type.toUpperCase() === "RAPID"
                                ? "bg-rose-500/15 text-rose-300 border border-rose-500/20"
                                : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                            }`}>
                              {pt.type}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-right text-slate-200">{pt.x.toFixed(3)}</td>
                          <td className="py-2 px-4 text-right text-slate-200">{pt.y.toFixed(3)}</td>
                          <td className="py-2 px-4 text-right text-slate-200">{pt.z.toFixed(3)}</td>
                          <td className="py-2 px-4 text-right text-amber-400">{pt.speed.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: Raw CSV Code Source Textarea Panel */}
            {activeTab === "rawEditor" && (
              <div className="w-full h-full flex flex-col overflow-hidden p-5 gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Raw CSV Toolpath Stream</h3>
                    <p className="text-[11px] text-slate-500">Make immediate edits below to see the 3D model rebuild down to the millimeter.</p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(csvText);
                      setSuccessMessage("Copied toolpath CSV source code to clipboard!");
                      setTimeout(() => setSuccessMessage(null), 3000);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold py-1 px-3.5 rounded border border-slate-700 transition"
                  >
                    Copy CSV Content
                  </button>
                </div>

                <div className="flex-1 w-full relative">
                  <textarea
                    id="raw-csv-textarea"
                    value={csvText}
                    onChange={(e) => handleCSVTextareaChange(e.target.value)}
                    className="w-full h-full p-4 bg-slate-900 border border-slate-800 rounded-xl focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none font-mono text-xs text-slate-200 leading-relaxed overflow-y-auto"
                    placeholder="line_type,X,Y,Z,speed"
                  />
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
