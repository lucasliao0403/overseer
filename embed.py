import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import PCA
import numpy as np

# Step 1: Load the dataset from Hugging Face
df = pd.read_csv("hf://datasets/sankar12345/Resume-Dataset/Resume.csv")

# Step 2: Extract the second column (index 1 since pandas is 0-indexed)
# Assuming the dataset has columns: ['ID', 'Resume_str', 'Category']
second_column = df.iloc[:, 1]  # This should be 'Resume_str'

# Step 3: Convert text data into numerical embeddings using TF-IDF
vectorizer = TfidfVectorizer(max_features=100)  # Limit to 100 features for simplicity
tfidf_matrix = vectorizer.fit_transform(second_column).toarray()

# Step 4: Reduce to 6 dimensions using PCA
pca = PCA(n_components=6)
embeddings_6d = pca.fit_transform(tfidf_matrix)

# Step 5: Output the first few embeddings as an example
print("Shape of 6D embeddings:", embeddings_6d.shape)
print("First 5 embeddings (6D):\n", embeddings_6d)

# Convert the 6D embeddings to a list of strings, each entry joined by commas
embeddings_6d_strings = [','.join(map(str, embedding)) for embedding in embeddings_6d]

# Define the output file path
output_file_path = "embeddings_6d.txt"

# Save the embeddings to a text file
with open(output_file_path, 'w') as f:
    for embedding_str in embeddings_6d_strings:
        f.write(embedding_str + '\n')

print(f"Saved 6D embeddings to {output_file_path}")


# Optional: If you want to embed a specific link or text, provide it separately
# For now, this uses the second column data as requested