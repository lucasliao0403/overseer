import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
import re

# Load the resume dataset
df = pd.read_csv("hf://datasets/sankar12345/Resume-Dataset/Resume.csv")
print(df.Resume_str)

# Print DataFrame properties
print("DataFrame shape:", df.shape)
print("\nDataFrame columns:", df.columns.tolist())
print("\nDataFrame info:")
df.info()
print("\nFirst few rows of Resume_str column:")
print(df['Resume_str'].head())

# Basic cleaning function (minimal preprocessing as BERT handles most of it)
def clean_text(text):
    if isinstance(text, str):
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    return ""

# Apply basic cleaning to Resume_str column
resume_column = 'Resume_str'  # Changed from 'Resume' to 'Resume_str'
df['cleaned_text'] = df[resume_column].apply(clean_text)

# Load a pretrained Sentence Transformer model
model = SentenceTransformer("all-MiniLM-L6-v2")

# Calculate embeddings for all resumes
resume_embeddings = model.encode(df['cleaned_text'].tolist(), show_progress_bar=True)

print(f"Shape of embeddings array: {resume_embeddings.shape}")
print(f"Sample embedding vector: {resume_embeddings[0][:10]}...")  # Show first 10 values of first embedding

# Find the greatest and least values in the first 100 embeddings
if len(resume_embeddings) >= 100:
    first_100_embeddings = resume_embeddings[:100]
    max_value = np.max(first_100_embeddings)
    min_value = np.min(first_100_embeddings)
    print(f"Greatest value in first 100 embeddings: {max_value}")
    print(f"Least value in first 100 embeddings: {min_value}")
    
    # Also print which embedding and position contains these values
    max_indices = np.unravel_index(np.argmax(first_100_embeddings), first_100_embeddings.shape)
    min_indices = np.unravel_index(np.argmin(first_100_embeddings), first_100_embeddings.shape)
    print(f"Max value location: embedding {max_indices[0]}, position {max_indices[1]}")
    print(f"Min value location: embedding {min_indices[0]}, position {min_indices[1]}")
else:
    print("Dataset has fewer than 100 embeddings.")

# # Optional: Calculate similarity matrix between resumes
# # Warning: This can be memory-intensive for large datasets
# # similarities = model.similarity(resume_embeddings, resume_embeddings)
# # print(f"Similarity matrix shape: {similarities.shape}")

# # Save embeddings for later use
np.save('resume_embeddings.npy', resume_embeddings)

# # If you want to add embeddings back to the dataframe as a new column
# # This converts each embedding array to a list and stores it in the DataFrame
# df['embedding'] = list(resume_embeddings)

# # Now you can use these embeddings for downstream tasks like clustering or classification 