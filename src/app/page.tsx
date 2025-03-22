'use client';

import SphereScene from '@/components/SphereScene';
import { useState } from 'react';

export default function Home() {
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleUpload = async () => {
    setIsLoading(true);
    try {
      // Placeholder for Supabase upload functionality
      console.log('Uploading files to Supabase...');
      // Implementation would go here
      alert('Files uploaded successfully');
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Error uploading files');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilter = async () => {
    setIsLoading(true);
    try {
      // Placeholder for filter functionality
      console.log('Filtering files...');
      // Implementation would go here
      alert('Files filtered successfully');
    } catch (error) {
      console.error('Error filtering files:', error);
      alert('Error filtering files');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      // Placeholder for download functionality
      console.log('Downloading files...');
      // Implementation would go here
      alert('Files downloaded successfully');
    } catch (error) {
      console.error('Error downloading files:', error);
      alert('Error downloading files');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen">
      <SphereScene />

      {/* Button container */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-20 flex gap-4">
        <button
          onClick={handleUpload}
          disabled={isLoading}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all hover:scale-110 disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : 'Upload'}
        </button>
        <button
          onClick={handleFilter}
          disabled={isLoading}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all hover:scale-110 disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : 'Filter'}
        </button>
        <button
          onClick={handleDownload}
          disabled={isLoading}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all hover:scale-110 disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : 'Download'}
        </button>
      </div>
    </main>
  );
} 