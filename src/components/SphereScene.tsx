import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { vectors, Vector6D } from '../data/spheres';

export default function SphereScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const rotationRef = useRef({ x: 0, y: 0 });
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const [selectedVector, setSelectedVector] = useState<Vector6D | null>(null);
  const didMoveRef = useRef(false);

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
    camera.position.z = 8;

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

    // Raycaster for clicking spheres
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Function to convert HSB to hex color
    const hsbToHex = (h: number, s: number, b: number): number => {
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
      
      r = Math.round((r + m) * 255);
      g = Math.round((g + m) * 255);
      b1 = Math.round((b1 + m) * 255);
      
      return (r << 16) | (g << 8) | b1;
    };

    // Store vector data with each sphere
    const spheresWithData: { sphere: THREE.Mesh; vector: Vector6D }[] = [];

    // Create spheres based on vector data
    vectors.forEach((vector: Vector6D) => {
      const geometry = new THREE.SphereGeometry(0.25, 32, 32);
      const color = hsbToHex(vector[3], vector[4], vector[5]);
      const material = new THREE.MeshBasicMaterial({ color });
      const sphere = new THREE.Mesh(geometry, material);
      
      // Position the sphere
      sphere.position.set(vector[0] * 2, vector[1] * 2, vector[2] * 2);
      
      sphereGroup.add(sphere);
      spheresWithData.push({ sphere, vector });
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
    };
    
    // Add wheel event listener
    window.addEventListener('wheel', handleWheel, { passive: false });

    // Function to handle sphere clicks
    const handleSphereClick = (event: MouseEvent) => {
      if (didMoveRef.current) {
        // User was dragging, not clicking
        return;
      }
      
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
          setSelectedVector(clickedSphere.vector);
        }
      } else {
        // Clicked empty space, clear selection
        setSelectedVector(null);
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
      if (isDraggingRef.current && !didMoveRef.current) {
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
        handleSphereClick(mouseEvent);
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

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Apply rotation to the sphere group while preserving camera position
      sphereGroup.rotation.x = rotationRef.current.x;
      sphereGroup.rotation.y = rotationRef.current.y;
      
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup function
    return () => {
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
    };
  }, []);

  return (
    <main className="relative min-h-screen">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full fixed top-0 left-0 -z-10 cursor-grab active:cursor-grabbing" 
      />
      
      {selectedVector && (
        <div className="absolute top-4 right-4 bg-white/90 p-4 rounded-lg shadow-lg border border-gray-200">
          <h3 className="font-semibold mb-2">Vector Information</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div>Position X:</div><div>{selectedVector[0]}</div>
            <div>Position Y:</div><div>{selectedVector[1]}</div>
            <div>Position Z:</div><div>{selectedVector[2]}</div>
            <div>Hue:</div><div>{selectedVector[3]}°</div>
            <div>Saturation:</div><div>{selectedVector[4]}%</div>
            <div>Brightness:</div><div>{selectedVector[5]}%</div>
          </div>
          <button 
            className="mt-2 px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm w-full"
            onClick={() => setSelectedVector(null)}
          >
            Close
          </button>
        </div>
      )}
    </main>
  );
} 