"use client";

import React, { useState } from "react";
import axios from "axios";
import MetadataForm from "./metadataForm";

const API_URL = (() => {
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

export interface CropItem {
  original_s3_uri: string;
  bounding_box: string;
  labeled: boolean;
  labeler_name: string;
  difficult: boolean;
}

export interface SimilarityResult {
  crop_s3_uri: string;
  crop_presigned_url: string;
  incoming_crop_metadata: Record<string, any>;
  similar_crop_s3_uri: string;
  similar_crop_presigned_url: string | null;
  similar_crop_metadata: Record<string, any>;
  score: number | null;
  embedding_id: string | null;
}

interface SimilarityModalProps {
  showModal: boolean;
  similarityData: SimilarityResult | null;

  dynamoDBHadIncoming: boolean;
  labelerName: string; // from parent
  setLabelerName: (val: string) => void;
  difficult: boolean;
  setDifficult: (val: boolean) => void;

  onClose: () => void;
  onAddToUDO: () => void;
  onNext: () => void;
  onFinish: () => void;
  onUpdateSimilarityData: (updated: SimilarityResult) => void;
}

function parsePickPoints(pickPointStr?: string): [number, number][] {
  if (!pickPointStr?.trim()) return [];
  return pickPointStr
    .split(";")
    .map((s) => s.trim())
    .map((pair) => {
      const [xStr, yStr] = pair.split(",");
      const x = parseFloat(xStr);
      const y = parseFloat(yStr);
      return [x, y] as [number, number];
    })
    .filter(([x, y]) => !isNaN(x) && !isNaN(y));
}

function formatPickPoints(points: [number, number][]): string {
  return points
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(";");
}

const crossArmStyle: React.CSSProperties = {
  position: "absolute",
  background: "red",
};

function MultipleCrosshairs({ pickPointStr }: { pickPointStr?: string }) {
  const points = parsePickPoints(pickPointStr);
  return (
    <>
      {points.map(([px, py], i) => {
        const style: React.CSSProperties = {
          position: "absolute",
          left: `${(px * 100).toFixed(1)}%`,
          top: `${(py * 100).toFixed(1)}%`,
          width: 0,
          height: 0,
          pointerEvents: "none",
          transform: "translate(-50%, -50%)",
        };
        return (
          <div key={i} style={style}>
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
        );
      })}
    </>
  );
}

export default function SimilarityModal({
  showModal,
  similarityData,
  dynamoDBHadIncoming,
  labelerName, // parent's labelerName state
  setLabelerName,
  difficult,
  setDifficult,
  onClose,
  onAddToUDO,
  onNext,
  onFinish,
  onUpdateSimilarityData,
}: SimilarityModalProps) {
  const [showIncomingOverlay, setShowIncomingOverlay] = useState(false);
  const [showSimilarOverlay, setShowSimilarOverlay] = useState(false);

  if (!showModal || !similarityData) {
    return null;
  }

  const data = similarityData;

  // -------------------------------
  // Option A Implementation:
  // Whenever user changes the labelerName text,
  // also copy it into the crop metadata objects
  // so that the difference is detected in finalizeCurrentItem().
  // -------------------------------
  function handleLabelerNameChange(newVal: string) {
    setLabelerName(newVal);

    // Also store in incoming & similar so that finalizeCurrentItem()
    // sees it as changed
    const updatedIncoming = {
      ...data.incoming_crop_metadata,
      labeler_name: newVal,
    };
    const updatedSimilar = {
      ...data.similar_crop_metadata,
      labeler_name: newVal,
    };

    onUpdateSimilarityData({
      ...data,
      incoming_crop_metadata: updatedIncoming,
      similar_crop_metadata: updatedSimilar,
    });
  }

  function handleIncomingMetaChange(updated: Record<string, any>) {
    onUpdateSimilarityData({
      ...data,
      incoming_crop_metadata: updated,
    } as SimilarityResult);
  }

  function handleSimilarMetaChange(updated: Record<string, any>) {
    onUpdateSimilarityData({
      ...data,
      similar_crop_metadata: updated,
    } as SimilarityResult);
  }

  // Add pick point for "Incoming Crop"
  function handleIncomingImgClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!showIncomingOverlay) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const yFrac = (e.clientY - rect.top) / rect.height;

    const oldStr = data.incoming_crop_metadata.pick_point || "";
    const oldPoints = parsePickPoints(oldStr);
    oldPoints.push([xFrac, yFrac]);
    const newStr = formatPickPoints(oldPoints);

    onUpdateSimilarityData({
      ...data,
      incoming_crop_metadata: {
        ...data.incoming_crop_metadata,
        pick_point: newStr,
      },
    } as SimilarityResult);
  }

  // Add pick point for "Similar Crop"
  function handleSimilarImgClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!showSimilarOverlay) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const yFrac = (e.clientY - rect.top) / rect.height;

    const oldStr = data.similar_crop_metadata.pick_point || "";
    const oldPoints = parsePickPoints(oldStr);
    oldPoints.push([xFrac, yFrac]);
    const newStr = formatPickPoints(oldPoints);

    onUpdateSimilarityData({
      ...data,
      similar_crop_metadata: {
        ...data.similar_crop_metadata,
        pick_point: newStr,
      },
    } as SimilarityResult);
  }

  function handleClearPickPoints(isIncoming: boolean) {
    if (isIncoming) {
      onUpdateSimilarityData({
        ...data,
        incoming_crop_metadata: {
          ...data.incoming_crop_metadata,
          pick_point: "",
        },
      } as SimilarityResult);
    } else {
      onUpdateSimilarityData({
        ...data,
        similar_crop_metadata: {
          ...data.similar_crop_metadata,
          pick_point: "",
        },
      } as SimilarityResult);
    }
  }

  // If embedding_id => "Delete from UDO", else => "Add to UDO"
  async function handleDeleteFromUDO() {
    if (!data.embedding_id) return;

    try {
      await axios.post(`${API_URL}/api/delete`, {
        embedding_id: data.embedding_id,
      });

      alert("Deleted from UDO!");
      onUpdateSimilarityData({
        ...data,
        embedding_id: null,
      } as SimilarityResult);
    } catch (err) {
      console.error("Delete from UDO failed:", err);
      alert("Failed to delete from UDO. Check console for details.");
    }
  }

  function getIncomingSourceTag(): { text: string; color: string } {
    if (data.embedding_id) {
      return { text: "Metadata from UDO", color: "green" };
    } else if (dynamoDBHadIncoming) {
      return { text: "Metadata from Dynamo DB", color: "orange" };
    } else {
      return { text: "Metadata from similar crop", color: "purple" };
    }
  }
  const { text: incomingTagText, color: incomingTagColor } = getIncomingSourceTag();

  function getIncomingButtonLabel(): string {
    if (showIncomingOverlay) {
      return "Finish selecting";
    }
    const arr = parsePickPoints(data.incoming_crop_metadata.pick_point);
    return arr.length > 0 ? "Re-select pick points" : "Select pick points";
  }

  function getSimilarButtonLabel(): string {
    if (showSimilarOverlay) {
      return "Finish selecting";
    }
    const arr = parsePickPoints(data.similar_crop_metadata.pick_point);
    return arr.length > 0 ? "Re-select pick points" : "Select pick points";
  }

  return (
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
          {/* Incoming Crop */}
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
              {incomingTagText && (
                <span
                  style={{
                    display: "inline-block",
                    marginBottom: "0.5rem",
                    background: incomingTagColor,
                    color: "#fff",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    marginLeft: "30px",
                  }}
                >
                  {incomingTagText}
                </span>
              )}
            </h3>

            {data.crop_presigned_url ? (
              <>
                <div
                  style={{
                    position: "relative",
                    display: "block",
                    lineHeight: 0,
                    maxWidth: "400px",
                    marginBottom: "0.5rem",
                  }}
                >
                  <img
                    src={data.crop_presigned_url}
                    alt="Incoming Crop"
                    style={{
                      display: "block",
                      width: "100%",
                      height: "auto",
                      cursor: showIncomingOverlay ? "crosshair" : "default",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                    }}
                    onClick={handleIncomingImgClick}
                  />
                  <MultipleCrosshairs
                    pickPointStr={data.incoming_crop_metadata.pick_point}
                  />
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <button
                    onClick={() => setShowIncomingOverlay((prev) => !prev)}
                    style={{
                      marginRight: "0.5rem",
                      padding: "6px 12px",
                      borderRadius: "4px",
                      border: "1px solid #bbb",
                      background: "#e6e6e6",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {getIncomingButtonLabel()}
                  </button>
                  <button
                    onClick={() => handleClearPickPoints(true)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "4px",
                      border: "1px solid #bbb",
                      background: "#f8d7da",
                      color: "#721c24",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Clear All
                  </button>
                </div>
              </>
            ) : (
              <p>No incoming crop URL</p>
            )}

            <MetadataForm
              metadata={data.incoming_crop_metadata}
              onMetadataChange={handleIncomingMetaChange}
            />

            <div style={{ marginTop: "1rem" }}>
              {data.embedding_id ? (
                <button
                  onClick={handleDeleteFromUDO}
                  style={{
                    backgroundColor: "#d9534f",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "0.5rem 1rem",
                    cursor: "pointer",
                  }}
                >
                  Delete from UDO
                </button>
              ) : (
                <button
                  onClick={onAddToUDO}
                  style={{
                    backgroundColor: "#4caf50",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "0.5rem 1rem",
                    cursor: "pointer",
                  }}
                >
                  Add to UDO
                </button>
              )}
            </div>
          </div>

          {/* Similar Crop */}
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

            {data.similar_crop_presigned_url ? (
              <>
                <div
                  style={{
                    position: "relative",
                    display: "block",
                    lineHeight: 0,
                    maxWidth: "400px",
                    marginBottom: "0.5rem",
                  }}
                >
                  <img
                    src={data.similar_crop_presigned_url}
                    alt="Similar Crop"
                    style={{
                      display: "block",
                      width: "100%",
                      height: "auto",
                      cursor: showSimilarOverlay ? "crosshair" : "default",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                    }}
                    onClick={handleSimilarImgClick}
                  />
                  <MultipleCrosshairs
                    pickPointStr={data.similar_crop_metadata.pick_point}
                  />
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <button
                    onClick={() => setShowSimilarOverlay((prev) => !prev)}
                    style={{
                      marginRight: "0.5rem",
                      padding: "6px 12px",
                      borderRadius: "4px",
                      border: "1px solid #bbb",
                      background: "#e6e6e6",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    {getSimilarButtonLabel()}
                  </button>

                  <button
                    onClick={() => handleClearPickPoints(false)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "4px",
                      border: "1px solid #bbb",
                      background: "#f8d7da",
                      color: "#721c24",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Clear All
                  </button>
                </div>
              </>
            ) : (
              <p>No similar crop URL</p>
            )}

            <MetadataForm
              metadata={data.similar_crop_metadata}
              onMetadataChange={handleSimilarMetaChange}
            />
          </div>
        </div>

        {/* Labeler / Difficult */}
        <div style={{ textAlign: "center", margin: "1.5rem 0" }}>
          <div style={{ marginBottom: "8px" }}>
            <label style={{ marginRight: "6px", fontWeight: "bold" }}>
              Labeler&apos;s name:
            </label>
            <input
              type="text"
              value={labelerName}
              // NEW: call a function that sets local state + updates metadata
              onChange={(e) => handleLabelerNameChange(e.target.value)}
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

        {/* Bottom Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          <button
            onClick={onClose}
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
            onClick={onFinish}
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
            onClick={onNext}
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
  );
}
