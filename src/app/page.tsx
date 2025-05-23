"use client";

import SphereScene from "../components/SphereScene";
import { useEffect, useState, useRef, useCallback } from "react";
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
  getAvailableDatasets,
  getUnbiasedResumes,
  getRemovedEntries,
  getAllClustersDataset,
} from "../api/apiClient";

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
  error?: string; // Added error property
}

interface SummaryResponse {
  summary: string;
  error?: string; // Added error property
}

interface JobStatusResponse {
  job_id: string;
  status: string;
  log?: string;
  error?: string; // Added error property
}

interface UploadResponse {
  message: string;
  job_id: string;
  rows_count: number;
  status: string;
  cluster_count: number;
  error?: string; // Added error property
}

// Add this interface to properly type the clusters info response
interface ClustersInfoResponse {
  job_id?: string;
  total_clusters?: number; // Make sure this is optional
  clusters?: { [key: string]: ClusterInfo }; // Map cluster name to ClusterInfo
  error?: string; // Make sure this is optional
}

// Add this interface near your other interfaces
interface EmbeddingsData {
  dimensions: number;
  count: number;
  embeddings: number[][];
  file_size_bytes: number;
  success?: boolean;
  shape?: [number, number];
  error?: string; // Added error property
}

interface ClusterInfo {
  count: number;
  dimensions: number;
  embeddings: number[][]; // Array of embedding arrays
}

// NEW: Interface for the getAvailableDatasets response
interface AvailableDatasetsResponse {
  cleaned_resumes?: boolean;
  unbiased_resumes?: boolean;
  removed_entries?: boolean;
  all_clusters?: boolean;
  cluster_analysis?: boolean;
  unbiased_embeddings_6d?: boolean;
  removed_embeddings_6d?: boolean;
  summary?: boolean;
  individual_clusters?: string[]; // List of cluster filenames like "cluster_1.csv"
  error?: string;
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
  const [isTabTransitioning, setIsTabTransitioning] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "processing" | "complete" | "error"
  >("idle");
  const [showSuccessNotification, setShowSuccessNotification] =
    useState<boolean>(false);
  const [showDefaultObjects, setShowDefaultObjects] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async () => {
      // Initial fetch doesn't have a jobId, perhaps we should remove this
      // or only fetch if a previous jobId is stored (e.g., in localStorage)
      // For now, commenting out initial fetch as it won't work without jobId
      /*
      try {
        const resumesData = (await getCleanedResumes(jobId, 1, 10)) as ResumesResponse; // Requires jobId
        const summaryData = (await getUnbiasingSummary(jobId)) as SummaryResponse; // Requires jobId

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
      */
    };

