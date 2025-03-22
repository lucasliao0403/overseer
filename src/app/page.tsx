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

export default function Home() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState<boolean>(false);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [showSuccessNotification, setShowSuccessNotification] =
    useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<string>("clusters");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [processingLog, setProcessingLog] = useState<string>("");

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

  if (resumes) {
    console.log(resumes);
  }
  if (summary) {
    console.log(summary);
  }

  // Poll for job status updates
  useEffect(() => {
    let interval: NodeJS.Timeout;
    console.log("Job status:", jobStatus);
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

              // After all the other processing, fetch and log removed embeddings
              console.log("Job completed, fetching removed embeddings...");
              const removedEmbeddings = await fetchAndLogRemovedEmbeddings();
              console.log("Removed embeddings processing complete!");
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

        // Show success notification instead of alert
        setSuccessMessage("Unbiased dataset downloaded successfully");
        setShowSuccessNotification(true);

        // Auto-hide success notification after 5 seconds
        setTimeout(() => {
          setShowSuccessNotification(false);
        }, 5000);
      } else {
        // Show error modal instead of alert
        setErrorMessage(
          "Unbiased dataset not available. Please process a file first."
        );
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error filtering files:", error);

      // Show error modal instead of alert
      setErrorMessage(
        `Error filtering files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setShowErrorModal(true);
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

        // Show success notification instead of alert
        setSuccessMessage("Summary downloaded successfully");
        setShowSuccessNotification(true);

        // Auto-hide success notification after 5 seconds
        setTimeout(() => {
          setShowSuccessNotification(false);
        }, 5000);
      } else {
        // Show error modal instead of alert
        setErrorMessage("Summary not available. Please process a file first.");
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error("Error downloading files:", error);

      // Show error modal instead of alert
      setErrorMessage(
        `Error downloading files: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setShowErrorModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
        // Show error modal instead of alert
        setErrorMessage("Please upload a CSV file");
        setShowErrorModal(true);
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
        // Show error modal instead of alert
        setErrorMessage("Please upload a CSV file");
        setShowErrorModal(true);
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
      // Use inline notification instead of alert
      setErrorMessage("Please select a CSV file first");
      setShowErrorModal(true);
      return;
    }

    // Close the upload modal immediately
    setShowUploadModal(false);

    // Show the loading screen
    setShowLoadingScreen(true);
    setLoadingProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => {
          const newProgress = prev + Math.random() * 15;
          return newProgress > 90 ? 90 : newProgress; // Cap at 90% until complete
        });
      }, 500);

      // Simulate file upload and processing
      // In a real app, replace this with your actual API call
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Mock successful response
      const mockJobId = `d${Math.random()
        .toString(36)
        .substring(2, 8)}fd-${Math.random()
        .toString(36)
        .substring(2, 6)}-${Math.random()
        .toString(36)
        .substring(2, 6)}-${Math.random()
        .toString(36)
        .substring(2, 6)}-${Math.random().toString(36).substring(2, 12)}`;

      // Store the job ID
      setJobId(mockJobId);

      // Complete the progress bar
      clearInterval(progressInterval);
      setLoadingProgress(100);

      // Keep loading screen for a moment to show completion
      setTimeout(() => {
        setShowLoadingScreen(false);

        // Show success notification instead of alert
        setSuccessMessage(
          `File "${uploadedFile.name}" uploaded successfully. Processing started with job ID: ${mockJobId}`
        );
        setShowSuccessNotification(true);

        // Auto-hide success notification after 5 seconds
        setTimeout(() => {
          setShowSuccessNotification(false);
        }, 5000);
      }, 1000);
    } catch (error) {
      console.error("Error processing file:", error);

      // Hide loading screen
      setShowLoadingScreen(false);

      // Show error modal
      setErrorMessage(
        `Error processing file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setShowErrorModal(true);
    }
  };

  const fetchAndLogRemovedEmbeddings = async () => {
    console.log("Fetching removed embeddings... ------------");
    try {
      console.log("Fetching removed embeddings...");
      const embeddings = await downloadFile("removed_embeddings");

      // Check if we received the embeddings data
      if (embeddings && embeddings.size > 0) {
        console.log(
          "Successfully downloaded removed_embeddings.npy",
          embeddings
        );

        // Create a URL for the blob
        const blobUrl = URL.createObjectURL(embeddings);
        console.log("Blob URL for removed embeddings:", blobUrl);

        // If you need to parse the NumPy array, you would need a library
        // like numpy-parser, but that's complex for browser use
        console.log(
          `Removed embeddings size: ${(embeddings.size / (1024 * 1024)).toFixed(
            2
          )} MB`
        );

        return embeddings;
      } else {
        console.error("Failed to download removed embeddings or file is empty");
      }
    } catch (error) {
      console.error("Error fetching removed embeddings:", error);
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

          {/* Modal content */}
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
                className={`border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer transition-colors mb-8 ${
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
                  className="h-16 w-16 mx-auto text-gray-400 mb-4"
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

                <p className="text-lg text-gray-700 font-medium mb-1">
                  {uploadedFile
                    ? `Selected: ${uploadedFile.name}`
                    : "Drop your CSV file here or click to browse"}
                </p>
                <p className="text-sm text-gray-500">
                  Supports CSV files with Resume_str column
                </p>
              </div>

              {/* Format example */}
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

              {/* Action buttons */}
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

      {/* Creative Loading Screen */}
      {showLoadingScreen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-64 h-64 relative mb-8">
            {/* Animated data visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-40 h-40 rounded-full border-8 border-blue-500/30 animate-spin"></div>
              <div className="w-32 h-32 rounded-full border-8 border-green-500/30 animate-spin-slow absolute"></div>
              <div className="w-24 h-24 rounded-full border-8 border-yellow-500/30 animate-reverse-spin absolute"></div>
            </div>

            {/* Floating data points */}
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-white rounded-full animate-float"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${3 + Math.random() * 4}s`,
                }}
              ></div>
            ))}

            {/* Central icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center animate-pulse">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="text-white text-xl font-medium mb-6">
            Processing Your Data
          </div>

          {/* Progress bar */}
          <div className="w-80 h-3 bg-gray-700 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500 ease-out"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>

          <div className="text-white/80 text-sm">
            {loadingProgress < 30 && "Analyzing data structure..."}
            {loadingProgress >= 30 &&
              loadingProgress < 60 &&
              "Generating embeddings..."}
            {loadingProgress >= 60 &&
              loadingProgress < 90 &&
              "Clustering data points..."}
            {loadingProgress >= 90 && "Finalizing results..."}
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowErrorModal(false)}
          ></div>

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden transform transition-all duration-300 ease-out animate-fadeIn">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold text-gray-900">
                  Processing Error
                </h3>
                <button
                  onClick={() => setShowErrorModal(false)}
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

              <div className="mb-8 flex items-center justify-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-10 w-10 text-red-600"
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
              </div>

              <p className="text-gray-700 mb-6 text-center">{errorMessage}</p>

              <div className="flex justify-center">
                <button
                  onClick={() => setShowErrorModal(false)}
                  className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {showSuccessNotification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md">
          <div className="bg-black/90 text-white p-4 rounded-lg shadow-lg animate-fadeIn flex items-start">
            <div className="flex-shrink-0 mr-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-green-400"
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
            <div className="flex-1">
              <p className="font-medium">Success</p>
              <p className="text-sm text-white/80">{successMessage}</p>
            </div>
            <button
              onClick={() => setShowSuccessNotification(false)}
              className="flex-shrink-0 ml-3 text-white/60 hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
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
        </div>
      )}
    </main>
  );
}
