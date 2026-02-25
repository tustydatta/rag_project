import faiss
import os
import pickle

from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")

index = faiss.IndexFlatL2(384)

documents = []

def add_document(text):

    global documents
    chunks = chunk_text(text)
    
    for ch in chunks:
        embedding = model.encode([ch])
        index.add(embedding)
        documents.append(ch)

    save()


def search(query):

    embedding = model.encode([query])

    D, I = index.search(embedding, k=1)

    return documents[I[0][0]]


def save():
    faiss.write_index(index, "docs.index")
    with open("docs.pkl", "wb") as f:
        pickle.dump(documents, f)

def load():
    global index, documents

    # Priority 1: Load the pre-saved math from the index file (INSTANT)
    if os.path.exists("docs.index") and os.path.exists("docs.pkl"):
        index = faiss.read_index("docs.index") # Fixed typo: 'read_index'
        with open("docs.pkl", "rb") as f:
            documents = pickle.load(f)
        print("Success: Index loaded from file.")

    # Priority 2: Only use the loop if the index file is missing (BACKUP)
    elif os.path.exists("docs.pkl"):
        with open("docs.pkl", "rb") as f:
            documents = pickle.load(f)
            for doc in documents:
                embedding = model.encode([doc])
                index.add(embedding)
        print("Backup: Index rebuilt from documents.")
   
def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100):
    text = (text or "").strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        chunks.append(text[start:end])
        start = end - overlap
        if start < 0:
            start = 0
        if end == len(text):
            break
    return chunks