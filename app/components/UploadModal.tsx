"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

interface Metadata {
    color?: string;
    material?: string;
    brand?: string;
    shape?: string;
}

interface UploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    apiUrl: string; // API endpoint URL
}

const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, apiUrl }) => {
    const [file, setFile] = useState<File | null>(null);
    const [metadata, setMetadata] = useState<Metadata>({});
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const router = useRouter(); // For navigation

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMetadata({ ...metadata, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        if (!file) {
            setUploadStatus("Please select a file to upload.");
            return;
        }

        setIsUploading(true);
        setUploadStatus(null);

        const formData = new FormData();
        formData.append("image", file);
        Object.entries(metadata).forEach(([key, value]) => {
            if (value) formData.append(key, value);
        });

        try {
            await axios.post(apiUrl, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            setUploadStatus("Upload successful!");

            // Close modal and redirect to root
            onClose();
            router.push("/"); // Redirect to the root page
        } catch (error) {
            console.error("Upload error:", error);
            setUploadStatus("Upload failed. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white w-96 rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Upload New Image</h2>

                <label className="block mb-2 text-sm font-medium text-gray-700">
                    Select Image
                </label>
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />

                <div className="mt-4">
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        Color
                    </label>
                    <input
                        type="text"
                        name="color"
                        placeholder="Enter color"
                        onChange={handleInputChange}
                        className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                    />
                </div>

                <div className="mt-4">
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        Material
                    </label>
                    <input
                        type="text"
                        name="material"
                        placeholder="Enter material"
                        onChange={handleInputChange}
                        className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                    />
                </div>

                <div className="mt-4">
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        Brand
                    </label>
                    <input
                        type="text"
                        name="brand"
                        placeholder="Enter brand"
                        onChange={handleInputChange}
                        className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                    />
                </div>

                <div className="mt-4">
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        Shape
                    </label>
                    <input
                        type="text"
                        name="shape"
                        placeholder="Enter shape"
                        onChange={handleInputChange}
                        className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                    />
                </div>

                {uploadStatus && (
                    <div
                        className={`mt-4 p-2 rounded ${uploadStatus.includes("successful")
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                    >
                        {uploadStatus}
                    </div>
                )}

                <div className="mt-6 flex justify-end space-x-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 ${isUploading ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                        disabled={isUploading}
                    >
                        {isUploading ? "Uploading..." : "Upload"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UploadModal;
