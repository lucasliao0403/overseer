import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
import re
import hdbscan
from sklearn.neighbors import NearestNeighbors
import os
from pathlib import Path # Use pathlib for easier path manipulation

def clean_text(text):
    """Basic cleaning function for resume text"""
    if isinstance(text, str):
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    return ""

def generate_embeddings(df, resume_column='Resume_str', model_name="all-MiniLM-L6-v2"):
    """Generate embeddings for resume texts"""
    print("Applying text cleaning...") # Added print statement
    df['cleaned_text'] = df[resume_column].apply(clean_text)
    
    print(f"Loading Sentence Transformer model: {model_name}...")
    model = SentenceTransformer(model_name)
    
    print("Generating embeddings (this may take some time)...")
    resume_embeddings = model.encode(df['cleaned_text'].tolist(), show_progress_bar=True)
    
    print(f"Shape of embeddings array: {resume_embeddings.shape}")
    if resume_embeddings.size > 0:
        print(f"Sample embedding vector (first 10 values): {resume_embeddings[0][:10]}...")
    else:
        print("Embeddings array is empty.")
    
    return resume_embeddings

def find_dense_clusters(embeddings, min_cluster_size=10, min_samples=5, n_clusters=10):
    """Find the N densest clusters using HDBSCAN"""
    print(f"Clustering {embeddings.shape[0]} embeddings using HDBSCAN...")
    print(f"Params: min_cluster_size={min_cluster_size}, min_samples={min_samples}, n_clusters={n_clusters}")
    
    if embeddings.shape[0] < min_cluster_size:
        print(f"Warning: Number of embeddings ({embeddings.shape[0]}) is less than min_cluster_size ({min_cluster_size}). Clustering may not be effective or may fail.")
        # Adjust min_cluster_size if too large relative to data points
        min_cluster_size = max(2, embeddings.shape[0] // 2) if embeddings.shape[0] >= 4 else 2
        print(f"Adjusted min_cluster_size to {min_cluster_size}")
    
    if embeddings.shape[0] < min_samples:
        min_samples = max(1, embeddings.shape[0] -1) if embeddings.shape[0] > 1 else 1
        print(f"Adjusted min_samples to {min_samples}")
    
    # Apply HDBSCAN clustering
    try:
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric='euclidean',
            cluster_selection_method='eom' # Excess of Mass
        )
        cluster_labels = clusterer.fit_predict(embeddings)
    except ValueError as e:
        print(f"Error during HDBSCAN fitting: {e}. This might happen if embeddings are identical or parameters are incompatible with data.")
        return [], []
    
    unique_clusters, counts = np.unique(cluster_labels, return_counts=True)
    noise_count = counts[unique_clusters == -1][0] if -1 in unique_clusters else 0
    unique_clusters = unique_clusters[unique_clusters != -1]
    num_clusters = len(unique_clusters)
    
    print(f"Found {num_clusters} clusters (excluding noise)")
    print(f"Noise points: {noise_count} ({(noise_count / len(cluster_labels) * 100):.2f}%)")
    
    if num_clusters == 0:
        print("No significant clusters found with current HDBSCAN parameters.")
        return [], []
    
    # Calculate density for each cluster (Simplified: using size as proxy for density)
    cluster_densities = {}
    cluster_indices = {}
    
    # Correctly filter counts for non-noise clusters BEFORE iterating
    non_noise_counts = counts[np.unique(cluster_labels, return_counts=True)[0] != -1]
    
    # Iterate only over non-noise clusters and their corresponding counts
    for label, count in zip(unique_clusters, non_noise_counts):
        cluster_point_indices = np.where(cluster_labels == label)[0]
        cluster_densities[label] = count # Use size as density proxy
        cluster_indices[label] = cluster_point_indices.tolist()
    
    # Sort clusters by density (size) (descending)
    sorted_clusters = sorted(cluster_densities.items(), key=lambda item: item[1], reverse=True)
    
    # Select the top n clusters based on size
    n_densest = min(n_clusters, len(sorted_clusters))
    if n_densest < n_clusters:
        print(f"Warning: Found only {n_densest} clusters, less than the requested {n_clusters}.")
    
    densest_cluster_labels = [label for label, _ in sorted_clusters[:n_densest]]
    densest_cluster_indices = [cluster_indices[label] for label in densest_cluster_labels]
    
    print(f"Selected {n_densest} largest clusters:")
    for i, label in enumerate(densest_cluster_labels):
        print(f"  Cluster {label}: {len(cluster_indices[label])} points")
    
    return densest_cluster_labels, densest_cluster_indices

def save_clusters_to_csv(df, cluster_indices, cluster_labels, job_dir):
    """Save each cluster as a separate CSV file within the job directory"""
    output_dir = job_dir / "clusters"
    output_dir.mkdir(exist_ok=True)
    
    print(f"Saving individual cluster CSV files to: {output_dir}")
    for i, (indices, label) in enumerate(zip(cluster_indices, cluster_labels)):
        cluster_df = df.iloc[indices].copy()
        output_file = output_dir / f"cluster_{label}.csv"
        try:
            # Save WITH index
            cluster_df.to_csv(output_file, index=True)
            print(f"  Saved Cluster {label} ({len(indices)} resumes) to {output_file.name}")
        except Exception as e:
            print(f"  Error saving Cluster {label} to {output_file.name}: {e}")
    
    # Also save a combined file with a cluster column
    print(f"Saving combined cluster file...")
    combined_df = df.copy()
    combined_df['cluster'] = -1 # Initialize all as noise
    
    for indices, label in zip(cluster_indices, cluster_labels):
        combined_df.loc[indices, 'cluster'] = label
    
    combined_file = output_dir / "all_clusters.csv"
    try:
        combined_df.to_csv(combined_file, index=False)
        print(f"Saved combined file with all clusters to {combined_file}")
    except Exception as e:
        print(f"Error saving combined cluster file {combined_file}: {e}")

