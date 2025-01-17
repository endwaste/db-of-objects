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

  // Image & pick point (store as [xFraction, yFraction])
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
    setIsCustomBrand(
      !brandOptions.some((option) => option.value === metadata.brand)
    );

    // Convert existing pick_point to fraction-based
    if (metadata.pick_point) {
      if (typeof metadata.pick_point === "string") {
        const [xStr, yStr] = metadata.pick_point.split(",");
        const px = parseFloat(xStr.trim());
        const py = parseFloat(yStr.trim());
        if (!isNaN(px) && !isNaN(py)) {
          setPickPoint([px, py]);
        } else {
          setPickPoint(null);
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

  const handleModifierDropdownToggle = (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
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
        // store as "x,y" fraction
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
        /* Make the crosshair symmetrical: 2px wide, 10px tall. */
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
        <div
          className="
            bg-white w-full max-w-md 
            max-h-[90vh]
            rounded-lg shadow-lg 
            flex flex-col overflow-hidden p-2 relative
          "
        >
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
                {/* 
                  1) Use a BLOCK container (no inline baseline offset).
                  2) position: relative so crosshair is anchored to this box.
                  3) lineHeight: 0 to avoid any stray text-baseline spacing.
                */}
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
                      verticalAlign: "top",
                    }}
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

                {/* Place the button BELOW the container, so it doesn't affect boundingRect */}
                <button
                  type="button"
                  onClick={handleSelectPickPoint}
                  className="mt-2 px-4 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                >
                  {pickPoint ? "Re-select pick point" : "Select pick point"}
                </button>
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
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-200 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              {isUpdating ? "Updating..." : "Update"}
            </button>
          </div>

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
                    // 1) Get bounding rect in the displayed coordinate space
                    const img = event.currentTarget;
                    const rect = img.getBoundingClientRect();

                    // 2) Translate the click to fractions [0..1, 0..1]
                    const xFraction = (event.clientX - rect.left) / rect.width;
                    const yFraction = (event.clientY - rect.top) / rect.height;

                    // 3) Store those fractions
                    setPickPoint([xFraction, yFraction]);
                    setShowPickPointModal(false);
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
                <p className="text-white mt-2 text-center">
                  Click on the image to select the pick point
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default EditModal;
