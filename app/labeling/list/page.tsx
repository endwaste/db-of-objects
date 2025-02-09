"use client";

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

import brandOptions from "@/app/constants/brandOptions";
import colorOptions from "@/app/constants/colorOptions";
import materialOptions from "@/app/constants/materialOptions";
import modifierOptions from "@/app/constants/modifierOptions";
import shapeOptions from "@/app/constants/shapeOptions";

// Adjust to your environment:
const BASE_API = (() => {
  switch (process.env.NEXT_PUBLIC_VERCEL_ENV) {
    case "development":
      return process.env.NEXT_PUBLIC_DEVELOPMENT_URL || "http://localhost:8000";
    case "production":
      return (
        process.env.NEXT_PUBLIC_PRODUCTION_URL ||
        "http://ec2-44-243-22-197.us-west-2.compute.amazonaws.com:8000"
      );
    default:
      return "http://localhost:8000";
  }
})();

// CropItem includes "difficult" from /list
interface CropItem {
  original_s3_uri: string;
  bounding_box: string;
  labeled: boolean;
  labeler_name: string;
  difficult: boolean;
}

// /similarity result
interface SimilarityResult {
  crop_s3_uri: string;
  crop_presigned_url: string;
  incoming_crop_metadata: Record<string, any>;
  similar_crop_s3_uri: string;
  similar_crop_presigned_url: string | null;
  similar_crop_metadata: Record<string, any>;
  score: number | null;
  embedding_id: string | null; // if empty => not in DB
}

/**
 * Renders brand/color/material/shape/modifier fields, plus a pick_point read-only.
 * If brand is "Other" or not recognized, we show a custom brand input.
 */
