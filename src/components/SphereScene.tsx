import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { vectors, Vector6D } from '../data/spheres';

export default function SphereScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const rotationRef = useRef({ x: 0, y: 0 });
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const [hoveredVector, setHoveredVector] = useState<Vector6D | null>(null);
  const didMoveRef = useRef(false);
  const hoveredSphereRef = useRef<THREE.Mesh | null>(null);
  const cameraPositionRef = useRef({ z: 8 });

  useEffect(() => {
    if (!canvasRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
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

    // Custom shader material definitions
    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      uniform float time;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vUv = uv;
        
        // Add subtle vertex displacement for shimmer effect
        vec3 newPosition = position + normal * sin(position.x * 10.0 + time * 2.0) * 0.01;
        
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
      
      void main() {
        // Calculate fresnel effect for edge highlighting
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - dot(vNormal, viewDirection), 3.0);
        
        // Create shimmer effect
        float shimmer = sin(vPosition.x * 20.0 + vPosition.y * 20.0 + vPosition.z * 20.0 + time * 3.0) * 0.5 + 0.5;
        shimmer = pow(shimmer, 4.0) * 0.15;
        
        // Combine base color with effects
        vec3 color = baseColor;
        color += vec3(1.0, 1.0, 1.0) * fresnel * 0.3; // Edge highlight
        color += vec3(1.0, 1.0, 1.0) * shimmer; // Shimmer
        
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
    const spheresWithData: { sphere: THREE.Mesh; vector: Vector6D; material: THREE.ShaderMaterial }[] = [];

    // Create spheres based on vector data
    vectors.forEach((vector: Vector6D) => {
      const geometry = new THREE.SphereGeometry(0.25, 32, 32);
      const rgbColor = hsbToRgb(vector[3], vector[4], vector[5]);
      
      // Create shader material with uniforms
      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          baseColor: { value: rgbColor },
          time: { value: 0.0 },
          isHovered: { value: false }
        }
      });
      
      const sphere = new THREE.Mesh(geometry, material);
      
      // Position the sphere
      sphere.position.set(vector[0] * 2, vector[1] * 2, vector[2] * 2);
      
      sphereGroup.add(sphere);
      spheresWithData.push({ sphere, vector, material });
    });

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
      camera.position.z = Math.max(2, Math.min(15, camera.position.z));
      
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
          setHoveredVector(hoveredSphere.vector);
          hoveredSphereRef.current = hoveredSphere.sphere;
          hoveredSphere.material.uniforms.isHovered.value = true;
        }
      } else {
        // Not hovering over any sphere, clear selection
        setHoveredVector(null);
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

    const handleMouseUp = () => {
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
        handleMouseUp();
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

    // Expose a function to reset camera and rotation
    window.recenterCamera = () => {
      // Store starting values for animation
      const startRotX = rotationRef.current.x;
      const startRotY = rotationRef.current.y;
      const startZ = camera.position.z;
      
      // Target values
      const targetRotX = 0;
      const targetRotY = 0;
      const targetZ = 8; // Default camera position
      
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
  }, []);

  // Function to handle recenter button click
  const handleRecenter = () => {
    if (window.recenterCamera) {
      window.recenterCamera();
    }
  };

  return (
    <main className="relative min-h-screen">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full fixed top-0 left-0 -z-10 cursor-grab active:cursor-grabbing" 
      />
      
      {/* Recenter button */}
      <button
        onClick={handleRecenter}
        className="absolute bottom-4 right-4 bg-white/90 px-4 py-2 rounded-lg shadow-lg border border-gray-200 text-gray-900 hover:bg-white transition-colors"
      >
        Recenter
      </button>
      
      {hoveredVector && (
        <div className="absolute top-4 right-4 bg-white/90 p-4 rounded-lg shadow-lg border border-gray-200">
          <h3 className="font-semibold mb-2 text-black">Vector Information</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="text-gray-900">Position X:</div><div className="text-gray-900">{hoveredVector[0]}</div>
            <div className="text-gray-900">Position Y:</div><div className="text-gray-900">{hoveredVector[1]}</div>
            <div className="text-gray-900">Position Z:</div><div className="text-gray-900">{hoveredVector[2]}</div>
            <div className="text-gray-900">Hue:</div><div className="text-gray-900">{hoveredVector[3]}°</div>
            <div className="text-gray-900">Saturation:</div><div className="text-gray-900">{hoveredVector[4]}%</div>
            <div className="text-gray-900">Brightness:</div><div className="text-gray-900">{hoveredVector[5]}%</div>
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