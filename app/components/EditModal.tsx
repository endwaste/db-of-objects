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

/** Parse multiple pick points from "x1,y1;x2,y2". */
function parsePickPoints(str: string | undefined): [number, number][] {
  if (!str) return [];
  return str
    .split(";")
    .map((pair): [number, number] => {
      const [xStr, yStr] = pair.trim().split(",");
      const x = parseFloat(xStr);
      const y = parseFloat(yStr);
      return [x, y];
    })
    .filter(([x, y]) => !isNaN(x) && !isNaN(y));
}


/** Convert multiple [x,y] points to "x1,y1;x2,y2". */
function formatPickPoints(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(";");
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

  // Multiple pick points
  const [pickPoints, setPickPoints] = useState<[number, number][]>([]);
  const [showPickPointModal, setShowPickPointModal] = useState(false);

  // We'll store the s3_presigned_url for preview
  const [imageUrl, setImageUrl] = useState<string>("");

  // --------------------------------------------------------------------------
  // 1) On open, load existing fields & parse multi pick points
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

    // Custom brand logic
    setIsCustomBrand(!brandOptions.some((option) => option.value === metadata.brand));

    // Parse existing pick points (e.g. "0.4,0.25;0.78,0.48")
    const existingPoints = parsePickPoints(metadata.pick_point);
    setPickPoints(existingPoints);

    // Use the image if we have a presigned URL
    if (metadata.s3_presigned_url) {
      setImageUrl(metadata.s3_presigned_url);
    } else {
      setImageUrl("");
    }
  }, [isOpen, metadata]);

  // --------------------------------------------------------------------------
  // 2) Hide modifier dropdown on outside click
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
  // Field & brand changes
  // --------------------------------------------------------------------------
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setEditMetadata((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
      const idx = selectedOptions.indexOf(e.target.value);
      if (idx > -1) selectedOptions.splice(idx, 1);
    }
    setEditMetadata((prev) => ({ ...prev, modifier: selectedOptions.join(", ") }));
  };

  const handleBrandChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "Other") {
      setIsCustomBrand(true);
      setEditMetadata((prev) => ({ ...prev, brand: "" }));
    } else {
      setIsCustomBrand(false);
      setEditMetadata((prev) => ({ ...prev, brand: value }));
    }
  };

  // --------------------------------------------------------------------------
  // 3) Let user pick multiple points
  // --------------------------------------------------------------------------
  const handleSelectPickPoints = () => {
    if (!imageUrl) return;
    setShowPickPointModal(true);
  };

  // --------------------------------------------------------------------------
  // 4) Submit "Update"
  // --------------------------------------------------------------------------
  const handleUpdate = async () => {
    setIsUpdating(true);
    setErrorMessage(null);

    try {
      // Build the form data
      const formData = new FormData();
      Object.entries(editMetadata).forEach(([key, value]) => {
        formData.append(key, value);
      });

      // Convert array => "x1,y1;x2,y2"
      if (pickPoints.length > 0) {
        formData.append("pick_point", formatPickPoints(pickPoints));
      } else {
        formData.append("pick_point", "");
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
  // 5) Close entire modal
  // --------------------------------------------------------------------------
  const handleClose = () => {
    setErrorMessage(null);
    onClose();
  };

  // --------------------------------------------------------------------------
  // 6) Render
  // --------------------------------------------------------------------------
  if (!isOpen) return null;

  return (
    <>
      {/* Crosshair styling */}
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
        .crosshair::before {
          width: 2px;
          height: 10px;
          left: -1px;
          top: -5px;
        }
        .crosshair::after {
          width: 10px;
          height: 2px;
          top: -1px;
          left: -5px;
        }
      `}</style>

      <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white w-full max-w-md max-h-[90vh] rounded-lg shadow-lg flex flex-col overflow-hidden p-2 relative">
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
            {imageUrl ? (
              <>
                {/* The preview with multiple crosshairs */}
                <div
                  className="relative block"
                  style={{ margin: 0, padding: 0, lineHeight: 0 }}
                >
                  <img
                    src={imageUrl}
                    alt="Preview"
                    style={{
                      objectFit: "contain",
                      display: "block",
                      width: "100%",
                      height: "auto",
                    }}
                  />
                  {pickPoints.map(([px, py], idx) => (
                    <div
                      key={idx}
                      className="crosshair"
                      style={{
                        left: `${px * 100}%`,
                        top: `${py * 100}%`,
                      }}
                    />
                  ))}
                </div>

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectPickPoints}
                    className="px-4 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                  >
                    {pickPoints.length > 0 ? "Re-select points" : "Select pick points"}
                  </button>
                  {pickPoints.length > 0 && (
                    <button
                      onClick={() => setPickPoints([])}
                      className="px-4 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600">No preview available.</p>
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
                <option value="" disabled>
                  Select a color
                </option>
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
                <option value="" disabled>
                  Select a material
                </option>
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
                <option value="" disabled>
                  Select a form factor
                </option>
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
              <label className="block text-sm font-medium">
                Labeler&apos;s name
              </label>
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
            <button onClick={handleUpdate} className="px-4 py-2 bg-blue-600 text-white rounded">
              {isUpdating ? "Updating..." : "Update"}
            </button>
          </div>

          {/* This is the pick-point modal where you see new points in real time */}
          {showPickPointModal && imageUrl && (
            <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center">
              <div className="relative">
                <button
                  onClick={() => setShowPickPointModal(false)}
                  className="absolute top-2 right-2 z-10 bg-gray-200 rounded px-2 py-1"
                >
                  X
                </button>
                {/* 
                  Wrap the image + crosshairs in a container with position: 'relative'
                  so we can place the crosshairs on top of the image in real-time.
                */}
                <div style={{ position: "relative", display: "inline-block" }}>
                  <img
                    src={imageUrl}
                    alt="Select Pick Points"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      let xFrac = (event.clientX - rect.left) / rect.width;
                      let yFrac = (event.clientY - rect.top) / rect.height;
                      // Optionally round
                      xFrac = Math.round(xFrac * 10000) / 10000;
                      yFrac = Math.round(yFrac * 10000) / 10000;

                      setPickPoints((prev) => [...prev, [xFrac, yFrac]]);
                    }}
                    style={{
                      width: "auto",
                      height: "auto",
                      maxWidth: "90vw",
                      maxHeight: "90vh",
                      objectFit: "contain",
                      cursor: "crosshair",
                      display: "block",
                    }}
                  />

                  {/* Show each newly selected crosshair in real-time */}
                  {pickPoints.map(([px, py], idx) => (
                    <div
                      key={idx}
                      className="crosshair absolute"
                      style={{
                        left: `${px * 100}%`,
                        top: `${py * 100}%`,
                      }}
                    />
                  ))}
                </div>

                <p className="text-white mt-2 text-center">
                  Click on the image to select multiple points
                </p>
                <div className="flex justify-center space-x-2 mt-2">
                  <button
                    onClick={() => setPickPoints([])}
                    className="bg-red-500 text-white px-3 py-1 rounded"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={() => setShowPickPointModal(false)}
                    className="bg-blue-600 text-white px-3 py-1 rounded"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default EditModal;
