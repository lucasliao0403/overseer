import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { vectors, Vector6D } from "../data/spheres";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Extended interface for our data points
interface DataPoint extends Vector6D {
  size?: number; // Size factor (1.0 is default)
  cluster?: number; // Cluster ID
  confidence?: number; // Confidence score (0-1)
  connections?: number[]; // Indices of connected data points
}

// Define cluster colors
const clusterColors = [
  new THREE.Color(0x4285f4), // Blue
  new THREE.Color(0xea4335), // Red
  new THREE.Color(0xfbbc05), // Yellow
  new THREE.Color(0x34a853), // Green
  new THREE.Color(0x8f00ff), // Purple
  new THREE.Color(0xff6d01), // Orange
];

// Define interface for embeddings data
interface EmbeddingsData {
  dimensions: number;
  count: number;
  embeddings: number[][];
  file_size_bytes: number;
}

// Fix duplicate interfaces and component declarations
interface SphereSceneProps {
  unbiasedEmbeddings?: EmbeddingsData | null;
  removedEmbeddings?: EmbeddingsData | null;
  activeTab?: string | null; // Define allowed literal values
  clusterData?: any;
}

// Add this before your SphereScene component, outside any function
declare global {
  interface Window {
    apiDataPoints?: DataPoint[];
    recenterCamera?: () => void;
  }
}

