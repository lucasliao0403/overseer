import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { vectors, Vector6D } from '../data/spheres';

// Extended interface for our data points
interface DataPoint extends Vector6D {
  size?: number;        // Size factor (1.0 is default)
  cluster?: number;     // Cluster ID
  confidence?: number;  // Confidence score (0-1)
  connections?: number[]; // Indices of connected data points
}

// Mock cluster data - replace with actual data from backend
const mockClusters = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3];
const mockSizes = vectors.map(() => 0.5 + Math.random() * 1.5);
const mockConfidence = vectors.map(() => 0.3 + Math.random() * 0.7);

// Generate mock connections (in real app, this would come from backend)
const mockConnections: number[][] = [];
for (let i = 0; i < vectors.length; i++) {
  const connections: number[] = [];
  // Connect points in same cluster with some probability
  for (let j = 0; j < vectors.length; j++) {
    if (i !== j && mockClusters[i] === mockClusters[j] && Math.random() > 0.7) {
      connections.push(j);
    }
  }
  mockConnections.push(connections);
}

// Enhance vectors with additional data
const dataPoints: DataPoint[] = vectors.map((vector, index) => ({
  ...vector,
  size: mockSizes[index],
  cluster: mockClusters[index % mockClusters.length],
  confidence: mockConfidence[index],
  connections: mockConnections[index]
}));

// Define cluster colors
const clusterColors = [
  new THREE.Color(0x4285F4), // Blue
  new THREE.Color(0xEA4335), // Red
  new THREE.Color(0xFBBC05), // Yellow
  new THREE.Color(0x34A853), // Green
  new THREE.Color(0x8F00FF), // Purple
  new THREE.Color(0xFF6D01), // Orange
];

