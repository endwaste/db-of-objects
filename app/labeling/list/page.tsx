"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import SimilarityModal from "./similarityModal";
import SlidingMenu from "../../components/SlidingMenu";

function getRobotFromS3Uri(s3Uri: string): string {
  const path = s3Uri.replace("s3://", "");
  const parts = path.split("/");
  for (let p of parts) {
    const lower = p.toLowerCase();
    if (
      lower.startsWith("gem-") ||
      lower.startsWith("scn-") ||
      lower.startsWith("cv-")
    ) {
      return p;
    }
  }
  return "UNKNOWN";
}

function getFolderForItem(item: CropItem): string {
  if (item.dest_folder) {
    return item.dest_folder;
  }
  return getRobotFromS3Uri(item.original_s3_uri);
}

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
  bounding_box: number[];
  labeled: boolean;
  labeler_name: string;
  difficult: boolean;
  dest_folder?: string | null;
}

interface SimilarityResult {
  crop_s3_uri: string;
  crop_presigned_url: string;
  incoming_crop_metadata: Record<string, any>;
  similar_crop_s3_uri: string;
  similar_crop_presigned_url: string | null;
  similar_crop_metadata: Record<string, any>;
  score: number | null;
  embedding_id: string | null;
}

export default function CropListPage() {
  // -----------------------------
  // State
  // -----------------------------
  const [robotMap, setRobotMap] = useState<Record<string, CropItem[]>>({});
  const [robots, setRobots] = useState<string[]>([]);

  const [selectedRobot, setSelectedRobot] = useState<string | null>(null);
  const [selectedRobotCrops, setSelectedRobotCrops] = useState<CropItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [labelerName, setLabelerName] = useState("");
  const [difficult, setDifficult] = useState(false);
  const [dynamoDBHadIncoming, setDynamoDBHadIncoming] = useState(false);

  const [similarityData, setSimilarityData] = useState<SimilarityResult | null>(
    null
  );
  const [showModal, setShowModal] = useState(false);

  const [selectedOriginalS3Uri, setSelectedOriginalS3Uri] = useState("");
  const [selectedBoundingBox, setSelectedBoundingBox] = useState<number[]>([]);

  const [originalSimilar, setOriginalSimilar] = useState<any>(null);
  const [originalIncoming, setOriginalIncoming] = useState<any>(null);

  // Multi-select
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // -----------------------------
  // Toast for ephemeral messages
  // -----------------------------
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  function showToast(message: string, duration = 3000) {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
      setToastMessage("");
    }, duration);
  }

  // --------------------------------------------------------------------------
  // Fetch labeling list
  // --------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${BASE_API}/api/list`);
        const fetchedCrops: CropItem[] = res.data.crops;

        const tempRobotMap: Record<string, CropItem[]> = {};
        for (const crop of fetchedCrops) {
          const robot = getFolderForItem(crop);
          if (!tempRobotMap[robot]) {
            tempRobotMap[robot] = [];
          }
          tempRobotMap[robot].push(crop);
        }
        const sortedRobots = Object.keys(tempRobotMap).sort();
        setRobotMap(tempRobotMap);
        setRobots(sortedRobots);
      } catch (err) {
        console.error("Error fetching crops:", err);
        setError("Unable to load the crop list from the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // --------------------------------------------------------------------------
  // Robot selection
  // --------------------------------------------------------------------------
  function handleSelectRobot(robot: string) {
    setSelectedRobot(robot);
    const list = robotMap[robot] || [];
    setSelectedRobotCrops(list);
    setSelectedItems(new Set());
  }

  function handleBackToFolders() {
    setSelectedRobot(null);
    setSelectedRobotCrops([]);
    setSelectedItems(new Set());
  }

  // --------------------------------------------------------------------------
  // Similarity
  // --------------------------------------------------------------------------
  async function handleCropClick(crop: CropItem) {
    setSelectedOriginalS3Uri(crop.original_s3_uri);
    setSelectedBoundingBox(crop.bounding_box);
    setDifficult(crop.difficult || false);

    try {
      const payload = {
        original_s3_uri: crop.original_s3_uri,
        bounding_box: crop.bounding_box,
      };
      const resp = await axios.post(`${BASE_API}/api/similarity`, payload);
      const result: SimilarityResult = resp.data;

      let incoming = { ...result.incoming_crop_metadata };
      const dynamoDBHadData = incoming && Object.keys(incoming).length > 0;
      if (!dynamoDBHadData) {
        incoming = { ...result.similar_crop_metadata };
        delete incoming.pick_point;
      } else {
        setDynamoDBHadIncoming(true);
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
      showToast("Couldn't load the similarity data. Check console for details.");
    }
  }

  function handleCloseModal() {
    setShowModal(false);
    setSimilarityData(null);
    setDynamoDBHadIncoming(false);
  }

  // --------------------------------------------------------------------------
  // Add to UDO
  // --------------------------------------------------------------------------
  async function handleAddToUDO() {
    if (!similarityData) {
      showToast("No data to add to UDO.");
      return;
    }
    const inc = similarityData.incoming_crop_metadata;
    const presignedUrl = similarityData.crop_presigned_url;

    if (!presignedUrl) {
      showToast("No presigned URL was found for this crop.");
      return;
    }
    if (!inc.pick_point) {
      showToast("No pick point found for the incoming crop.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("presigned_url", presignedUrl);
      formData.append("brand", inc.brand || "");
      formData.append("color", inc.color || "");
      formData.append("material", inc.material || "");
      formData.append("shape", inc.shape || "");
      formData.append("pick_point", inc.pick_point || "");
      formData.append("modifier", inc.modifier || "");
      formData.append("comment", "");
      formData.append("labeler_name", inc.labeler_name || "");

      const resp = await fetch(`${BASE_API}/api/new`, {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        throw new Error(`Failed to add crop. Status: ${resp.status}`);
      }
      const data = await resp.json();
      if (data.status !== "success") {
        throw new Error(data.message || "We couldn't add the crop to UDO.");
      }

      const { metadata } = data;

      // Update DB embedding
      const updatePayload = {
        original_s3_uri: selectedOriginalS3Uri,
        bounding_box: selectedBoundingBox,
        embedding_id: metadata.embedding_id,
      };
      await axios.put(`${BASE_API}/api/update_dynamodb_embedding`, updatePayload, {
        headers: { "Content-Type": "application/json" },
      });

      setSimilarityData((prev) =>
        prev ? { ...prev, embedding_id: metadata.embedding_id } : prev
      );

      showToast("Crop added to UDO and DB updated.");
    } catch (error) {
      console.error("Add to UDO error:", error);
      showToast("Unable to add the crop to UDO. Check console for details.");
    }
  }

  // --------------------------------------------------------------------------
  // finalizeCurrentItem
  // --------------------------------------------------------------------------
  async function finalizeCurrentItem() {
    if (!similarityData) return;
    const currentSimilar = similarityData.similar_crop_metadata;
    const currentIncoming = similarityData.incoming_crop_metadata;

    let updateSimilarPromise = Promise.resolve();
    let updateIncomingPromise = Promise.resolve();

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
        formDataSim.append("labeler_name", currentSimilar.labeler_name || "");
        formDataSim.append("pick_point", currentSimilar.pick_point || "");
        updateSimilarPromise = axios.put(
          `${BASE_API}/api/update/${simEmbeddingId}`,
          formDataSim,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
      }
    }

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
      formDataIn.append("labeler_name", currentIncoming.labeler_name || "");
      formDataIn.append("pick_point", currentIncoming.pick_point || "");
      updateIncomingPromise = axios.put(
        `${BASE_API}/api/update/${similarityData.embedding_id}`,
        formDataIn,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
    }

    await Promise.all([updateSimilarPromise, updateIncomingPromise]);

    const updatePayload = {
      original_s3_uri: selectedOriginalS3Uri,
      bounding_box: selectedBoundingBox,
      labeler_name: labelerName || "",
      difficult: difficult,
      incoming_crop_metadata: currentIncoming,
      similar_crop_metadata: currentSimilar,
      embedding_id: similarityData.embedding_id || "",
    };

    try {
      await axios.put(`${BASE_API}/api/update_dynamodb`, updatePayload, {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error updating DynamoDB:", error);
      showToast("Could not save your changes. See console for details.");
    }
  }

  // --------------------------------------------------------------------------
  // Next
  // --------------------------------------------------------------------------
  async function handleNext() {
    if (!similarityData) return;
    try {
      await finalizeCurrentItem();
      showToast("Crop updated; moving to next.");
    } catch (err) {
      console.error(err);
      showToast("Error finalizing crop. Check console for details.");
    }

    const idx = selectedRobotCrops.findIndex(
      (c) =>
        c.original_s3_uri === selectedOriginalS3Uri &&
        c.bounding_box.join(",") === selectedBoundingBox.join(",")
    );
    for (let i = idx + 1; i < selectedRobotCrops.length; i++) {
      if (!selectedRobotCrops[i].labeled) {
        handleCropClick(selectedRobotCrops[i]);
        return;
      }
    }
    showToast("No more unlabeled items for this robot!");
    handleCloseModal();
  }

  // --------------------------------------------------------------------------
  // Finish
  // --------------------------------------------------------------------------
  async function handleFinish() {
    if (!similarityData) return;
    try {
      await finalizeCurrentItem();
      showToast("Crop changes saved. Session ended.");
    } catch (err) {
      console.error(err);
      showToast("Error finalizing crop. Check console for details.");
    }
    handleCloseModal();
  }

  // --------------------------------------------------------------------------
  // Single delete
  // --------------------------------------------------------------------------
  async function handleDeleteSingle(crop: CropItem) {
    try {
      const boxString = crop.bounding_box.join(",");
      const url = `${BASE_API}/api/delete_item?original_s3_uri=${encodeURIComponent(
        crop.original_s3_uri
      )}&bounding_box=${boxString}`;

      const resp = await axios.delete(url);
      if (resp.data.status === "ok") {
        const updatedCrops = selectedRobotCrops.filter(
          (c) =>
            !(
              c.original_s3_uri === crop.original_s3_uri &&
              c.bounding_box.join(",") === boxString
            )
        );
        setSelectedRobotCrops(updatedCrops);
        showToast("Item removed from the database.");
      }
    } catch (error) {
      console.error("Error deleting item:", error);
      showToast("Could not remove the item. See console for details.");
    }
  }

  // --------------------------------------------------------------------------
  // Multi-select
  // --------------------------------------------------------------------------
  function handleToggleSelect(crop: CropItem) {
    const key = crop.original_s3_uri + "|" + crop.bounding_box.join(",");
    const newSet = new Set(selectedItems);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedItems(newSet);
  }

  function isItemSelected(crop: CropItem) {
    const key = crop.original_s3_uri + "|" + crop.bounding_box.join(",");
    return selectedItems.has(key);
  }

  // --------------------------------------------------------------------------
  // Mark unreviewed
  // --------------------------------------------------------------------------
  async function handleMarkUnreviewed() {
    if (selectedItems.size === 0) {
      showToast("Please select at least one item.");
      return;
    }
    const itemsPayload = Array.from(selectedItems).map((k) => {
      const [orig, boxStr] = k.split("|");
      const coords = boxStr.split(",").map(Number);
      return {
        original_s3_uri: orig,
        bounding_box: coords,
      };
    });

    try {
      const resp = await axios.put(`${BASE_API}/api/mark_unreviewed`, {
        items: itemsPayload,
      });
      // e.g. "1 item(s) moved to shard=UNLABELED."
      const msg = resp.data.message || "Selected items moved to Not Reviewed.";
      showToast(msg);

      const updatedCrops = selectedRobotCrops.map((c) => {
        const key = c.original_s3_uri + "|" + c.bounding_box.join(",");
        if (selectedItems.has(key)) {
          return { ...c, labeled: false };
        }
        return c;
      });
      setSelectedRobotCrops(updatedCrops);
      setSelectedItems(new Set());
    } catch (err) {
      console.error("Mark unreviewed error:", err);
      showToast("Couldn't mark items as unreviewed. See console for details.");
    }
  }

  // --------------------------------------------------------------------------
  // Delete selection
  // --------------------------------------------------------------------------
  async function handleDeleteSelection() {
    if (selectedItems.size === 0) {
      showToast("Please select at least one item.");
      return;
    }
  
    if (!window.confirm("Are you sure you want to remove these items from the database?")) {
      return;
    }
  
    let countDeleted = 0;
    const newSet = new Set(selectedItems);
    const selectedArray = Array.from(selectedItems);
  
    for (const key of selectedArray) {
      const [orig, boxStr] = key.split("|");
      const coords = boxStr.split(",").map(Number);
  
      try {
        const url = `${BASE_API}/api/delete_item?original_s3_uri=${encodeURIComponent(
          orig
        )}&bounding_box=${coords.join(",")}`;
        const resp = await axios.delete(url);
        if (resp.data.status === "ok") {
          newSet.delete(key);
          countDeleted++;
        }
      } catch (error) {
        console.error("Error deleting item:", error);
      }
    }
  
    const updatedCrops = selectedRobotCrops.filter((c) => {
      const k = c.original_s3_uri + "|" + c.bounding_box.join(",");
      return !selectedItems.has(k);
    });
  
    setSelectedRobotCrops(updatedCrops);
    setSelectedItems(newSet);
    showToast(`Removed ${countDeleted} item(s) from the database.`);
  }
  
  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  const showFolderIcons = !selectedRobot;

  let labeledCount = 0;
  let totalCount = 0;
  if (selectedRobotCrops.length > 0) {
    totalCount = selectedRobotCrops.length;
    labeledCount = selectedRobotCrops.filter((c) => c.labeled).length;
  }
  const labeledPercent =
    totalCount === 0 ? 0 : (labeledCount / totalCount) * 100;

  return (
    <div style={{ background: "#f3f4f6", position: "relative" }}>
      <SlidingMenu />

      {/* Floating toast at bottom-center */}
      {toastVisible && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0,0,0,0.8)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: "6px",
            zIndex: 9999,
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            fontSize: "14px",
          }}
        >
          {toastMessage}
        </div>
      )}

      <div
        style={{
          padding: "2.5rem",
          fontFamily: "'Inter', sans-serif",
          minHeight: "100vh",
          textAlign: "center",
        }}
      >
        {/* We removed the old status banner. Now using showToast for ephemeral messages. */}

        <img
          src="https://endwaste.io/assets/logo_footer.png"
          alt="Glacier Logo"
          style={{
            width: "80px",
            height: "auto",
            marginBottom: "0.5rem",
            display: "block",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        />
        <div className="text-center">
          <h1
            className="font-sans text-4xl mb-3"
            style={{ color: "#466CD9" }}
          >
            Universal database of objects
          </h1>
        </div>

        {loading && <p>Loading crops...</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}

        {showFolderIcons && !loading && !error && (
          <div style={{ marginBottom: "2rem" }}>
            <h1 className="font-sans text-base mb-5 text-gray-900">
              Select a robot or scanner folder to begin labeling:
            </h1>

            {robots.length === 0 && <p>No data found.</p>}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "2rem",
                justifyContent: "center",
                alignItems: "center",
                maxWidth: "90%",
                margin: "0 auto",
              }}
            >
              {robots.map((robot) => {
                const itemCount = robotMap[robot].length;
                return (
                  <div
                    key={robot}
                    style={{
                      textAlign: "center",
                      cursor: "pointer",
                    }}
                    onClick={() => handleSelectRobot(robot)}
                  >
                    <img
                      src="https://images.vexels.com/media/users/3/276661/isolated/preview/614fa2f6000e812cb013b82d5ed0eb21-blue-folder-squared.png"
                      alt="folder icon"
                      style={{
                        width: "100px",
                        height: "100px",
                        marginBottom: "8px",
                        filter:
                          "drop-shadow(2px 2px 2px rgba(0,0,0,0.2))",
                        transition: "filter 0.2s ease-in-out",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.filter =
                          "drop-shadow(2px 2px 2px rgba(0,0,255,0.4))")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.filter =
                          "drop-shadow(2px 2px 2px rgba(0,0,0,0.2))")
                      }
                    />
                    <div
                      style={{
                        fontWeight: "600",
                        fontSize: "16px",
                        color: "#374151",
                        textTransform: "uppercase",
                      }}
                    >
                      {robot}
                    </div>
                    <div
                      style={{ fontSize: "12px", color: "#6B7280" }}
                    >
                      {itemCount} items
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedRobot && (
          <div>
            {/* Back button + Robot title */}
            <div
              style={{
                position: "relative",
                width: "100%",
                margin: "0 auto",
                paddingBottom: "1rem",
              }}
            >
              <button
                onClick={() => {
                  handleCloseModal();
                  handleBackToFolders();
                }}
                style={{
                  position: "absolute",
                  left: "0",
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#374151",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "16px" }}>←</span> Back
              </button>

              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#1F2937",
                  textTransform: "uppercase",
                  margin: "0 auto",
                  textAlign: "center",
                  display: "block",
                  width: "fit-content",
                }}
              >
                {selectedRobot}
              </h2>
            </div>

            {/* If items are selected => multi-select bar */}
            {selectedItems.size > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "1rem",
                  padding: "0 1rem",
                }}
              >
                <span style={{ fontSize: "15px" }}>
                  {selectedItems.size} items selected
                </span>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleMarkUnreviewed}
                    style={{
                      backgroundColor: "#6c757d",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "0.3rem 0.5rem",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Mark as Not Reviewed
                  </button>
                  <button
                    onClick={handleDeleteSelection}
                    style={{
                      backgroundColor: "#b94a48",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "0.3rem 0.5rem",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Delete Selection
                  </button>
                </div>
              </div>
            )}

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  fontSize: "14px",
                  background: "#ffffff",
                  borderRadius: "8px",
                  boxShadow: "0px 2px 5px rgba(0, 0, 0, 0.1)",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#E5E7EB",
                      fontSize: "15px",
                      fontWeight: "600",
                      color: "#374151",
                    }}
                  >
                    <th
                      style={{
                        padding: "12px",
                        paddingLeft: "24px",
                      }}
                    >
                      Select
                    </th>
                    <th style={{ padding: "12px", paddingLeft: "24px" }}>
                      Original S3 URI
                    </th>
                    <th style={{ padding: "12px" }}>Bounding Box</th>
                    <th style={{ padding: "12px" }}>Reviewed?</th>
                    <th style={{ padding: "12px" }}>Labeler</th>
                    <th style={{ padding: "12px" }}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRobotCrops.map((crop, idx) => {
                    const isSelected = isItemSelected(crop);
                    const boundingStr = crop.bounding_box.join(", ");
                    return (
                      <tr key={idx} style={{ borderBottom: "1px solid #E5E7EB" }}>
                        <td
                          style={{
                            padding: "12px",
                            paddingLeft: "24px",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(crop)}
                          />
                        </td>

                        <td
                          style={{
                            padding: "12px",
                            paddingLeft: "24px",
                            wordBreak: "break-word",
                            color: "#1F2937",
                            fontWeight: "500",
                            cursor: "pointer",
                          }}
                          onClick={() => handleCropClick(crop)}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = "#F9FAFB")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          {crop.original_s3_uri}
                        </td>

                        <td
                          style={{ padding: "12px", color: "#4B5563", cursor: "pointer" }}
                          onClick={() => handleCropClick(crop)}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = "#F9FAFB")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          {boundingStr}
                        </td>

                        <td style={{ padding: "12px" }}>
                          <span
                            style={{
                              fontWeight: "600",
                              color: crop.labeled ? "#10B981" : "#EF4444",
                            }}
                          >
                            {crop.labeled ? "Yes" : "No"}
                          </span>
                        </td>

                        <td style={{ padding: "12px", color: "#4B5563" }}>
                          {crop.labeler_name || "-"}
                        </td>

                        <td style={{ padding: "8px" }}>
                          <button
                            onClick={() => handleDeleteSingle(crop)}
                            style={{
                              backgroundColor: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <img
                              src="https://cdn-icons-png.flaticon.com/512/1214/1214428.png"
                              alt="Delete"
                              style={{ width: "18px", height: "18px" }}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                margin: "12px 0",
                width: "100%",
                background: "#E5E7EB",
                height: "14px",
                borderRadius: "6px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${labeledPercent.toFixed(1)}%`,
                  background:
                    labeledCount === totalCount ? "#10B981" : "#3B82F6",
                  borderRadius: "6px",
                  transition: "width 0.3s",
                }}
              />
            </div>
            <p
              style={{
                fontSize: "14px",
                color: "#4B5563",
                fontWeight: "500",
              }}
            >
              {labeledCount} / {totalCount} labeled (
              {labeledPercent.toFixed(1)}%)
            </p>
          </div>
        )}
      </div>

      <SimilarityModal
        showModal={showModal}
        similarityData={similarityData}
        dynamoDBHadIncoming={dynamoDBHadIncoming}
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
