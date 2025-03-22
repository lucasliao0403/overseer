"use client";

import SphereScene from "../components/SphereScene";
import { useEffect, useState, useRef } from "react";
import { getCleanedResumes, getUnbiasingSummary } from "../api/apiClient";

export default function Home() {
  const [resumes, setResumes] = useState<any[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<string>("clusters");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      const resumesData = await getCleanedResumes(1, 10);
      const summary = await getUnbiasingSummary();

      // Update state with the data
      setResumes((resumesData as any[]) || []);
      setSummary((summary as string) || "");
    };

    fetchData();
  }, []);

  if (resumes) {
    console.log(resumes);
  }
  if (summary) {
    console.log(summary);
  }

  const handleUpload = async () => {
    if (!uploadedFile) {
      setShowUploadModal(true);
      return;
    }
    
    setIsLoading(true);
    try {
      // Placeholder for CSV processing functionality
      console.log('Processing CSV file:', uploadedFile.name);
      // Implementation would go here
      alert(`CSV file "${uploadedFile.name}" processed successfully`);
      setShowUploadModal(false);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file');
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        alert('Please upload a CSV file');
        return;
      }
      setUploadedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        alert('Please upload a CSV file');
        return;
      }
      setUploadedFile(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const processUpload = () => {
    if (!uploadedFile) {
      alert('Please select a CSV file first');
      return;
    }
    
    setIsLoading(true);
    try {
      // Placeholder for CSV processing functionality
      console.log('Processing CSV file:', uploadedFile.name);
      // Implementation would go here
      alert(`CSV file "${uploadedFile.name}" processed successfully`);
      setShowUploadModal(false);
      setUploadedFile(null);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen">
      <SphereScene />

      {/* Navigation Tabs */}
      <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-20">
        <div className="bg-white/90 rounded-full shadow-lg p-1 flex">
          <button
            onClick={() => setActiveTab("clusters")}
            className={`px-8 py-3 rounded-full text-lg font-medium transition-all ${
              activeTab === "clusters" 
                ? "bg-black text-white" 
                : "bg-transparent text-gray-700 hover:bg-gray-100"
            }`}
          >
            Clusters
          </button>
          <button
            onClick={() => setActiveTab("bias")}
            className={`px-8 py-3 rounded-full text-lg font-medium transition-all ${
              activeTab === "bias" 
                ? "bg-black text-white" 
                : "bg-transparent text-gray-700 hover:bg-gray-100"
            }`}
          >
            Bias Analysis
          </button>
        </div>
      </div>

      {/* Button container */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-20 flex gap-4">
        <button
          onClick={() => setShowUploadModal(true)}
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

      {/* Upload Modal with Backdrop Blur */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Blurred backdrop */}
          <div 
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowUploadModal(false)}
          ></div>
          
          {/* Modal content - updated to match the screenshot */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden transform transition-all duration-300 ease-out animate-fadeIn">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold text-gray-900">Upload CSV Data</h3>
                <button 
                  onClick={() => setShowUploadModal(false)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Drag and drop area - updated to match the screenshot */}
              <div 
                className={`border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer transition-colors mb-8 ${
                  isDragging 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'hover:border-blue-500'
                }`}
                onClick={triggerFileInput}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept=".csv" 
                  onChange={handleFileChange}
                />
                
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                
                <p className="text-lg text-gray-700 font-medium mb-1">
                  {uploadedFile 
                    ? `Selected: ${uploadedFile.name}` 
                    : 'Drop your CSV file here or click to browse'
                  }
                </p>
                <p className="text-sm text-gray-500">Supports CSV files only</p>
              </div>
              
              {/* Format example - updated to match the screenshot */}
              <div className="mb-8">
                <p className="text-lg text-gray-700 mb-2">Expected format:</p>
                <div className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto text-gray-700 mb-2">
                  x,y,z,h,s,b,size,cluster,confidence<br/>
                  0.1,0.2,0.3,180,50,80,1.2,0,0.95<br/>
                  ...
                </div>
              </div>
              
              {/* Action buttons - updated to match the screenshot */}
              <div className="flex justify-end space-x-4">
                <button 
                  onClick={() => setShowUploadModal(false)}
                  className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-lg"
                >
                  Cancel
                </button>
                <button 
                  onClick={processUpload}
                  disabled={!uploadedFile || isLoading}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {isLoading ? 'Processing...' : 'Process CSV'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
