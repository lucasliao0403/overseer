import os
import logging
import pandas as pd
from pathlib import Path
import time
import sys
import argparse
import shutil
import numpy as np

# Import functions from our other files
from embeddings import main as embeddings_main
from cluster_analysis import main as cluster_analysis_main
from create_unbiased_dataset import create_unbiased_dataset

# Setup argument parser
def parse_args():
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(description='Process resume data for a specific job')
    # Input file is now expected to be within the job directory
    parser.add_argument('--input', type=str, required=True, help='Path to input CSV file (within job directory)')
    parser.add_argument('--job_id', type=str, required=True, help='Job ID for this processing run')
    parser.add_argument('--cluster_count', type=int, default=6, help='Number of clusters to create (1-10)')
    
    return parser.parse_args()

# Setup logging for a specific job
def setup_logging(job_id):
    job_dir = Path("uploads") / job_id
    log_dir = job_dir / "logs" # Log within the job directory
    log_dir.mkdir(exist_ok=True, parents=True)
    
    # Use job_id for the log filename
    log_file = log_dir / "pipeline_detailed.log"
    
    # Remove previous handlers if any (useful for reruns or testing)
    # Get the root logger
    root_logger = logging.getLogger()
    # Remove all existing handlers from the root logger
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Configure logging with a standard format that doesn't require job_id
    logging.basicConfig(
        level=logging.INFO,
        # Standard format: Timestamp - Level - Logger Name - Message
        format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout) # Also log to stdout where Flask captures it
        ]
    )
    
    # Get a logger instance for this module (main)
    logger = logging.getLogger(__name__) # Use module-specific logger
    
    # Log the initial message including the job_id
    logger.info(f"[JOB:{job_id}] Logging setup complete. Detailed logs will be saved to {log_file}")
    return logger, log_file # Return the logger instance, not an adapter

def count_files_in_dir(directory):
    """Count files in a directory and report their sizes"""
    directory = Path(directory) # Ensure it's a Path object
    if not directory.exists() or not directory.is_dir():
        return "Directory does not exist or is not a directory"
    
    result = []
    total_size_mb = 0
    file_count = 0
    
    for item in directory.iterdir():
        if item.is_file():
            try:
                size_bytes = item.stat().st_size
                size_mb = size_bytes / (1024 * 1024)
                total_size_mb += size_mb
                result.append(f"  - {item.name} ({size_mb:.2f} MB)")
                file_count += 1
            except OSError as e:
                result.append(f"  - {item.name} (Error reading size: {e})")
    
    return f"{file_count} files, total size: {total_size_mb:.2f} MB\n" + "\n".join(result)

def report_file_info(file_path):
    """Report information about a file"""
    file_path = Path(file_path) # Ensure it's a Path object
    if not file_path.exists() or not file_path.is_file():
        return f"File does not exist or is not a file: {file_path}"
    
    try:
        size_bytes = file_path.stat().st_size
        size_mb = size_bytes / (1024 * 1024)
    except OSError as e:
        return f"{file_path.name}: (Error reading size: {e})"
    
    if file_path.suffix == '.csv':
        try:
            # Reading just the header or a few rows might be faster for large files
            df_peek = pd.read_csv(file_path, nrows=0) # Read only header
            num_cols = len(df_peek.columns)
            # Count rows more efficiently for large files if needed
            # For simplicity now, we read the whole file to count rows
            df = pd.read_csv(file_path, low_memory=False)
            num_rows = len(df)
            del df # Free memory
            return f"{file_path.name}: {num_rows} rows, {num_cols} columns, {size_mb:.2f} MB"
        except Exception as e:
            return f"{file_path.name}: {size_mb:.2f} MB (Error reading CSV: {e})"
    elif file_path.suffix == '.npy':
        try:
            arr = np.load(file_path, mmap_mode='r') # Use memory mapping for large arrays
            shape_str = " x ".join(map(str, arr.shape))
            return f"{file_path.name}: NumPy array, shape ({shape_str}), {size_mb:.2f} MB"
        except Exception as e:
             return f"{file_path.name}: {size_mb:.2f} MB (Error reading NPY: {e})"
    else:
        return f"{file_path.name}: {size_mb:.2f} MB"

