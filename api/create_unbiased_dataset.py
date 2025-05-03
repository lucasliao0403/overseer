import pandas as pd
import numpy as np
from pathlib import Path
import os
import random
import json
from sklearn.decomposition import PCA
import datetime # Import datetime for summary

def normalize_embeddings(emb):
    """Normalize embeddings to unit length (L2 norm)."""
    norm = np.linalg.norm(emb, axis=1, keepdims=True)
    norm = np.maximum(norm, 1e-10) # Avoid division by zero
    return emb / norm

def create_unbiased_dataset(job_dir: Path):
    """
    Creates an unbiased version of the dataset for a specific job by removing
    50% of the datapoints from the top 3 largest clusters.
    Outputs results into the job's unbiased_dataset subdirectory.
    Assumes embeddings.py and cluster_analysis.py ran successfully for the job.

    Args:
        job_dir: Path object for the job directory.

    Returns:
        Tuple: (unbiased_dataframe, removed_dataframe) or (None, None) on failure.
    """
    print(f"--- Creating Unbiased Dataset for job: {job_dir.name} ---")

    # Define job-specific paths
    cleaned_file = job_dir / "cleaned_resumes.csv"
    embeddings_file = job_dir / "resume_embeddings.npy"
    clusters_dir = job_dir / "clusters"
    output_dir = job_dir / "unbiased_dataset"
    output_dir.mkdir(exist_ok=True) # Ensure output dir exists

    # --- Input Validation --- 
    if not cleaned_file.exists():
        print(f"Error: Cleaned dataset not found: {cleaned_file}")
        return None, None
    if not embeddings_file.exists():
        print(f"Error: Embeddings file not found: {embeddings_file}")
        return None, None
    if not clusters_dir.exists() or not clusters_dir.is_dir():
        print(f"Error: Clusters directory not found: {clusters_dir}")
        return None, None

    # --- Load Data --- 
    try:
        all_embeddings = np.load(embeddings_file)
        print(f"Loaded main embeddings. Shape: {all_embeddings.shape}")
        # Load cleaned CSV WITHOUT index - its default RangeIndex will align with embeddings
        df_full = pd.read_csv(cleaned_file)
        print(f"Loaded cleaned dataset. Shape: {df_full.shape}")
        # Ensure index is the default RangeIndex
        df_full = df_full.reset_index(drop=True)
    except Exception as e:
        print(f"Error loading input data: {e}")
        return None, None

    # --- Identify Top Clusters to Prune --- 
    cluster_files = list(clusters_dir.glob("cluster_*.csv"))
    if not cluster_files:
        print(f"Error: No cluster CSV files found in {clusters_dir}")
        return None, None

    cluster_sizes = {}
    for f in cluster_files:
        try:
            cluster_label = int(f.stem.split('_')[1])
            # Load cluster WITH index to get original indices
            cluster_df_size = pd.read_csv(f, index_col=0)
            cluster_sizes[cluster_label] = len(cluster_df_size)
        except (IndexError, ValueError, FileNotFoundError, pd.errors.EmptyDataError) as e:
            print(f"Warning: Could not process cluster file {f.name} to get size: {e}")
            continue
        except Exception as e: # Catch other potential read errors
             print(f"Warning: Unexpected error reading {f.name} for size check: {e}")
             continue

    if not cluster_sizes:
        print("Error: Could not determine sizes for any clusters.")
        return None, None

    sorted_clusters = sorted(cluster_sizes.items(), key=lambda item: item[1], reverse=True)
    top_clusters_to_prune = [label for label, size in sorted_clusters[:3]] # Prune top 3 largest

    indices_to_remove = set()
    removed_counts = {}
    if not top_clusters_to_prune:
        print("Warning: No clusters identified for pruning. Proceeding without pruning.")
    else:
        print(f"Identified top {len(top_clusters_to_prune)} clusters for pruning: {top_clusters_to_prune}")
        for cluster_label in top_clusters_to_prune:
            cluster_file = clusters_dir / f"cluster_{cluster_label}.csv"
            try:
                # Load cluster WITH index to get original indices
                cluster_df_prune = pd.read_csv(cluster_file, index_col=0)
                original_indices = cluster_df_prune.index.tolist()

                random.seed(42)
                num_to_remove = len(original_indices) // 2
                if num_to_remove > 0:
                    indices_sample = random.sample(original_indices, k=num_to_remove)
                    # The indices from cluster CSV are original 0-based row numbers
                    # We can use them directly if df_full has RangeIndex
                    indices_to_remove.update(indices_sample)
                    removed_counts[cluster_label] = num_to_remove # Count attempts
                    print(f"  Selected {num_to_remove} original indices from Cluster {cluster_label} for removal consideration.")
                else:
                    print(f"  Cluster {cluster_label} is too small to remove 50%. Skipping removal.")
                    removed_counts[cluster_label] = 0
            except (FileNotFoundError, pd.errors.EmptyDataError, KeyError) as e:
                print(f"Warning: Could not load cluster {cluster_label} file ({cluster_file.name}) with index for pruning: {e}")
                removed_counts[cluster_label] = 0
            except Exception as e:
                 print(f"Warning: Unexpected error processing cluster {cluster_label} for pruning: {e}")
                 removed_counts[cluster_label] = 0

    indices_to_remove = list(indices_to_remove)
    # Filter the collected indices to ensure they are valid for df_full's RangeIndex
    valid_indices_to_drop = [idx for idx in indices_to_remove if 0 <= idx < len(df_full)]
    removed_count_final = len(valid_indices_to_drop)
    print(f"Total unique valid indices selected for removal from main dataframe: {removed_count_final}")

    # --- Create Unbiased Dataset --- 
    try:
        df_unbiased = df_full.drop(index=valid_indices_to_drop)
        removed_df = df_full.loc[valid_indices_to_drop]
    except Exception as e:
        print(f"Error creating unbiased/removed dataframes by dropping indices: {e}")
        return None, None

    unbiased_csv_file = output_dir / "unbiased_resumes.csv"
    removed_csv_file = output_dir / "removed_entries.csv"
    try:
        df_unbiased.to_csv(unbiased_csv_file, index=False)
        removed_df.to_csv(removed_csv_file, index=False)
        print(f"Unbiased dataset saved: {unbiased_csv_file.name} ({len(df_unbiased)} rows)")
        print(f"Removed entries saved: {removed_csv_file.name} ({len(removed_df)} rows)")
    except Exception as e:
        print(f"Error saving unbiased/removed CSV files: {e}")

    # --- Process Embeddings --- 
    if len(all_embeddings) != len(df_full):
        print(f"CRITICAL WARNING: Mismatch between embeddings count ({len(all_embeddings)}) and loaded dataframe rows ({len(df_full)}). Skipping embedding processing.")
        unbiased_embeddings, removed_embeddings = None, None
    else:
        try:
            # Use the validated 0-based indices directly on the embeddings array
            keep_mask = np.ones(len(all_embeddings), dtype=bool)
            if len(valid_indices_to_drop) > 0:
                keep_mask[valid_indices_to_drop] = False
    
            unbiased_embeddings = all_embeddings[keep_mask]
            removed_embeddings = all_embeddings[~keep_mask]
            print(f"Split embeddings: {len(unbiased_embeddings)} kept, {len(removed_embeddings)} removed")
        except IndexError as e:
             print(f"Error splitting embeddings using indices (check index validity): {e}")
             unbiased_embeddings, removed_embeddings = None, None
        except Exception as e:
            print(f"Error processing/splitting embeddings based on indices: {e}")
            unbiased_embeddings, removed_embeddings = None, None

    unbiased_384d_file = output_dir / "unbiased_embeddings_384d.npy"
    removed_384d_file = output_dir / "removed_embeddings_384d.npy"
    save_errors_384d = []
    try:
        if unbiased_embeddings is not None: np.save(unbiased_384d_file, unbiased_embeddings)
    except Exception as e: save_errors_384d.append(f"unbiased_384d: {e}")
    try:
        if removed_embeddings is not None: np.save(removed_384d_file, removed_embeddings)
    except Exception as e: save_errors_384d.append(f"removed_384d: {e}")
    if not save_errors_384d:
        print(f"Saved original dimension embeddings (split): {unbiased_384d_file.name}, {removed_384d_file.name}")
    else:
        print(f"Errors saving 384D split embeddings: {'; '.join(save_errors_384d)}")

    # --- Apply PCA to get 6D versions --- 
    unbiased_6d, removed_6d, all_6d = None, None, None
    if len(all_embeddings) >= 6:
        print("Applying PCA to reduce embeddings to 6D...")
        try:
            pca = PCA(n_components=6)
            pca.fit(all_embeddings)
            print(f"  PCA Explained variance ratio (overall): {pca.explained_variance_ratio_}")
    
            if unbiased_embeddings is not None and len(unbiased_embeddings) > 0:
                unbiased_6d = pca.transform(unbiased_embeddings)
                unbiased_6d = normalize_embeddings(unbiased_6d)
            if removed_embeddings is not None and len(removed_embeddings) > 0:
                removed_6d = pca.transform(removed_embeddings)
                removed_6d = normalize_embeddings(removed_6d)
            all_6d = pca.transform(all_embeddings)
            all_6d = normalize_embeddings(all_6d)
            print("  PCA transformation complete for all, unbiased, and removed sets.")
        except Exception as e:
            print(f"Error during PCA processing: {e}")
    else:
        print("Skipping PCA reduction: Not enough data points (< 6).")

    all_6d_file = output_dir / "all_embeddings_6d.npy"
    unbiased_6d_file = output_dir / "unbiased_embeddings_6d.npy"
    removed_6d_file = output_dir / "removed_embeddings_6d.npy"
    save_errors_6d = []
    try:
        if all_6d is not None: np.save(all_6d_file, all_6d)
    except Exception as e: save_errors_6d.append(f"all_6d: {e}")
    try:
        if unbiased_6d is not None: np.save(unbiased_6d_file, unbiased_6d)
    except Exception as e: save_errors_6d.append(f"unbiased_6d: {e}")
    try:
        if removed_6d is not None: np.save(removed_6d_file, removed_6d)
    except Exception as e: save_errors_6d.append(f"removed_6d: {e}")
    if not save_errors_6d:
        print(f"Saved 6D embeddings (NPY): {all_6d_file.name}, {unbiased_6d_file.name}, {removed_6d_file.name}")
    else:
        print(f"Errors saving 6D NPY files: {'; '.join(save_errors_6d)}")

    # --- Generate Summary --- 
    summary_path = output_dir / "unbiasing_summary.txt"
    print(f"Generating summary file: {summary_path.name}")
    summary_content = ["UNBIASED DATASET SUMMARY"] # ... (rest of summary generation remains the same)
    # (Keeping the summary generation logic as it was, assuming it's correct)
    summary_content.append("=========================")
    summary_content.append(f"Job ID: {job_dir.name}")
    summary_content.append(f"Timestamp: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    summary_content.append("\n-- Counts --")
    summary_content.append(f"Original dataset entries: {len(df_full)}")
    summary_content.append(f"Unbiased dataset entries: {len(df_unbiased)}")
    summary_content.append(f"Removed entries: {len(removed_df)}")
    if len(df_full) > 0:
        removal_percentage = (len(removed_df) / len(df_full)) * 100
        summary_content.append(f"Overall removal percentage: {removal_percentage:.2f}%")
    else:
        summary_content.append("Overall removal percentage: N/A (original dataset empty)")

    summary_content.append("\n-- Pruning Details --")
    if top_clusters_to_prune:
        summary_content.append(f"Clusters selected for pruning (top 3 largest): {top_clusters_to_prune}")
        for label in top_clusters_to_prune:
            original_size = cluster_sizes.get(label, 'N/A')
            removed_count = removed_counts.get(label, 0)
            remaining = original_size - removed_count if original_size != 'N/A' else 'N/A'
            percentage_removed = (removed_count / original_size * 100) if original_size != 'N/A' and original_size > 0 else 0
            summary_content.append(f"  Cluster {label}: Original Size={original_size}, Removed={removed_count} ({percentage_removed:.1f}%), Remaining={remaining}")
    else:
        summary_content.append("No clusters were large enough or identified for pruning.")

    summary_content.append("\n-- File Information --")
    def get_file_info(fpath):
        display_name = fpath.relative_to(job_dir.parent).as_posix() if fpath else "N/A"
        if fpath and fpath.exists():
            size_mb = fpath.stat().st_size / (1024*1024)
            if fpath.suffix == '.npy':
                try:
                     shape = np.load(fpath, mmap_mode='r').shape
                     return f"{display_name:<40} | Shape: {str(shape):<15} | Size: {size_mb:.2f} MB"
                except Exception as load_err: return f"{display_name:<40} | Shape: N/A (Load Error) | Size: {size_mb:.2f} MB ({load_err})"
            elif fpath.suffix == '.csv':
                 try:
                      # Read only index to count rows efficiently
                      count = len(pd.read_csv(fpath, usecols=[0]))
                      return f"{display_name:<40} | Rows: {count:<15} | Size: {size_mb:.2f} MB"
                 except Exception as read_err:
                     return f"{display_name:<40} | Rows: N/A (Read Error) | Size: {size_mb:.2f} MB ({read_err})"
            else:
                return f"{display_name:<40} |                     | Size: {size_mb:.2f} MB"
        return f"{display_name:<40} | --- File Not Found --- "

    summary_content.append(get_file_info(cleaned_file))
    summary_content.append(get_file_info(unbiased_csv_file))
    summary_content.append(get_file_info(removed_csv_file))
    summary_content.append(get_file_info(embeddings_file))
    summary_content.append(get_file_info(unbiased_384d_file))
    summary_content.append(get_file_info(removed_384d_file))
    summary_content.append(get_file_info(all_6d_file))
    summary_content.append(get_file_info(unbiased_6d_file))
    summary_content.append(get_file_info(removed_6d_file))

    try:
        with open(summary_path, "w") as f:
            f.write("\n".join(summary_content))
        print(f"Summary saved to {summary_path.name}")
    except Exception as e:
        print(f"Error saving summary file: {e}")

    print(f"--- Unbiasing Dataset Creation complete for job {job_dir.name} --- ")
    return df_unbiased, removed_df

if __name__ == "__main__":
    # This script is not meant to be run directly anymore.
    # It should be called by main.py which provides the job_dir.
    print("This script should be called via main.py, not run directly.")
    # Example for testing (requires creating dummy job dir and files):
    # test_job_dir = Path("uploads") / "testjob_unbias"
    # test_job_dir.mkdir(exist_ok=True, parents=True)
    # test_clusters_dir = test_job_dir / "clusters"
    # test_clusters_dir.mkdir(exist_ok=True)
    # test_output_dir = test_job_dir / "unbiased_dataset"
    # test_output_dir.mkdir(exist_ok=True)
    # # Create dummy cleaned data and embeddings
    # dummy_df = pd.DataFrame({'Resume_str': [f'resume {i}' for i in range(20)]}, index=pd.Index(range(20), name='original_index'))
    # dummy_df.to_csv(test_job_dir / "cleaned_resumes.csv", index=True)
    # np.save(test_job_dir / "resume_embeddings.npy", np.random.rand(20, 384)) # Match embedding dim
    # # Create dummy cluster files (cluster 1 largest)
    # dummy_df.iloc[0:10].to_csv(test_clusters_dir / "cluster_1.csv", index=True)
    # dummy_df.iloc[10:15].to_csv(test_clusters_dir / "cluster_2.csv", index=True)
    # dummy_df.iloc[15:20].to_csv(test_clusters_dir / "cluster_3.csv", index=True)
    # create_unbiased_dataset(job_dir=test_job_dir)