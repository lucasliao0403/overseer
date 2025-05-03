from flask import Flask, jsonify, request, send_file
import pandas as pd
import os
import json
import subprocess
from pathlib import Path
from flask_cors import CORS  # Import CORS
import uuid
import shutil
import numpy as np

app = Flask(__name__)
# IMPORTANT: Update this origin list for production deployment!
# Allow requests from common development origins and potentially your deployed frontend URL
CORS(app, resources={
    r"/api/*": {"origins": ["http://localhost:3000", "http://127.0.0.1:3000"]}
})

# Create uploads directory if it doesn't exist
UPLOAD_FOLDER = Path("uploads")
UPLOAD_FOLDER.mkdir(exist_ok=True)

def get_job_dir(job_id):
    """Helper function to get the job directory path."""
    return UPLOAD_FOLDER / str(job_id) # Ensure job_id is treated as string for path

# Helper to check if job exists
def check_job_exists(job_id):
    job_dir = get_job_dir(job_id)
    if not job_dir.exists() or not job_dir.is_dir():
        return False, jsonify({"error": "Job not found"}), 404
    return True, None, None

@app.route('/')
def index():
    return "Bias Unbiasing API"

@app.route('/api/health', methods=['GET'])
def health_check():
    """Basic health check endpoint"""
    return jsonify({"status": "healthy", "message": "API is running"})

@app.route('/api/jobs/<job_id>/datasets/available', methods=['GET'])
def available_datasets(job_id):
    """Return information about which datasets are available for a specific job"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    clusters_dir = job_dir / "clusters"
    unbiased_dir = job_dir / "unbiased_dataset"
    analysis_dir = job_dir / "cluster_analysis"

    available = {
        "cleaned_resumes": (job_dir / "cleaned_resumes.csv").exists(),
        "unbiased_resumes": (unbiased_dir / "unbiased_resumes.csv").exists(),
        "removed_entries": (unbiased_dir / "removed_entries.csv").exists(),
        "all_clusters": (clusters_dir / "all_clusters.csv").exists(),
        "cluster_analysis": analysis_dir.exists(),
        "unbiased_embeddings_6d": (unbiased_dir / "unbiased_embeddings_6d.npy").exists(),
        "removed_embeddings_6d": (unbiased_dir / "removed_embeddings_6d.npy").exists(),
        "summary": (unbiased_dir / "unbiasing_summary.txt").exists(),
    }

    # Check for individual cluster files
    available["individual_clusters"] = []
    if clusters_dir.exists():
        cluster_files = list(clusters_dir.glob("cluster_*.csv"))
        available["individual_clusters"] = [f.name for f in cluster_files]

    return jsonify(available)

@app.route('/api/jobs/<job_id>/cleaned_resumes', methods=['GET'])
def get_cleaned_resumes(job_id):
    """Return the cleaned resumes dataset for a specific job with pagination"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    file_path = job_dir / "cleaned_resumes.csv"
    if not file_path.exists():
        return jsonify({"error": "Cleaned resumes dataset not found for this job"}), 404

    return get_paginated_dataset(file_path, "cleaned_resumes")

@app.route('/api/jobs/<job_id>/unbiased_resumes', methods=['GET'])
def get_unbiased_resumes(job_id):
    """Return the unbiased resumes dataset for a specific job with pagination"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    file_path = job_dir / "unbiased_dataset" / "unbiased_resumes.csv"
    if not file_path.exists():
        return jsonify({"error": "Unbiased resumes dataset not found for this job"}), 404

    return get_paginated_dataset(file_path, "unbiased_resumes")

@app.route('/api/jobs/<job_id>/removed_entries', methods=['GET'])
def get_removed_entries(job_id):
    """Return the removed entries dataset for a specific job with pagination"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    file_path = job_dir / "unbiased_dataset" / "removed_entries.csv"
    if not file_path.exists():
        return jsonify({"error": "Removed entries dataset not found for this job"}), 404

    return get_paginated_dataset(file_path, "removed_entries")

