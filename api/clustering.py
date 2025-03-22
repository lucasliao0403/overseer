import numpy as np
import pandas as pd
import hdbscan
from sklearn.neighbors import NearestNeighbors
import matplotlib.pyplot as plt
from sklearn.decomposition import PCA
from collections import Counter
import pickle

def cluster_embeddings(embeddings, min_cluster_size=5, min_samples=None, n_densest_clusters=3, 
                        plot_results=True, use_cosine=True, random_state=42, save_plots=True):
    """
    Cluster resume embeddings using HDBSCAN and return the n densest clusters.
    
    Parameters:
    -----------
    embeddings : numpy.ndarray
        Array of embeddings (n_samples, n_dimensions)
    min_cluster_size : int, default=5
        The minimum size of clusters
    min_samples : int, default=None
        The number of samples in a neighborhood for a point to be considered a core point
    n_densest_clusters : int, default=3
        Number of densest clusters to return
    plot_results : bool, default=True
        Whether to create and show visualization plots
    use_cosine : bool, default=True
        Whether to use cosine distance (True) or Euclidean distance (False)
    random_state : int, default=42
        Random state for reproducibility
    save_plots : bool, default=True
        Whether to save plots instead of displaying them
        
    Returns:
    --------
    dict
        Dictionary containing information about the densest clusters
    """
    # Default min_samples to same as min_cluster_size if not specified
    if min_samples is None:
        min_samples = min_cluster_size
    
    print(f"Clustering {embeddings.shape[0]} embeddings of dimension {embeddings.shape[1]}")
    
    # Convert embeddings to float64 to avoid dtype issues
    embeddings = np.array(embeddings, dtype=np.float64)
    
    # Apply HDBSCAN clustering
    if use_cosine:
        from sklearn.metrics.pairwise import cosine_distances
        distance_matrix = cosine_distances(embeddings)
        # Ensure distance matrix is float64
        distance_matrix = np.array(distance_matrix, dtype=np.float64)
        
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric='precomputed',
            cluster_selection_epsilon=0.1,
            cluster_selection_method='eom',
            prediction_data=True
        )
        cluster_labels = clusterer.fit_predict(distance_matrix)
    else:
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            metric='euclidean',
            cluster_selection_epsilon=0.1,
            cluster_selection_method='eom',
            prediction_data=True
        )
        cluster_labels = clusterer.fit_predict(embeddings)
    
    # Get number of unique clusters (excluding noise points labeled as -1)
    unique_clusters = np.unique(cluster_labels)
    unique_clusters = unique_clusters[unique_clusters != -1]
    num_clusters = len(unique_clusters)
    
    print(f"Found {num_clusters} clusters (excluding noise)")
    
    if num_clusters == 0:
        print("No clusters found. Try adjusting parameters (lower min_cluster_size or min_samples).")
        return {
            'densest_cluster_indices': [],
            'densest_cluster_labels': [],
            'densest_cluster_densities': [],
            'clusterer': clusterer,
            'all_labels': cluster_labels
        }
    
    # Calculate density for each cluster
    cluster_densities = {}
    cluster_indices = {}
    
    for label in unique_clusters:
        # Get points in this cluster
        cluster_points = embeddings[cluster_labels == label]
        cluster_point_indices = np.where(cluster_labels == label)[0]
        
        # Calculate average distance to k nearest neighbors as a proxy for density
        k = min(5, len(cluster_points) - 1)  # Use 5 neighbors or all if fewer points
        if k > 0:
            # Use the same metric as the clustering
            nbrs = NearestNeighbors(
                n_neighbors=k+1, 
                metric='cosine' if use_cosine else 'euclidean'
            ).fit(cluster_points)
            distances, _ = nbrs.kneighbors(cluster_points)
            # Exclude self-distance (first column)
            avg_dist = np.mean(distances[:, 1:])
            # Higher density = lower average distance
            density = 1.0 / (avg_dist + 1e-6)  # Add small value to avoid division by zero
        else:
            density = 0
        
        cluster_densities[label] = density
        cluster_indices[label] = cluster_point_indices.tolist()
    
    # Sort clusters by density (descending)
    sorted_clusters = sorted(cluster_densities.items(), key=lambda x: x[1], reverse=True)
    
    # Select the n densest clusters
    n_densest = min(n_densest_clusters, len(sorted_clusters))
    densest_cluster_labels = [label for label, _ in sorted_clusters[:n_densest]]
    densest_cluster_densities = [density for _, density in sorted_clusters[:n_densest]]
    densest_cluster_indices = [cluster_indices[label] for label in densest_cluster_labels]
    
    # Print information about the densest clusters
    for i, (label, density) in enumerate(zip(densest_cluster_labels, densest_cluster_densities)):
        print(f"Cluster {label}: {len(cluster_indices[label])} points, density: {density:.4f}")
    
    # Calculate percentage of data assigned to clusters vs. marked as noise
    noise_count = np.sum(cluster_labels == -1)
    total_count = len(cluster_labels)
    noise_percentage = (noise_count / total_count) * 100
    print(f"Noise points: {noise_count} ({noise_percentage:.2f}% of data)")
    
    # Plot results if requested
    if plot_results:
        plot_clusters(embeddings, cluster_labels, densest_cluster_labels)
    
    return {
        'densest_cluster_indices': densest_cluster_indices,
        'densest_cluster_labels': densest_cluster_labels,
        'densest_cluster_densities': densest_cluster_densities,
        'clusterer': clusterer,
        'all_labels': cluster_labels
    }