    fetchData();
  }, []); // Removed jobId dependency as initial fetch is commented out

  // if (resumes) {
  //   console.log(resumes);
  // }
  if (summary) {
    console.log(summary);
  }

  // Poll for job status updates
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (jobId && ["processing", "running"].includes(jobStatus || "")) {
      setUploadStatus("processing");
      interval = setInterval(async () => {
        if (!jobId) return; // Extra check inside interval
        try {
          const status = (await getJobStatus(jobId)) as JobStatusResponse;
          setJobStatus(status.status);
          setProcessingLog(status.log || "");

          if (status.status === "completed") {
            setUploadStatus("complete");
            setShowSuccessNotification(true);

            try {
              const available: AvailableDatasetsResponse =
                await getAvailableDatasets(jobId);
              console.log(`Available datasets for job ${jobId}:`, available);

              if (available.cleaned_resumes) {
                const resumesData = (await getCleanedResumes(
                  jobId,
                  1,
                  10
                )) as ResumesResponse;
                if (!resumesData.error && resumesData.records)
                  setResumes(resumesData.records);
              }
              if (available.summary) {
                const summaryData = (await getUnbiasingSummary(
                  jobId
                )) as SummaryResponse;
                if (!summaryData.error && summaryData.summary)
                  setSummary(summaryData.summary);
              }
              if (available.cluster_analysis) {
                const clusterAnalyses: any = await getAllClusterAnalyses(
                  jobId!
                );
                if (!clusterAnalyses?.error) {
                  console.log(
                    "Retrieved all cluster analyses:",
                    clusterAnalyses
                  );
                } else {
                  console.error(
                    "Failed to fetch cluster analyses:",
                    clusterAnalyses.error
                  );
                }
              }
              if (
                available.individual_clusters &&
                available.individual_clusters.length > 0
              ) {
                const clustersInfo = (await getAllClustersInfo(
                  jobId
                )) as ClustersInfoResponse;
                if (!clustersInfo.error) {
                  console.log(
                    "Retrieved complete clusters info:",
                    clustersInfo
                  );
                  setClusterData(clustersInfo);
                }
              }
              if (available.unbiased_embeddings_6d) {
                const unbiasedData = (await getUnbiasedEmbeddingsData(
                  jobId
                )) as EmbeddingsData;
                if (!unbiasedData.error) setEmbeddingsData(unbiasedData);
              }
              if (available.removed_embeddings_6d) {
                const removedData = (await getRemovedEmbeddingsData(
                  jobId
                )) as EmbeddingsData;
                if (!removedData.error) setRemovedEmbeddingsData(removedData);
              }

              setShowDefaultObjects(false);
            } catch (fetchError) {
              console.error(
                `Error fetching data after job ${jobId} completion:`,
                fetchError
              );
            }

            setIsLoading(false);

            // Clear job ID after successful completion - reduced from 3000ms to 2000ms
            setTimeout(() => {
              setJobId(null);
              setJobStatus(null);
            }, 2000);

            // Clear the success message after animation completes - reduced from 3500ms to 2000ms
            setTimeout(() => {
              setUploadStatus("idle");
              setShowSuccessNotification(false);
            }, 2000);
          } else if (status.status === "failed") {
            setUploadStatus("error");
            setIsLoading(false);
            // Optionally clear jobId here or keep it for retry?
          }
        } catch (error) {
          console.error("Error checking job status:", error);
          setUploadStatus("error");
          // Consider clearing interval or jobId on status check failure
          if (interval) clearInterval(interval);
        }
      }, 2000); // Check every 2 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
    // Dependency array includes jobId and jobStatus
  }, [jobId, jobStatus]);

  const handleUpload = async () => {
    // Reset previous job state if any
    setJobId(null);
    setJobStatus(null);
    setProcessingLog("");
    setUploadStatus("idle");
    setEmbeddingsData(null);
    setRemovedEmbeddingsData(null);
    setClusterData(null);
    setShowDefaultObjects(true);
    setSummary("");
    setShowUploadModal(true);
  };

  // This function is likely deprecated or needs jobId
  const handleFilter = async () => {
    if (!jobId) {
      alert("Please complete a processing job first.");
      return;
    }
    setIsLoading(true);
    try {
      const blob = await downloadFile(jobId, "unbiased_resumes");
      if (blob) {
        saveFile(blob, `unbiased_resumes_${jobId.substring(0, 8)}.csv`);
      }
    } catch (error) {
      console.error("Error filtering/downloading files:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!jobId) {
      alert("Please complete a processing job first.");
      return;
    }
    setIsLoading(true);
    try {
      // Download the summary text for the current job
      const blob = await downloadFile(jobId, "summary");
      if (blob) {
        saveFile(blob, `unbiasing_summary_${jobId.substring(0, 8)}.txt`);
      }
    } catch (error) {
      console.error("Error downloading summary file:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
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
      return;
    }

    setIsLoading(true);
    setShowUploadModal(false);
    setUploadStatus("uploading");

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 10;
      });
    }, 300);

    try {
      // Upload the file to the backend with cluster count
      const response = (await uploadDataset(
        uploadedFile,
        clusterCount
      )) as UploadResponse;

      if (response && response.job_id) {
        clearInterval(progressInterval);
        setUploadProgress(100);
        setJobId(response.job_id);
        setJobStatus("processing");
        setUploadStatus("processing");
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      clearInterval(progressInterval);
      setUploadStatus("error");
      console.error("Error processing file:", error);
    }
  };

  const handleFetchAndLogEmbeddings = async () => {
    if (!jobId) {
      alert("Please upload and process a dataset first.");
      return;
    }
    setIsLoading(true);
    try {
      console.log(`Fetching unbiased embeddings data for job ${jobId}...`);
      // Use non-null assertion
      const data = (await getUnbiasedEmbeddingsData(jobId!)) as EmbeddingsData;

      console.log("Unbiased embeddings data:", data);
      if (data.error) throw new Error(data.error); // Handle potential API error

      console.log("Number of embeddings:", data.count);
      console.log("Embedding dimensions:", data.dimensions);
      console.log("First embedding:", data.embeddings?.[0]);

      alert(
        `Successfully fetched ${data.count} embeddings. Check the console.`
      );
    } catch (error) {
      console.error("Error fetching embeddings:", error);
      alert(
        `Error fetching embeddings data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchEmbeddingsInfo = async () => {
    if (!jobId) {
      alert("Please upload and process a dataset first.");
      return;
    }
    setIsLoading(true);
    setShowDefaultObjects(false);

    try {
      // Use non-null assertion for jobId
      const unbiasedEmbeddings = (await getUnbiasedEmbeddingsData(
        jobId!
      )) as EmbeddingsData;
      console.log("Unbiased embeddings:", unbiasedEmbeddings);
      if (unbiasedEmbeddings.error)
        throw new Error(`Unbiased fetch failed: ${unbiasedEmbeddings.error}`);

      const removedEmbeddings = (await getRemovedEmbeddingsData(
        jobId!
      )) as EmbeddingsData;
      console.log("Removed embeddings:", removedEmbeddings);
      if (removedEmbeddings.error)
        throw new Error(`Removed fetch failed: ${removedEmbeddings.error}`);

      const clusterAnalyses: any = await getAllClusterAnalyses(jobId!); // Use assertion
      console.log("Retrieved all cluster analyses:", clusterAnalyses);
      if (clusterAnalyses?.error)
        throw new Error(`Analyses fetch failed: ${clusterAnalyses.error}`); // Optional chaining check

      const clustersInfo = (await getAllClustersInfo(
        jobId!
      )) as ClustersInfoResponse; // Use assertion
      console.log("Retrieved complete clusters info:", clustersInfo);
      if (clustersInfo.error)
        throw new Error(`Cluster info fetch failed: ${clustersInfo.error}`);

      // Update state with fetched data
      setEmbeddingsData(unbiasedEmbeddings);
      setRemovedEmbeddingsData(removedEmbeddings);
      setClusterData(clustersInfo);
    } catch (error) {
      console.error("Error fetching embeddings info:", error);
      alert(
        `Error fetching data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClusterCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCount = parseInt(e.target.value);
    console.log(`Cluster count changed to: ${newCount}`);
    setClusterCount(newCount);
  };

  const handleAggressivenessChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setAggressiveness(parseInt(e.target.value));
  };

  // Add this function to handle tab switching with delay
  const handleTabSwitch = (tab: string) => {
    // If already on this tab or transitioning, do nothing
    if (activeTab === tab || isTabTransitioning) return;

    // If switching from analysis to clusters, add delay
    if (activeTab === "bias" && tab === "clusters") {
      setIsTabTransitioning(true);

      // Set a timeout to actually change the tab after 500ms
      setTimeout(() => {
        setActiveTab(tab);
        setIsTabTransitioning(false);
      }, 75);
    } else {
      // For other transitions, switch immediately
      setActiveTab(tab);
    }
  };

  // Update the CSS animation duration in globals.css or add this style tag to your layout.tsx
  useEffect(() => {
    // Add a style tag to the document head
    const styleTag = document.createElement("style");
    styleTag.innerHTML = `
      @keyframes fadeOut {
        0% { opacity: 1; }
        80% { opacity: 1; }
        100% { opacity: 0; }
      }
      .animate-fadeOut {
        animation: fadeOut 2s forwards;
      }
    `;
    document.head.appendChild(styleTag);

    // Clean up
    return () => {
      document.head.removeChild(styleTag);
    };
  }, []);

  // Add this function to filter clusters based on the slider value
  const getFilteredClusterData = useCallback(() => {
    if (!clusterData || !clusterData.clusters) return null;

    // Get all cluster IDs
    const allClusterIds = Object.keys(clusterData.clusters);

    // Sort clusters by size (optional, depends on how you want to prioritize)
    const sortedClusterIds = allClusterIds.sort(
      (a, b) => clusterData.clusters[b].size - clusterData.clusters[a].size
    );

    // Take only the first n clusters based on slider
    const selectedClusterIds = sortedClusterIds.slice(0, clusterCount);

    // Create a filtered version of the cluster data
    const filteredClusters: { [key: string]: any } = {};
    selectedClusterIds.forEach((id) => {
      filteredClusters[id] = clusterData.clusters[id];
    });

    return {
      ...clusterData,
      clusters: filteredClusters,
    };
  }, [clusterData, clusterCount]);

  // Use the filtered data when passing to SphereScene
  useEffect(() => {
    // This effect runs when clusterCount or clusterData changes
    console.log(`Updating visible clusters to show ${clusterCount} clusters`);
  }, [clusterCount, clusterData]);

  const fetchEmbeddings = async () => {
    if (!jobId) {
      alert("Please complete a processing job first.");
      return;
    }
    setIsLoading(true);
    try {
      // Fetch unbiased embeddings for the current job
      const unbiasedData = (await getUnbiasedEmbeddingsData(
        jobId
      )) as EmbeddingsData;
      setEmbeddingsData(unbiasedData);

      // Fetch removed embeddings for the current job
      const removedData = (await getRemovedEmbeddingsData(
        jobId
      )) as EmbeddingsData;
      setRemovedEmbeddingsData(removedData);

      // Fetch cluster data for the current job
      const clustersInfo = await getAllClustersInfo(jobId);
      setClusterData(clustersInfo);

      // Only hide default objects after embeddings are fetched
      setShowDefaultObjects(false);
    } catch (error) {
      console.error("Error fetching embeddings:", error);
      // TODO: Set error state for UI
    } finally {
      setIsLoading(false);
    }
  };

  // This function is defined within Home component but not used,
  // let's assume it might be used later or remove it.
  // We will fix the API calls within it for now.
  const fetchAllDatasetStats = async (currentJobId: string | null) => {
    if (!currentJobId) {
      console.warn("fetchAllDatasetStats called without jobId");
      return { error: "Job ID is required." };
    }
    try {
      const available: AvailableDatasetsResponse = await getAvailableDatasets(
        currentJobId
      );
      if (available.error) {
        throw new Error(available.error);
      }
      const stats: any = {
        cleanedResumes: null,
        unbiasedResumes: null,
        removedEntries: null,
        allClusters: null,
        clusters: null,
      };

      if (available.cleaned_resumes) {
        const data = (await getCleanedResumes(
          currentJobId,
          1,
          1
        )) as ResumesResponse;
        if (!data.error)
          stats.cleanedResumes = {
            totalRecords: data.total_records || 0,
            totalPages: data.total_pages || 0,
          };
      }
      if (available.unbiased_resumes) {
        const data = (await getUnbiasedResumes(
          currentJobId,
          1,
          1
        )) as ResumesResponse;
        if (!data.error)
          stats.unbiasedResumes = {
            totalRecords: data.total_records || 0,
            totalPages: data.total_pages || 0,
          };
      }
      if (available.removed_entries) {
        const data = (await getRemovedEntries(
          currentJobId,
          1,
          1
        )) as ResumesResponse;
        if (!data.error)
          stats.removedEntries = {
            totalRecords: data.total_records || 0,
            totalPages: data.total_pages || 0,
          };
      }
      if (available.all_clusters) {
        const data = (await getAllClustersDataset(
          currentJobId,
          1,
          1
        )) as ResumesResponse;
        if (!data.error)
          stats.allClusters = {
            totalRecords: data.total_records || 0,
            totalPages: data.total_pages || 0,
          };
      }
      if (
        available.individual_clusters &&
        available.individual_clusters.length > 0
      ) {
        const clustersInfo = (await getAllClustersInfo(
          currentJobId
        )) as ClustersInfoResponse;
        if (!clustersInfo.error) {
          stats.clusters = {
            totalClusters: clustersInfo.total_clusters || 0,
            clusterSizes: Object.entries(clustersInfo.clusters || {}).reduce(
              (acc, [key, value]) => {
                acc[key] = value.count || 0;
                return acc;
              },
              {} as { [key: string]: number }
            ),
          };
        }
      }

      console.log("Fetched stats:", stats);
      return stats;
    } catch (error: any) {
      console.error(
        `Error fetching dataset stats for job ${currentJobId}:`,
        error
      );
      return { error: error.message };
    }
  };

  return (
    <main className="relative min-h-screen">
      {/* Main content area - always render SphereScene now */}
      <div className="w-full h-screen">
        {activeTab === "clusters" ? (
          <SphereScene
            clusterData={getFilteredClusterData()}
            unbiasedEmbeddings={embeddingsData}
            removedEmbeddings={removedEmbeddingsData}
            clusterEmbeddings={getFilteredClusterData()}
            clusterCount={clusterCount}
            activeTab={activeTab}
            showDefaultObjects={showDefaultObjects}
          />
        ) : (
          <></>
        )}
      </div>

      {/* Logo at top left with good padding - persistent across all tabs */}
      <div className="fixed top-8 left-10 z-20">
        <h1 className="font-serif text-6xl text-black drop-shadow-md">
          Overseer
        </h1>
      </div>

      {/* Navigation Tabs - updated to use handleTabSwitch */}
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
          {/* <button
            onClick={() => handleTabSwitch("clusters")}
            disabled={isTabTransitioning}
            className={`px-8 py-3 rounded-full text-lg font-medium transition-all relative z-10 ${
              activeTab === "clusters"
                ? "text-white"
                : "text-gray-700 hover:text-gray-900"
            } ${isTabTransitioning ? "cursor-not-allowed opacity-70" : ""}`}
          >
            Clusters
          </button>
          <button
            onClick={() => handleTabSwitch("bias")}
            disabled={isTabTransitioning}
            className={`px-8 py-3 rounded-full text-lg font-medium transition-all relative z-10 ${
              activeTab === "bias"
                ? "text-white"
                : "text-gray-700 hover:text-gray-900"
            } ${isTabTransitioning ? "cursor-not-allowed opacity-70" : ""}`}
          >
            Analysis
          </button> */}
        </div>
      </div>

      {/* Action buttons - vertical on right side */}
      <div className="fixed right-10 top-16 z-20 flex flex-col space-y-4">
        <button
          onClick={handleUpload}
          className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 border border-gray-400 rounded-md shadow"
        >
          Upload
        </button>

        <button
          onClick={handleFilter}
          className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 border border-gray-400 rounded-md shadow"
        >
          Get Unbiased Data
        </button>

        <button
          onClick={handleDownload}
          className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 border border-gray-400 rounded-md shadow"
        >
          Download Summary
        </button>

        <button
          onClick={fetchEmbeddings}
          className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 border border-gray-400 rounded-md shadow"
        >
          Fetch Embeddings Info
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

      {/* New Upload Progress Overlay */}
      {uploadStatus !== "idle" && uploadStatus !== "complete" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-fadeIn">
            <div className="text-center">
              {uploadStatus === "uploading" && (
                <>
                  <div className="mb-4">
                    <svg
                      className="w-16 h-16 mx-auto text-blue-500 animate-bounce"
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
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-black">
                    Uploading {uploadedFile?.name}
                  </h3>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-gray-600">
                    Please wait while we upload your file...
                  </p>
                </>
              )}

              {uploadStatus === "processing" && (
                <>
                  <div className="mb-4">
                    <svg
                      className="w-16 h-16 mx-auto text-blue-500 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-black">
                    Processing Data
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Analyzing and clustering your data...
                  </p>
                  <div className="flex justify-center space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-300"></div>
                  </div>
                </>
              )}

              {uploadStatus === "error" && (
                <>
                  <div className="mb-4">
                    <svg
                      className="w-16 h-16 mx-auto text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-red-600">
                    Processing Failed
                  </h3>
                  <p className="text-gray-600 mb-4">
                    There was an error processing your file.
                  </p>
                  <button
                    onClick={() => setUploadStatus("idle")}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success notification at bottom right of screen, above instructions box */}
      {showSuccessNotification && (
        <div className="fixed bottom-28 right-4 z-50 bg-green-50 border-l-4 border-green-500 p-4 rounded shadow-lg animate-fadeOut w-full max-w-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                Processing complete! Your data is ready.
              </p>
            </div>
          </div>
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
                <p className="text-xs text-gray-500">
                  Supports CSV files with Resume_str column
                </p>
              </div>

              {/* Control panel */}
              <div className="bg-gray-50 p-4 rounded-xl mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Controls
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Number of clusters */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label
                        htmlFor="cluster-count"
                        className="text-xs font-medium text-gray-700"
                      >
                        Clusters
                      </label>
                      <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-md shadow-sm">
                        {clusterCount}
                      </span>
                    </div>
                    <input
                      id="cluster-count"
                      type="range"
                      min="1"
                      max="10"
                      value={clusterCount}
                      onChange={handleClusterCountChange}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>1</span>
                      <span>10</span>
                    </div>
                  </div>

                  {/* Aggressiveness */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label
                        htmlFor="aggressiveness"
                        className="text-xs font-medium text-gray-700"
                      >
                        Aggressiveness
                      </label>
                      <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded-md shadow-sm">
                        {aggressiveness}%
                      </span>
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
