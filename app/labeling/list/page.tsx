"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import SimilarityModal from "./similarityModal"; 

// If using Next.js, consider environment logic:
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

interface CropItem {
  original_s3_uri: string;
  bounding_box: string;
  labeled: boolean;
  labeler_name: string;
  difficult: boolean;
}

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


export default function CropListPage() {
  const [crops, setCrops] = useState<CropItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fields for the modal
  const [labelerName, setLabelerName] = useState("");
  const [difficult, setDifficult] = useState(false);
  const [csvHadIncoming, setCsvHadIncoming] = useState(false);

  const [similarityData, setSimilarityData] = useState<SimilarityResult | null>(
    null
  );
  const [showModal, setShowModal] = useState(false);

  // Keep track of which row is selected
  const [selectedOriginalS3Uri, setSelectedOriginalS3Uri] = useState("");
  const [selectedBoundingBoxStr, setSelectedBoundingBoxStr] = useState("");

  // Keep copies so we can compare changes
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
  // Handle row click => get similarity => open modal
  // --------------------------------------------------------------------------
  async function handleCropClick(crop: CropItem) {
    setSelectedOriginalS3Uri(crop.original_s3_uri);
    setSelectedBoundingBoxStr(crop.bounding_box);
    try {
      // populate labeler/difficult from row
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

      // If empty => copy from the similar crop's metadata (minus pick_point)
      if (!csvHadData) {
        incoming = { ...result.similar_crop_metadata };
        delete incoming.pick_point;
      } else {
        setCsvHadIncoming(true);
      }

      // Save the “original” states
      setOriginalIncoming(JSON.parse(JSON.stringify(incoming)));
      setOriginalSimilar(
        JSON.parse(JSON.stringify(result.similar_crop_metadata))
      );

      // Set final similarityData with updated “incoming_crop_metadata”
      setSimilarityData({
        ...result,
        incoming_crop_metadata: incoming,
      });
      setShowModal(true);
    } catch (err) {
      console.error("Error calling /similarity:", err);
      alert("Error calling /similarity. Check console.");
    }
  }

  // --------------------------------------------------------------------------
  // Close the modal
  // --------------------------------------------------------------------------
  function handleCloseModal() {
    setShowModal(false);
    setSimilarityData(null);
    setCsvHadIncoming(false);
  }

  // --------------------------------------------------------------------------
  // "Add to UDO" logic
  // --------------------------------------------------------------------------
  async function handleAddToUDO() {
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

    try {
      // Build FormData for /api/new (some endpoint you have).
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

      const resp = await fetch(`${BASE_API}/api/new`, {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        throw new Error(`Add to UDO failed. Status: ${resp.status}`);
      }
      const data = await resp.json();
      if (data.status !== "success") {
        throw new Error(data.message || "Add to UDO did not succeed.");
      }

      const { metadata } = data;
      console.log("UDO metadata returned:", metadata);

      // Update CSV with new embedding_id
      const updatePayload = {
        original_s3_uri: selectedOriginalS3Uri,
        bounding_box: selectedBoundingBoxStr.split(",").map((x) =>
          Number(x.trim())
        ),
        embedding_id: metadata.embedding_id,
      };

      await axios.put(`${BASE_API}/api/update_csv_embedding`, updatePayload, {
        headers: { "Content-Type": "application/json" },
      });

      // Also update local state so the button is disabled
      setSimilarityData((prev) =>
        prev ? { ...prev, embedding_id: metadata.embedding_id } : prev
      );

      alert("Crop successfully added to UDO and CSV updated!");
    } catch (error) {
      console.error("Add to UDO error:", error);
      alert("Failed to add crop to UDO. See console for details.");
    }
  }

  // --------------------------------------------------------------------------
  // "Next" / "Finish Labeling" => update CSV, possibly update UDO
  // --------------------------------------------------------------------------
  async function updateRecords(action: "next" | "end") {
    if (!similarityData) return;
    const currentSimilar = similarityData.similar_crop_metadata;
    const currentIncoming = similarityData.incoming_crop_metadata;

    // Possibly update UDO if metadata changed
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

    // Wait for both requests to finish
    await Promise.all([updateSimilarPromise, updateIncomingPromise]);

    // 3. Update CSV with final data
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
          // automatically open the next one
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
  }

  // Handler for the Next button
  async function handleNext() {
    await updateRecords("next");
  }

  // Handler for the Finish Labeling button
  async function handleFinish() {
    await updateRecords("end");
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <h1 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>Crop List</h1>

      {loading && <p>Loading crops...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && crops.length === 0 && <p>No crops found.</p>}

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
                <td style={{ padding: "8px" }}>
                  {crop.labeler_name || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Render your separate SimilarityModal */}
      <SimilarityModal
        showModal={showModal}
        similarityData={similarityData}
        csvHadIncoming={csvHadIncoming}
        labelerName={labelerName}
        setLabelerName={setLabelerName}
        difficult={difficult}
        setDifficult={setDifficult}
        onClose={handleCloseModal}
        onAddToUDO={handleAddToUDO}
        onNext={handleNext}
        onFinish={handleFinish}
        onUpdateSimilarityData={setSimilarityData}
      />
    </div>
  );
}
