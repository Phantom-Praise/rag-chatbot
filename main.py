import os, shutil
from datetime import datetime
from fastapi import (FastAPI, Query, HTTPException, UploadFile, File, Form)
from langchain_ollama import ChatOllama # type: ignore
from langchain_chroma import Chroma # type: ignore
from langchain_community.embeddings.fastembed import FastEmbedEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.prompts import PromptTemplate
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain.chains import create_retrieval_chain
import io, asyncio, requests
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from bs4 import BeautifulSoup
from typing import Optional, List
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from PyPDF2 import PdfReader

app = FastAPI()
origins = [
    "https://rag-chatbot-drab.vercel.app/",
    "http://localhost:3000/",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Base directory for vector databases
VECTOR_DB_BASE_PATH = "./vector_dbs"
os.makedirs(VECTOR_DB_BASE_PATH, exist_ok=True)

# Track the current active database path
current_db_path = ""

CHUNK_SIZE = 1024
CHUNK_OVERLAP = 100
RETRIEVAL_K = 3
MODEL_NAME = "llama3:latest"
MODEL_BASE_URL = "http://localhost:11435"

embedding = FastEmbedEmbeddings()
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    length_function=len,
    add_start_index=True,
)

class DataProcessor:
    @staticmethod
    async def fetch_html_text(url: str) -> Optional[str]:
        try:
            response = requests.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            for script in soup(["script", "style"]):
                script.extract()
            return soup.get_text(separator=" ", strip=True)
        except requests.exceptions.RequestException as e:
            raise HTTPException(status_code=500, detail=f"Error fetching URL: {str(e)}")
    
    @staticmethod
    async def process_pdf(file: UploadFile) -> str:
        try:
            pdf_reader = PdfReader(io.BytesIO(await file.read()))
            return "\n".join([page.extract_text() for page in pdf_reader.pages if page.extract_text()])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error processing PDF file: {str(e)}")

class VectorStore:
    @staticmethod
    def create_new_db(texts: List[str]) -> str:
        if not texts:
            raise ValueError("No data provided for ingestion.")

        # Create a new directory with timestamp
        new_db_path = os.path.join(VECTOR_DB_BASE_PATH, f"vector_db_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        os.makedirs(new_db_path, exist_ok=True)
        
        # Create document chunks
        chunks = text_splitter.create_documents(texts)
        
        # Store in new vector db
        Chroma.from_documents(
            documents=chunks, 
            embedding=embedding, 
            persist_directory=new_db_path
        )
        
        # Update the current db path
        global current_db_path
        current_db_path = new_db_path
        
        print(f"New Vector DB created at: {new_db_path}")
        return new_db_path

    @staticmethod
    def get_retriever():
        global current_db_path
        if not current_db_path or not os.path.exists(current_db_path) or not os.listdir(current_db_path):
            raise HTTPException(
                status_code=400,
                detail="No active vector database found. Please upload data first."
            )
        vector_store = Chroma(persist_directory=current_db_path, embedding_function=embedding)
        return vector_store.as_retriever(search_type="similarity", search_kwargs={"k": RETRIEVAL_K})

class RAGChain:
    @staticmethod
    def create():
        model = ChatOllama(model=MODEL_NAME, base_url=MODEL_BASE_URL)
        prompt = PromptTemplate.from_template("""
        <s> [Instructions] You are a helpful assistant. Answer the user's question using only the information provided in the context.
        If the answer is unclear, suggest possible follow-up questions. Do not mention missing context. [/Instructions] 
        [Instructions] Question: {input} 
        Context: {context} 
        Answer:[/Instructions]
        """)
        retriever = VectorStore.get_retriever()
        document_chain = create_stuff_documents_chain(model, prompt)
        return create_retrieval_chain(retriever, document_chain)

@app.get("/")
def home():
    return {"message": "Backend is running!"}

@app.get("/ask/")
async def ask(query: str = Query(..., title="User Query")):
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    global current_db_path
    if not current_db_path or not os.path.exists(current_db_path):
        raise HTTPException(status_code=400, detail="No active vector database. Please upload data first.")
    
    chain = RAGChain.create()
    result = chain.invoke({"input": query})
    return {"answer": result["answer"]}

@app.post("/aggregate_data")
async def aggregate_data(
    urls: Optional[List[str]] = Form(None),
    pdf_files: Optional[List[UploadFile]] = File(None)
):
    texts = []
    if urls:
        for url in urls:
            if url.strip():  # Ensure it's not an empty string
                texts.append(await DataProcessor.fetch_html_text(url))
    if pdf_files:
        for pdf_file in pdf_files:
            texts.append(await DataProcessor.process_pdf(pdf_file))
    
    if texts:
        new_db_path = VectorStore.create_new_db(texts)
        return {"message": f"New vector database created at {new_db_path}"}
    else:
        raise HTTPException(status_code=400, detail="No data provided for ingestion")

@app.get("/current_db")
def get_current_db():
    global current_db_path
    if current_db_path and os.path.exists(current_db_path):
        return {"current_db": current_db_path}
    return {"current_db": "None"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)