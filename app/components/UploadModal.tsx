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

    // Coordinates for the pick point
    const [pickPoint, setPickPoint] = useState<[number, number] | null>(null);
    const [showPickPointModal, setShowPickPointModal] = useState(false);

    // Hide modifier dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const dropdown = modifierDropdownRef.current;
            if (dropdown && !dropdown.contains(event.target as Node)) {
                dropdown.classList.add("hidden");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleModifierDropdownToggle = () => {
        setIsModifierDropdownOpen((prev) => !prev);
    };

    const handleBrandChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === "Other") {
            setIsCustomBrand(true);
            setMetadata({ ...metadata, brand: "" });
        } else {
            setIsCustomBrand(false);
            setMetadata({ ...metadata, brand: value });
        }
    };

    const handleCustomBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMetadata({ ...metadata, brand: e.target.value });
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
                formData.append("metadata_key", "s3_file_path");

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

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        setMetadata({ ...metadata, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        if (!file) {
            setErrorMessage("Please select a file to upload.");
            return;
        }
        setIsUploading(true);
        setErrorMessage(null);
        setUploadStatus(null);
        setPickPoint(null);

        const formData = new FormData();
        formData.append("image", file);

        Object.entries(metadata).forEach(([key, value]) => {
            if (value) formData.append(key, value);
        });

        if (pickPoint) {
            formData.append("pick_point", `${pickPoint[0]},${pickPoint[1]}`);
        }

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
            await axios.post(`${apiUrl}/delete`, { embedding_id: id });
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
        setPickPoint(null);
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
        <>
            {/* Global style for crosshair (slightly thicker, smaller lines) */}
            <style jsx global>{`
                .crosshair {
                    position: absolute;
                    width: 0;
                    height: 0;
                    transform: translate(-50%, -50%);
                    pointer-events: none;
                }
                .crosshair::before,
                .crosshair::after {
                    content: "";
                    position: absolute;
                    background: red;
                }
                /* Thicker lines (2px) but shorter length (10px) */
                .crosshair::before {
                    width: 2px;
                    height: 10px;
                    left: -1px;  /* half of 2px */
                    top: -5px;   /* half of 10px */
                }
                .crosshair::after {
                    width: 10px;
                    height: 2px;
                    top: -1px;   /* half of 2px */
                    left: -5px;  /* half of 10px */
                }
            `}</style>

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
                            <h2 className="text-xl font-semibold mb-4">
                                Upload New Image
                            </h2>

                            {/* File Input */}
                            <label className="block mb-2 text-sm font-medium text-gray-700">
                                Select Image
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />

                            {/* Image Preview + pick point */}
                            <div className="relative inline-block mt-2">
                                {imageUrl && (
                                    <div className="mt-4">
                                        <h3 className="text-sm font-medium text-gray-700">
                                            Image Preview
                                        </h3>
                                        <div
                                            className="relative"
                                            style={{ width: "192px", height: "auto" }}
                                        >
                                            <Image
                                                src={imageUrl}
                                                alt="Preview"
                                                width={400} // or 192
                                                height={400}
                                                className="rounded-lg"
                                            />
                                            {pickPoint && (
                                                <div
                                                    className="crosshair"
                                                    style={{
                                                        left: `${pickPoint[0] * 100}%`,
                                                        top: `${pickPoint[1] * 100}%`,
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-2 flex space-x-2">
                                    {/* "Select pick point" button with CTA style */}
                                    {imageUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setShowPickPointModal(true)}
                                            className="py-1 px-3 text-sm rounded border border-transparent 
                                                bg-blue-600 text-white hover:bg-blue-700 
                                                focus:outline-none focus:ring-2 focus:ring-blue-500 
                                                focus:ring-offset-2"
                                        >
                                            {pickPoint
                                                ? "Re-select pick point"
                                                : "Select pick point"}
                                        </button>
                                    )}

                                    {/* Google lens URL */}
                                    {presignedUrl && (
                                        <a
                                            href={`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(
                                                presignedUrl
                                            )}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="py-1 px-3 text-sm rounded border border-transparent 
                                                bg-blue-600 text-white hover:bg-blue-700 
                                                focus:outline-none focus:ring-2 focus:ring-blue-500 
                                                focus:ring-offset-2 flex items-center"
                                        >
                                            Search in Google Lens
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Dropdowns (Color, Material, Brand, etc.) */}
                            <div className="mt-4">
                                <label className="block mb-2 text-sm font-medium text-gray-700">
                                    Color
                                </label>
                                <select
                                    name="color"
                                    value={metadata.color || ""}
                                    onChange={handleInputChange}
                                    className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                                >
                                    <option value="" disabled>
                                        Select a color
                                    </option>
                                    {colorOptions.map((color) => (
                                        <option key={color.value} value={color.value}>
                                            {color.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="mt-4">
                                <label className="block mb-2 text-sm font-medium text-gray-700">
                                    Material
                                </label>
                                <select
                                    name="material"
                                    value={metadata.material || ""}
                                    onChange={handleInputChange}
                                    className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                                >
                                    <option value="" disabled>
                                        Select a material
                                    </option>
                                    {materialOptions.map((material) => (
                                        <option key={material.value} value={material.value}>
                                            {material.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="mt-4">
                                <label className="block mb-2 text-sm font-medium text-gray-700">
                                    Brand
                                </label>
                                <select
                                    name="brand"
                                    value={isCustomBrand ? "Other" : metadata.brand || ""}
                                    onChange={handleBrandChange}
                                    className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                                >
                                    <option value="" disabled>
                                        Select a brand
                                    </option>
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
                                <label className="block mb-2 text-sm font-medium text-gray-700">
                                    Form factor
                                </label>
                                <select
                                    name="shape"
                                    value={metadata.shape || ""}
                                    onChange={handleInputChange}
                                    className="block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                                >
                                    <option value="" disabled>
                                        Select a form factor
                                    </option>
                                    {shapeOptions.map((shape) => (
                                        <option key={shape.value} value={shape.value}>
                                            {shape.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="mt-4">
                                <label className="block mb-2 text-sm font-medium text-gray-700">
                                    Modifier
                                </label>
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

                                    <div
                                        ref={modifierDropdownRef}
                                        className={`absolute mt-2 w-full max-h-48 overflow-y-auto bg-white border border-gray-300 rounded-md shadow-md z-50 ${
                                            isModifierDropdownOpen ? "" : "hidden"
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
                                                            if (index > -1) {
                                                                selectedOptions.splice(index, 1);
                                                            }
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
                                <label className="block mb-2 text-sm font-medium text-gray-700">
                                    Comment
                                </label>
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
                                <label className="block mb-2 text-sm font-medium text-gray-700">
                                    Labeler&apos;s name
                                </label>
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
                                    className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 ${
                                        isUploading ? "opacity-50 cursor-not-allowed" : ""
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

                            {/* Wrap the Image in a relative container */}
                            <div className="relative w-full h-auto mb-4">
                                <Image
                                    src={uploadResult.presigned_url}
                                    alt="Uploaded"
                                    width={350}
                                    height={350}
                                    className="w-full h-auto rounded"
                                />
                                {uploadResult.pick_point && (() => {
                                    const [px, py] = uploadResult.pick_point.split(",").map(Number);
                                    return (
                                        <div
                                            className="absolute crosshair"
                                            style={{
                                                left: `${px * 100}%`,
                                                top: `${py * 100}%`,
                                            }}
                                        />
                                    );
                                })()}
                            </div>

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
                                <p><strong>Pick Point:</strong> {uploadResult.pick_point || "N/A"}</p>
                            </div>

                            <div className="mt-6 flex justify-end space-x-4">
                                <button
                                    onClick={() => handleUndo(uploadResult.embedding_id)}
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

                {/* Modal for picking the point */}
                {showPickPointModal && imageUrl && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center">
                        <div className="relative">
                            <button
                                onClick={() => setShowPickPointModal(false)}
                                className="absolute top-2 right-2 z-10 bg-gray-200 rounded px-2 py-1"
                            >
                                X
                            </button>
                            <img
                                src={imageUrl}
                                alt="Select Pick Point"
                                onClick={(event) => {
                                    const rect = (event.target as HTMLImageElement).getBoundingClientRect();
                                    const x = (event.clientX - rect.left) / rect.width;
                                    const y = (event.clientY - rect.top) / rect.height;
                                    console.log("Pick point selected:", [x, y]);

                                    setPickPoint([x, y]);
                                    setShowPickPointModal(false);
                                }}
                                style={{
                                    width: "auto",
                                    height: "auto",
                                    maxWidth: "90vw",
                                    maxHeight: "90vh",
                                    objectFit: "contain",
                                }}
                                className="cursor-crosshair"
                            />
                            <p className="text-white mt-2 text-center">
                                Click on the image to select the pick point
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default UploadModal;