export default function SphereScene({
  unbiasedEmbeddings,
  removedEmbeddings,
  activeTab = "clusters",
  clusterData,
}: SphereSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const rotationRef = useRef({ x: 0, y: 0 });
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const [hoveredVector, setHoveredVector] = useState<DataPoint | null>(null);
  const [selectedVector, setSelectedVector] = useState<DataPoint | null>(null);
  const didMoveRef = useRef(false);
  const hoveredSphereRef = useRef<THREE.Mesh | null>(null);
  const selectedSphereRef = useRef<THREE.Mesh | null>(null);
  const cameraPositionRef = useRef({ z: 12 });
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<THREE.Group | null>(null);
  const removedPointsRef = useRef<THREE.Group | null>(null);

  // Add velocity tracking for momentum
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastTimeRef = useRef(0);
  const momentumActiveRef = useRef(false);

  // Example: track data from embeddings if needed
  const [apiDataPoints, setApiDataPoints] = useState<any[]>([]);

  // Function to handle recenter button click - moved outside useEffect
  const handleRecenter = () => {
    if (window.recenterCamera) {
      window.recenterCamera();
    }
  };

  // Function to get cluster name - moved outside useEffect
  const getClusterName = (clusterId: number | undefined) => {
    if (clusterId === undefined) return "Unknown";
    const clusterNames = [
      "Blue Group",
      "Red Group",
      "Yellow Group",
      "Green Group",
    ];
    return clusterNames[clusterId % clusterNames.length];
  };

  // 1. First effect: basic scene setup (if clusters tab)
  useEffect(() => {
    if (activeTab !== "clusters" || !canvasRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fa);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 6;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // Create a group to hold all spheres
    const sphereGroup = new THREE.Group();
    scene.add(sphereGroup);

    // Create a group for connection lines
    const lineGroup = new THREE.Group();
    sphereGroup.add(lineGroup);

    // Custom shader material definitions
    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      uniform float time;
      uniform float pulseIntensity;
      uniform bool isActiveCluster;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vUv = uv;
        
        // Add subtle vertex displacement for shimmer effect
        vec3 newPosition = position + normal * sin(position.x * 10.0 + time * 2.0) * 0.01;
        
        // Add pulsing effect for cluster highlighting
        float pulseFactor = 0.0;
        if (isActiveCluster) {
          // Create a pulsing effect
          pulseFactor = sin(time * 2.0) * 0.5 + 0.5; // Oscillates between 0 and 1
          
          // Add a smaller base size increase (15%) plus a smaller pulsing component (15%)
          newPosition += normal * (0.02 + pulseFactor * 0.10) * pulseIntensity;
        }
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      uniform vec3 baseColor;
      uniform float time;
      uniform bool isHovered;
      uniform bool isActiveCluster;
      uniform float confidence;
      
      void main() {
        // Calculate fresnel effect for edge highlighting
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - dot(vNormal, viewDirection), 3.0);
        
        // Create shimmer effect
        float shimmer = sin(vPosition.x * 20.0 + vPosition.y * 20.0 + vPosition.z * 20.0 + time * 3.0) * 0.5 + 0.5;
        shimmer = pow(shimmer, 4.0) * 0.15;
        
        // Combine base color with effects
        vec3 color = baseColor;
        
        // Adjust color based on confidence
        color = mix(color * 0.7, color, confidence);
        
        // Add edge highlight
        color += vec3(1.0, 1.0, 1.0) * fresnel * 0.3;
        
        // Add shimmer
        color += vec3(1.0, 1.0, 1.0) * shimmer;
        
        // Add active cluster highlighting
        if (isActiveCluster && !isHovered) {
          float pulse = sin(time * 2.0) * 0.5 + 0.5;
          color = color * 1.2 + vec3(1.0, 1.0, 1.0) * pulse * 0.1;
        }
        
        // Add glow effect when hovered
        if (isHovered) {
          // Increase brightness and add pulsing glow
          float pulse = sin(time * 5.0) * 0.5 + 0.5;
          color = color * 1.5 + vec3(1.0, 1.0, 1.0) * pulse * 0.3;
        }
        
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // Clock for animation timing
    const clock = new THREE.Clock();

    // Raycaster for clicking spheres
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Store vector data with each sphere
    const spheresWithData: {
      sphere: THREE.Mesh;
      dataPoint: DataPoint;
      material: THREE.ShaderMaterial;
      position: THREE.Vector3;
    }[] = [];

    // Render loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      controls.dispose();
    };
  }, [activeTab]);

  // 2. Second effect: convert unbiasedEmbeddings into data points if clusters tab
  useEffect(() => {
    if (activeTab !== "clusters" || !unbiasedEmbeddings?.embeddings) return;

    try {
      const points = unbiasedEmbeddings.embeddings
        .map((emb) => {
          // Make sure there's enough length
          if (emb.length < 6) return null;
          // Example: convert to a data point
          return {
            x: emb[0],
            y: emb[1],
            z: emb[2],
            r: (emb[3] + 1) / 2,
            g: (emb[4] + 1) / 2,
            b: (emb[5] + 1) / 2,
          };
        })
        .filter(Boolean);

      setApiDataPoints(points as any[]);
    } catch (error) {
      console.error("Error converting embeddings:", error);
      setApiDataPoints([]);
    }
  }, [unbiasedEmbeddings, activeTab]);

  // 3. Third effect: actually create spheres (or points) from dataPoints if clusters tab
  useEffect(() => {
    if (activeTab !== "clusters") return;
    if (!sceneRef.current) return;

    // Clear previous objects if needed
    // ...

    // Create new group
    const group = new THREE.Group();

    // Example scale factor
    const SCALE = 2.5;
    // Create spheres
    apiDataPoints.forEach(({ x, y, z, r, g, b }) => {
      // Use a consistent, very small size (0.05)
      const geometry = new THREE.SphereGeometry(0.05, 12, 12);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(r, g, b),
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x * SCALE, y * SCALE, z * SCALE);
      group.add(mesh);
    });

    sceneRef.current.add(group);

    // Cleanup
    return () => {
      sceneRef.current?.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) obj.material.dispose();
        }
      });
    };
  }, [apiDataPoints, activeTab]);

  // 4. Fourth effect: handle removedEmbeddings similarly if needed
  useEffect(() => {
    if (
      activeTab !== "clusters" ||
      !removedEmbeddings?.embeddings ||
      !sceneRef.current
    )
      return;

    // Example: create a group
    const removedGroup = new THREE.Group();
    const SCALE = 2.5;

    removedEmbeddings.embeddings.forEach((emb) => {
      if (emb.length < 6) return;
      // Same size for consistency
      const geometry = new THREE.SphereGeometry(0.05, 12, 12);
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(
          (emb[3] + 1) / 2,
          (emb[4] + 1) / 2,
          (emb[5] + 1) / 2
        ),
        opacity: 0.7,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(emb[0] * SCALE, emb[1] * SCALE, emb[2] * SCALE);
      removedGroup.add(mesh);
    });

    sceneRef.current.add(removedGroup);

    return () => {
      sceneRef.current?.remove(removedGroup);
      removedGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) obj.material.dispose();
        }
      });
    };
  }, [removedEmbeddings, activeTab]);

  // Component return: conditionally render if not clusters
  if (activeTab !== "clusters") {
    return (
      <div className="min-h-screen bg-gray-50 p-6 pt-24">
        {/* Put whatever you need for non-clusters tab */}
        Non-clusters content here...
      </div>
    );
  }

  // Otherwise, show the 3D canvas
  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