export default function SphereScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const rotationRef = useRef({ x: 0, y: 0 });
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const [hoveredVector, setHoveredVector] = useState<DataPoint | null>(null);
  const didMoveRef = useRef(false);
  const hoveredSphereRef = useRef<THREE.Mesh | null>(null);
  const cameraPositionRef = useRef({ z: 12 }); // Increased default distance
  const [activeCluster, setActiveCluster] = useState<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fa);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = cameraPositionRef.current.z;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

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

    // Function to convert HSB to RGB color
    const hsbToRgb = (h: number, s: number, b: number): THREE.Vector3 => {
      // Convert HSB to RGB first
      h = h % 360;
      s = s / 100;
      b = b / 100;
      
      let c = b * s;
      let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      let m = b - c;
      let r = 0, g = 0, b1 = 0;
      
      if (h >= 0 && h < 60) { r = c; g = x; b1 = 0; }
      else if (h >= 60 && h < 120) { r = x; g = c; b1 = 0; }
      else if (h >= 120 && h < 180) { r = 0; g = c; b1 = x; }
      else if (h >= 180 && h < 240) { r = 0; g = x; b1 = c; }
      else if (h >= 240 && h < 300) { r = x; g = 0; b1 = c; }
      else { r = c; g = 0; b1 = x; }
      
      r = r + m;
      g = g + m;
      b1 = b1 + m;
      
      return new THREE.Vector3(r, g, b1);
    };

    // Store vector data with each sphere
    const spheresWithData: { 
      sphere: THREE.Mesh; 
      dataPoint: DataPoint; 
      material: THREE.ShaderMaterial;
      position: THREE.Vector3;
    }[] = [];

    // Create spheres based on data points
    dataPoints.forEach((dataPoint: DataPoint, index) => {
      // Determine sphere size based on data
      const baseSize = 0.2;
      const sizeMultiplier = dataPoint.size || 1.0;
      const finalSize = baseSize * sizeMultiplier;
      
      const geometry = new THREE.SphereGeometry(finalSize, 32, 32);
      
      // Use cluster color or HSB color
      const clusterColor = clusterColors[dataPoint.cluster || 0 % clusterColors.length];
      const rgbColor = dataPoint.cluster !== undefined 
        ? new THREE.Vector3(clusterColor.r, clusterColor.g, clusterColor.b)
        : hsbToRgb(dataPoint[3], dataPoint[4], dataPoint[5]);
      
      // Create shader material with uniforms
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          baseColor: { value: rgbColor },
          time: { value: 0.0 },
          isHovered: { value: false },
          isActiveCluster: { value: false },
          confidence: { value: dataPoint.confidence || 0.5 },
          pulseIntensity: { value: 0.0 }
        }
      });
      
      const sphere = new THREE.Mesh(geometry, material);
      
      // Position the sphere
      const position = new THREE.Vector3(
        dataPoint[0] * 2.5, 
        dataPoint[1] * 2.5, 
        dataPoint[2] * 2.5
      );
      sphere.position.copy(position);
      
      sphereGroup.add(sphere);
      spheresWithData.push({ 
        sphere, 
        dataPoint, 
        material, 
        position 
      });
    });

    // Function to handle cluster selection from the panel
    const handleClusterSelect = (clusterId: number) => {
      // Toggle cluster selection
      setActiveCluster(activeCluster === clusterId ? null : clusterId);
    };

    // Update spheres based on active cluster
    const updateSpheresForActiveCluster = () => {
      spheresWithData.forEach(({ material, dataPoint }) => {
        // A sphere is active if it belongs to the active cluster
        const isActive = activeCluster !== null && dataPoint.cluster === activeCluster;
        material.uniforms.isActiveCluster.value = isActive;
        
        // Add pulsing effect to spheres in the active cluster
        if (isActive) {
          material.uniforms.pulseIntensity.value = 1.0;
        } else {
          material.uniforms.pulseIntensity.value = 0.0;
        }
      });
      
      // Recreate connection lines based on active cluster
      createConnectionLines();
    };

    // Create connection lines between related data points
    const createConnectionLines = () => {
      // Remove existing lines
      while (lineGroup.children.length > 0) {
        const line = lineGroup.children[0];
        lineGroup.remove(line);
        if (line instanceof THREE.Line) {
          (line.geometry as THREE.BufferGeometry).dispose();
          (line.material as THREE.Material).dispose();
        }
      }
      
      // Create new lines
      spheresWithData.forEach((sourceData, sourceIndex) => {
        const connections = sourceData.dataPoint.connections || [];
        
        connections.forEach(targetIndex => {
          if (targetIndex >= spheresWithData.length) return;
          
          const targetData = spheresWithData[targetIndex];
          
          // Skip if neither sphere is in active cluster (when one is selected)
          if (activeCluster !== null && 
              sourceData.dataPoint.cluster !== activeCluster && 
              targetData.dataPoint.cluster !== activeCluster) {
            return;
          }
          
          // Create line geometry
          const points = [
            sourceData.position.clone(),
            targetData.position.clone()
          ];
          
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          
          // Calculate similarity strength (mock data - replace with actual similarity)
          const similarity = Math.random(); // 0-1 value
          
          // Create line material with opacity based on similarity
          const material = new THREE.LineBasicMaterial({ 
            color: 0x333333, // Even darker color
            transparent: true,
            opacity: 0.5 + similarity * 0.4, // Increased base opacity
            linewidth: 3 // Increased line width
          });
          
          const line = new THREE.Line(geometry, material);
          lineGroup.add(line);
        });
      });
    };

    // Initial creation of connection lines
    createConnectionLines();

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Add zoom functionality with simpler implementation
    const handleWheel = (event: WheelEvent) => {
      // Only handle wheel events when mouse is over our canvas
      const canvasElement = canvasRef.current;
      if (!canvasElement) return;
      
      const rect = canvasElement.getBoundingClientRect();
      const isMouseOverCanvas = 
        event.clientX >= rect.left && 
        event.clientX <= rect.right && 
        event.clientY >= rect.top && 
        event.clientY <= rect.bottom;
      
      if (!isMouseOverCanvas) return;
      
      // Prevent default scrolling behavior
      event.preventDefault();
      
      // Fixed step size for consistent zooming
      const zoomStep = 0.5;
      
      // Determine zoom direction
      const zoomIn = event.deltaY < 0;
      
      // Update camera position
      if (zoomIn) {
        camera.position.z -= zoomStep; // Move camera closer
      } else {
        camera.position.z += zoomStep; // Move camera farther
      }
      
      // Apply min/max limits
      camera.position.z = Math.max(3, Math.min(20, camera.position.z));
      
      // Update the ref to keep track of camera position
      cameraPositionRef.current.z = camera.position.z;
    };
    
    // Add wheel event listener
    window.addEventListener('wheel', handleWheel, { passive: false });

    // Function to handle sphere hover
    const handleSphereHover = (event: MouseEvent) => {
      const canvasElement = canvasRef.current;
      if (!canvasElement) return;
      
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = canvasElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update the picking ray with the camera and mouse position
      raycaster.setFromCamera(mouse, camera);
      
      // Calculate objects intersecting the picking ray
      const intersects = raycaster.intersectObjects(sphereGroup.children);
      
      // Reset previously hovered sphere if it exists
      if (hoveredSphereRef.current) {
        const prevHoveredData = spheresWithData.find(
          item => item.sphere === hoveredSphereRef.current
        );
        if (prevHoveredData) {
          prevHoveredData.material.uniforms.isHovered.value = false;
        }
        hoveredSphereRef.current = null;
      }
      
      if (intersects.length > 0) {
        // Find the hovered sphere in our data array
        const hoveredSphere = spheresWithData.find(
          item => item.sphere === intersects[0].object
        );
        
        if (hoveredSphere) {
          setHoveredVector(hoveredSphere.dataPoint);
          hoveredSphereRef.current = hoveredSphere.sphere;
          hoveredSphere.material.uniforms.isHovered.value = true;
        }
      } else {
        // Not hovering over any sphere, clear selection
        setHoveredVector(null);
      }
    };

    // Function to handle sphere click
    const handleSphereClick = (event: MouseEvent) => {
      if (didMoveRef.current) return; // Skip if dragging
      
      const canvasElement = canvasRef.current;
      if (!canvasElement) return;
      
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = canvasElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update the picking ray with the camera and mouse position
      raycaster.setFromCamera(mouse, camera);
      
      // Calculate objects intersecting the picking ray
      const intersects = raycaster.intersectObjects(sphereGroup.children);
      
      if (intersects.length > 0) {
        // Find the clicked sphere in our data array
        const clickedSphere = spheresWithData.find(
          item => item.sphere === intersects[0].object
        );
        
        if (clickedSphere) {
          const clickedCluster = clickedSphere.dataPoint.cluster;
          
          // Toggle cluster selection
          if (activeCluster === clickedCluster) {
            setActiveCluster(null);
          } else {
            setActiveCluster(clickedCluster ?? null);
          }
          
          // Update all spheres' active cluster state
          spheresWithData.forEach(({ material, dataPoint }) => {
            const isActive = activeCluster === null || dataPoint.cluster === activeCluster;
            material.uniforms.isActiveCluster.value = isActive;
            
            // Add pulsing effect to spheres in the active cluster
            if (activeCluster !== null && dataPoint.cluster === activeCluster) {
              material.uniforms.pulseIntensity.value = 1.0;
            } else {
              material.uniforms.pulseIntensity.value = 0.0;
            }
          });
          
          // Recreate connection lines based on active cluster
          createConnectionLines();
        }
      }
    };

    // Mouse event handlers
    const handleMouseDown = (event: MouseEvent) => {
      isDraggingRef.current = true;
      didMoveRef.current = false;
      previousMousePositionRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
    };

    const handleMouseMove = (event: MouseEvent) => {
      // Always check for hover, regardless of dragging state
      handleSphereHover(event);
      
      if (!isDraggingRef.current) return;
      
      const deltaX = event.clientX - previousMousePositionRef.current.x;
      const deltaY = event.clientY - previousMousePositionRef.current.y;
      
      // If the user moved more than a few pixels, count as dragging rather than clicking
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        didMoveRef.current = true;
      }
      
      rotationRef.current.y += deltaX * 0.006;
      rotationRef.current.x += deltaY * 0.006;
      
      previousMousePositionRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!didMoveRef.current) {
        handleSphereClick(event);
      }
      isDraggingRef.current = false;
    };

    // Touch event handlers for mobile
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        isDraggingRef.current = true;
        didMoveRef.current = false;
        previousMousePositionRef.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        // Convert touch to mouse event for hover handling
        const touch = event.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        handleSphereHover(mouseEvent);
      }
      
      if (!isDraggingRef.current || event.touches.length !== 1) return;
      
      const deltaX = event.touches[0].clientX - previousMousePositionRef.current.x;
      const deltaY = event.touches[0].clientY - previousMousePositionRef.current.y;
      
      // If the user moved more than a few pixels, count as dragging rather than clicking
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        didMoveRef.current = true;
      }
      
      rotationRef.current.y += deltaX * 0.003;
      rotationRef.current.x += deltaY * 0.003;
      
      previousMousePositionRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (isDraggingRef.current && !didMoveRef.current && event.changedTouches.length > 0) {
        // Convert touch to mouse event for click handling
        const touch = event.changedTouches[0];
        const mouseEvent = new MouseEvent('mouseup', {
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        handleMouseUp(mouseEvent);
      }
      isDraggingRef.current = false;
    };

    // Add event listeners
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    // Watch for changes to activeCluster
    updateSpheresForActiveCluster();

    // Expose a function to reset camera and rotation
    window.recenterCamera = () => {
      // Store starting values for animation
      const startRotX = rotationRef.current.x;
      const startRotY = rotationRef.current.y;
      const startZ = camera.position.z;
      
      // Target values
      const targetRotX = 0;
      const targetRotY = 0;
      const targetZ = 12; // Default camera position
      
      const duration = 1000; // Animation duration in ms
      const startTime = performance.now();
      
      const animateReset = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Use easeOutCubic for smooth animation
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        // Interpolate rotation
        rotationRef.current.x = startRotX + (targetRotX - startRotX) * easeProgress;
        rotationRef.current.y = startRotY + (targetRotY - startRotY) * easeProgress;
        
        // Interpolate camera position
        camera.position.z = startZ + (targetZ - startZ) * easeProgress;
        cameraPositionRef.current.z = camera.position.z;
        
        if (progress < 1) {
          requestAnimationFrame(animateReset);
        }
      };
      
      requestAnimationFrame(animateReset);
      
      // Reset active cluster
      setActiveCluster(null);
      
      // Update all spheres' active cluster state
      spheresWithData.forEach(({ material }) => {
        material.uniforms.isActiveCluster.value = false;
        material.uniforms.pulseIntensity.value = 0.0;
      });
      
      // Recreate connection lines
      createConnectionLines();
    };

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Update time uniform for all shader materials
      const elapsedTime = clock.getElapsedTime();
      spheresWithData.forEach(({ material }) => {
        material.uniforms.time.value = elapsedTime;
      });
      
      // Apply rotation to the sphere group
      sphereGroup.rotation.x = rotationRef.current.x;
      sphereGroup.rotation.y = rotationRef.current.y;
      
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup function
    return () => {
      // Reset hovered state
      if (hoveredSphereRef.current) {
        const hoveredData = spheresWithData.find(
          item => item.sphere === hoveredSphereRef.current
        );
        if (hoveredData) {
          hoveredData.material.uniforms.isHovered.value = false;
        }
      }
      
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('wheel', handleWheel);
      
      // Dispose of all resources
      sphereGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      scene.remove(sphereGroup);
      renderer.dispose();

      // Remove the global recenter function
      delete window.recenterCamera;
    };
  }, [activeCluster]);

  // Function to handle recenter button click
  const handleRecenter = () => {
    if (window.recenterCamera) {
      window.recenterCamera();
    }
  };

  // Function to get cluster name
  const getClusterName = (clusterId: number | undefined) => {
    if (clusterId === undefined) return "Unknown";
    const clusterNames = ["Blue Group", "Red Group", "Yellow Group", "Green Group"];
    return clusterNames[clusterId % clusterNames.length];
  };

  return (
    <main className="relative min-h-screen">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full fixed top-0 left-0 -z-10 cursor-grab active:cursor-grabbing" 
      />
      
      {/* Legend */}
      <div className="absolute top-4 left-4 bg-white/90 p-4 rounded-lg shadow-lg border border-gray-200">
        <h3 className="font-semibold mb-2 text-black">Clusters</h3>
        <div className="space-y-2">
          {[0, 1, 2, 3].map(clusterId => (
            <div 
              key={clusterId}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
              onClick={() => setActiveCluster(activeCluster === clusterId ? null : clusterId)}
            >
              <div 
                className="w-4 h-4 rounded-full" 
                style={{ 
                  backgroundColor: `rgb(${Math.round(clusterColors[clusterId].r * 255)}, ${Math.round(clusterColors[clusterId].g * 255)}, ${Math.round(clusterColors[clusterId].b * 255)})`,
                  border: activeCluster === clusterId ? '2px solid black' : 'none'
                }}
              />
              <span className="text-sm text-gray-900">{getClusterName(clusterId)}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Recenter button */}
      <button
        onClick={handleRecenter}
        className="absolute bottom-4 right-4 bg-white/90 px-4 py-2 rounded-lg shadow-lg border border-gray-200 text-gray-900 hover:bg-white transition-colors"
      >
        Recenter
      </button>
      
      {hoveredVector && (
        <div className="absolute top-4 right-4 bg-white/90 p-4 rounded-lg shadow-lg border border-gray-200">
          <h3 className="font-semibold mb-2 text-black">Data Point Information</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="text-gray-900">Position X:</div><div className="text-gray-900">{hoveredVector[0]}</div>
            <div className="text-gray-900">Position Y:</div><div className="text-gray-900">{hoveredVector[1]}</div>
            <div className="text-gray-900">Position Z:</div><div className="text-gray-900">{hoveredVector[2]}</div>
            <div className="text-gray-900">Cluster:</div><div className="text-gray-900">{getClusterName(hoveredVector.cluster)}</div>
            <div className="text-gray-900">Size Factor:</div><div className="text-gray-900">{hoveredVector.size?.toFixed(2)}</div>
            <div className="text-gray-900">Confidence:</div><div className="text-gray-900">{(hoveredVector.confidence || 0).toFixed(2)}</div>
            <div className="text-gray-900">Connections:</div><div className="text-gray-900">{hoveredVector.connections?.length || 0}</div>
          </div>
        </div>
      )}
    </main>
  );
}

// Add the recenterCamera method to the Window interface
declare global {
  interface Window {
    recenterCamera?: () => void;
  }
} 