function MetadataForm({
  metadata,
  onMetadataChange,
}: {
  metadata: Record<string, any>;
  onMetadataChange: (updated: Record<string, any>) => void;
}) {
  const [localMeta, setLocalMeta] = useState<Record<string, any>>(metadata);
  const [isCustomBrand, setIsCustomBrand] = useState(false);

  // For the modifier dropdown
  const [showModifierDropdown, setShowModifierDropdown] = useState(false);
  const modifierDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalMeta(metadata);

    // Decide if brand is "Other" or unrecognized
    if (!metadata.brand) {
      setIsCustomBrand(false);
    } else {
      const knownOption = brandOptions.find((b) => b.value === metadata.brand);
      if (!knownOption) {
        setIsCustomBrand(true);
      } else if (knownOption.value === "Other") {
        setIsCustomBrand(true);
      } else {
        setIsCustomBrand(false);
      }
    }
  }, [metadata]);

  // Close modifier dropdown if user clicks outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        modifierDropdownRef.current &&
        !modifierDropdownRef.current.contains(e.target as Node)
      ) {
        setShowModifierDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleFieldChange(field: string, value: string) {
    const updated = { ...localMeta, [field]: value };
    setLocalMeta(updated);
    onMetadataChange(updated);
  }

  function handleBrandChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === "Other") {
      setIsCustomBrand(true);
      handleFieldChange("brand", "Other");
    } else {
      setIsCustomBrand(false);
      handleFieldChange("brand", val);
    }
  }

  function handleCustomBrandChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFieldChange("brand", e.target.value);
  }

  // Multi-check modifiers
  function handleModifierChange(modVal: string, checked: boolean) {
    const curr = localMeta.modifier || "";
    const arr = curr ? curr.split(", ") : [];
    if (checked) {
      arr.push(modVal);
    } else {
      const idx = arr.indexOf(modVal);
      if (idx > -1) arr.splice(idx, 1);
    }
    handleFieldChange("modifier", arr.join(", "));
  }

  const selectedMods = localMeta.modifier ? localMeta.modifier.split(", ") : [];

  return (
    <div style={{ marginTop: "8px" }}>
      {/* Brand */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Brand:</label>
        <select
          value={isCustomBrand ? "Other" : localMeta.brand || ""}
          onChange={handleBrandChange}
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          <option value="">--Select--</option>
          {brandOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {isCustomBrand && (
          <input
            type="text"
            placeholder="Custom brand"
            style={{
              marginLeft: "6px",
              padding: "4px",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
            value={localMeta.brand}
            onChange={handleCustomBrandChange}
          />
        )}
      </div>

      {/* Color */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Color:</label>
        <select
          value={localMeta.color || ""}
          onChange={(e) => handleFieldChange("color", e.target.value)}
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          <option value="">--Select--</option>
          {colorOptions.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Material */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Material:</label>
        <select
          value={localMeta.material || ""}
          onChange={(e) => handleFieldChange("material", e.target.value)}
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          <option value="">--Select--</option>
          {materialOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Shape */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Shape:</label>
        <select
          value={localMeta.shape || ""}
          onChange={(e) => handleFieldChange("shape", e.target.value)}
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        >
          <option value="">--Select--</option>
          {shapeOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Modifiers Dropdown */}
      <div style={{ marginBottom: "8px", position: "relative" }}>
        <label style={{ marginRight: 6, fontWeight: "bold" }}>Modifiers:</label>
        <button
          type="button"
          style={{
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: "#f9f9f9",
            cursor: "pointer",
          }}
          onClick={() => setShowModifierDropdown((prev) => !prev)}
        >
          {selectedMods.length > 0
            ? selectedMods.join(", ")
            : "Select Modifiers..."}
        </button>
        {showModifierDropdown && (
          <div
            ref={modifierDropdownRef}
            style={{
              position: "absolute",
              zIndex: 999,
              top: "100%",
              left: 0,
              background: "#fff",
              border: "1px solid #ccc",
              borderRadius: "4px",
              padding: "6px",
              width: "200px",
              marginTop: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            {modifierOptions.map((m) => {
              const checked = selectedMods.includes(m.value);
              return (
                <label
                  key={m.value}
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ marginRight: "4px" }}
                    checked={checked}
                    onChange={(e) =>
                      handleModifierChange(m.value, e.target.checked)
                    }
                  />
                  {m.label}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Pick Point (read-only) */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: "6px", fontWeight: "bold" }}>
          Pick Point:
        </label>
        <input
          type="text"
          readOnly
          style={{
            width: "80px",
            background: "#f5f5f5",
            borderRadius: "4px",
            border: "1px solid #ccc",
            padding: "4px",
            cursor: "not-allowed",
          }}
          value={localMeta.pick_point || ""}
        />
      </div>
    </div>
  );
}

export default function CropListPage() {
  const [crops, setCrops] = useState<CropItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labelerName, setLabelerName] = useState("");
  const [difficult, setDifficult] = useState(false);
  const [similarityData, setSimilarityData] = useState<SimilarityResult | null>(
    null
  );
  const [showModal, setShowModal] = useState(false);
  const [showIncomingOverlay, setShowIncomingOverlay] = useState(false);
  const [showSimilarOverlay, setShowSimilarOverlay] = useState(false);
  const [csvHadIncoming, setCsvHadIncoming] = useState(false);
  const [selectedOriginalS3Uri, setSelectedOriginalS3Uri] = useState<string>("");
  const [selectedBoundingBoxStr, setSelectedBoundingBoxStr] = useState<string>("");
  const [originalSimilar, setOriginalSimilar] = useState<any>(null);
  const [originalIncoming, setOriginalIncoming] = useState<any>(null);


  // --------------------------------------------------------------------------
  // Fetch labeling list
  // --------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${BASE_API}/api/list`);
        setCrops(res.data.crops);
      } catch (err) {
        console.error("Error fetching crops:", err);
        setError("Failed to fetch crop list.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // --------------------------------------------------------------------------
  // On row click => populate labeler/difficult => /similarity => open modal
  // --------------------------------------------------------------------------
  const handleCropClick = async (crop: CropItem) => {
    setSelectedOriginalS3Uri(crop.original_s3_uri);
    setSelectedBoundingBoxStr(crop.bounding_box);
    try {
      setLabelerName(crop.labeler_name || "");
      setDifficult(crop.difficult || false);

      const boundingBox = crop.bounding_box.split(",").map(Number);
      const payload = {
        original_s3_uri: crop.original_s3_uri,
        bounding_box: boundingBox,
      };

      const resp = await axios.post(`${BASE_API}/api/similarity`, payload);
      const result: SimilarityResult = resp.data;

      let incoming = { ...result.incoming_crop_metadata };
      const csvHadData = incoming && Object.keys(incoming).length > 0;
      // If empty => copy from similar minus pick_point
      if (!csvHadData) {
        incoming = { ...result.similar_crop_metadata };
        delete incoming.pick_point;
      } else {
        setCsvHadIncoming(true);
      }

      setOriginalIncoming(JSON.parse(JSON.stringify(incoming)));
      setOriginalSimilar(JSON.parse(JSON.stringify(result.similar_crop_metadata)));

      setSimilarityData({
        ...result,
        incoming_crop_metadata: incoming,
      });
      setShowModal(true);
    } catch (err) {
      console.error("Error calling /similarity:", err);
      alert("Error calling /similarity. Check console.");
    }
  };

  // --------------------------------------------------------------------------
  // Close modal
  // --------------------------------------------------------------------------
  const handleCloseModal = () => {
    setShowModal(false);
    setSimilarityData(null);
    setShowIncomingOverlay(false);
    setShowSimilarOverlay(false);
  };

  const handleAddToUDO = async () => {
    if (!similarityData) {
      alert("No data to add to UDO");
      return;
    }
  
    const inc = similarityData.incoming_crop_metadata;
    const presignedUrl = similarityData.crop_presigned_url;
    if (!presignedUrl) {
      alert("No presigned URL found for the incoming crop.");
      return;
    }
  
    // Build FormData for the /new endpoint.
    const formData = new FormData();
    formData.append("presigned_url", presignedUrl);
    formData.append("brand", inc.brand || "");
    formData.append("color", inc.color || "");
    formData.append("material", inc.material || "");
    formData.append("shape", inc.shape || "");
    formData.append("pick_point", inc.pick_point || "");
    formData.append("modifier", inc.modifier || "");
    formData.append("comment", "");
    formData.append("labeler_name", labelerName || "");
  
    try {
      const resp = await fetch(`${BASE_API}/api/new`, {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        throw new Error(`Add to UDO failed. Status: ${resp.status}`);
      }
      const data = await resp.json();
      console.log("Add to UDO response:", data);
  
      if (data.status !== "success") {
        throw new Error(data.message || "Add to UDO did not succeed.");
      }
  
      const { metadata } = data;
      console.log("UDO metadata returned:", metadata);

      const updatePayload = {
        original_s3_uri: selectedOriginalS3Uri,
        bounding_box: selectedBoundingBoxStr.split(",").map((x: string) =>
          Number(x.trim())
        ),
        embedding_id: metadata.embedding_id,
      };
  
      await axios.put(`${BASE_API}/api/update_csv_embedding`, updatePayload, {
        headers: { "Content-Type": "application/json" },
      });
  
      setSimilarityData((prev) =>
        prev ? { ...prev, embedding_id: metadata.embedding_id } : prev
      );
  
      alert("Crop successfully added to UDO and CSV updated!");
      console.log("Crop added to UDO:", metadata);
    } catch (error) {
      console.error("Add to UDO error:", error);
      alert("Failed to add crop to UDO. See console for details.");
    }
  };

  const updateRecords = async (action: "next" | "end") => {
    if (!similarityData) return;

    const currentSimilar = similarityData.similar_crop_metadata;
    const currentIncoming = similarityData.incoming_crop_metadata;

    let updateSimilarPromise = Promise.resolve();
    let updateIncomingPromise = Promise.resolve();

    // 1. If similar crop metadata has changed, update its UDO record.
    if (JSON.stringify(currentSimilar) !== JSON.stringify(originalSimilar)) {
      const simEmbeddingId = currentSimilar.embedding_id;
      if (simEmbeddingId) {
        const formDataSim = new FormData();
        formDataSim.append("brand", currentSimilar.brand || "");
        formDataSim.append("color", currentSimilar.color || "");
        formDataSim.append("material", currentSimilar.material || "");
        formDataSim.append("shape", currentSimilar.shape || "");
        formDataSim.append("comment", currentSimilar.comment || "");
        formDataSim.append("modifier", currentSimilar.modifier || "");
        formDataSim.append("labeler_name", labelerName || "");
        formDataSim.append("pick_point", currentSimilar.pick_point || "");
        console.log("Updating similar crop metadata...");
        updateSimilarPromise = axios.put(
          `${BASE_API}/api/update/${simEmbeddingId}`,
          formDataSim,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
      }
    }

    // 2. If incoming crop metadata has changed AND the crop is in the UDO, update it.
    if (
      JSON.stringify(currentIncoming) !== JSON.stringify(originalIncoming) &&
      similarityData.embedding_id
    ) {
      const formDataIn = new FormData();
      formDataIn.append("brand", currentIncoming.brand || "");
      formDataIn.append("color", currentIncoming.color || "");
      formDataIn.append("material", currentIncoming.material || "");
      formDataIn.append("shape", currentIncoming.shape || "");
      formDataIn.append("comment", currentIncoming.comment || "");
      formDataIn.append("modifier", currentIncoming.modifier || "");
      formDataIn.append("labeler_name", labelerName || "");
      formDataIn.append("pick_point", currentIncoming.pick_point || "");
      updateIncomingPromise = axios.put(
        `${BASE_API}/api/update/${similarityData.embedding_id}`,
        formDataIn,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
    }

    // Wait for any pending update requests to finish
    await Promise.all([updateSimilarPromise, updateIncomingPromise]);

    // Build the payload for updating the CSV (always update CSV)
    const updatePayload = {
      original_s3_uri: selectedOriginalS3Uri,
      bounding_box: selectedBoundingBoxStr.split(",").map((x: string) =>
        Number(x.trim())
      ),
      labeler_name: labelerName || "",
      difficult: difficult,
      incoming_crop_metadata: currentIncoming,
      similar_crop_metadata: currentSimilar,
      embedding_id: similarityData.embedding_id || "",
      action: action,
    };
    console.log("Updating CSV with:", updatePayload);

    try {
      const csvResp = await axios.put(
        `${BASE_API}/api/update_csv`,
        updatePayload,
        { headers: { "Content-Type": "application/json" } }
      );
      const csvResult = csvResp.data;
      if (action === "next") {
        if (csvResult.next_crop) {
          alert(csvResult.message);
          handleCropClick(csvResult.next_crop);
        } else {
          alert(csvResult.message);
          handleCloseModal();
        }
      } else {
        alert(csvResult.message);
        handleCloseModal();
      }
    } catch (error) {
      console.error("Error updating CSV:", error);
      alert("Failed to update CSV. Check console for details.");
    }
  };

  // Handler for the Next button.
  const handleNext = async () => {
    await updateRecords("next");
  };

  // Handler for the Finish Labeling button.
  const handleFinish = async () => {
    await updateRecords("end");
  };
 

  function getIncomingSourceTag(): { text: string; color: string } {
    if (!similarityData) {
      return { text: "", color: "" };
    }
    const { embedding_id, incoming_crop_metadata } = similarityData;
    if (embedding_id) {
      return { text: "Metadata from UDO", color: "green" };
    } else if (csvHadIncoming) {
      console.log("incoming_crop_metadata", incoming_crop_metadata);
      return { text: " Metadata from CSV", color: "orange" };
    } else {
      // It's empty => we must have copied from Similar
      return { text: "Metadata from similar crop", color: "purple" };
    }
  }

  // --------------------------------------------------------------------------
  // Metadata form changes
  // --------------------------------------------------------------------------
  const handleIncomingMetaChange = (updated: Record<string, any>) => {
    if (!similarityData) return;
    setSimilarityData((prev) =>
      prev ? { ...prev, incoming_crop_metadata: updated } : prev
    );
  };
  const handleSimilarMetaChange = (updated: Record<string, any>) => {
    if (!similarityData) return;
    setSimilarityData((prev) =>
      prev ? { ...prev, similar_crop_metadata: updated } : prev
    );
  };

  // --------------------------------------------------------------------------
  // Pick point logic
  // --------------------------------------------------------------------------
  const handleIncomingImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!showIncomingOverlay || !similarityData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPos = e.clientX - rect.left;
    const yPos = e.clientY - rect.top;
    const xFrac = (xPos / rect.width).toFixed(2);
    const yFrac = (yPos / rect.height).toFixed(2);

    const updated = {
      ...similarityData.incoming_crop_metadata,
      pick_point: `${xFrac},${yFrac}`,
    };
    setSimilarityData({ ...similarityData, incoming_crop_metadata: updated });
  };

  const handleSimilarImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!showSimilarOverlay || !similarityData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPos = e.clientX - rect.left;
    const yPos = e.clientY - rect.top;
    const xFrac = (xPos / rect.width).toFixed(2);
    const yFrac = (yPos / rect.height).toFixed(2);

    const updated = {
      ...similarityData.similar_crop_metadata,
      pick_point: `${xFrac},${yFrac}`,
    };
    setSimilarityData({ ...similarityData, similar_crop_metadata: updated });
  };

  // --------------------------------------------------------------------------
  // Crosshair shape
  // --------------------------------------------------------------------------
  const pickPointCrossStyle = (pickPoint?: string) => {
    if (!pickPoint) return { display: "none" };
    const [xStr, yStr] = pickPoint.split(",");
    const x = parseFloat(xStr) || 0;
    const y = parseFloat(yStr) || 0;
    return {
      position: "absolute" as const,
      left: `${(x * 100).toFixed(1)}%`,
      top: `${(y * 100).toFixed(1)}%`,
      width: 0,
      height: 0,
      pointerEvents: "none",
      transform: "translate(-50%, -50%)",
    };
  };
  const crossArmStyle = {
    position: "absolute" as const,
    background: "red",
  };

  const pickPointButtonLabel = (pickPoint?: string) =>
    pickPoint ? "Reselect Pick Point" : "Select Pick Point";

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <h1 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>Crop List</h1>
      {loading && <p>Loading crops...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && crops.length === 0 && <p>No crops found.</p>

      /* TABLE OF CROPS */
      }
      {crops.length > 0 && !loading && !error && (
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            marginBottom: "1rem",
            fontSize: "14px",
          }}
        >
          <thead>
            <tr style={{ background: "#f2f2f2", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>Original S3 URI</th>
              <th style={{ padding: "8px" }}>Bounding Box</th>
              <th style={{ padding: "8px" }}>Labeled?</th>
              <th style={{ padding: "8px" }}>Labeler's Name</th>
            </tr>
          </thead>
          <tbody>
            {crops.map((crop, idx) => (
              <tr
                key={idx}
                onClick={() => handleCropClick(crop)}
                style={{
                  cursor: "pointer",
                  borderBottom: "1px solid #eee",
                }}
              >
                <td style={{ padding: "8px" }}>{crop.original_s3_uri}</td>
                <td style={{ padding: "8px" }}>{crop.bounding_box}</td>
                <td style={{ padding: "8px" }}>
                  {crop.labeled ? "Yes" : "No"}
                </td>
                <td style={{ padding: "8px" }}>{crop.labeler_name || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* MODAL */}
      {showModal && similarityData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              padding: "1rem",
              width: "80%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
              fontSize: "14px",
            }}
          >
            <h2
              style={{
                marginBottom: "1rem",
                fontSize: "1.4rem",
                borderBottom: "1px solid #ddd",
                paddingBottom: "0.5rem",
              }}
            >
              Similarity Result
            </h2>

            <div
              style={{
                display: "flex",
                gap: "1.5rem",
                marginBottom: "1rem",
                alignItems: "flex-start",
              }}
            >
              {/* Incoming Crop Column */}
              <div
                style={{
                  flex: 1,
                  border: "1px solid #eee",
                  borderRadius: "6px",
                  padding: "1rem",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                }}
              >
                <h3
                  style={{
                    marginBottom: "0.5rem",
                    fontSize: "1rem",
                    borderBottom: "1px solid #ddd",
                    paddingBottom: "0.25rem",
                  }}
                >
                  Incoming Crop
                  {(() => {
                    const { text, color } = getIncomingSourceTag();
                    if (!text) return null;
                    return (
                      <span
                        style={{
                          display: "inline-block",
                          marginBottom: "0.5rem",
                          background: color,
                          color: "#fff",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          marginLeft: "30px",
                        }}
                      >
                        {text}
                      </span>
                    );
                  })()}
                </h3>


                {similarityData.crop_presigned_url ? (
                  <>
                    <div
                      style={{
                        position: "relative",
                        display: "block",
                        margin: 0,
                        padding: 0,
                        lineHeight: 0,
                        maxWidth: "400px",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <img
                        src={similarityData.crop_presigned_url}
                        alt="Incoming Crop"
                        style={{
                          display: "block",
                          width: "100%",
                          height: "auto",
                          margin: 0,
                          padding: 0,
                          cursor: showIncomingOverlay ? "crosshair" : "default",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                        }}
                        onClick={handleIncomingImgClick}
                      />
                      {/* Crosshair */}
                      <div
                        style={pickPointCrossStyle(
                          similarityData.incoming_crop_metadata.pick_point
                        )}
                      >
                        <div
                          style={{
                            ...crossArmStyle,
                            width: "1px",
                            height: "14px",
                            top: "-7px",
                            left: "0px",
                          }}
                        />
                        <div
                          style={{
                            ...crossArmStyle,
                            width: "14px",
                            height: "1px",
                            top: "0px",
                            left: "-7px",
                          }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => setShowIncomingOverlay((prev) => !prev)}
                      style={{
                        marginBottom: "1rem",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "1px solid #bbb",
                        background: "#e6e6e6",
                        cursor: "pointer",
                        fontSize: "14px",
                      }}
                    >
                      {pickPointButtonLabel(
                        similarityData.incoming_crop_metadata.pick_point
                      )}
                    </button>
                  </>
                ) : (
                  <p>No incoming crop URL</p>
                )}

                <MetadataForm
                  metadata={similarityData.incoming_crop_metadata}
                  onMetadataChange={handleIncomingMetaChange}
                />

                {/* 
                  "Add to UDO" => only if embedding_id is empty 
                */}
                <div style={{ marginTop: "1rem" }}>
                  <button
                    onClick={handleAddToUDO}
                    disabled={
                      // disable if embedding_id is non-empty => already in DB
                      Boolean(similarityData.embedding_id)
                    }
                    style={{
                      backgroundColor: "#4caf50",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "0.5rem 1rem",
                      cursor: similarityData.embedding_id
                        ? "not-allowed"
                        : "pointer",
                      opacity: similarityData.embedding_id ? 0.6 : 1,
                    }}
                  >
                    Add to UDO
                  </button>
                </div>
              </div>

              {/* Similar Crop Column */}
              <div
                style={{
                  flex: 1,
                  border: "1px solid #eee",
                  borderRadius: "6px",
                  padding: "1rem",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                }}
              >
                <h3
                  style={{
                    marginBottom: "0.5rem",
                    fontSize: "1rem",
                    borderBottom: "1px solid #ddd",
                    paddingBottom: "0.75rem",
                  }}
                >
                  Similar Crop
                </h3>

                {similarityData.similar_crop_presigned_url ? (
                  <>
                    <div
                      style={{
                        position: "relative",
                        display: "block",
                        margin: 0,
                        padding: 0,
                        lineHeight: 0,
                        maxWidth: "400px",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <img
                        src={similarityData.similar_crop_presigned_url}
                        alt="Similar Crop"
                        style={{
                          display: "block",
                          width: "100%",
                          height: "auto",
                          margin: 0,
                          padding: 0,
                          cursor: showSimilarOverlay ? "crosshair" : "default",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                        }}
                        onClick={handleSimilarImgClick}
                      />
                      <div
                        style={pickPointCrossStyle(
                          similarityData.similar_crop_metadata.pick_point
                        )}
                      >
                        <div
                          style={{
                            ...crossArmStyle,
                            width: "1px",
                            height: "14px",
                            top: "-7px",
                            left: "0px",
                          }}
                        />
                        <div
                          style={{
                            ...crossArmStyle,
                            width: "14px",
                            height: "1px",
                            top: "0px",
                            left: "-7px",
                          }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => setShowSimilarOverlay((prev) => !prev)}
                      style={{
                        marginBottom: "1rem",
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "1px solid #bbb",
                        background: "#e6e6e6",
                        cursor: "pointer",
                        fontSize: "14px",
                      }}
                    >
                      {pickPointButtonLabel(
                        similarityData.similar_crop_metadata.pick_point
                      )}
                    </button>
                  </>
                ) : (
                  <p>No similar crop URL</p>
                )}

                <MetadataForm
                  metadata={similarityData.similar_crop_metadata}
                  onMetadataChange={handleSimilarMetaChange}
                />
                {/* No extra button here */}
              </div>
            </div>

            {/* 
                CENTER FIELDS => Labeler's Name + Difficult 
            */}
            <div
              style={{
                textAlign: "center",
                margin: "1.5rem 0",
              }}
            >
              <div style={{ marginBottom: "8px" }}>
                <label style={{ marginRight: "6px", fontWeight: "bold" }}>
                  Labeler&apos;s name:
                </label>
                <input
                  type="text"
                  value={labelerName}
                  onChange={(e) => setLabelerName(e.target.value)}
                  style={{
                    padding: "4px 6px",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                  }}
                />
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label style={{ fontWeight: "bold" }}>
                  <input
                    type="checkbox"
                    checked={difficult}
                    onChange={(e) => setDifficult(e.target.checked)}
                    style={{ marginRight: "6px" }}
                  />
                  Difficult
                </label>
              </div>
            </div>

            {/* BOTTOM BUTTONS => Next, Close */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "1rem",
                marginTop: "1rem",
              }}
            >
              <button
                onClick={handleCloseModal}
                style={{
                  backgroundColor: "#6c757d",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "0.5rem 1rem",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                onClick={handleFinish}
                style={{
                  backgroundColor: "#28a745",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "0.5rem 1rem",
                  cursor: "pointer",
                }}
              >
                Finish Labeling
              </button>
              <button
                onClick={handleNext}
                style={{
                  backgroundColor: "#007BFF",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "0.5rem 1rem",
                  cursor: "pointer",
                }}
              >
                Next
              </button>
            
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
