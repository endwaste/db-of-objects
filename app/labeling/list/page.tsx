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

// Helper to parse robot name from original_s3_uri
function getFolderForItem(item: CropItem): string {
  if (item.dest_folder) {
    return item.dest_folder;
  }
  return getRobotFromS3Uri(item.original_s3_uri);
}

// Adjust to your environment logic
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
  embedding_id: string | null; // if empty => not in DB
}

export default function CropListPage() {
  // 1) Data structures for robot grouping
  const [robotMap, setRobotMap] = useState<Record<string, CropItem[]>>({});
  const [robots, setRobots] = useState<string[]>([]);

  // 2) Which robot is selected, plus that robot's items
  const [selectedRobot, setSelectedRobot] = useState<string | null>(null);
  const [selectedRobotCrops, setSelectedRobotCrops] = useState<CropItem[]>([]);

  // 3) Error/loading
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 4) Fields for the modal
  const [labelerName, setLabelerName] = useState("");
  const [difficult, setDifficult] = useState(false);
  const [dynamoDBHadIncoming, setDynamoDBHadIncoming] = useState(false);

  const [similarityData, setSimilarityData] = useState<SimilarityResult | null>(
    null
  );
  const [showModal, setShowModal] = useState(false);

  // 5) Track which row is selected
  const [selectedOriginalS3Uri, setSelectedOriginalS3Uri] = useState("");
  const [selectedBoundingBox, setSelectedBoundingBox] = useState<number[]>([]);

  // 6) Originals for metadata changes
  const [originalSimilar, setOriginalSimilar] = useState<any>(null);
  const [originalIncoming, setOriginalIncoming] = useState<any>(null);

  // --------------------------------------------------------------------------
  // Fetch labeling list once on mount
  // --------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${BASE_API}/api/list`);
        const fetchedCrops: CropItem[] = res.data.crops;
        console.log("Fetched Crops:", fetchedCrops);

        // Group by robot
        const tempRobotMap: Record<string, CropItem[]> = {};
        for (const crop of fetchedCrops) {
          const robot = getFolderForItem(crop);
          if (!tempRobotMap[robot]) {
            tempRobotMap[robot] = [];
          }
          tempRobotMap[robot].push(crop);
        }

        // Sort the robot names
        const sortedRobots = Object.keys(tempRobotMap).sort();

        setRobotMap(tempRobotMap);
        setRobots(sortedRobots);
      } catch (err) {
        console.error("Error fetching crops:", err);
        setError("Failed to fetch crop list.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // --------------------------------------------------------------------------
  // Show that robot's table
  // --------------------------------------------------------------------------
  function handleSelectRobot(robot: string) {
    setSelectedRobot(robot);
    const list = robotMap[robot] || [];
    setSelectedRobotCrops(list);
  }

  // --------------------------------------------------------------------------
  // "Back" => show folder icons again
  // --------------------------------------------------------------------------
  function handleBackToFolders() {
    setSelectedRobot(null);
    setSelectedRobotCrops([]);
  }

  // --------------------------------------------------------------------------
  // Handle row click => get similarity => open modal
  // --------------------------------------------------------------------------
  async function handleCropClick(crop: CropItem) {
    setSelectedOriginalS3Uri(crop.original_s3_uri);
    setSelectedBoundingBox(crop.bounding_box);
    try {
      // populate labeler/difficult from row
      setLabelerName(crop.labeler_name || "");
      setDifficult(crop.difficult || false);

      const payload = {
        original_s3_uri: crop.original_s3_uri,
        bounding_box: crop.bounding_box,
      };

      const resp = await axios.post(`${BASE_API}/api/similarity`, payload);
      const result: SimilarityResult = resp.data;
      console.log("Similarity result:", result);

      let incoming = { ...result.incoming_crop_metadata };
      const dynamoDBHadData = incoming && Object.keys(incoming).length > 0;

      // If empty => copy from the similar crops metadata (minus pick_point)
      if (!dynamoDBHadData) {
        incoming = { ...result.similar_crop_metadata };
        delete incoming.pick_point;
      } else {
        setDynamoDBHadIncoming(true);
      }

      // Save “original” states for detection of changes
      setOriginalIncoming(JSON.parse(JSON.stringify(incoming)));
      setOriginalSimilar(
        JSON.parse(JSON.stringify(result.similar_crop_metadata))
      );

      // Set final similarityData w updated incoming
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
    setDynamoDBHadIncoming(false);
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
    if (!inc.pick_point) {
      alert("No pick_point found for the incoming crop.");
      return;
    }

    try {
      // Build FormData for /api/new
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
        throw new Error(`Add to UDO failed. Status: ${resp.status}`);
      }
      const data = await resp.json();
      if (data.status !== "success") {
        throw new Error(data.message || "Add to UDO did not succeed.");
      }

      const { metadata } = data;
      console.log("UDO metadata returned:", metadata);

      // Update DynamoDB with new embedding_id
      const updatePayload = {
        original_s3_uri: selectedOriginalS3Uri,
        bounding_box: selectedBoundingBox,
        embedding_id: metadata.embedding_id,
      };

      await axios.put(`${BASE_API}/api/update_dynamodb_embedding`, updatePayload, {
        headers: { "Content-Type": "application/json" },
      });

      // Also update local state so the button is disabled
      setSimilarityData((prev) =>
        prev ? { ...prev, embedding_id: metadata.embedding_id } : prev
      );

      alert("Crop successfully added to UDO and Dynamo DB updated!");
    } catch (error) {
      console.error("Add to UDO error:", error);
      alert("Failed to add crop to UDO. See console for details.");
    }
  }

  // --------------------------------------------------------------------------
  // "Next" => finalize current => pick next unlabeled in same robot
  // --------------------------------------------------------------------------
  async function handleNext() {
    if (!similarityData) return;

    // 1) finalize the current item
    await finalizeCurrentItem();

    // 2) find the next unlabeled item in selectedRobotCrops
    const idx = selectedRobotCrops.findIndex(
      (c) =>
        c.original_s3_uri === selectedOriginalS3Uri &&
        c.bounding_box.join(",") === selectedBoundingBox.join(",")
    );
    for (let i = idx + 1; i < selectedRobotCrops.length; i++) {
      if (!selectedRobotCrops[i].labeled) {
        // found next unlabeled => open similarity
        handleCropClick(selectedRobotCrops[i]);
        return;
      }
    }

    // If none
    alert("No more unlabeled items for this robot!");
    handleCloseModal();
  }

  // --------------------------------------------------------------------------
  // "Finish Labeling" => finalize current => close modal
  // --------------------------------------------------------------------------
  async function handleFinish() {
    if (!similarityData) return;
    await finalizeCurrentItem();
    alert("Crop updated. Labeling session ended.");
    handleCloseModal();
  }

  // --------------------------------------------------------------------------
  // finalizeCurrentItem => updates DB (server) once, removing any action param
  // --------------------------------------------------------------------------
  async function finalizeCurrentItem() {
    if (!similarityData) return;
    const currentSimilar = similarityData.similar_crop_metadata;
    const currentIncoming = similarityData.incoming_crop_metadata;

    // Possibly update UDO if metadata changed
    let updateSimilarPromise = Promise.resolve();
    let updateIncomingPromise = Promise.resolve();

    // If similar metadata changed => update Pinecone/CSV
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

    // If incoming metadata changed => update Pinecone/CSV
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
      // NEW: get labeler from the *incoming* metadata
      formDataIn.append("labeler_name", currentIncoming.labeler_name || "");
      formDataIn.append("pick_point", currentIncoming.pick_point || "");

      updateIncomingPromise = axios.put(
        `${BASE_API}/api/update/${similarityData.embedding_id}`,
        formDataIn,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
    }

    await Promise.all([updateSimilarPromise, updateIncomingPromise]);

    // Now also update the DB row
    const updatePayload = {
      original_s3_uri: selectedOriginalS3Uri,
      bounding_box: selectedBoundingBox,
      labeler_name: labelerName || "", // This is for Dynamo
      difficult: difficult,
      incoming_crop_metadata: currentIncoming,
      similar_crop_metadata: currentSimilar,
      embedding_id: similarityData.embedding_id || "",
    };

    try {
      const dynamoResp = await axios.put(
        `${BASE_API}/api/update_dynamodb`,
        updatePayload,
        { headers: { "Content-Type": "application/json" } }
      );
      console.log("finalizeCurrentItem response:", dynamoResp.data);
    } catch (error) {
      console.error("Error updating DynamoDB:", error);
      alert("Failed to update DynamoDB. Check console for details.");
    }
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  const showFolderIcons = !selectedRobot;

  // If a robot is selected, we can compute how many are labeled vs. total
  let labeledCount = 0;
  let totalCount = 0;
  if (selectedRobotCrops.length > 0) {
    totalCount = selectedRobotCrops.length;
    labeledCount = selectedRobotCrops.filter((c) => c.labeled).length;
  }
  const labeledPercent =
    totalCount === 0 ? 0 : (labeledCount / totalCount) * 100;

  return (
    <div style={{ background: "#f3f4f6" }}>
      {/* Sliding Menu */}
      <SlidingMenu />

      {/* Main Content */}
      <div
        style={{
          padding: "2.5rem",
          fontFamily: "'Inter', sans-serif",
          minHeight: "100vh",
          textAlign: "center",
        }}
      >
        {/* Logo Image Centered */}
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
            {/* Container for back button and title */}
            <div
              style={{
                position: "relative",
                width: "100%",
                margin: "0 auto",
                paddingBottom: "1rem",
              }}
            >
              {/* Back Button with Arrow - Aligned Left */}
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

              {/* Robot Title - Centered */}
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

            {/* Table - Left-aligned */}
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
                        borderBottom: "2px solid #D1D5DB",
                        textAlign: "left",
                      }}
                    >
                      Original S3 URI
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        borderBottom: "2px solid #D1D5DB",
                        textAlign: "left",
                      }}
                    >
                      Bounding Box
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        borderBottom: "2px solid #D1D5DB",
                        textAlign: "left",
                      }}
                    >
                      Reviewed?
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        borderBottom: "2px solid #D1D5DB",
                        textAlign: "left",
                      }}
                    >
                      Labeler
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRobotCrops.map((crop, idx) => (
                    <tr
                      key={idx}
                      onClick={() => handleCropClick(crop)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid #E5E7EB",
                        transition: "background 0.2s ease-in-out",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#F9FAFB")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td
                        style={{
                          padding: "12px",
                          wordBreak: "break-word",
                          color: "#1F2937",
                          fontWeight: "500",
                        }}
                      >
                        {crop.original_s3_uri}
                      </td>
                      <td style={{ padding: "12px", color: "#4B5563" }}>
                        {crop.bounding_box.join(", ")}
                      </td>
                      <td
                        style={{
                          padding: "12px",
                          fontWeight: "600",
                          color: crop.labeled ? "#10B981" : "#EF4444",
                        }}
                      >
                        {crop.labeled ? "Yes" : "No"}
                      </td>
                      <td style={{ padding: "12px", color: "#4B5563" }}>
                        {crop.labeler_name || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Wider Progress Bar */}
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

      {/* Render your separate SimilarityModal */}
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
