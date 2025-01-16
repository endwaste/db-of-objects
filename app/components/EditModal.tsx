"use client";

import axios from "axios";
import Image from "next/image";
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
  // Fields
  const [editMetadata, setEditMetadata] = useState<Record<string, string>>({
    brand: "",
    color: "",
    modifier: "",
    material: "",
    shape: "",
    comment: "",
    labeler_name: "",
  });
  const [isCustomBrand, setIsCustomBrand] = useState(false);

  // UI states
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // For the modifier dropdown
  const modifierDropdownRef = useRef<HTMLDivElement>(null);

  // Image & pick point
  const [imageUrl, setImageUrl] = useState<string>("");
  const [pickPoint, setPickPoint] = useState<[number, number] | null>(null);
  const [showPickPointModal, setShowPickPointModal] = useState(false);

  // --------------------------------------------------------------------------
  // Prefill logic when modal opens
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !metadata) return;

    // Basic fields
    setEditMetadata({
      brand: metadata.brand || "",
      color: metadata.color || "",
      modifier: metadata.modifier || "",
      material: metadata.material || "",
      shape: metadata.shape || "",
      comment: metadata.comment || "",
      labeler_name: metadata.labeler_name || "",
    });
    setIsCustomBrand(!brandOptions.some((option) => option.value === metadata.brand));

    // If there's a pick_point, parse it to [x, y]
    if (metadata.pick_point) {
      if (typeof metadata.pick_point === "string") {
        const [xStr, yStr] = metadata.pick_point.split(",");
        const px = parseFloat(xStr.trim());
        const py = parseFloat(yStr.trim());
        if (!isNaN(px) && !isNaN(py)) {
          setPickPoint([px, py]);
        }
      } else if (Array.isArray(metadata.pick_point)) {
        setPickPoint([metadata.pick_point[0], metadata.pick_point[1]]);
      } else {
        setPickPoint(null);
      }
    } else {
      setPickPoint(null);
    }

    // If we already have a presigned URL, use it; otherwise set blank
    if (metadata.s3_presigned_url) {
      setImageUrl(metadata.s3_presigned_url);
    } else {
      setImageUrl("");
    }
  }, [isOpen, metadata]);

  // --------------------------------------------------------------------------
  // Handle outside clicks for modifier dropdown
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // Standard field updates
  // --------------------------------------------------------------------------
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setEditMetadata({ ...editMetadata, [e.target.name]: e.target.value });
  };

  const handleModifierDropdownToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
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

  // --------------------------------------------------------------------------
  // Pick point logic
  // --------------------------------------------------------------------------
  const handleSelectPickPoint = () => {
    if (!imageUrl) return;
    setShowPickPointModal(true);
  };

  // This ref is used inside the pick-point overlay <img>
  const pickImageRef = useRef<HTMLImageElement>(null);

  // --------------------------------------------------------------------------
  // Letterbox-aware click calculation
  // --------------------------------------------------------------------------
  const handlePickPointClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!pickImageRef.current) return;

    const imgEl = pickImageRef.current;
    const rect = imgEl.getBoundingClientRect();

    const naturalW = imgEl.naturalWidth;
    const naturalH = imgEl.naturalHeight;

    // Current displayed aspect ratio vs. natural
    const displayedAspect = rect.width / rect.height;
    const naturalAspect = naturalW / naturalH;

    // Figure out how big the image actually is within the rect
    let displayedW = rect.width;
    let displayedH = rect.height;

    if (displayedAspect > naturalAspect) {
      // width is "extra" => letterboxing on the left/right
      displayedW = displayedH * naturalAspect;
    } else if (displayedAspect < naturalAspect) {
      // height is "extra" => letterboxing top/bottom
      displayedH = displayedW / naturalAspect;
    }

    // The leftover space is presumably centered
    const offsetX = (rect.width - displayedW) / 2;
    const offsetY = (rect.height - displayedH) / 2;

    // Where user actually clicked
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Adjust for leftover letterbox offset
    const xWithin = clickX - offsetX;
    const yWithin = clickY - offsetY;

    // clamp to [0..displayedW or displayedH]
    const xClamped = Math.max(0, Math.min(xWithin, displayedW));
    const yClamped = Math.max(0, Math.min(yWithin, displayedH));

    // Now normalize within the displayed area
    const xNormalized = xClamped / displayedW;
    const yNormalized = yClamped / displayedH;

    setPickPoint([xNormalized, yNormalized]);
    setShowPickPointModal(false);
  };

  const handleClosePickPointModal = () => {
    setShowPickPointModal(false);
  };

  // --------------------------------------------------------------------------
  // Submit "Update"
  // --------------------------------------------------------------------------
  const handleUpdate = async () => {
    setIsUpdating(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      Object.entries(editMetadata).forEach(([key, value]) => {
        formData.append(key, value);
      });
      if (pickPoint) {
        formData.append("pick_point", `${pickPoint[0]},${pickPoint[1]}`);
      }

      await axios.put(`${apiUrl}/update/${metadata.embedding_id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setEditStatus("Update successful!");
      onClose();
    } catch (error) {
      console.error("Update error:", error);
      setErrorMessage("Update failed. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  // --------------------------------------------------------------------------
  // Close entire modal
  // --------------------------------------------------------------------------
  const handleClose = () => {
    setErrorMessage(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
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
            {/* Header */}
            <div className="p-4 flex justify-between items-center">
                <h2 className="text-xl font-semibold">Edit image metadata</h2>
                <button
                    className="text-gray-500 hover:text-gray-700 focus:outline-none"
                    onClick={handleClose}
                >
                    &times;
                </button>
            </div>

            {imageUrl && (
            <div className="relative inline-block mt-2">
                <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700">Image Preview</h3>
                <div className="relative" style={{ width: "192px", height: "auto" }}>
                    <Image
                    src={imageUrl}
                    alt="Preview"
                    width={400} 
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
            </div>
            )}


            {/* Brand */}
            <div>
                <label className="block text-sm font-medium">Brand</label>
                <select
                name="brand"
                value={isCustomBrand ? "Other" : editMetadata.brand}
                onChange={handleBrandChange}
                className="block w-full mt-1 p-2 border rounded"
                >
                <option value="" disabled>
                    Select a brand
                </option>
                {brandOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                    {option.label}
                    </option>
                ))}
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
                {colorOptions.map((option) => (
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
                {materialOptions.map((option) => (
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
                {shapeOptions.map((option) => (
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
            {errorMessage && (
                <div className="text-sm text-red-500 self-center mr-4">
                {errorMessage}
                </div>
            )}
            <button onClick={handleClose} className="px-4 py-2 bg-gray-200 rounded">
                Cancel
            </button>
            <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded"
            >
                {isUpdating ? "Updating..." : "Update"}
            </button>
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

export default EditModal;