def main():
    """Main function to execute the entire unbiasing pipeline for a specific job"""
    args = parse_args()
    job_id = args.job_id
    input_file = Path(args.input) # Ensure input_file is a Path object
    job_dir = Path("uploads") / job_id # Define job directory path
    
    # Setup job-specific logging - get the logger instance
    logger, log_file = setup_logging(job_id)
    
    # Ensure cluster count is within valid range
    cluster_count = max(1, min(10, args.cluster_count))
    # Include job_id in log messages from this point on
    logger.info(f"[JOB:{job_id}] Starting pipeline with {cluster_count} clusters.")
    logger.info(f"[JOB:{job_id}] Input file: {input_file}")
    logger.info(f"[JOB:{job_id}] Job directory: {job_dir}")
    
    # Define output subdirectories within the job directory
    clusters_dir = job_dir / "clusters"
    analysis_dir = job_dir / "cluster_analysis"
    unbiased_dir = job_dir / "unbiased_dataset"
    
    # Ensure job directory and subdirectories exist (create if necessary)
    job_dir.mkdir(exist_ok=True)
    clusters_dir.mkdir(exist_ok=True)
    analysis_dir.mkdir(exist_ok=True)
    unbiased_dir.mkdir(exist_ok=True)
    
    # Define key output file paths relative to job_dir
    cleaned_csv_path = job_dir / "cleaned_resumes.csv"
    embeddings_npy_path = job_dir / "resume_embeddings.npy"
    summary_txt_path = unbiased_dir / "unbiasing_summary.txt"
    
    completion_marker = job_dir / "completed"
    failure_marker = job_dir / "failed"
    
    # Clean up previous markers if they exist
    if completion_marker.exists(): completion_marker.unlink()
    if failure_marker.exists(): failure_marker.unlink()
    
    try:
        # Step 1: Generate embeddings and find clusters
        logger.info(f"[JOB:{job_id}] {'=' * 80}")
        logger.info(f"[JOB:{job_id}] STEP 1: GENERATING EMBEDDINGS AND FINDING CLUSTERS")
        logger.info(f"[JOB:{job_id}] {'=' * 80}")
        
        # Pass job_dir to embeddings_main
        df, embeddings = embeddings_main(job_dir=job_dir, input_file=input_file, n_clusters=cluster_count)
        
        if df is None or embeddings is None:
            logger.error(f"[JOB:{job_id}] Failed to generate embeddings. Exiting.")
            failure_marker.touch()
            return
        
        logger.info(f"[JOB:{job_id}] Embeddings shape: {embeddings.shape}")
        logger.info(f"[JOB:{job_id}] Generated {report_file_info(cleaned_csv_path)}")
        logger.info(f"[JOB:{job_id}] Generated {report_file_info(embeddings_npy_path)}")
        
        # Report on clusters directory contents
        if clusters_dir.exists():
            logger.info(f"[JOB:{job_id}] Clusters directory contents:\n{count_files_in_dir(clusters_dir)}")
        else:
             logger.warning(f"[JOB:{job_id}] Clusters directory not created: {clusters_dir}")
        
        # Step 2: Analyze clusters using Cohere
        logger.info(f"[JOB:{job_id}] \n{'=' * 80}")
        logger.info(f"[JOB:{job_id}] STEP 2: ANALYZING CLUSTERS USING COHERE")
        logger.info(f"[JOB:{job_id}] {'=' * 80}")
        
        # Pass job_dir to cluster_analysis_main
        cluster_analysis_main(job_dir=job_dir)
        
        # Report on analysis results directory contents
        if analysis_dir.exists():
            logger.info(f"[JOB:{job_id}] Cluster analysis directory contents:\n{count_files_in_dir(analysis_dir)}")
        else:
            logger.warning(f"[JOB:{job_id}] Cluster analysis directory not created: {analysis_dir}")
        
        # Step 3: Create unbiased dataset
        logger.info(f"[JOB:{job_id}] \n{'=' * 80}")
        logger.info(f"[JOB:{job_id}] STEP 3: CREATING UNBIASED DATASET")
        logger.info(f"[JOB:{job_id}] {'=' * 80}")
        
        # Pass job_dir to create_unbiased_dataset
        unbiased_df, removed_df = create_unbiased_dataset(job_dir=job_dir)
        
        # Report on unbiased dataset directory contents
        if unbiased_dir.exists():
            logger.info(f"[JOB:{job_id}] Unbiased dataset directory contents:\n{count_files_in_dir(unbiased_dir)}")
        else:
             logger.warning(f"[JOB:{job_id}] Unbiased dataset directory not created: {unbiased_dir}")
        
        # Final summary
        logger.info(f"[JOB:{job_id}] \n{'=' * 80}")
        logger.info(f"[JOB:{job_id}] PIPELINE COMPLETE - SUMMARY")
        logger.info(f"[JOB:{job_id}] {'=' * 80}")
        
        logger.info(f"[JOB:{job_id}] Original dataset processed: {report_file_info(cleaned_csv_path)}")
        logger.info(f"[JOB:{job_id}] Unbiased dataset created: {report_file_info(unbiased_dir / 'unbiased_resumes.csv')}")
        logger.info(f"[JOB:{job_id}] Removed entries file: {report_file_info(unbiased_dir / 'removed_entries.csv')}")
        
        if summary_txt_path.exists():
            try:
                with open(summary_txt_path, 'r') as f:
                    summary = f.read()
                    logger.info(f"[JOB:{job_id}] Unbiasing summary:\n{summary}")
            except Exception as e:
                logger.error(f"[JOB:{job_id}] Could not read summary file {summary_txt_path}: {e}")
        else:
            logger.warning(f"[JOB:{job_id}] Summary file not found: {summary_txt_path}")
        
        logger.info(f"[JOB:{job_id}] Unbiasing pipeline completed successfully!")
        completion_marker.touch()
        
    except Exception as e:
        # Log the unhandled error including the job_id
        logger.error(f"[JOB:{job_id}] Unhandled error in pipeline: {str(e)}", exc_info=True)
        failure_marker.touch()
    
    # Log the final message including the job_id
    logger.info(f"[JOB:{job_id}] Pipeline finished. Detailed log available at: {log_file}")

if __name__ == "__main__":
    # Note: This script is intended to be called by flask_app.py
    # It assumes the environment (like CWD, Python path) is set correctly by the caller.
    main() 