@app.route('/api/jobs/<job_id>/all_clusters', methods=['GET'])
def get_all_clusters(job_id):
    """Return the all clusters dataset for a specific job with pagination"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    file_path = job_dir / "clusters" / "all_clusters.csv"
    if not file_path.exists():
        return jsonify({"error": "All clusters dataset not found for this job"}), 404

    return get_paginated_dataset(file_path, "all_clusters")

@app.route('/api/jobs/<job_id>/unbiased_embeddings_data', methods=['GET'])
def get_unbiased_embeddings_data(job_id):
    """Return the unbiased embeddings as JSON for a specific job"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    file_path = job_dir / "unbiased_dataset" / "unbiased_embeddings_6d.npy"
    if not file_path.exists():
        return jsonify({"error": "Unbiased 6D embeddings not found for this job"}), 404

    try:
        embeddings = np.load(file_path)
        embeddings_list = embeddings.tolist()
        return jsonify({
            "success": True,
            "job_id": job_id,
            "embeddings": embeddings_list,
            "shape": embeddings.shape,
            "dimensions": embeddings.shape[1] if len(embeddings.shape) > 1 else 0,
            "count": embeddings.shape[0]
        })
    except Exception as e:
        return jsonify({"error": f"Error processing embeddings: {str(e)}"}), 500

@app.route('/api/jobs/<job_id>/removed_embeddings_data', methods=['GET'])
def get_removed_embeddings_data(job_id):
    """Return the removed embeddings as JSON for a specific job"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    file_path = job_dir / "unbiased_dataset" / "removed_embeddings_6d.npy"
    if not file_path.exists():
        return jsonify({"error": "Removed 6D embeddings not found for this job"}), 404

    try:
        embeddings = np.load(file_path)
        embeddings_list = embeddings.tolist()
        return jsonify({
            "success": True,
            "job_id": job_id,
            "embeddings": embeddings_list,
            "shape": embeddings.shape,
            "dimensions": embeddings.shape[1] if len(embeddings.shape) > 1 else 0,
            "count": embeddings.shape[0]
        })
    except Exception as e:
        return jsonify({"error": f"Error processing embeddings: {str(e)}"}), 500

def get_paginated_dataset(file_path, dataset_name):
    """Helper function to return a paginated dataset"""
    page = request.args.get('page', default=1, type=int)
    page_size = request.args.get('page_size', default=100, type=int)
    page_size = min(page_size, 1000)

    try:
        df = pd.read_csv(file_path)
        total_records = len(df)
        total_pages = (total_records + page_size - 1) // page_size

        if page < 1:
            page = 1
        if page > total_pages and total_pages > 0:
            page = total_pages

        start_idx = (page - 1) * page_size
        end_idx = min(start_idx + page_size, total_records)
        records = df.iloc[start_idx:end_idx].to_dict('records')

        return jsonify({
            "dataset": dataset_name,
            "total_records": total_records,
            "total_pages": total_pages,
            "current_page": page,
            "page_size": page_size,
            "records": records
        })

    except Exception as e:
        return jsonify({"error": f"Error reading dataset: {str(e)}"}), 500

@app.route('/api/jobs/<job_id>/clusters', methods=['GET'])
def get_clusters(job_id):
    """Return embeddings for all clusters for a specific job"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    clusters_dir = job_dir / "clusters"

    if not clusters_dir.exists():
        return jsonify({"error": f"Clusters directory not found for job {job_id}"}), 404

    # Use the 6D npy files
    embedding_files = list(clusters_dir.glob("cluster_*_embeddings_6d.npy"))

    if not embedding_files:
        return jsonify({"error": f"No cluster embedding files found in {clusters_dir}"}), 404

    try:
        all_clusters = {}
        for embedding_file in embedding_files:
            file_name = embedding_file.stem
            try:
                # Robust parsing: cluster_1_embeddings_6d -> 1
                cluster_id_str = file_name.split('_')[1]
                cluster_id = int(cluster_id_str)
            except (IndexError, ValueError):
                print(f"Warning: Could not parse cluster ID from filename {embedding_file.name}")
                continue

            try:
                embeddings = np.load(embedding_file)
                embeddings_list = embeddings.tolist()
                all_clusters[f"cluster_{cluster_id}"] = {
                    "count": len(embeddings),
                    "dimensions": embeddings.shape[1] if len(embeddings.shape) > 1 else 0,
                    "embeddings": embeddings_list
                }
            except Exception as e:
                print(f"Error loading embeddings for cluster {cluster_id} from {embedding_file}: {str(e)}")
                continue

        if not all_clusters:
            return jsonify({"error": "Failed to load any cluster embeddings"}), 500

        return jsonify({
            "job_id": job_id,
            "total_clusters": len(all_clusters),
            "clusters": all_clusters
        })

    except Exception as e:
        return jsonify({"error": f"Error reading cluster embeddings: {str(e)}"}), 500