def plot_clusters(embeddings, cluster_labels, highlight_clusters=None):
    """Create visualizations of the clustering results using PCA for dimensionality reduction"""
    # Use PCA to reduce to 2D for visualization
    pca = PCA(n_components=2)
    embeddings_2d = pca.fit_transform(embeddings)
    
    # Plot all clusters
    plt.figure(figsize=(12, 10))
    
    # Plot noise points in grey
    noise_mask = (cluster_labels == -1)
    plt.scatter(
        embeddings_2d[noise_mask, 0],
        embeddings_2d[noise_mask, 1],
        c='lightgrey',
        marker='.',
        alpha=0.5,
        label='Noise'
    )
    
    # Plot clustered points with different colors
    unique_labels = np.unique(cluster_labels)
    unique_clusters = [l for l in unique_labels if l != -1]
    colors = plt.cm.rainbow(np.linspace(0, 1, len(unique_clusters)))
    
    for i, label in enumerate(unique_clusters):
        mask = (cluster_labels == label)
        is_highlighted = highlight_clusters is not None and label in highlight_clusters
        
        plt.scatter(
            embeddings_2d[mask, 0],
            embeddings_2d[mask, 1],
            c=[colors[i]],
            marker='o' if is_highlighted else '.',
            s=50 if is_highlighted else 30,
            alpha=1.0 if is_highlighted else 0.7,
            label=f'Cluster {label}' + (' (dense)' if is_highlighted else '')
        )
    
    plt.title("Resume Embeddings Clusters (PCA 2D projection)")
    plt.legend(loc='upper right')
    plt.tight_layout()
    
    # Save the plot instead of showing it
    plt.savefig('cluster_visualization.png')
    print("Saved cluster visualization to cluster_visualization.png")
    plt.close()
    
    # If there are clusters, show cluster sizes distribution
    if len(unique_clusters) > 1:
        plt.figure(figsize=(12, 6))
        cluster_counts = Counter(cluster_labels)
        cluster_sizes = [count for label, count in cluster_counts.items() if label != -1]
        
        sorted_sizes = sorted(cluster_sizes, reverse=True)
        plt.bar(range(len(sorted_sizes)), sorted_sizes)
        plt.title("Cluster Sizes (excluding noise)")
        plt.xlabel("Cluster Rank (by size)")
        plt.ylabel("Number of Resumes")
        plt.tight_layout()
        
        # Save the plot instead of showing it
        plt.savefig('cluster_sizes.png')
        print("Saved cluster sizes visualization to cluster_sizes.png")
        plt.close()

def analyze_resume_clusters(df, cluster_labels, densest_cluster_indices, n_keywords=10):
    """
    Analyze clusters to extract common terms and characteristics
    """
    results = []
    
    for i, indices in enumerate(densest_cluster_indices):
        cluster_df = df.iloc[indices]
        
        # Combine all text in the cluster
        all_text = ' '.join(cluster_df['cleaned_text'].tolist())
        
        # Simple keyword extraction (could be improved with TF-IDF or other NLP techniques)
        words = all_text.lower().split()
        word_counts = Counter(words)
        
        # Remove common stop words (a very basic list)
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
                      'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of', 'as', 'i', 'my',
                      'we', 'our', 'you', 'your', 'he', 'she', 'his', 'her', 'they', 'their'}
        
        for word in stop_words:
            word_counts.pop(word, None)
        
        # Get top keywords
        keywords = [word for word, count in word_counts.most_common(n_keywords)]
        
        # Get additional statistics if available 
        # (assuming there might be a Category column in the dataset)
        if 'Category' in cluster_df.columns:
            category_counts = cluster_df['Category'].value_counts()
            top_categories = category_counts.index.tolist()[:3]
        else:
            top_categories = ["N/A"]
        
        results.append({
            'cluster_index': i,
            'size': len(indices),
            'keywords': keywords,
            'top_categories': top_categories
        })
    
    return results

def main():
    # Load the embeddings
    print("Loading embeddings...")
    try:
        embeddings = np.load('resume_embeddings.npy')
        print(f"Loaded embeddings with shape: {embeddings.shape}")
    except Exception as e:
        print(f"Error loading embeddings: {e}")
        return None
    
    # Load the cleaned dataframe
    try:
        df = pd.read_csv('cleaned_resumes.csv')
        print(f"Loaded dataframe with shape: {df.shape}")
    except Exception as e:
        print(f"Error loading dataframe: {e}")
        df = None
    
    # Cluster the embeddings
    print("\nClustering embeddings...")
    results = cluster_embeddings(
        embeddings,
        min_cluster_size=15,
        min_samples=5,
        n_densest_clusters=3,
        plot_results=True,
        use_cosine=True
    )
    
    # Save clustering results (removing the pickle save since it was used by transform_embeddings.py)
    print("\nClustering complete!")
    
    return results

if __name__ == "__main__":
    cluster_results = main()