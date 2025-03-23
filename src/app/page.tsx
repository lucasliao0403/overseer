"use client";

import SphereScene from "../components/SphereScene";
import { useEffect, useState, useRef } from "react";
import {
  getCleanedResumes,
  getUnbiasingSummary,
  uploadDataset,
  getJobStatus,
  downloadFile,
  saveFile,
  getAllClusterAnalyses,
  getAllClustersInfo,
  getUnbiasedEmbeddingsData,
  getRemovedEmbeddingsData,
} from "../api/apiClient";
import BiasAnalysisScreen from "@/components/BiasAnalysisScreen";

// Define interfaces for our API responses
interface Resume {
  id: number;
  Resume_str: string;
  Category?: string;
  [key: string]: any; // For any other properties
}

interface ResumesResponse {
  records: Resume[];
  total_records?: number;
  total_pages?: number;
  page?: number;
  page_size?: number;
}

interface SummaryResponse {
  summary: string;
}

interface JobStatusResponse {
  job_id: string;
  status: string;
  log?: string;
}

interface UploadResponse {
  message: string;
  job_id: string;
  rows_count: number;
  status: string;
}

// Add this interface to properly type the clusters info response
interface ClustersInfoResponse {
  clusters: {
    [clusterId: string]: {
      size: number;
      center: number[];
      [key: string]: any;
    };
  };
}

// Add this interface near your other interfaces
interface EmbeddingsData {
  dimensions: number;
  count: number;
  embeddings: number[][];
  file_size_bytes: number;
}