@app.route('/api/jobs/<job_id>/clusters/<cluster_id>', methods=['GET'])
def get_cluster(job_id, cluster_id):
    """Return a specific cluster by ID for a specific job"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    try:
        cluster_num = int(cluster_id)
        file_path = job_dir / "clusters" / f"cluster_{cluster_num}.csv"

        if not file_path.exists():
            return jsonify({"error": f"Cluster {cluster_num} CSV not found for job {job_id}"}), 404

        return get_paginated_dataset(file_path, f"cluster_{cluster_num}")

    except ValueError:
        return jsonify({"error": "Cluster ID must be a number"}), 400
    except Exception as e:
        return jsonify({"error": f"Error reading cluster: {str(e)}"}), 500

@app.route('/api/jobs/<job_id>/analysis/clusters', methods=['GET'])
def get_all_cluster_analyses(job_id):
    """Return analysis results for all clusters for a specific job"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    analysis_dir = job_dir / "cluster_analysis"
    if not analysis_dir.exists():
        return jsonify({"error": f"Analysis directory not found for job {job_id}"}), 404

    results = {}
    # Try reading the summary JSON first
    summary_json_path = analysis_dir / "all_clusters_analysis.json"
    if summary_json_path.exists():
        try:
            with open(summary_json_path, 'r') as f:
                results = json.load(f)
            return jsonify(results)
        except Exception as e:
            print(f"Error reading summary JSON {summary_json_path}: {e}")
            # Fallback to reading individual files if JSON fails

    # Fallback: Read individual analysis files if summary JSON doesn't exist or fails
    analysis_files = list(analysis_dir.glob("cluster_*_analysis.txt"))
    if not analysis_files:
        return jsonify({"error": "No analysis files found"}), 404

    for file_path in analysis_files:
        try:
            # Extract cluster number (e.g., cluster_1_analysis.txt -> 1)
            cluster_num = int(file_path.stem.split('_')[1])
            with open(file_path, 'r') as f:
                results[f"cluster_{cluster_num}"] = f.read()
        except (ValueError, IndexError, IOError) as e:
            print(f"Error reading or parsing analysis file {file_path}: {e}")
            continue # Skip problematic files

    if not results:
         return jsonify({"error": "Could not read any analysis files"}), 500

    return jsonify(results)

@app.route('/api/jobs/<job_id>/analysis/clusters/<cluster_id>', methods=['GET'])
def get_cluster_analysis(job_id, cluster_id):
    """Return analysis result for a specific cluster for a specific job"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    try:
        cluster_num = int(cluster_id)
        file_path = job_dir / "cluster_analysis" / f"cluster_{cluster_num}_analysis.txt"

        if not file_path.exists():
            return jsonify({"error": f"Analysis for cluster {cluster_num} not found for job {job_id}"}), 404

        with open(file_path, 'r') as f:
            content = f.read()
        return jsonify({f"cluster_{cluster_num}": content})

    except ValueError:
        return jsonify({"error": "Cluster ID must be a number"}), 400
    except Exception as e:
        return jsonify({"error": f"Error reading analysis file: {str(e)}"}), 500

@app.route('/api/jobs/<job_id>/summary', methods=['GET'])
def get_unbiasing_summary(job_id):
    """Return the unbiasing summary text for a specific job"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    file_path = job_dir / "unbiased_dataset" / "unbiasing_summary.txt"
    if not file_path.exists():
        return jsonify({"error": f"Summary file not found for job {job_id}"}), 404

    try:
        with open(file_path, 'r') as f:
            summary_content = f.read()
        return jsonify({"summary": summary_content})
    except Exception as e:
        return jsonify({"error": f"Error reading summary file: {str(e)}"}), 500

