Overseer filters hiring training data for fairness.

Users input source data, such as resumes or text-based records, which are then transformed into text embeddings to capture the semantic meaning of the text. 
Next, clusters are identified and an LLM (Cohere CMD-A) extracts common traits that define each group. Finally, we prune over-concentrated sections to ensure that no dominant category skews the dataset, leading to a more balanced and representative distribution. 

See our (Devpost)[https://devpost.com/software/overseer-vn8fpc] for more information.

Stack: Flask, Cohere CMD-A, Scikit Learn, numpy, pandas
