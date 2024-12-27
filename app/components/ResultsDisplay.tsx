import { PencilIcon, TrashIcon } from "@heroicons/react/24/solid";
import axios from "axios";
import Image from "next/image";
import React, { useState } from "react";

interface Result {
  score: number;
  metadata: {
    class?: string;
    date_added?: string;
    s3_file_name?: string;
    s3_file_path?: string;
    s3_presigned_url: string;
    file_type: "image" | "video" | "text";
    start_offset_sec?: number;
    end_offset_sec?: number;
    interval_sec?: number;
    segment?: number;
    brand?: string;
    modifier?: string;
    color?: string;
    coordinates?: string;
    datetime_taken?: string;
    embedding_id?: string;
    material?: string;
    original_s3_uri?: string;
    robot?: string;
    shape?: string;
    comment?: string;
    timestamp?: string;
  };
}

interface ResultsDisplayProps {
  apiUrl: string;
  isLoadingResults: boolean;
  results: Result[];
  getScoreLabel: (score: number) => { score: string };
  getVideoId: (result: Result, index: number) => string;
  onEdit?: (metadata: Record<string, any>) => void; // Callback for edit modal
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  isLoadingResults,
  apiUrl,
  results,
  getScoreLabel,
  getVideoId,
  onEdit,
}) => {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleDelete = async (embeddingId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this object?");
    if (!confirmDelete) return;

    try {
      await axios.post(`${apiUrl}/delete`, { embedding_id: embeddingId });
      console.log(`Deleted entry with ID: ${embeddingId}`);
      setSuccessMessage("Object deleted successfully.");
      window.location.reload();
    } catch (error) {
      console.error("Failed to delete entry:", error);
      setSuccessMessage("Failed to delete object. Please try again.");
    }
  };

  const handleEdit = (metadata: Record<string, any>) => {
    if (onEdit) onEdit(metadata);
  };

  return (
    <div>
      {successMessage && (
        <div className="bg-green-500 text-white p-2 rounded mb-4">
          {successMessage}
        </div>
      )}

      {isLoadingResults ? (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(20)].map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="bg-gray-300 h-64 w-full rounded-sm"></div>
              <div className="h-4 bg-gray-300 rounded w-3/4 mt-2"></div>
            </div>
          ))}
        </div>
      ) : (
        results.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((result, index) => {
              const { score } = getScoreLabel(result.score);
              const videoId = getVideoId(result, index);

              return (
                <div key={videoId} className="relative group rounded-md overflow-hidden">
                  {/* Action Buttons - Positioned at the Top Right */}
                  <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {/* Edit Button */}
                    <button
                      onClick={() => handleEdit(result.metadata)}
                      className="text-blue-500 hover:text-blue-700"
                      title="Edit Object"
                    >
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    {/* Delete Button */}
                    <button
                      onClick={() => handleDelete(result.metadata.embedding_id || "")}
                      className="text-red-500 hover:text-red-700"
                      title="Delete Object"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Display Image or Video */}
                  {result.metadata.file_type === "image" ? (
                    <Image
                      src={result.metadata.s3_presigned_url}
                      alt="Result"
                      className="w-full h-auto object-cover rounded"
                      width="640"
                      height="360"
                    />
                  ) : (
                    <div className="video-container rounded">
                      <video id={videoId} className="video-js vjs-default">
                        <source
                          src={result.metadata.s3_presigned_url}
                          type="video/mp4"
                        />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="mt-2 p-4 bg-white shadow-md rounded-md text-gray-800 text-xs break-words">
                    {Object.entries(result.metadata).map(([key, value]) => {
                      if (
                        value &&
                        key !== "file_type" &&
                        key !== "s3_presigned_url" &&
                        key !== "s3_file_name"
                      ) {
                        return (
                          <p key={key} className="mb-2">
                            <strong>
                              {key
                                .replace(/_/g, " ")
                                .replace(/\b\w/g, (char) => char.toUpperCase())}
                              :
                            </strong>{" "}
                            {value}
                          </p>
                        );
                      }
                      return null;
                    })}
                    <p>
                      <strong>Similarity Score:</strong> {score}
                    </p>
                  </div>

                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};

export default ResultsDisplay;
