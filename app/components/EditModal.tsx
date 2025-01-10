"use client";

import axios from "axios";
import React, { useEffect, useRef, useState } from "react";

import brandOptions from "@/app/constants/brandOptions";
import colorOptions from "@/app/constants/colorOptions";
import materialOptions from "@/app/constants/materialOptions";
import modifierOptions from "@/app/constants/modifierOptions";
import shapeOptions from "@/app/constants/shapeOptions";

interface EditModalProps {
    isOpen: boolean;
    onClose: () => void;
    apiUrl: string;
    metadata: Record<string, any>;
    setEditStatus: (status: string | null) => void;
}

const EditModal: React.FC<EditModalProps> = ({
    isOpen,
    onClose,
    apiUrl,
    metadata,
    setEditStatus,
}) => {
    const [editMetadata, setEditMetadata] = useState<Record<string, string>>({
        brand: "",
        color: "",
        modifier: "",
        material: "",
        shape: "",
        comment: "",
        labeler_name: "",
    });
    const [isUpdating, setIsUpdating] = useState(false);
    const [isCustomBrand, setIsCustomBrand] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const modifierDropdownRef = useRef<HTMLDivElement>(null);

    // Pre-fill metadata
    useEffect(() => {
        if (isOpen && metadata) {
            setEditMetadata({
                brand: metadata.brand || "",
                color: metadata.color || "",
                modifier: metadata.modifier || "",
                material: metadata.material || "",
                shape: metadata.shape || "",
                comment: metadata.comment || "",
                labeler_name: metadata.labeler_name || "",
            });
            setIsCustomBrand(!brandOptions.some(option => option.value === metadata.brand));
        }
    }, [isOpen, metadata]);

    // Handle dropdown outside clicks
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const dropdown = modifierDropdownRef.current;
            if (dropdown && !dropdown.contains(event.target as Node)) {
                dropdown.classList.add("hidden");
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setEditMetadata({ ...editMetadata, [e.target.name]: e.target.value });
    };

    const handleModifierDropdownToggle = () => {
        const dropdown = modifierDropdownRef.current;
        if (dropdown) {
            dropdown.classList.toggle("hidden");
        }
    };

    const handleModifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedOptions = editMetadata.modifier
            ? editMetadata.modifier.split(", ")
            : [];
        if (e.target.checked) {
            selectedOptions.push(e.target.value);
        } else {
            const index = selectedOptions.indexOf(e.target.value);
            if (index > -1) selectedOptions.splice(index, 1);
        }
        setEditMetadata({ ...editMetadata, modifier: selectedOptions.join(", ") });
    };

    const handleBrandChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === "Other") {
            setIsCustomBrand(true);
            setEditMetadata({ ...editMetadata, brand: "" });
        } else {
            setIsCustomBrand(false);
            setEditMetadata({ ...editMetadata, brand: value });
        }
    };

    const handleUpdate = async () => {
        setIsUpdating(true);
        setErrorMessage(null);

        const formData = new FormData();
        Object.entries(editMetadata).forEach(([key, value]) => {
            formData.append(key, value);
        });

        try {
            await axios.put(
                `${apiUrl}/update/${metadata.embedding_id}`,
                formData,
                { headers: { "Content-Type": "multipart/form-data" } }
            );
            setEditStatus("Update successful!");
            onClose();
        } catch (error) {
            console.error("Update error:", error);
            setErrorMessage("Update failed. Please try again.");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleClose = () => {
        setErrorMessage(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white w-full max-w-md rounded-lg shadow-lg flex flex-col overflow-hidden p-2">

                {/* Header */}
                <div className="p-4 flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Edit Image Metadata</h2>
                    <button
                        className="text-gray-500 hover:text-gray-700 focus:outline-none"
                        onClick={handleClose}
                    >
                        &times;
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Brand */}
                    <div>
                        <label className="block text-sm font-medium">Brand</label>
                        <select
                            name="brand"
                            value={isCustomBrand ? "Other" : editMetadata.brand}
                            onChange={handleBrandChange}
                            className="block w-full mt-1 p-2 border rounded"
                        >
                            <option value="" disabled>Select a brand</option>
                            {brandOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                            <option value="Other">Other</option>
                        </select>
                        {isCustomBrand && (
                            <input
                                type="text"
                                name="brand"
                                value={editMetadata.brand}
                                onChange={handleInputChange}
                                placeholder="Enter custom brand"
                                className="block w-full mt-2 p-2 border rounded"
                            />
                        )}
                    </div>

                    {/* Color */}
                    <div>
                        <label className="block text-sm font-medium">Color</label>
                        <select
                            name="color"
                            value={editMetadata.color}
                            onChange={handleInputChange}
                            className="block w-full mt-1 p-2 border rounded"
                        >
                            {colorOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Material */}
                    <div>
                        <label className="block text-sm font-medium">Material</label>
                        <select
                            name="material"
                            value={editMetadata.material}
                            onChange={handleInputChange}
                            className="block w-full mt-1 p-2 border rounded"
                        >
                            {materialOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Form Factor */}
                    <div>
                        <label className="block text-sm font-medium">Form Factor</label>
                        <select
                            name="shape"
                            value={editMetadata.shape}
                            onChange={handleInputChange}
                            className="block w-full mt-1 p-2 border rounded"
                        >
                            {shapeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Modifier */}
                    <div>
                        <label className="block text-sm font-medium">Modifier</label>
                        <div className="relative mt-1">
                            <button
                                type="button"
                                className="block w-full p-2 border rounded text-left bg-white"
                                onClick={handleModifierDropdownToggle}
                            >
                                {editMetadata.modifier
                                    ? editMetadata.modifier.split(", ").join(", ")
                                    : "Select Modifiers"}
                            </button>
                            <div
                                ref={modifierDropdownRef}
                                className="absolute mt-1 w-full bg-white border rounded shadow-md z-10 hidden overflow-auto max-h-48"
                            >
                                {modifierOptions.map((modifier) => (
                                    <label
                                        key={modifier.value}
                                        className="block px-4 py-2 text-sm text-left cursor-pointer hover:bg-gray-100"
                                    >
                                        <input
                                            type="checkbox"
                                            value={modifier.value}
                                            checked={editMetadata.modifier
                                                .split(", ")
                                                .includes(modifier.value)}
                                            onChange={handleModifierChange}
                                            className="mr-2"
                                        />
                                        {modifier.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>


                    {/* Comment */}
                    <div>
                        <label className="block text-sm font-medium">Comment</label>
                        <input
                            type="text"
                            name="comment"
                            value={editMetadata.comment}
                            onChange={handleInputChange}
                            placeholder="Enter comment"
                            className="block w-full mt-1 p-2 border rounded"
                        />
                    </div>

                    {/* Labeler Name */}
                    <div>
                        <label className="block text-sm font-medium">Labeler&apos;s name</label>
                        <input
                            type="text"
                            name="labeler_name"
                            value={editMetadata.labeler_name}
                            onChange={handleInputChange}
                            placeholder="Enter your name"
                            className="block w-full mt-1 p-2 border rounded"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 flex justify-end gap-2">
                    <button onClick={handleClose} className="px-4 py-2 bg-gray-200 rounded">
                        Cancel
                    </button>
                    <button onClick={handleUpdate} className="px-4 py-2 bg-blue-600 text-white rounded">
                        {isUpdating ? "Updating..." : "Update"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditModal;
