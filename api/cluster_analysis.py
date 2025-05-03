import os
import pandas as pd
import cohere
from dotenv import load_dotenv
import json
from pathlib import Path
import numpy as np
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import datetime # Import datetime for logging

# Load environment variables from .env file
load_dotenv()

# Get Cohere API key
CO_API_KEY = os.getenv("COHERE_API_KEY")
if not CO_API_KEY:
    print("Warning: COHERE_API_KEY not found in environment variables. Analysis will likely fail.")
    co = None
else:
    try:
        co = cohere.ClientV2(CO_API_KEY)
        print("Cohere client initialized.")
    except Exception as e:
        print(f"Error initializing Cohere client: {e}")
        co = None

def analyze_cluster(cluster_df, cluster_label, job_dir):
    """
    Analyze a cluster using Cohere LLM to identify patterns.
    
    Args:
        cluster_df: DataFrame containing the cluster data
        cluster_label: The label/identifier of the cluster
        job_dir: Path object for the job directory
    
    Returns:
        The analysis results from Cohere or an error message
    """
    if co is None:
        return f"ANALYSIS SKIPPED: Cohere client not initialized (API key missing or invalid?)."

    # Sample some resumes from the cluster (limit to 5 to avoid token limits)
    sample_size = min(5, len(cluster_df))
    if sample_size == 0:
        return "ANALYSIS SKIPPED: Cluster is empty."
    sample_df = cluster_df.sample(sample_size, random_state=42) # Use random_state for consistency
    
    # Prepare the prompt with resume samples
    resume_samples = []
    
    for i, row in sample_df.iterrows():
        resume_text = str(row['Resume_str'])[:2000]  # Limit to 2000 chars
        # Use original index if available, otherwise just use row number
        resume_id = row.get('Unnamed: 0', i)
        sample = f"Resume #{resume_id}:\n{resume_text}\n\n"
        resume_samples.append(sample)
    
    resume_text_block = "\n".join(resume_samples)
    
    # Craft the prompt
    prompt = f"""
Analyze the following {sample_size} sample resumes from Cluster #{cluster_label}:

{resume_text_block}

Based *only* on these samples, provide:
1. A concise title for the cluster (e.g., "Software Engineers - Web Focus"). Enclose in ** **.
2. A 2-sentence summary identifying common skills, experiences, qualifications, or targeted roles/industries.

**Example Format:**
**Data Scientists - NLP/ML**

This cluster features resumes strong in Python, machine learning libraries (Scikit-learn, TensorFlow), and NLP techniques. Candidates appear to target data science roles with an emphasis on natural language processing.

**Your analysis:**
"""
    
    # Make the API call to Cohere with error handling
    print(f"  Calling Cohere API for Cluster {cluster_label}...")
    try:
        # Using chat endpoint V2 - Use 'messages' list format
        response = co.chat(
            model="command-r-plus", # Use latest model
            messages=[{"role": "user", "content": prompt}]
        )
        analysis_text = response.text
        print(f"  Cohere response received for Cluster {cluster_label}.")
        return analysis_text

    except Exception as e:
        error_message = f"Error calling Cohere API: {str(e)}"
        print(f"ERROR analyzing Cluster {cluster_label}: {error_message}")
        
        # Log the error to a job-specific file
        log_dir = job_dir / "logs"
        log_dir.mkdir(exist_ok=True)
        error_log_file = log_dir / "cohere_api_errors.log"
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(error_log_file, "a") as error_log:
            error_log.write(f"[{timestamp}] Cluster {cluster_label}: {error_message}\n")
        
        # Return error message as the analysis result
        return f"ANALYSIS FAILED: {error_message}\nPlease check {error_log_file.relative_to(job_dir.parent)} for details."