def main(job_dir: Path, input_file: Path, n_clusters=6):
    """Main function for embedding generation and clustering for a specific job."""
    
    # Define job-specific output paths
    cleaned_csv_path = job_dir / "cleaned_resumes.csv"
    embeddings_npy_path = job_dir / "resume_embeddings.npy"
    clusters_output_dir = job_dir / "clusters"
    
    print(f"Starting embedding and clustering for job: {job_dir.name}")
    print(f"Input file: {input_file}")
    print(f"Requested number of clusters: {n_clusters}")
    
    # Load the resume dataset from the job-specific input file
    print(f"Loading resume dataset from {input_file}...")
    try:
        if not input_file.exists():
            print(f"Error: Input file does not exist: {input_file}")
            return None, None
        df = pd.read_csv(input_file)
    except Exception as e:
        print(f"Error loading dataset: {e}")
        return None, None
    
    print(f"Dataset loaded. Shape: {df.shape}")
    if 'Resume_str' not in df.columns:
        print("Error: 'Resume_str' column not found in the input dataset.")
        return None, None
    print(f"Columns: {df.columns.tolist()}")
    
    # Check if embeddings already exist *for this job*
    if embeddings_npy_path.exists():
        print(f"Loading existing embeddings from {embeddings_npy_path}...")
        try:
            resume_embeddings = np.load(embeddings_npy_path)
            # Basic shape check consistency with dataframe
            if resume_embeddings.shape[0] != len(df):
                 print(f"Warning: Loaded embeddings shape {resume_embeddings.shape} inconsistent with dataframe length {len(df)}. Regenerating embeddings.")
                 # Force regeneration if counts mismatch
                 embeddings_npy_path.unlink() # Remove inconsistent file
                 resume_embeddings = None
            else:
                 print(f"Embeddings loaded successfully. Shape: {resume_embeddings.shape}")
                 # If embeddings exist but cleaned_text doesn't (unlikely now), regenerate cleaned_text
                 if 'cleaned_text' not in df.columns:
                     print("Regenerating cleaned text...")
                     df['cleaned_text'] = df['Resume_str'].apply(clean_text)
        except Exception as e:
            print(f"Error loading existing embeddings: {e}. Regenerating.")
            resume_embeddings = None # Ensure regeneration on load error
    else:
        resume_embeddings = None
    
    # Generate embeddings if they weren't loaded successfully
    if resume_embeddings is None:
        print("Generating new embeddings...")
        resume_embeddings = generate_embeddings(df)
        if resume_embeddings is None or resume_embeddings.size == 0:
            print("Error: Embedding generation failed.")
            return None, None
        # Save embeddings *for this job*
        try:
            np.save(embeddings_npy_path, resume_embeddings)
            print(f"Saved embeddings to {embeddings_npy_path}")
        except Exception as e:
            print(f"Error saving embeddings to {embeddings_npy_path}: {e}")
            # Continue processing, but embeddings won't be saved for reuse
    
    # Save cleaned dataframe *for this job* if not already saved
    if not cleaned_csv_path.exists() or 'cleaned_text' not in pd.read_csv(cleaned_csv_path, nrows=0).columns:
        print(f"Saving cleaned dataframe to {cleaned_csv_path}...")
        try:
            # Ensure 'cleaned_text' column exists before saving
            if 'cleaned_text' not in df.columns:
                 df['cleaned_text'] = df['Resume_str'].apply(clean_text)
            # Save WITHOUT index
            df.to_csv(cleaned_csv_path, index=False)
            print("Saved cleaned dataframe.")
        except Exception as e:
            print(f"Error saving cleaned dataframe: {e}")
            # Decide if this is critical - perhaps return None, None?
    
    # --- Clustering --- 
    print("\n--- Starting Clustering --- ")
    # Use the provided n_clusters value for selecting the top N densest clusters
    densest_cluster_labels, densest_cluster_indices = find_dense_clusters(
        resume_embeddings,
        min_cluster_size=10, # Keep HDBSCAN params somewhat fixed for now
        min_samples=5,
        n_clusters=n_clusters # Use user-specified number for selection
    )
    
    # Save clusters to CSV files *for this job*
    if densest_cluster_indices:
        save_clusters_to_csv(df, densest_cluster_indices, densest_cluster_labels, job_dir)
    else:
        print("No clusters found or selected to save.")
    
    print(f"--- Embedding and Clustering complete for job {job_dir.name} --- ")
    return df, resume_embeddings

if __name__ == "__main__":
    # This script is not meant to be run directly anymore.
    # It should be called by main.py which provides the job_dir.
    print("This script should be called via main.py, not run directly.")
    # Example for testing (requires creating dummy uploads/testjob):
    # test_job_dir = Path("uploads") / "testjob"
    # test_job_dir.mkdir(exist_ok=True)
    # dummy_input = test_job_dir / "Resume.csv"
    # # Create a dummy CSV for testing
    # pd.DataFrame({'Resume_str': ['test resume 1', 'another test resume']}).to_csv(dummy_input, index=False)
    # main(job_dir=test_job_dir, input_file=dummy_input, n_clusters=2)