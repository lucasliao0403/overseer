// [x, y, z, hue, saturation, brightness]
export type Vector6D = [number, number, number, number, number, number];

// Default list of 6D vectors as fallback
const defaultVectors: Vector6D[] = [
  [0, 0.5, 0, 0, 66, 77],
  [0, 0.5, 0.5, 0, 65, 90],
  [1, 1, 1, 60, 50, 86],
  [-1, 0, 1, 120, 45, 69],
  [0, -1, -1, 180, 70, 49],
  [-1, 1, 0, 240, 69, 69],
  [1, -1, -1, 300, 56, 35]
];

// Function to load vectors from the JSON file
export async function loadVectors(): Promise<Vector6D[]> {
  try {
    const response = await fetch('/data/spheres.json');
    if (!response.ok) {
      throw new Error(`Failed to load vectors: ${response.statusText}`);
    }
    const data = await response.json();
    return data as Vector6D[];
  } catch (error) {
    console.error('Error loading vectors:', error);
    return defaultVectors; // Fallback to default vectors if loading fails
  }
}

// Initial vectors
export let vectors: Vector6D[] = [...defaultVectors];

// Function to refresh vectors
export async function refreshVectors(): Promise<Vector6D[]> {
  const newVectors = await loadVectors();
  vectors = newVectors;
  return vectors;
}

// Load vectors on initial import
loadVectors().then(loadedVectors => {
  vectors = loadedVectors;
});

// Remove the React component code from this file
// The import and component code should be in a separate React component file, not in spheres.ts