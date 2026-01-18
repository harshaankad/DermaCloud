"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UploadScanPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  // Form data
  const [formData, setFormData] = useState({
    patientName: "",
    patientAge: "",
    patientGender: "",
    notes: "",
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");

    if (!token || !userData) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);

    if (parsedUser.tier !== "tier1") {
      router.push("/dashboard");
    }
  }, [router]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files) {
      const filesArray = Array.from(e.dataTransfer.files);
      handleFiles(filesArray);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      handleFiles(filesArray);
    }
  };

  const compressImage = (file: File, maxWidth = 1024, quality = 0.8): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            "image/jpeg",
            quality
          );
        };
      };
    });
  };

  const handleFiles = async (files: File[]) => {
    const validTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

    // Check total count (max 5)
    if (selectedFiles.length + files.length > 5) {
      setError("Maximum 5 images allowed per scan");
      return;
    }

    // Validate each file
    for (const file of files) {
      if (!validTypes.includes(file.type)) {
        setError(`Invalid file type for ${file.name}. Only JPEG, PNG, or WebP allowed`);
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError(`File ${file.name} too large. Maximum size is 10MB`);
        return;
      }
    }

    setError("");

    // Compress images before adding
    const compressedFiles = await Promise.all(
      files.map((file) => compressImage(file, 1024, 0.8))
    );

    // Add files to selection
    const newFiles = [...selectedFiles, ...compressedFiles];
    setSelectedFiles(newFiles);

    // Create previews for new files
    const newPreviews = [...previews];
    compressedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newPreviews.push(e.target?.result as string);
        setPreviews([...newPreviews]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedFiles.length === 0) {
      setError("Please select at least one image to upload");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");

      const uploadFormData = new FormData();

      // Append multiple images with indexed names
      selectedFiles.forEach((file, index) => {
        uploadFormData.append(`image${index}`, file);
      });

      uploadFormData.append("patientName", formData.patientName || "Unknown");
      uploadFormData.append("patientAge", formData.patientAge);
      uploadFormData.append("patientGender", formData.patientGender);
      uploadFormData.append("notes", formData.notes);

      const response = await fetch("/api/tier1/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: uploadFormData,
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setUploadResult(data.data);
        // Redirect to results after 2 seconds
        setTimeout(() => {
          router.push(`/tier1/scans/${data.data.scanId}`);
        }, 2000);
      } else {
        setError(data.message || "Upload failed");
      }
    } catch (err: any) {
      setError(err.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    setPreviews(newPreviews);
  };

  const clearSelection = () => {
    setSelectedFiles([]);
    setPreviews([]);
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (success && uploadResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20 text-center animate-fade-in-up">
            <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Analysis Complete!
            </h2>

            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 mb-6">
              <p className="text-sm text-gray-600 mb-2">
                {uploadResult.imageCount > 1 ? `Analyzed ${uploadResult.imageCount} images` : "Top Prediction"}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                {uploadResult.imageCount > 1 && "Averaged Result"}
              </p>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                {uploadResult.finalResult.topPrediction.condition}
              </h3>
              <p className="text-lg text-gray-700">
                {(uploadResult.finalResult.topPrediction.probability * 100).toFixed(1)}% confidence
              </p>
              <span
                className={`inline-block mt-3 px-4 py-2 rounded-full text-sm font-semibold ${
                  uploadResult.finalResult.topPrediction.confidence === "high"
                    ? "bg-green-100 text-green-700"
                    : uploadResult.finalResult.topPrediction.confidence === "medium"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {uploadResult.finalResult.topPrediction.confidence} confidence
              </span>
            </div>

            <p className="text-gray-600 mb-6">
              Redirecting to detailed results...
            </p>

            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Animated background */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
      <div className="absolute top-40 right-10 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/tier1/dashboard">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent cursor-pointer">
              DermaHMS
            </h1>
          </Link>
          <Link href="/tier1/dashboard">
            <button className="text-gray-600 hover:text-gray-900 font-semibold">
              ← Back to Dashboard
            </button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
        <div className="text-center mb-8 animate-fade-in-down">
          <h2 className="text-4xl font-bold text-gray-900 mb-2">
            Upload Skin Scan
          </h2>
          <p className="text-gray-600 text-lg">
            AI-powered analysis in seconds
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-6">
          {/* Upload Area */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-8 border border-white/20 animate-fade-in-up">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => selectedFiles.length < 5 && fileInputRef.current?.click()}
              className={`border-4 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                dragActive
                  ? "border-blue-500 bg-blue-50"
                  : selectedFiles.length < 5
                  ? "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
                  : "border-gray-300 bg-gray-50 cursor-not-allowed"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                multiple
                disabled={selectedFiles.length >= 5}
              />

              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {dragActive ? "Drop images here" : "Upload Images (1-5)"}
              </h3>
              <p className="text-gray-600 mb-4">
                {selectedFiles.length === 0
                  ? "Drag and drop or click to browse"
                  : `${selectedFiles.length} image(s) selected • ${5 - selectedFiles.length} more allowed`}
              </p>
              <p className="text-sm text-gray-500">
                JPEG, PNG, or WebP • Max 10MB each
              </p>
            </div>

            {/* Preview Grid */}
            {previews.length > 0 && (
              <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                {previews.map((preview, index) => (
                  <div key={index} className="relative rounded-xl overflow-hidden bg-gray-100 group">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-48 object-cover"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2 truncate">
                      {selectedFiles[index]?.name}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Clear all button */}
            {selectedFiles.length > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="mt-4 w-full py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Patient Information */}
          {previews.length > 0 && (
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl p-8 border border-white/20 animate-fade-in space-y-4">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Patient Information (Optional)
              </h3>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Patient Name
                </label>
                <input
                  type="text"
                  value={formData.patientName}
                  onChange={(e) =>
                    setFormData({ ...formData, patientName: e.target.value })
                  }
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                  placeholder="John Doe"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Age
                  </label>
                  <input
                    type="number"
                    value={formData.patientAge}
                    onChange={(e) =>
                      setFormData({ ...formData, patientAge: e.target.value })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                    placeholder="25"
                    min="0"
                    max="150"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Gender
                  </label>
                  <select
                    value={formData.patientGender}
                    onChange={(e) =>
                      setFormData({ ...formData, patientGender: e.target.value })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                  placeholder="Any additional information..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 animate-fade-in">
              <p className="text-red-700 text-center font-semibold">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          {previews.length > 0 && (
            <button
              type="submit"
              disabled={loading || selectedFiles.length === 0}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-lg rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin h-6 w-6 mr-2"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Analyzing {selectedFiles.length} Image{selectedFiles.length > 1 ? "s" : ""}...
                </span>
              ) : (
                `Analyze ${selectedFiles.length} Image${selectedFiles.length > 1 ? "s" : ""} with AI`
              )}
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
