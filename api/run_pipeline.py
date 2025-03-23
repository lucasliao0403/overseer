import os
import subprocess
import argparse
from pathlib import Path
import sys

def run_pipeline(skip_pca=False, skip_cluster=False, skip_unbiased=False):
    """
    Run the complete pipeline:
    1. Apply PCA to compress vectors into 6D
    2. Run cluster analysis 
    3. Create unbiased dataset with cluster removal
    """
    print("Starting the complete pipeline...")
    
    # Get the current directory
    current_dir = Path(__file__).parent.absolute()
    
    # Ensure we're using the correct Python interpreter
    python_executable = sys.executable
    
    # Step 1: Run PCA on all embedding files
    if not skip_pca:
        print("\n=== STEP 1: Running PCA on all embedding files ===")
        result = subprocess.run(
            [python_executable, str(current_dir / "PCA.py"), "--process_all"], 
            check=False,
            capture_output=True,
            text=True
        )
        print(result.stdout)
        if result.returncode != 0:
            print(f"Error running PCA: {result.stderr}")
            raise Exception(f"PCA processing failed: {result.stderr}")
    
    # Step 2: Run cluster analysis
    if not skip_cluster:
        print("\n=== STEP 2: Running cluster analysis ===")
        result = subprocess.run(
            [python_executable, str(current_dir / "cluster_analysis.py")], 
            check=False,
            capture_output=True,
            text=True
        )
        print(result.stdout)
        if result.returncode != 0:
            print(f"Error running cluster analysis: {result.stderr}")
            raise Exception(f"Cluster analysis failed: {result.stderr}")
    
    # Step 3: Create unbiased dataset with cluster removal
    if not skip_unbiased:
        print("\n=== STEP 3: Creating unbiased dataset ===")
        result = subprocess.run(
            [python_executable, str(current_dir / "create_unbiased_dataset.py")],
            check=False,
            capture_output=True,
            text=True
        )
        print(result.stdout)
        if result.returncode != 0:
            print(f"Error creating unbiased dataset: {result.stderr}")
            raise Exception(f"Unbiased dataset creation failed: {result.stderr}")
    
    print("\nPipeline complete! All processes finished successfully.")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Run the complete data processing pipeline')
    parser.add_argument('--skip_pca', action='store_true', help='Skip the PCA step')
    parser.add_argument('--skip_cluster', action='store_true', help='Skip the cluster analysis step')
    parser.add_argument('--skip_unbiased', action='store_true', help='Skip the unbiased dataset creation step')
    args = parser.parse_args()
    
    run_pipeline(
        skip_pca=args.skip_pca,
        skip_cluster=args.skip_cluster,
        skip_unbiased=args.skip_unbiased
    ) 