@app.route('/api/jobs/<job_id>/download/<file_type>', methods=['GET'])
def download_file(job_id, file_type):
    """Allow downloading specific result files for a job"""
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    base_path_map = {
        "cleaned_resumes": job_dir / "cleaned_resumes.csv",
        "unbiased_resumes": job_dir / "unbiased_dataset" / "unbiased_resumes.csv",
        "removed_entries": job_dir / "unbiased_dataset" / "removed_entries.csv",
        "all_clusters": job_dir / "clusters" / "all_clusters.csv",
        "summary": job_dir / "unbiased_dataset" / "unbiasing_summary.txt",
        "unbiased_embeddings_6d": job_dir / "unbiased_dataset" / "unbiased_embeddings_6d.npy",
        "removed_embeddings_6d": job_dir / "unbiased_dataset" / "removed_embeddings_6d.npy",
    }

    if file_type in base_path_map:
        file_path = base_path_map[file_type]
    # Handle individual cluster CSVs
    elif file_type.startswith("cluster_") and file_type.endswith(".csv"):
         file_path = job_dir / "clusters" / file_type
    # Handle individual cluster analysis text files
    elif file_type.startswith("cluster_") and file_type.endswith("_analysis.txt"):
        file_path = job_dir / "cluster_analysis" / file_type
    else:
        return jsonify({"error": "Invalid file type specified"}), 400

    if not file_path.exists():
        return jsonify({"error": f"File '{file_path.name}' not found for job {job_id}"}), 404

    try:
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        return jsonify({"error": f"Error sending file: {str(e)}"}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """
    Upload a CSV file to use as the dataset for the analysis pipeline
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    if not file.filename.endswith('.csv'):
        return jsonify({"error": "Only CSV files are supported"}), 400

    # Get cluster count from request (default to 6 if not provided)
    cluster_count = request.form.get('cluster_count', '6')
    try:
        cluster_count = int(cluster_count)
        # Ensure cluster count is within valid range
        cluster_count = max(1, min(10, cluster_count))
    except ValueError:
        cluster_count = 6  # Default if invalid value

    # Create a unique ID for this upload
    upload_id = str(uuid.uuid4())
    job_dir = get_job_dir(upload_id) # Use helper
    job_dir.mkdir(exist_ok=True, parents=True) # Ensure parents=True

    # Save the uploaded file
    file_path = job_dir / "Resume.csv" # Standard input name within job dir
    file.save(file_path)

    try:
        # Validate the CSV file (basic check)
        df = pd.read_csv(file_path, nrows=5) # Read only a few rows for validation
        if 'Resume_str' not in df.columns:
            shutil.rmtree(job_dir, ignore_errors=True) # Clean up invalid upload
            return jsonify({
                "error": "Invalid CSV format. The file must contain a 'Resume_str' column."
            }), 400

        # Get full row count without loading whole file if large
        # This part can be optimized further if needed for very large files
        full_df = pd.read_csv(file_path)
        rows_count = len(full_df)
        del full_df # Free memory

        print(f"Starting job {upload_id} for file {file_path} with {cluster_count} clusters.")

        # Run the pipeline asynchronously with the cluster count parameter
        # Ensure paths are correctly passed as strings
        process = subprocess.Popen(
            ["python", "./main.py", "--input", str(file_path), "--job_id", upload_id,
             "--cluster_count", str(cluster_count)],
            cwd=os.path.dirname(os.path.abspath(__file__)), # Run from api dir
            stdout=open(job_dir / "pipeline.log", "w"),
            stderr=subprocess.STDOUT
        )
        print(f"Started subprocess for job {upload_id} with PID {process.pid}")

        return jsonify({
            "message": "File uploaded successfully. Processing started.",
            "job_id": upload_id,
            "rows_count": rows_count,
            "status": "processing",
            "cluster_count": cluster_count
        })

    except Exception as e:
        print(f"Error during upload processing for job {upload_id}: {str(e)}")
        # Clean up on error
        shutil.rmtree(job_dir, ignore_errors=True)
        return jsonify({"error": f"Error processing file: {str(e)}"}), 500

@app.route('/api/jobs/<job_id>/status', methods=['GET'])
def get_job_status(job_id):
    """Check the status of a processing job"""
    # Use check_job_exists for validation
    exists, error_response, status_code = check_job_exists(job_id)
    if not exists:
        return error_response, status_code

    job_dir = get_job_dir(job_id)
    completed = (job_dir / "completed").exists()
    failed = (job_dir / "failed").exists()
    log_path = job_dir / "pipeline.log"
    log_content = ""

    if log_path.exists():
        try:
            with open(log_path, "r") as f:
                log_content = f.read()
        except Exception as e:
            log_content = f"Error reading log file: {e}"

    status = "processing"
    if completed:
        status = "completed"
    elif failed:
        status = "failed"

    return jsonify({
        "job_id": job_id,
        "status": status,
        "log": log_content
    })

if __name__ == '__main__':
    # Run the Flask app
    # Use Gunicorn or another WSGI server in production instead of app.run()
    port = int(os.environ.get("PORT", 3002)) # Use PORT env var if available
    app.run(debug=False, host='0.0.0.0', port=port) # Disable debug for safety 