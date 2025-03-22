import pandas as pd
import numpy as np
from pathlib import Path
import os
import random

def create_biased_dataset():
    """
    Creates a biased version of the original dataset by randomly removing 
    50% of the datapoints from clusters 1, 2, and 3 in the cleaned_resumes.csv file.
    The original cluster files are not modified.
    """
    print("Creating biased dataset...")
    
    # Check if cleaned_resumes.csv exists
    cleaned_file = Path("cleaned_resumes.csv")
    if not cleaned_file.exists():
        print("Error: cleaned_resumes.csv not found. Run embeddings.py first.")
        return
    
    # Load the full cleaned dataset
    df_full = pd.read_csv(cleaned_file)
    print(f"Loaded cleaned_resumes.csv with {len(df_full)} rows")
    
    # Check if cluster directories exist
    clusters_dir = Path("clusters")
    if not clusters_dir.exists():
        print("Error: clusters directory not found. Run embeddings.py first.")
        return
    
    # Get the lists of indices that belong to each cluster
    top_clusters = [1, 2, 3]
    cluster_indices = {}
    
    for cluster_num in top_clusters:
        cluster_file = clusters_dir / f"cluster_{cluster_num}.csv"
        if not cluster_file.exists():
            print(f"Warning: {cluster_file} not found, skipping cluster {cluster_num}")
            continue
            
        cluster_df = pd.read_csv(cluster_file)
        print(f"Loaded cluster_{cluster_num}.csv with {len(cluster_df)} rows")
        
        # Try to identify the indices in the main dataset
        # Method 1: Using Unnamed:0 column which often contains original indices
        if 'Unnamed: 0' in cluster_df.columns:
            indices = cluster_df['Unnamed: 0'].tolist()
            print(f"Using 'Unnamed: 0' to map indices for cluster {cluster_num}")
        else:
            # Method 2: Try to match on Resume_str content
            print(f"No index column found, using content matching for cluster {cluster_num}")
            indices = []
            for i, row in cluster_df.iterrows():
                # Use a smaller subset of the text for matching to improve performance
                sample_text = str(row['Resume_str'])[:100]
                # Find matching indices in the main dataset
                matches = df_full[df_full['Resume_str'].str.startswith(sample_text, na=False)].index.tolist()
                if matches:
                    indices.extend(matches)
        
        cluster_indices[cluster_num] = indices
        print(f"Identified {len(indices)} rows in cleaned_resumes.csv belonging to cluster {cluster_num}")
    
    # Create a copy of the full dataset
    df_biased = df_full.copy()
    
    # Combine all indices from all clusters
    all_cluster_indices = []
    for cluster_num in top_clusters:
        if cluster_num in cluster_indices:
            all_cluster_indices.extend(cluster_indices[cluster_num])
    
    # Count entries in each cluster before removal
    for cluster_num in top_clusters:
        if cluster_num in cluster_indices:
            count = len(cluster_indices[cluster_num])
            print(f"Cluster {cluster_num} has {count} entries before removal")
    
    # Randomly select 50% of indices from these clusters to remove
    random.seed(42)  # For reproducibility
    indices_to_remove = random.sample(all_cluster_indices, k=len(all_cluster_indices) // 2)
    print(f"Removing {len(indices_to_remove)} entries from clusters {top_clusters}")
    
    # Remove the selected indices
    df_biased = df_biased.drop(indices_to_remove)
    
    # Calculate how many entries from each cluster were removed
    removed_counts = {}
    for cluster_num in top_clusters:
        if cluster_num in cluster_indices:
            original_indices = set(cluster_indices[cluster_num])
            removed_indices = set(indices_to_remove).intersection(original_indices)
            removed_counts[cluster_num] = len(removed_indices)
            remaining = len(original_indices) - len(removed_indices)
            print(f"Removed {len(removed_indices)} entries from cluster {cluster_num}, {remaining} remain")
    
    # Create output directory if it doesn't exist
    output_dir = Path("biased_dataset")
    output_dir.mkdir(exist_ok=True)
    
    # Save the biased dataset
    output_file = output_dir / "biased_resumes.csv"
    df_biased.to_csv(output_file, index=False)
    print(f"Biased dataset saved to {output_file}")
    
    # Save the removed entries as a separate file for reference
    removed_df = df_full.loc[indices_to_remove]
    removed_file = output_dir / "removed_entries.csv"
    removed_df.to_csv(removed_file, index=False)
    print(f"Removed entries saved to {removed_file}")
    
    # Print file sizes
    original_size_mb = os.path.getsize(cleaned_file) / (1024 * 1024)
    biased_size_mb = os.path.getsize(output_file) / (1024 * 1024)
    removed_size_mb = os.path.getsize(removed_file) / (1024 * 1024)
    
    print(f"\nFile sizes:")
    print(f"Original cleaned_resumes.csv: {original_size_mb:.2f} MB")
    print(f"Biased dataset: {biased_size_mb:.2f} MB")
    print(f"Removed entries: {removed_size_mb:.2f} MB")
    
    # Save summary statistics
    summary = {
        "original_count": len(df_full),
        "biased_count": len(df_biased),
        "removed_count": len(indices_to_remove),
        "removal_percentage": (len(indices_to_remove) / len(df_full)) * 100,
        "cluster_removal_counts": removed_counts,
        "file_sizes": {
            "original_mb": original_size_mb,
            "biased_mb": biased_size_mb,
            "removed_mb": removed_size_mb
        }
    }
    
    # Save summary as text file
    with open(output_dir / "bias_summary.txt", "w") as f:
        f.write("BIASED DATASET SUMMARY\n")
        f.write("=====================\n\n")
        f.write(f"Original dataset size: {summary['original_count']} entries ({original_size_mb:.2f} MB)\n")
        f.write(f"Biased dataset size: {summary['biased_count']} entries ({biased_size_mb:.2f} MB)\n")
        f.write(f"Removed entries: {summary['removed_count']} entries ({removed_size_mb:.2f} MB)\n")
        f.write(f"Overall removal percentage: {summary['removal_percentage']:.2f}%\n\n")
        
        f.write("Removal by cluster:\n")
        for cluster_num in top_clusters:
            if cluster_num in removed_counts:
                count = removed_counts[cluster_num]
                original = len(cluster_indices[cluster_num])
                remaining = original - count
                percentage = (count / original) * 100
                f.write(f"  Cluster {cluster_num}: Removed {count}/{original} entries ({percentage:.2f}%), {remaining} remain\n")
    
    print(f"Summary saved to {output_dir}/bias_summary.txt")
    
    return df_biased, removed_df

if __name__ == "__main__":
    create_biased_dataset() 