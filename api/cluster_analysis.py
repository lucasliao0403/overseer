import os
import pandas as pd
import cohere
from dotenv import load_dotenv
import json
from pathlib import Path
import numpy as np

# Load environment variables from .env file
load_dotenv()

# Get Cohere API key
CO_API_KEY = os.getenv("COHERE_API_KEY")
co = cohere.ClientV2(CO_API_KEY)

def analyze_cluster(cluster_df, cluster_num):
    """
    Analyze a cluster using Cohere LLM to identify patterns.
    
    Args:
        cluster_df: DataFrame containing the cluster data
        cluster_num: The number/identifier of the cluster
    
    Returns:
        The analysis results from Cohere
    """
    # Sample some resumes from the cluster (limit to 5 to avoid token limits)
    sample_size = min(5, len(cluster_df))
    sample_df = cluster_df.sample(sample_size)
    
    # Prepare the prompt with resume samples
    resume_samples = []
    
    for i, row in sample_df.iterrows():
        # Get the resume text and truncate if too long
        resume_text = str(row['Resume_str'])[:2000]  # Limit to 2000 chars
        
        sample = f"Resume #{i}:\n{resume_text}\n\n"
        resume_samples.append(sample)
    
    resume_text = "\n".join(resume_samples)
    
    # Craft the prompt
    prompt = f"""
    I have a cluster (Cluster #{cluster_num}) of resume data. Here are {sample_size} sample resumes from this cluster:
    
    {resume_text}
    
    Based on only these samples, please analyze and identify:
    1. Common skills, experiences, or qualifications in this cluster
    2. The likely job roles or industries these resumes target
    3. Educational backgrounds or patterns
    4. Any other notable patterns or similarities
    5. A suggested name/label for this cluster based on the common characteristics
    
    Format your response as a structured analysis with clear sections and bullet points.
    """
    
    # Make the API call to Cohere with error handling
    try:
        response = co.chat(
            model="command-a-03-2025",
            messages=[{"role": "user", "content": prompt}]
        )
        print(response)
        return response.message.content[0].text
    except Exception as e:
        error_message = f"Error calling Cohere API: {str(e)}"
        print(f"ERROR: {error_message}")
        
        # Log the error to a file
        with open("cohere_api_errors.log", "a") as error_log:
            import datetime
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            error_log.write(f"[{timestamp}] Cluster {cluster_num}: {error_message}\n")
            
        # Return error message as the analysis result
        return f"ANALYSIS FAILED: {error_message}\n\nPlease check cohere_api_errors.log for details."

def export_complete_dataset(cluster_files):
    """
    Export the original dataset with cluster information
    """
    print("Exporting complete dataset with cluster information...")
    
    # First, load all individual cluster files to get the mapping
    cluster_mapping = {}
    for cluster_file in cluster_files:
        cluster_num = int(cluster_file.stem.split("_")[1])
        cluster_df = pd.read_csv(cluster_file)
        
        # Get original indices if available or row numbers otherwise
        if 'Unnamed: 0' in cluster_df.columns:
            indices = cluster_df['Unnamed: 0'].tolist()
        else:
            # Create a synthetic index based on row position
            indices = cluster_df.index.tolist()
            
        # Map these indices to this cluster
        for idx in indices:
            cluster_mapping[idx] = cluster_num
    
    # Load the original dataset
    try:
        # Try cleaned file first (should exist from embeddings.py)
        if os.path.exists('cleaned_resumes.csv'):
            print("Loading cleaned_resumes.csv...")
            df = pd.read_csv('cleaned_resumes.csv')
        else:
            # Try original source
            print("Loading original dataset...")
            try:
                df = pd.read_csv("hf://datasets/sankar12345/Resume-Dataset/Resume.csv")
            except Exception:
                print("Trying local file...")
                df = pd.read_csv("Resume.csv")
    except Exception as e:
        print(f"Error loading dataset: {e}")
        return
    
    # Add cluster information
    df['cluster'] = -1  # Default to noise/unclustered
    
    # Map indices to clusters
    for i, row in df.iterrows():
        if i in cluster_mapping:
            df.at[i, 'cluster'] = cluster_mapping[i]
    
    # Create the clusters directory if it doesn't exist
    clusters_dir = Path("clusters")
    clusters_dir.mkdir(exist_ok=True)
    
    # Save the complete dataset with cluster information
    complete_file = clusters_dir / "all_clusters.csv"
    df.to_csv(complete_file, index=False)
    print(f"Saved complete dataset with cluster information to {complete_file}")
    
    # Print cluster distribution
    cluster_counts = df['cluster'].value_counts().sort_index()
    print("\nCluster distribution:")
    for cluster, count in cluster_counts.items():
        if cluster != -1:
            print(f"Cluster {cluster}: {count} entries")
    print(f"Noise/Unclustered: {cluster_counts.get(-1, 0)} entries")
    
    return df

def main():
    # Create directory for analysis results
    output_dir = Path("cluster_analysis")
    output_dir.mkdir(exist_ok=True)
    
    # Get clusters from the individual CSV files
    clusters_dir = Path("clusters")
    
    # Check if clusters directory exists
    if not clusters_dir.exists():
        print("Error: Clusters directory not found. Run embeddings.py first to generate clusters.")
        return
    
    # Get all cluster files
    cluster_files = list(clusters_dir.glob("cluster_*.csv"))
    
    if not cluster_files:
        print("No cluster files found in the clusters directory.")
        return
    
    print(f"Found {len(cluster_files)} cluster files.")
    
    # Export complete dataset with cluster information
    export_complete_dataset(cluster_files)
    
    # Analyze each cluster
    all_analyses = {}
    
    for cluster_file in cluster_files:
        cluster_num = cluster_file.stem.split("_")[1]
        print(f"Analyzing Cluster {cluster_num}...")
        
        # Load the cluster data
        cluster_df = pd.read_csv(cluster_file)
        print(f"  Cluster size: {len(cluster_df)} resumes")
        
        # Analyze the cluster
        analysis = analyze_cluster(cluster_df, cluster_num)
        
        # Save the analysis
        all_analyses[f"Cluster {cluster_num}"] = analysis
        
        # Save individual analysis to file
        with open(output_dir / f"cluster_{cluster_num}_analysis.txt", "w") as f:
            f.write(analysis)
        
        print(f"  Analysis complete for Cluster {cluster_num}")
        print(f"  Results saved to {output_dir}/cluster_{cluster_num}_analysis.txt")
        print("\n" + "="*80 + "\n")
        
        # Print a preview of the analysis
        print(f"ANALYSIS PREVIEW FOR CLUSTER {cluster_num}:")
        print(analysis[:500] + "...\n")
    
    # Save all analyses to a single JSON file
    with open(output_dir / "all_clusters_analysis.json", "w") as f:
        json.dump(all_analyses, f, indent=2)
    
    print(f"All analyses saved to {output_dir}/all_clusters_analysis.json")

if __name__ == "__main__":
    main() 