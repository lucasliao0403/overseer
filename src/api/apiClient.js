// API client for interacting with the backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002/api";

// Ensure we don't have trailing slashes that might cause double-slash issues
const getApiUrl = (endpoint) => {
  // Remove any leading slash from the endpoint to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  // Ensure base URL doesn't have trailing slash if endpoint starts with one
  const cleanBase = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return `${cleanBase}/${cleanEndpoint}`;
};

/**
 * Check if the API is running
 * @returns {Promise<Object>} Status information
 */
export const getApiStatus = async () => {
  try {
    const response = await fetch(getApiUrl('health'));
    if (!response.ok) {
        throw new Error(`API health check failed: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error checking API status:", error);
    return { status: "error", message: error.message };
  }
};

/**
 * Upload a CSV file to use as the dataset for unbiasing
 * @param {File} file - The CSV file to upload
 * @param {number} clusterCount - Number of clusters to create (1-10)
 * @returns {Promise<Object>} Upload result with job ID
 */
export const uploadDataset = async (file, clusterCount) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('cluster_count', clusterCount.toString());
    
    const response = await fetch(getApiUrl('upload'), {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      // Try to parse error message from backend
      let errorMsg = 'Upload failed';
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || `Upload failed with status ${response.status}`;
      } catch (parseError) {
        errorMsg = `Upload failed with status ${response.status}`;
      }
      throw new Error(errorMsg);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error uploading dataset:", error);
    // Re-throw the error so UI can catch it
    throw error; 
  }
};

/**
 * Check the status of a processing job
 * @param {string} jobId - The job ID to check
 * @returns {Promise<Object>} Job status information
 */
export const getJobStatus = async (jobId) => {
  if (!jobId) throw new Error("Job ID is required to check status.");
  try {
    const response = await fetch(getApiUrl(`jobs/${jobId}/status`));
    
    if (!response.ok) {
      let errorMsg = 'Failed to get job status';
       try {
        const errorData = await response.json();
        errorMsg = errorData.error || `Failed to get job status: ${response.statusText}`;
       } catch(parseError){ errorMsg = `Failed to get job status: ${response.statusText}`;}
      throw new Error(errorMsg);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error getting job status for ${jobId}:`, error);
    throw error; 
  }
};

/**
 * Get information about which datasets are available for a specific job
 * @param {string} jobId - The job ID
 * @returns {Promise<Object>} Available datasets information
 */
export const getAvailableDatasets = async (jobId) => {
  if (!jobId) {
      console.warn("getAvailableDatasets called without jobId");
      return {};
  }
  try {
    const response = await fetch(getApiUrl(`jobs/${jobId}/datasets/available`));
     if (!response.ok) {
         if (response.status === 404) return { error: "Job not found or no datasets available yet."};
         throw new Error(`Failed to get available datasets: ${response.statusText}`);
     }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching available datasets for ${jobId}:`, error);
    return { error: error.message };
  }
};

/**
 * Fetch a page of data from any job-specific paginated dataset endpoint
 * @param {string} jobId - The job ID
 * @param {string} datasetType - e.g., "cleaned_resumes", "unbiased_resumes"
 * @param {number} page - Page number (default: 1)
 * @param {number} pageSize - Number of records per page (default: 100)
 * @returns {Promise<Object>} Paginated data
 */
export const fetchPaginatedDataset = async (jobId, datasetType, page = 1, pageSize = 100) => {
  if (!jobId) {
    console.warn(`fetchPaginatedDataset (${datasetType}) called without jobId`);
    return { error: "Job ID is required." };
  }
  try {
    const endpoint = `jobs/${jobId}/${datasetType}`;
    const url = new URL(getApiUrl(endpoint));
    url.searchParams.append("page", page.toString());
    url.searchParams.append("page_size", pageSize.toString());
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Dataset ${datasetType} not found for job ${jobId}`);
        return { error: `Dataset ${datasetType} not found for this job.` };
      }
      throw new Error(`Failed to fetch ${datasetType}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${datasetType} for job ${jobId}:`, error);
    return { error: error.message };
  }
};

/**
 * Get a page of the cleaned resumes dataset for a specific job
 * @param {string} jobId - The job ID
 * @param {number} page - Page number
 * @param {number} pageSize - Number of records per page
 * @returns {Promise<Object>} Paginated data
 */
export const getCleanedResumes = (jobId, page = 1, pageSize = 100) => {
  return fetchPaginatedDataset(jobId, "cleaned_resumes", page, pageSize);
};

