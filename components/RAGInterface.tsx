'use client';
import React, { useState, useRef } from 'react';
import { Loader2, Upload, Send, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

// const API_BASE_URL = "https://chatbot-gigh.onrender.com";
const API_BASE_URL = "http://localhost:8000";


const RAGInterface = () => {
  const [urls, setUrls] = useState<string[]>(['']);
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isDataUploaded, setIsDataUploaded] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [querying, setQuerying] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
    setIsDataUploaded(false);
  };

  const addUrlField = () => {
    setUrls([...urls, '']);
  };

  const removeUrlField = (index: number) => {
    const newUrls = urls.filter((_, i) => i !== index);
    setUrls(newUrls);
  };

  // Completely replace the file handling approach
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Replace existing files with new selection
      setFiles(Array.from(e.target.files));
      setIsDataUploaded(false);
    }
  };

  const clearFiles = () => {
    setFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadData = async () => {
    setUploading(true);
    setError('');
    
    try {
      // Create a new FormData instance
      const formData = new FormData();
      
      // Add URLs
      urls.filter(url => url.trim()).forEach(url => {
        formData.append('urls', url);
      });
      
      // Add files - ensure we're using the correct field name expected by the backend
      files.forEach(file => {
        // Log each file being appended for debugging
        console.log(`Appending file: ${file.name}, size: ${file.size}`);
        formData.append('pdf_files', file);
      });
      
      // Log the entire FormData for debugging (this is limited but helps)
      for (let [key, value] of formData.entries()) {
        console.log(`${key}: ${value instanceof File ? value.name : value}`);
      }
      
      const response = await fetch('${API_BASE_URL}/aggregate_data', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Error response:', errorData);
        throw new Error(errorData?.detail || 'Failed to upload data');
      }
      
      setIsDataUploaded(true);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'An unknown error occurred');
    } finally {
      setUploading(false);
    }
  };
  
  const askQuestion = async () => {
    if (!query.trim()) return;
  
    setQuerying(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/ask/?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Failed to get answer');
  
      const data = await response.json();
      setAnswer(data.answer);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setQuerying(false);
    }
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload Knowledge Base</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {urls.map((url, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="url"
                  placeholder="Enter URL"
                  value={url}
                  onChange={(e) => handleUrlChange(index, e.target.value)}
                />
                {urls.length > 1 && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => removeUrlField(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            
            <Button
              variant="outline"
              onClick={addUrlField}
              className="w-full"
            >
              Add Another URL
            </Button>

            <div className="mt-4 border p-4 rounded-md">
              <p className="text-sm mb-3">Select PDF files:</p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileChange}
                className="mb-2"
              />
              
              {files.length > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">Selected files ({files.length}):</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFiles}
                    >
                      Clear
                    </Button>
                  </div>
                  <ul className="mt-2 text-sm max-h-32 overflow-y-auto">
                    {files.map((file, index) => (
                      <li key={index} className="py-1">
                        {file.name} ({(file.size / 1024).toFixed(1)} KB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Button 
              onClick={uploadData} 
              disabled={uploading || (urls.every(url => !url.trim()) && !files.length)} 
              className="w-full"
            >
              {uploading ? 
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> 
                : <Upload className="h-4 w-4 mr-2" />}
              Upload Data
            </Button>
            
            {isDataUploaded && (
              <Alert className="mt-4 bg-green-50 border-green-200">
                <AlertDescription className="text-green-700">
                  Data successfully uploaded! You can now ask questions.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Ask Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Textarea
              placeholder="Enter your question..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-24"
            />
            
            <Button
              onClick={askQuestion}
              disabled={querying || !isDataUploaded || !query.trim()}
              className="w-full"
            >
              {querying ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Ask Question
            </Button>

            {answer && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-medium mb-2">Answer:</h3>
                <p className="whitespace-pre-wrap">{answer}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default RAGInterface;