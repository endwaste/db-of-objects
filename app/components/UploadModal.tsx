"use client";

import axios from "axios";
import Image from "next/image";
import React, { useState } from "react";

import brandOptions from "@/app/constants/brandOptions";
import colorOptions from "@/app/constants/colorOptions";
import materialOptions from "@/app/constants/materialOptions";
import shapeOptions from "@/app/constants/shapeOptions";

interface UploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    apiUrl: string;
    setUploadStatus: (status: string | null) => void;
}

const UploadModal: React.FC<UploadModalProps> = ({
    isOpen,
    onClose,
    apiUrl,
    setUploadStatus,
}) => {
    const [metadata, setMetadata] = useState<{
        brand?: string;
        color?: string;
        material?: string;
        shape?: string;
        comment?: string;
    }>({});
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isCustomBrand, setIsCustomBrand] = useState(false);
    const [uploadResult, setUploadResult] = useState<any>(null); // For upload response
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);


    const handleBrandChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;

        if (value === "Other") {
            setIsCustomBrand(true); // Show the custom input field
            setMetadata({ ...metadata, brand: "" }); // Clear brand
        } else {
            setIsCustomBrand(false); // Hide the custom input field
            setMetadata({ ...metadata, brand: value }); // Save the selected brand
        }
    };

    const handleCustomBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMetadata({ ...metadata, brand: e.target.value }); // Save custom brand
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result as string); // Set the image preview URL
            };
            reader.readAsDataURL(file); // Read the file as a data URL
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setMetadata({ ...metadata, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        if (!file) {
            setErrorMessage("Please select a file to upload.");
            return;
        }

        setIsUploading(true);
        setErrorMessage(null); // Clear previous errors
        setUploadStatus(null);

        const formData = new FormData();
        formData.append("image", file);
        Object.entries(metadata).forEach(([key, value]) => {
            if (value) formData.append(key, value);
        });

        try {
            const response = await axios.post(`${apiUrl}/new`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            setUploadResult(response.data.metadata);

        } catch (error) {
            console.error("Upload error:", error);
            setErrorMessage("Upload failed. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleUndo = async (id: string) => {
        try {
            const response = await axios.post(`${apiUrl}/delete`, { embedding_id: id });
            handleClose();
        } catch (error) {
            console.error("Error undoing the upload:", error);
        }
    };


    const handleClose = () => {
        setMetadata({
            brand: "",
            color: "",
            material: "",
            shape: "",
            comment: "",
        });
        setFile(null);
        setImageUrl(null);
        setErrorMessage(null);
        setUploadResult(null);
        setIsCustomBrand(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white w-96 rounded-lg shadow-lg p-6 relative">
                {/* Close Button */}
                <button
                    className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                    onClick={handleClose}
                >
                    &times;
                </button>

                {/* Conditional Rendering */}
                {!uploadResult ? (
                    /* Render Upload Form */
                    <>
                        <h2 className="text-xl font-semibold mb-4">Upload New Image</h2>

                        {/* File Input */}
                        <label className="block mb-2 text-sm font-medium text-gray-700">Select Image</label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {/* Add this below the file input to display the image preview */}
                        {imageUrl && (
                            <div className="mt-4">
                                <h3 className="text-sm font-medium text-gray-700">Image Preview</h3>
                                <Image
                                    src={imageUrl}
                                    alt="Preview"
                                    width={400}
                                    height={400}
                                    className="w-48 h-auto mt-2 rounded-lg"
                                />
                            </div>
                        )}

                        {/* Dropdowns */}
                        <div className="mt-4">
                            <label className="block mb-2 text-sm font-medium text-gray-700">Color</label>
                            <select
                                name="color"
                                value={metadata.color || ""}
                                onChange={handleInputChange}
                                className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                            >
                                <option value="" disabled>Select a color</option>
                                {colorOptions.map((color) => (
                                    <option key={color.value} value={color.value}>
                                        {color.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mt-4">
                            <label className="block mb-2 text-sm font-medium text-gray-700">Material</label>
                            <select
                                name="material"
                                value={metadata.material || ""}
                                onChange={handleInputChange}
                                className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                            >
                                <option value="" disabled>Select a material</option>
                                {materialOptions.map((material) => (
                                    <option key={material.value} value={material.value}>
                                        {material.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mt-4">
                            <label className="block mb-2 text-sm font-medium text-gray-700">Brand</label>
                            <select
                                name="brand"
                                value={isCustomBrand ? "Other" : metadata.brand || ""}
                                onChange={handleBrandChange}
                                className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                            >
                                <option value="" disabled>Select a brand</option>
                                {brandOptions.map((brand) => (
                                    <option key={brand.value} value={brand.value}>
                                        {brand.label}
                                    </option>
                                ))}
                            </select>
                            {isCustomBrand && (
                                <input
                                    type="text"
                                    name="brand"
                                    placeholder="Enter custom brand"
                                    value={metadata.brand || ""}
                                    onChange={handleCustomBrandChange}
                                    className="block w-full mt-2 p-2 border border-gray-300 rounded-md shadow-sm"
                                />
                            )}
                        </div>

                        <div className="mt-4">
                            <label className="block mb-2 text-sm font-medium text-gray-700">Shape</label>
                            <select
                                name="shape"
                                value={metadata.shape || ""}
                                onChange={handleInputChange}
                                className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                            >
                                <option value="" disabled>Select a shape</option>
                                {shapeOptions.map((shape) => (
                                    <option key={shape.value} value={shape.value}>
                                        {shape.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mt-4">
                            <label className="block mb-2 text-sm font-medium text-gray-700">Comment</label>
                            <input
                                type="text"
                                name="comment"
                                value={metadata.comment || ""}
                                onChange={handleInputChange}
                                placeholder="Enter your comment"
                                className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                            />
                        </div>


                        <div className="mt-6 flex justify-end space-x-4">
                            {errorMessage && (
                                <div className="mt-4 text-sm text-red-500">
                                    {errorMessage}
                                </div>
                            )}
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={isUploading}
                                className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 ${isUploading ? "opacity-50 cursor-not-allowed" : ""
                                    }`}
                            >
                                {isUploading ? "Uploading..." : "Upload"}
                            </button>
                        </div>
                    </>
                ) : (
                    /* Render Upload Summary */
                    <>
                        <h2 className="text-xl font-semibold mb-4">Upload Summary</h2>
                        {/* Display Uploaded Image */}
                        <Image
                            src={uploadResult.presigned_url}
                            alt="Uploaded"
                            width={400}
                            height={400}
                            className="w-full h-auto mb-4 rounded"
                        />

                        {/* Display Metadata */}
                        <div className="text-sm text-gray-700 space-y-2">
                            <p><strong>Color:</strong> {uploadResult.color || "N/A"}</p>
                            <p><strong>Material:</strong> {uploadResult.material || "N/A"}</p>
                            <p><strong>Brand:</strong> {uploadResult.brand || "N/A"}</p>
                            <p><strong>Shape:</strong> {uploadResult.shape || "N/A"}</p>
                            <p><strong>Comment:</strong> {uploadResult.comment || "N/A"}</p>
                            <p><strong>Timestamp:</strong> {uploadResult.timestamp || "N/A"}</p>
                            <p><strong>Robot:</strong> {uploadResult.robot || "N/A"}</p>
                            <p><strong>Date Taken:</strong> {uploadResult.datetime_taken || "N/A"}</p>
                        </div>
                        <div className="mt-6 flex justify-end space-x-4">
                            <button
                                onClick={() => handleUndo(uploadResult.embedding_id)} // Pass the ID to the undo handler
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
                            >
                                Undo
                            </button>
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
                            >
                                Close
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default UploadModal;
