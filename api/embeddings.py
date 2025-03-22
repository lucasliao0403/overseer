import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
import re

def clean_text(text):
    """Basic cleaning function for resume text"""
    if isinstance(text, str):
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text
    return ""

def generate_embeddings(df, resume_column='Resume_str', model_name="all-MiniLM-L6-v2"):
    """Generate embeddings for resume texts"""
    # Apply basic cleaning to Resume column
    df['cleaned_text'] = df[resume_column].apply(clean_text)
    
    # Load a pretrained Sentence Transformer model
    model = SentenceTransformer(model_name)
    
    # Calculate embeddings for all resumes
    resume_embeddings = model.encode(df['cleaned_text'].tolist(), show_progress_bar=True)
    
    print(f"Shape of embeddings array: {resume_embeddings.shape}")
    print(f"Sample embedding vector: {resume_embeddings[0][:10]}...")  # Show first 10 values
    
    return resume_embeddings

def main():
    # Load the resume dataset
    print("Loading resume dataset...")
    try:
        df = pd.read_csv("hf://datasets/sankar12345/Resume-Dataset/Resume.csv")
    except Exception as e:
        print(f"Error loading dataset from Hugging Face: {e}")
        print("Trying local file...")
        try:
            df = pd.read_csv("Resume.csv")
        except Exception as e2:
            print(f"Error loading local file: {e2}")
            return None, None
    
    # Print dataset information
    print("DataFrame shape:", df.shape)
    print("\nDataFrame columns:", df.columns.tolist())
    
    # Generate embeddings
    print("\nGenerating embeddings...")
    resume_embeddings = generate_embeddings(df)
    
    # Save embeddings for later use
    np.save('resume_embeddings.npy', resume_embeddings)
    print("Saved embeddings to resume_embeddings.npy")
    
    # Save cleaned dataframe for later use
    df.to_csv('cleaned_resumes.csv', index=False)
    print("Saved cleaned dataframe to cleaned_resumes.csv")
    
    return df, resume_embeddings

if __name__ == "__main__":
    df, embeddings = main()
 
# # Optional: Calculate similarity matrix between resumes
# # Warning: This can be memory-intensive for large datasets
# # similarities = model.similarity(resume_embeddings, resume_embeddings)
# # print(f"Similarity matrix shape: {similarities.shape}")
# 
# # Save embeddings for later use
# np.save('resume_embeddings.npy', resume_embeddings)
# 
# # If you want to add embeddings back to the dataframe as a new column
# # This converts each embedding array to a list and stores it in the DataFrame
# df['embedding'] = list(resume_embeddings)
# 
# # Now you can use these embeddings for downstream tasks like clustering or classification 