/**
 * Get a page of the unbiased resumes dataset for a specific job
 * @param {string} jobId - The job ID
 * @param {number} page - Page number
 * @param {number} pageSize - Number of records per page
 * @returns {Promise<Object>} Paginated data
 */
export const getUnbiasedResumes = (jobId, page = 1, pageSize = 100) => {
  return fetchPaginatedDataset(jobId, "unbiased_resumes", page, pageSize);
};

/**
 * Get a page of the removed entries dataset for a specific job
 * @param {string} jobId - The job ID
 * @param {number} page - Page number
 * @param {number} pageSize - Number of records per page
 * @returns {Promise<Object>} Paginated data
 */
export const getRemovedEntries = (jobId, page = 1, pageSize = 100) => {
  return fetchPaginatedDataset(jobId, "removed_entries", page, pageSize);
};

/**
 * Get a page of the all_clusters dataset for a specific job
 * @param {string} jobId - The job ID
 * @param {number} page - Page number
 * @param {number} pageSize - Number of records per page
 * @returns {Promise<Object>} Paginated data
 */
export const getAllClustersDataset = (jobId, page = 1, pageSize = 100) => {
  return fetchPaginatedDataset(jobId, "all_clusters", page, pageSize);
};

/**
 * Get information about all clusters (including embeddings) for a specific job
 * @param {string} jobId - The job ID
 * @returns {Promise<Object>} All clusters information
 */
export const getAllClustersInfo = async (jobId) => {
  if (!jobId) {
    console.warn("getAllClustersInfo called without jobId");
    return { error: "Job ID is required." };
  }
  try {
    const response = await fetch(getApiUrl(`jobs/${jobId}/clusters`));
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch cluster info: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching cluster info for ${jobId}:`, error);
    // Throw error so UI can handle loading state etc.
    throw error; 
  }
};

/**
 * Get a specific cluster dataset by ID for a specific job (paginated)
 * @param {string} jobId - The job ID
 * @param {number} clusterId - Cluster ID
 * @param {number} page - Page number
 * @param {number} pageSize - Number of records per page
 * @returns {Promise<Object>} Cluster data
 */
export const getCluster = async (jobId, clusterId, page = 1, pageSize = 100) => {
    if (!jobId) {
        console.warn(`getCluster (${clusterId}) called without jobId`);
        return { error: "Job ID is required." };
    }
    return fetchPaginatedDataset(jobId, `clusters/${clusterId}`, page, pageSize);
};

/**
 * Get all cluster analyses for a specific job
 * @param {string} jobId - The job ID
 * @returns {Promise<Object>} All analyses
 */
export const getAllClusterAnalyses = async (jobId) => {
  if (!jobId) {
    console.warn("getAllClusterAnalyses called without jobId");
    return { error: "Job ID is required." };
  }
  try {
    const response = await fetch(getApiUrl(`jobs/${jobId}/analysis/clusters`));
    
     if (!response.ok) {
       if (response.status === 404) {
         console.warn(`Cluster analyses not found for job ${jobId}`);
         return { error: "Analyses not found for this job." };
       }
       throw new Error(`Failed to get analyses: ${response.statusText}`);
     }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching cluster analyses for ${jobId}:`, error);
    return { error: error.message };
  }
};

/**
 * Fetches the unbiased embeddings data for a specific job
 * @param {string} jobId - The job ID
 * @returns {Promise<Object>} The embeddings data
 */
export const getUnbiasedEmbeddingsData = async (jobId) => {
  if (!jobId) {
    console.warn("getUnbiasedEmbeddingsData called without jobId");
    return { error: "Job ID is required." };
  }
  try {
    const response = await fetch(getApiUrl(`jobs/${jobId}/unbiased_embeddings_data`));
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch unbiased embeddings: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching unbiased embeddings data for ${jobId}:`, error);
    throw error;
  }
};

/**
 * Fetches the removed embeddings data for a specific job
 * @param {string} jobId - The job ID
 * @returns {Promise<Object>} The embeddings data
 */
export const getRemovedEmbeddingsData = async (jobId) => {
  if (!jobId) {
    console.warn("getRemovedEmbeddingsData called without jobId");
    return { error: "Job ID is required." };
  }
  try {
    const response = await fetch(getApiUrl(`jobs/${jobId}/removed_embeddings_data`));
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch removed embeddings: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching removed embeddings data for ${jobId}:`, error);
    throw error;
  }
};

/**
 * Get analysis for a specific cluster for a specific job
 * @param {string} jobId - The job ID
 * @param {number} clusterId - Cluster ID
 * @returns {Promise<Object>} Cluster analysis
 */