def save_cluster_embeddings(cluster_df, cluster_label, job_dir):
    """
    Save embeddings for resumes in this cluster (both full-dim and 6D PCA).
    Reads all embeddings from the job's main NPY file.
    
    Args:
        cluster_df: DataFrame containing the cluster data (must contain original indices)
        cluster_label: The number/identifier of the cluster
        job_dir: Path object for the job directory
    
    Returns:
        Path to the saved 6D NPY embeddings file, or None on failure.
    """
    print(f"Extracting and processing embeddings for Cluster {cluster_label}...")
    embeddings_file = job_dir / "resume_embeddings.npy"
    clusters_output_dir = job_dir / "clusters"
    clusters_output_dir.mkdir(exist_ok=True)

    # Ensure the main embeddings file exists for the job
    if not embeddings_file.exists():
        print(f"ERROR: Main embeddings file '{embeddings_file}' not found. Cannot process cluster embeddings.")
        return None

    # Load all embeddings for the job
    try:
        all_embeddings = np.load(embeddings_file)
        print(f"  Loaded main embeddings. Shape: {all_embeddings.shape}")
    except Exception as e:
        print(f"ERROR: Could not load main embeddings file '{embeddings_file}': {e}")
        return None

    # Get resume indices from the cluster dataframe
    # IMPORTANT: Assumes the dataframe index IS the original index from the cleaned CSV
    # If embeddings.py saved 'cleaned_resumes.csv' without index, this needs adjustment.
    # Let's assume the index is correct for now.
    resume_indices = cluster_df.index.values

    # Ensure indices are valid for the loaded embeddings array
    valid_indices_mask = (resume_indices >= 0) & (resume_indices < len(all_embeddings))
    valid_indices = resume_indices[valid_indices_mask]

    if len(valid_indices) != len(resume_indices):
        print(f"  Warning: {len(resume_indices) - len(valid_indices)} indices were out of bounds for the embeddings array.")

    if len(valid_indices) == 0:
        print(f"  ERROR: No valid resume indices found for Cluster {cluster_label}. Cannot extract embeddings.")
        return None

    # Extract the corresponding embeddings
    cluster_embeddings = all_embeddings[valid_indices]
    print(f"  Extracted {len(cluster_embeddings)} embeddings for Cluster {cluster_label}.")

    # --- Save Full Dimensional Embeddings (Optional, consider removing if not needed) ---
    # Saving full dim might be redundant if create_unbiased_dataset uses the main NPY
    # embeddings_data_full = {
    #     "cluster_id": int(cluster_label),
    #     "total_embeddings": len(valid_indices),
    #     "embeddings": [
    #         {"id": i, "resume_id": int(resume_id), "embedding": embedding.tolist()}
    #         for i, (resume_id, embedding) in enumerate(zip(valid_indices, cluster_embeddings))
    #     ]
    # }
    # embeddings_full_json_file = clusters_output_dir / f"cluster_{cluster_label}_embeddings_full.json"
    # try:
    #     with open(embeddings_full_json_file, 'w') as f:
    #         json.dump(embeddings_data_full, f, indent=2)
    #     print(f"  Saved {len(valid_indices)} full-dimensional embeddings to {embeddings_full_json_file.name}")
    # except Exception as e:
    #     print(f"  Error saving full-dimensional embeddings JSON: {e}")
    # ---------------------------------------------------------------------------------

    # --- Reduce to 6D with PCA --- 
    print(f"  Applying PCA to reduce {len(cluster_embeddings)} embeddings to 6D...")
    embeddings_6d = None
    if len(cluster_embeddings) < 6:
         print(f"  Warning: Cannot perform PCA to 6 dimensions with only {len(cluster_embeddings)} samples. Skipping PCA.")
    else:
        try:
            # Standardize before PCA
            scaler = StandardScaler()
            scaled_embeddings = scaler.fit_transform(cluster_embeddings)
            # Apply PCA
            pca = PCA(n_components=6)
            embeddings_6d = pca.fit_transform(scaled_embeddings)
            # Normalize the 6D embeddings (L2 norm)
            embeddings_6d = normalize_embeddings(embeddings_6d)
            explained_variance = sum(pca.explained_variance_ratio_) * 100
            print(f"  PCA completed. Explained variance with 6 components: {explained_variance:.2f}%")
        except Exception as e:
             print(f"  Error during PCA reduction for Cluster {cluster_label}: {e}. Skipping 6D output.")
             embeddings_6d = None # Ensure we don't try to save failed PCA results

    # --- Save 6D Embeddings --- 
    embeddings_6d_npy_file = None
    if embeddings_6d is not None and embeddings_6d.size > 0:
        embeddings_6d_npy_file = clusters_output_dir / f"cluster_{cluster_label}_embeddings_6d.npy"
        embeddings_6d_json_file = clusters_output_dir / f"cluster_{cluster_label}_embeddings_6d.json"

        # Save 6D as NPY (preferred for API)
        try:
            np.save(embeddings_6d_npy_file, embeddings_6d)
            print(f"  Saved {len(embeddings_6d)} 6D embeddings to {embeddings_6d_npy_file.name}")
        except Exception as e:
            print(f"  Error saving 6D NPY embeddings: {e}")
            embeddings_6d_npy_file = None # Indicate failure

        # Save 6D as JSON (optional, might be useful for debugging)
        # embeddings_6d_data = {
        #     "cluster_id": int(cluster_label),
        #     "total_embeddings": len(valid_indices),
        #     "dimensions": 6,
        #     "embeddings": [
        #         {"id": i, "resume_id": int(resume_id), "embedding": embedding.tolist()}
        #         for i, (resume_id, embedding) in enumerate(zip(valid_indices, embeddings_6d))
        #     ]
        # }
        # try:
        #     with open(embeddings_6d_json_file, 'w') as f:
        #         json.dump(embeddings_6d_data, f, indent=2)
        #     print(f"  Saved {len(embeddings_6d)} 6D embeddings to {embeddings_6d_json_file.name}")
        # except Exception as e:
        #     print(f"  Error saving 6D JSON embeddings: {e}")
    else:
        print("  Skipping saving of 6D embeddings due to previous errors or lack of data.")

    return embeddings_6d_npy_file # Return path to NPY file or None

