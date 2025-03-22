import pandas as pd
import requests
import json
import os

# Load the dataset
df = pd.read_csv("hf://datasets/sankar12345/Resume-Dataset/Resume.csv")

# Display the first few rows to understand the structure
print("DataFrame columns:", df.columns.tolist())
print("\nFirst few rows:")
print(df.head())

# Function to predict gender using an LLM API
def predict_gender(text):
    try:
        # Replace with your actual LLM API endpoint and authentication
        api_url = "YOUR_LLM_API_ENDPOINT"
        headers = {
            "Authorization": "Bearer YOUR_API_KEY",
            "Content-Type": "application/json"
        }
        
        # Craft prompt for gender prediction
        prompt = f"Based on this text, determine if the person is male, female, or undefined. Only respond with 'male', 'female', or 'undefined': {text}"
        
        payload = {
            "prompt": prompt,
            "max_tokens": 10
        }
        
        response = requests.post(api_url, headers=headers, json=payload)
        response_text = response.json().get("choices")[0].get("text", "").strip().lower()
        
        # Standardize the response
        if "male" in response_text:
            return "male"
        elif "female" in response_text:
            return "female"
        else:
            return "undefined"
    except Exception as e:
        print(f"Error predicting gender: {e}")
        return "undefined"

# Assuming the third column is what you want to replace
# Get the name of the third column
third_column_name = df.columns[2]
print(f"\nReplacing column: {third_column_name}")

# Create a copy of the dataframe to avoid modifying the original
new_df = df.copy()

# Get the text to analyze for gender prediction
# This could be the name, resume text, or another relevant column
# Adjust this based on your actual data structure
text_column = df.columns[0]  # Using first column for demonstration
print(f"Using {text_column} for gender prediction")

# Apply gender prediction to each row
new_df[third_column_name] = df[text_column].apply(predict_gender)

# Get the path to the Downloads folder
downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
output_file = os.path.join(downloads_path, "resume_with_gender.csv")

# Save the modified dataframe to the Downloads folder
new_df.to_csv(output_file, index=False)
print(f"\nSaved modified data to {output_file}")