export default function Home() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<string>("clusters");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [processingLog, setProcessingLog] = useState<string>("");
  const [embeddingsData, setEmbeddingsData] = useState<EmbeddingsData | null>(
    null
  );
  const [removedEmbeddingsData, setRemovedEmbeddingsData] =
    useState<EmbeddingsData | null>(null);
  const [clusterData, setClusterData] = useState<any>(null);
  const [clusterCount, setClusterCount] = useState<number>(5); // Default number of clusters
  const [aggressiveness, setAggressiveness] = useState<number>(50); // Default aggressiveness (0-100)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const resumesData = (await getCleanedResumes(1, 10)) as ResumesResponse;
        const summaryData = (await getUnbiasingSummary()) as SummaryResponse;

        // Update state with the data
        if (resumesData && resumesData.records) {
          setResumes(resumesData.records);
        }

        if (summaryData && summaryData.summary) {
          setSummary(summaryData.summary);
        }
      } catch (error) {
        console.error("Error fetching initial data:", error);
      }
    };

    fetchData();
  }, []);

  // if (resumes) {
  //   console.log(resumes);
  // }
  if (summary) {
    console.log(summary);
  }

  // Poll for job status updates
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (jobId && ["processing", "running"].includes(jobStatus || "")) {
      interval = setInterval(async () => {
        try {
          const status = (await getJobStatus(jobId)) as JobStatusResponse;
          setJobStatus(status.status);
          setProcessingLog(status.log || "");

          if (status.status === "completed") {
            // Refresh data when job completes
            const resumesData = (await getCleanedResumes(
              1,
              10
            )) as ResumesResponse;
            const summaryData =
              (await getUnbiasingSummary()) as SummaryResponse;

            if (resumesData && resumesData.records) {
              setResumes(resumesData.records);
            }

            if (summaryData && summaryData.summary) {
              setSummary(summaryData.summary);
            }

            // Fetch all cluster data at once
            try {
              // Get all cluster analyses in one call
              const clusterAnalyses = await getAllClusterAnalyses();
              console.log("Retrieved all cluster analyses:", clusterAnalyses);

              // Get full clusters info in one call
              const clustersInfo =
                (await getAllClustersInfo()) as ClustersInfoResponse;
              console.log("Retrieved complete clusters info:", clustersInfo);

              if (
                clustersInfo &&
                typeof clustersInfo === "object" &&
                "clusters" in clustersInfo
              ) {
                // Log the number of clusters found
                const clusterIds = Object.keys(clustersInfo.clusters);
                console.log(`Found ${clusterIds.length} clusters in total`);

                // We now have all cluster data at once - no need for individual fetches
                console.log("All cluster data successfully retrieved in bulk");
              }
            } catch (error) {
              console.error("Error fetching cluster data:", error);
            }

            setIsLoading(false);
          } else if (status.status === "failed") {
            setIsLoading(false);
            alert("Processing failed. Please check the logs.");
          }
        } catch (error) {
          console.error("Error checking job status:", error);
        }
      }, 2000); // Check every 2 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [jobId, jobStatus]);

  const handleUpload = async () => {
    if (!uploadedFile) {
      setShowUploadModal(true);
      return;
    }

    processUpload();
  };

  const handleFilter = async () => {
    setIsLoading(true);
    try {
      // For now, we're just downloading the unbiased dataset
      const blob = await downloadFile("unbiased_resumes");
      if (blob) {
        saveFile(blob, "unbiased_resumes.csv");
        alert("Unbiased dataset downloaded successfully");
      } else {
        alert("Unbiased dataset not available. Please process a file first.");
      }
    } catch (error) {
      console.error("Error filtering files:", error);
      alert("Error filtering files");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      // Download the summary text
      const blob = await downloadFile("summary");
      if (blob) {
        saveFile(blob, "unbiasing_summary.txt");
        alert("Summary downloaded successfully");
      } else {
        alert("Summary not available. Please process a file first.");
      }
    } catch (error) {
      console.error("Error downloading files:", error);
      alert("Error downloading files");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
        alert("Please upload a CSV file");
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
      if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
        alert("Please upload a CSV file");
        return;
      }
      setUploadedFile(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const processUpload = async () => {
    if (!uploadedFile) {
      alert("Please select a CSV file first");
      return;
    }

    setIsLoading(true);
    try {
      // Upload the file to the backend
      const response = (await uploadDataset(uploadedFile)) as UploadResponse;

      if (response && response.job_id) {
        setJobId(response.job_id);
        setJobStatus("processing");

        // Keep modal open to show progress
        alert(
          `File "${uploadedFile.name}" uploaded successfully. Processing started with job ID: ${response.job_id}`
        );
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Error processing file:", error);
      alert(
        `Error processing file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchAndLogEmbeddings = async () => {
    setIsLoading(true);
    try {
      console.log("Fetching unbiased embeddings data...");
      const data = (await getUnbiasedEmbeddingsData()) as EmbeddingsData;

      // Log the entire embeddings data to console
      console.log("Unbiased embeddings data:", data);
      console.log("Number of embeddings:", data.count);
      console.log("Embedding dimensions:", data.dimensions);
      console.log("First embedding:", data.embeddings[0]);

      alert(
        `Successfully fetched ${data.count} embeddings. Check the console.`
      );
    } catch (error) {
      console.error("Error fetching embeddings:", error);
      alert("Error fetching embeddings data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchEmbeddingsInfo = async () => {
    setIsLoading(true);
    try {
      // Fetch embeddings and clusters in parallel
      console.log("Fetching embeddings and cluster info...");
      const [unbiasedEmbeddings, removedEmbeddings, clusters] =
        await Promise.all([
          getUnbiasedEmbeddingsData(),
          getRemovedEmbeddingsData(),
          getAllClustersInfo(),
        ]);

      // Save data to state
      setEmbeddingsData(unbiasedEmbeddings as EmbeddingsData);
      setRemovedEmbeddingsData(removedEmbeddings as EmbeddingsData);
      setClusterData(clusters as any);

      // Log detailed info to console
      console.log("Unbiased embeddings:", unbiasedEmbeddings);
      console.log("Removed embeddings:", removedEmbeddings);

      // More detailed logging of cluster data
      console.log("Cluster data:", clusters);

      // Log cluster structure details
      if (clusters && typeof clusters === "object") {
        const clusterInfo = clusters as ClustersInfoResponse;

        if (clusterInfo.clusters) {
          console.log(
            "Number of clusters:",
            Object.keys(clusterInfo.clusters).length
          );
        }
      }

      // Show success message
      alert(
        `Successfully fetched embeddings and clusters data. Check the console.`
      );

      return { unbiasedEmbeddings, removedEmbeddings, clusters };
    } catch (error) {
      console.error("Error fetching data:", error);
      alert("Error fetching data. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClusterCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClusterCount(parseInt(e.target.value));
  };
  
  const handleAggressivenessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAggressiveness(parseInt(e.target.value));
  };

  return (
    <main className="relative min-h-screen">
      {/* Main content area - conditionally render based on activeTab */}
      <div className="w-full h-screen">
        {activeTab === "clusters" ? (
          <SphereScene 
            clusterData={clusterData} 
            unbiasedEmbeddings={embeddingsData}
            removedEmbeddings={removedEmbeddingsData}
            clusterEmbeddings={clusterData}
          />
        ) : (
          <BiasAnalysisScreen 
            activeCluster={clusterData} 
          />
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-20">
        <div className="bg-white/90 rounded-full shadow-lg p-1 flex relative">
          {/* Animated background that moves based on active tab */}
          <div 
            className={`absolute top-1 bottom-1 rounded-full bg-black transition-all duration-300 ease-in-out ${
              activeTab === "clusters" 
                ? "left-1 right-[calc(50%+1px)]" 
                : "left-[calc(50%+1px)] right-1"
            }`}
          />
          <button
            onClick={() => setActiveTab("clusters")}
            className={`px-8 py-3 rounded-full text-lg font-medium transition-all relative z-10 ${
              activeTab === "clusters"
                ? "text-white"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            Clusters
          </button>
          <button
            onClick={() => setActiveTab("bias")}
            className={`px-8 py-3 rounded-full text-lg font-medium transition-all relative z-10 ${
              activeTab === "bias"
                ? "text-white"
                : "text-gray-700 hover:text-gray-900"
            }`}
          >
            Analysis
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
          {isLoading ? "Processing..." : "Upload"}
        </button>
        <button
          onClick={handleFilter}
          disabled={isLoading}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all hover:scale-110 disabled:opacity-50"
        >
          {isLoading ? "Processing..." : "Get Unbiased Data"}
        </button>
        <button
          onClick={handleDownload}
          disabled={isLoading}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all hover:scale-110 disabled:opacity-50"
        >
          {isLoading ? "Processing..." : "Download Summary"}
        </button>
        <button
          onClick={handleFetchEmbeddingsInfo}
          disabled={isLoading}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all hover:scale-110 disabled:opacity-50"
        >
          {isLoading ? "Processing..." : "Fetch Embeddings Info"}
        </button>
      </div>

      {/* Status display if there's an active job */}
      {jobId && jobStatus && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-20 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg">
          <h3 className="text-lg font-bold mb-2">
            Job Status: {jobStatus.charAt(0).toUpperCase() + jobStatus.slice(1)}
          </h3>
          <p className="text-sm">Job ID: {jobId}</p>
          {processingLog && (
            <div className="mt-2">
              <details>
                <summary className="cursor-pointer text-blue-500">
                  View logs
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded max-h-40 overflow-auto">
                  {processingLog}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}

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
                <h3 className="text-2xl font-semibold text-gray-900">
                  Upload CSV Data
                </h3>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Drag and drop area */}
              <div
                className={`border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer transition-colors mb-6 ${
                  isDragging
                    ? "border-blue-500 bg-blue-50"
                    : "hover:border-blue-500"
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

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 mx-auto text-gray-400 mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>

                <p className="text-base text-gray-700 font-medium">
                  {uploadedFile
                    ? `Selected: ${uploadedFile.name}`
                    : "Drop CSV file here or click to browse"}
                </p>
                <p className="text-xs text-gray-500">Supports CSV files with Resume_str column</p>
              </div>

              {/* Control panel */}
              <div className="bg-gray-50 p-4 rounded-xl mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Controls</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Number of clusters */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label htmlFor="cluster-count" className="text-xs font-medium text-gray-700">Clusters</label>
                      <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-md shadow-sm">{clusterCount}</span>
                    </div>
                    <input
                      id="cluster-count"
                      type="range"
                      min="2"
                      max="20"
                      value={clusterCount}
                      onChange={handleClusterCountChange}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>2</span>
                      <span>20</span>
                    </div>
                  </div>
                  
                  {/* Aggressiveness */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label htmlFor="aggressiveness" className="text-xs font-medium text-gray-700">Aggressiveness</label>
                      <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-md shadow-sm">{aggressiveness}%</span>
                    </div>
                    <input
                      id="aggressiveness"
                      type="range"
                      min="0"
                      max="100"
                      value={aggressiveness}
                      onChange={handleAggressivenessChange}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Format example - updated to match the screenshot */}
              <div className="mb-8">
                <p className="text-lg text-gray-700 mb-2">Expected format:</p>
                <div className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto text-gray-700 mb-2">
                  id,Resume_str,Category
                  <br />
                  1,"I am a software engineer with 5 years of experience...",IT
                  <br />
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
                  {isLoading ? "Processing..." : "Process CSV"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
