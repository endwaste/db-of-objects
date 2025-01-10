"use client";

import axios from "axios";
import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";

import brandOptions from "@/app/constants/brandOptions";
import colorOptions from "@/app/constants/colorOptions";
import materialOptions from "@/app/constants/materialOptions";
import modifierOptions from "@/app/constants/modifierOptions";
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
        modifier?: string;
        color?: string;
        material?: string;
        shape?: string;
        comment?: string;
        labeler_name?: string;
    }>({});
    const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isCustomBrand, setIsCustomBrand] = useState(false);
    const [uploadResult, setUploadResult] = useState<any>(null); // For upload response
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const modifierDropdownRef = useRef<HTMLDivElement>(null);
    const [isModifierDropdownOpen, setIsModifierDropdownOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);


    // Hide modifier dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const dropdown = modifierDropdownRef.current;

            // Close the dropdown if the click is outside the dropdown
            if (dropdown && !dropdown.contains(event.target as Node)) {
                dropdown.classList.add("hidden");
            }
        };

        // Attach the listener to the document
        document.addEventListener("mousedown", handleClickOutside);

        // Cleanup the listener on component unmount
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);


    const handleModifierDropdownToggle = () => {
        setIsModifierDropdownOpen((prev) => !prev); // Toggle dropdown visibility
    };



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

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setErrorMessage(null);
        setPresignedUrl(null);

        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);

            // Display image preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result as string);
            };
            reader.readAsDataURL(selectedFile);

            // Immediately send the file to the backend
            try {
                setIsLoading(true);
                const formData = new FormData();
                formData.append("file", selectedFile);
                formData.append("metadata_key", "s3_file_path"); // Default metadata key

                const response = await axios.post(`${apiUrl}/upload-image`, formData, {
                    headers: { "Content-Type": "multipart/form-data" },
                });

                if (response.data.presignedUrl) {
                    setPresignedUrl(response.data.presignedUrl);
                } else {
                    setErrorMessage("Presigned URL not found in the response.");
                }
            } catch (error) {
                console.error("Error extracting presigned URL:", error);
                setErrorMessage("Failed to generate presigned URL. Please try again.");
            } finally {
                setIsLoading(false);
            }
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
            modifier: "",
            material: "",
            shape: "",
            comment: "",
            labeler_name: "",
        });
        setFile(null);
        setImageUrl(null);
        setPresignedUrl(null);
        setErrorMessage(null);
        setUploadResult(null);
        setIsCustomBrand(false);
        onClose();
    };

    useEffect(() => {
        if (isOpen) {
            setIsModifierDropdownOpen(false);
        }
    }, [isOpen]);


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white w-full max-w-md rounded-lg shadow-lg flex flex-col p-6 max-h-[80vh] overflow-y-auto relative">

                <button
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 focus:outline-none z-50"
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
                        {/* Presigned URL */}
                        {presignedUrl && (
                            <div className="mt-4">
                                <h3 className="text-sm font-medium"></h3>
                                <a
                                    href={`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(presignedUrl)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 underline"
                                >
                                    Search in Google Lens
                                </a>
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
                            <label className="block mb-2 text-sm font-medium text-gray-700">Form factor</label>
                            <select
                                name="shape"
                                value={metadata.shape || ""}
                                onChange={handleInputChange}
                                className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                            >
                                <option value="" disabled>Select a form factor</option>
                                {shapeOptions.map((shape) => (
                                    <option key={shape.value} value={shape.value}>
                                        {shape.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mt-4">
                            <label className="block mb-2 text-sm font-medium text-gray-700">Modifier</label>
                            <div className="relative">
                                {/* Trigger button */}
                                <button
                                    type="button"
                                    className="block w-full p-2 border border-gray-300 rounded-md shadow-sm bg-white text-left"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleModifierDropdownToggle();
                                    }}
                                >
                                    {metadata.modifier
                                        ? metadata.modifier.split(", ").join(", ")
                                        : "Select modifiers"}
                                </button>

                                {/* Dropdown menu */}
                                <div
                                    ref={modifierDropdownRef}
                                    className={`absolute mt-2 w-full max-h-48 overflow-y-auto bg-white border border-gray-300 rounded-md shadow-md z-50 ${isModifierDropdownOpen ? "" : "hidden"
                                        }`}
                                >


                                    {modifierOptions.map((modifier) => (
                                        <label
                                            key={modifier.value}
                                            className="block px-4 py-2 text-sm cursor-pointer hover:bg-gray-100"
                                        >
                                            <input
                                                type="checkbox"
                                                value={modifier.value}
                                                checked={
                                                    metadata.modifier
                                                        ?.split(", ")
                                                        .includes(modifier.value) || false
                                                }
                                                onChange={(e) => {
                                                    const selectedOptions = metadata.modifier
                                                        ? metadata.modifier.split(", ")
                                                        : [];
                                                    if (e.target.checked) {
                                                        selectedOptions.push(modifier.value);
                                                    } else {
                                                        const index = selectedOptions.indexOf(
                                                            modifier.value
                                                        );
                                                        if (index > -1) selectedOptions.splice(index, 1);
                                                    }
                                                    setMetadata({
                                                        ...metadata,
                                                        modifier: selectedOptions.join(", "),
                                                    });
                                                }}
                                                className="mr-2"
                                            />
                                            {modifier.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
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

                        <div className="mt-4">
                            <label className="block mb-2 text-sm font-medium text-gray-700">Labeler&apos;s name</label>
                            <input
                                type="text"
                                name="labeler_name"
                                value={metadata.labeler_name || ""}
                                onChange={handleInputChange}
                                placeholder="Enter your name"
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
                            <p><strong>Form Factor:</strong> {uploadResult.shape || "N/A"}</p>
                            <p><strong>Labeler&apos;s name:</strong> {uploadResult.labeler_name || "N/A"}</p>
                            <p><strong>Modifier:</strong> {uploadResult.modifier || "N/A"}</p>
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
        </div >
    );
};

export default UploadModal;