export const getClusterAnalysis = async (jobId, clusterId) => {
  if (!jobId) {
    console.warn(`getClusterAnalysis (${clusterId}) called without jobId`);
    return { error: "Job ID is required." };
  }
  try {
    const response = await fetch(getApiUrl(`jobs/${jobId}/analysis/clusters/${clusterId}`));
    
    if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Analysis for cluster ${clusterId} not found for job ${jobId}`);
          return { error: `Analysis for cluster ${clusterId} not found.` };
        }
        throw new Error(`Failed to get analysis: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching analysis for cluster ${clusterId}, job ${jobId}:`, error);
    return { error: error.message };
  }
};

/**
 * Get the unbiasing summary for a specific job
 * @param {string} jobId - The job ID
 * @returns {Promise<Object>} Unbiasing summary
 */
export const getUnbiasingSummary = async (jobId) => {
  if (!jobId) {
    console.warn("getUnbiasingSummary called without jobId");
    return { error: "Job ID is required." };
  }
  try {
    const response = await fetch(getApiUrl(`jobs/${jobId}/summary`));
    
    if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Summary not found for job ${jobId}`);
          return { error: "Summary not found for this job." };
        }
        throw new Error(`Failed to get summary: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching unbiasing summary for ${jobId}:`, error);
    return { error: error.message };
  }
};

/**
 * Download a file from the API for a specific job
 * @param {string} jobId - The job ID
 * @param {string} fileType - Type of file to download (e.g., "cleaned_resumes", "unbiased_resumes")
 * @returns {Promise<Blob|null>} File blob or null on error
 */
export const downloadFile = async (jobId, fileType) => {
  if (!jobId) {
    console.warn(`downloadFile (${fileType}) called without jobId`);
    return null;
  }
  try {
    const response = await fetch(getApiUrl(`jobs/${jobId}/download/${fileType}`));
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`File ${fileType} not found for job ${jobId}`);
      } else {
        console.error(`Error downloading ${fileType} for job ${jobId}: ${response.statusText}`);
      }
      // Maybe throw an error or return specific error info?
      return null; 
    }
    
    return await response.blob();
  } catch (error) {
    console.error(`Error downloading ${fileType} for job ${jobId}:`, error);
    return null;
  }
};

/**
 * Save a blob as a file in the browser
 * @param {Blob} blob - File blob
 * @param {string} filename - Filename to save as
 */
export const saveFile = (blob, filename) => {
  if (!blob) return;
  
  try {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
      console.error("Error saving file:", error);
      // Optionally inform the user
  }
};

/**
 * Fetch all dataset statistics for a specific job
 * @param {string} jobId - The job ID
 * @returns {Promise<Object>} Statistics for all available datasets for the job
 */
export const fetchAllDatasetStats = async (jobId) => {
  if (!jobId) {
    console.warn("fetchAllDatasetStats called without jobId");
    return { error: "Job ID is required." };
  }
  try {
    // First check what's available for this job
    const available = await getAvailableDatasets(jobId);
    if (available.error) {
      throw new Error(available.error);
    }
    const stats = {};
    
    // Use the job-specific functions
    if (available.cleaned_resumes) {
      const data = await getCleanedResumes(jobId, 1, 1);
      stats.cleanedResumes = { totalRecords: data.total_records || 0, totalPages: data.total_pages || 0 };
    }
    if (available.unbiased_resumes) {
      const data = await getUnbiasedResumes(jobId, 1, 1);
      stats.unbiasedResumes = { totalRecords: data.total_records || 0, totalPages: data.total_pages || 0 };
    }
    if (available.removed_entries) {
      const data = await getRemovedEntries(jobId, 1, 1);
      stats.removedEntries = { totalRecords: data.total_records || 0, totalPages: data.total_pages || 0 };
    }
    if (available.all_clusters) {
      const data = await getAllClustersDataset(jobId, 1, 1);
      stats.allClusters = { totalRecords: data.total_records || 0, totalPages: data.total_pages || 0 };
    }
    if (available.individual_clusters && available.individual_clusters.length > 0) {
      // Get detailed cluster info (might already contain counts)
      const clustersInfo = await getAllClustersInfo(jobId);
      stats.clusters = {
        totalClusters: clustersInfo.total_clusters || 0,
        // Adjust if getAllClustersInfo provides counts differently
        clusterSizes: Object.entries(clustersInfo.clusters || {}).reduce((acc, [key, value]) => {
          acc[key] = value.count || 0; // Assuming count is provided
          return acc;
        }, {})
      };
    }
    
    return stats;
  } catch (error) {
    console.error(`Error fetching dataset stats for job ${jobId}:`, error);
    return { error: error.message };
  }
}; 