def normalize_embeddings(embeddings):
    """
    Normalize each embedding vector to unit length (L2 norm)
    """
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-10) # Prevent division by zero
    normalized_embeddings = embeddings / norms
    return normalized_embeddings

def main(job_dir: Path):
    """Main function to analyze clusters for a specific job."""
    print(f"--- Starting Cluster Analysis for job: {job_dir.name} ---")
    clusters_input_dir = job_dir / "clusters"
    analysis_output_dir = job_dir / "cluster_analysis"
    analysis_output_dir.mkdir(exist_ok=True) # Ensure output dir exists

    # Check if the cluster directory exists
    if not clusters_input_dir.exists() or not clusters_input_dir.is_dir():
        print(f"Error: Clusters directory not found: {clusters_input_dir}")
        print("Ensure embeddings.py ran successfully and created the clusters.")
        return

    # Find cluster CSV files
    cluster_files = sorted(list(clusters_input_dir.glob("cluster_*.csv"))) # Sort for consistent order

    if not cluster_files:
        print(f"Error: No cluster CSV files found in {clusters_input_dir}")
        print("Ensure embeddings.py ran successfully and saved cluster files.")
        return

    print(f"Found {len(cluster_files)} cluster files to analyze.")

    all_analyses = {}
    processed_clusters_count = 0

    # Analyze each cluster file
    for cluster_file in cluster_files:
        try:
            # Extract cluster label from filename (e.g., cluster_1.csv -> 1)
            cluster_label = int(cluster_file.stem.split('_')[1])
            print(f"\nProcessing Cluster {cluster_label} from {cluster_file.name}...")
        except (IndexError, ValueError):
            print(f"Warning: Could not parse cluster label from filename '{cluster_file.name}'. Skipping.")
            continue

        try:
            # Load cluster data WITH index
            cluster_df = pd.read_csv(cluster_file, index_col=0)
            print(f"  Loaded {len(cluster_df)} resumes for Cluster {cluster_label}.")

            if 'Resume_str' not in cluster_df.columns:
                 print(f"  Warning: 'Resume_str' column not found in {cluster_file.name}. Cannot perform text analysis. Trying to process embeddings only.")
                 analysis_result = "ANALYSIS SKIPPED: 'Resume_str' column missing."
            elif len(cluster_df) > 0:
                # Perform Cohere analysis
                analysis_result = analyze_cluster(cluster_df, cluster_label, job_dir)
            else:
                analysis_result = "ANALYSIS SKIPPED: Cluster dataframe is empty."

            # Save individual analysis result to a text file
            analysis_file_path = analysis_output_dir / f"cluster_{cluster_label}_analysis.txt"
            with open(analysis_file_path, 'w') as f:
                f.write(analysis_result)
            print(f"  Saved analysis to {analysis_file_path.name}")
            all_analyses[f"cluster_{cluster_label}"] = analysis_result

            # --- Process and save embeddings for this cluster --- 
            if len(cluster_df) > 0:
                 # Pass the dataframe WITH the index loaded correctly
                 save_cluster_embeddings(cluster_df, cluster_label, job_dir)
            else:
                 print("  Skipping embedding processing for empty cluster.")
            # -----------------------------------------------------

            processed_clusters_count += 1

        except pd.errors.EmptyDataError:
             print(f"  Warning: Cluster file {cluster_file.name} is empty. Skipping.")
             all_analyses[f"cluster_{cluster_label}"] = "ANALYSIS SKIPPED: Cluster file was empty."
        except KeyError:
            print(f"  Error: Could not find index column when loading {cluster_file.name} with index_col=0. Was it saved correctly?")
            all_analyses[f"cluster_{cluster_label}"] = f"ANALYSIS FAILED: Error reading index column."
        except Exception as e:
            print(f"Error processing Cluster {cluster_label} from {cluster_file.name}: {e}")
            all_analyses[f"cluster_{cluster_label}"] = f"ANALYSIS FAILED: {e}"

    # Save all analysis results to a single JSON file
    summary_json_path = analysis_output_dir / "all_clusters_analysis.json"
    try:
        with open(summary_json_path, 'w') as f:
            json.dump(all_analyses, f, indent=2)
        print(f"\nSaved summary of all analyses to {summary_json_path}")
    except Exception as e:
        print(f"Error saving analysis summary JSON: {e}")

    print(f"--- Cluster Analysis complete for job {job_dir.name}. Processed {processed_clusters_count}/{len(cluster_files)} clusters. --- ")

if __name__ == "__main__":
    # This script is not meant to be run directly anymore.
    # It should be called by main.py which provides the job_dir.
    print("This script should be called via main.py, not run directly.")
    # Example for testing (requires creating dummy uploads/testjob/clusters):
    # test_job_dir = Path("uploads") / "testjob"
    # test_clusters_dir = test_job_dir / "clusters"
    # test_clusters_dir.mkdir(exist_ok=True, parents=True)
    # # Create dummy cluster CSVs for testing
    # pd.DataFrame({'Unnamed: 0': [0], 'Resume_str': ['Test resume cluster 1']}).to_csv(test_clusters_dir / "cluster_1.csv")
    # pd.DataFrame({'Unnamed: 0': [1], 'Resume_str': ['Test resume cluster 2']}).to_csv(test_clusters_dir / "cluster_2.csv", index=False) # Test without index
    # # Create dummy embeddings NPY
    # np.save(test_job_dir / "resume_embeddings.npy", np.random.rand(10, 10)) 
    # main(job_dir=test_job_dir) 